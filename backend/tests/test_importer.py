"""Importer tests: fresh import, file-level dedup, row-level dedup, multi-date."""

from __future__ import annotations

import json
from pathlib import Path

import pytest
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import SKU, ImportRun, SKUSalesDaily, SKUSnapshot
from app.enums import ImportStatus
from app.scripts.generate_inventories import build_variant
from app.services.importer import import_inventory

DATA_DIR = Path(__file__).resolve().parents[2] / "data"
BASE = DATA_DIR / "inventory.json"


async def _count(session: AsyncSession, model: type) -> int:
    return await session.scalar(select(func.count()).select_from(model)) or 0


async def test_fresh_import(session: AsyncSession) -> None:
    result = await import_inventory(session, BASE)

    assert result.skipped is False
    assert result.run.status == ImportStatus.SUCCESS
    assert result.run.skus_created == 20
    assert result.run.snapshots_created == 20
    assert result.run.sales_rows_inserted == 600
    assert result.run.sales_rows_skipped == 0

    assert await _count(session, SKU) == 20
    assert await _count(session, SKUSnapshot) == 20
    assert await _count(session, SKUSalesDaily) == 600


async def test_reimport_same_file_skipped(session: AsyncSession) -> None:
    first = await import_inventory(session, BASE)
    second = await import_inventory(session, BASE)

    assert second.skipped is True
    assert second.run.id == first.run.id
    assert await _count(session, ImportRun) == 1
    assert await _count(session, SKUSalesDaily) == 600


async def test_modified_same_date_inserts_no_sales(
    session: AsyncSession, tmp_path: Path
) -> None:
    await import_inventory(session, BASE)

    # Change a byte that doesn't touch sales dates -> new checksum, identical rows.
    doc = json.loads(BASE.read_text())
    doc["config"]["notes"] = str(doc["config"].get("notes", "")) + " (modified)"
    modified = tmp_path / "inventory_mod.json"
    modified.write_text(json.dumps(doc))

    result = await import_inventory(session, modified)

    assert result.skipped is False
    assert result.run.status == ImportStatus.SUCCESS
    assert result.run.sales_rows_inserted == 0
    assert result.run.sales_rows_skipped == 600
    assert result.run.snapshots_created == 0  # same snapshot_date -> DO UPDATE
    assert result.run.skus_updated == 20
    assert await _count(session, SKUSalesDaily) == 600  # unchanged
    assert await _count(session, ImportRun) == 2


async def test_multidate_accumulates_and_dedups(
    session: AsyncSession, tmp_path: Path
) -> None:
    await import_inventory(session, BASE)  # data_date 2026-05-25

    base_doc = json.loads(BASE.read_text())
    _, variant_doc = build_variant(base_doc, offset=1)  # 2026-05-24
    variant = tmp_path / "inventory_prev.json"
    variant.write_text(json.dumps(variant_doc))

    result = await import_inventory(session, variant)

    # One new earlier day per SKU; the 29 overlapping days are skipped.
    assert result.run.sales_rows_inserted == 20
    assert result.run.sales_rows_skipped == 580
    assert result.run.snapshots_created == 20  # new snapshot_date
    assert await _count(session, SKUSnapshot) == 40
    assert await _count(session, SKUSalesDaily) == 620


async def test_invalid_json_raises(session: AsyncSession, tmp_path: Path) -> None:
    bad = tmp_path / "bad.json"
    bad.write_text("{ not valid json")
    with pytest.raises(ValueError):
        await import_inventory(session, bad)


async def test_partial_failure_isolates_bad_sku(
    session: AsyncSession, tmp_path: Path
) -> None:
    """One bad SKU (int4-overflowing stock) is recorded, the other 19 still import."""
    doc = json.loads(BASE.read_text())
    target = doc["skus"][0]["sku"]
    doc["skus"][0]["current_stock"] = 10_000_000_000  # overflows PG integer
    bad = tmp_path / "inventory_partial.json"
    bad.write_text(json.dumps(doc))

    result = await import_inventory(session, bad)

    assert result.skipped is False
    assert result.run.status == ImportStatus.PARTIAL
    assert result.run.error_log is not None
    assert any(e["sku"] == target for e in result.run.error_log)

    # The other 19 SKUs persisted fully; the bad one left nothing behind.
    assert result.run.skus_created == 19
    assert await _count(session, SKU) == 19
    assert await _count(session, SKUSnapshot) == 19
    assert await _count(session, SKUSalesDaily) == 19 * 30
    assert await session.scalar(select(SKU).where(SKU.sku_code == target)) is None
