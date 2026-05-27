"""Inventory importer: JSON -> DB with two-layer dedup.

File-level dedup: sha256 of the raw bytes against ``import_runs.file_checksum``.
Row-level dedup: ``ON CONFLICT DO NOTHING`` on ``(sku_id, sale_date)`` and
``ON CONFLICT DO UPDATE`` on ``(sku_id, snapshot_date)``.

Date convention (matches inventory.json's note "index 0 = 30 days ago,
index 29 = yesterday"): ``sale_date(i) = data_date - (len(sales) - i)`` days, so
the newest entry maps to ``data_date - 1`` and sales never land on the snapshot
date itself. (The IMPLEMENTATION_PLAN formula was off by one; the data note wins.)
"""

from __future__ import annotations

import hashlib
import json
import logging
from dataclasses import dataclass
from datetime import UTC, date, datetime, timedelta
from decimal import Decimal
from pathlib import Path

from pydantic import ValidationError
from sqlalchemy import Boolean, literal_column, select
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.ext.asyncio import AsyncSession

from ..models import SKU, Category, ImportRun, SKUSalesDaily, SKUSnapshot, Supplier
from ..enums import ImportStatus
from ..schemas.importing import InventoryFileSchema, SKUInput

logger = logging.getLogger(__name__)


@dataclass
class ImportResult:
    run: ImportRun
    skipped: bool


def compute_checksum(raw: bytes) -> str:
    return hashlib.sha256(raw).hexdigest()


def category_code(name: str) -> str:
    """Derive a category's stable code. Must match the seed migration (0002)."""
    return name.strip().lower()


def _sale_dates(data_date: date, count: int) -> list[date]:
    """Map sales-array indices to calendar dates (oldest first, newest = yesterday)."""
    return [data_date - timedelta(days=count - i) for i in range(count)]


async def import_inventory(session: AsyncSession, file_path: Path | str) -> ImportResult:
    path = Path(file_path)
    raw = path.read_bytes()
    checksum = compute_checksum(raw)

    # --- File-level dedup -------------------------------------------------
    existing = await session.scalar(
        select(ImportRun).where(ImportRun.file_checksum == checksum)
    )
    if existing is not None and existing.status == ImportStatus.SUCCESS:
        logger.info(
            "Import skipped: checksum %s already imported as run %s",
            checksum[:12],
            existing.id,
        )
        return ImportResult(run=existing, skipped=True)

    # --- Parse JSON (need config.today before the run row exists) ---------
    try:
        doc = json.loads(raw, parse_float=Decimal)
    except json.JSONDecodeError as exc:
        raise ValueError(f"{path.name} is not valid JSON: {exc}") from exc

    today_raw = (doc.get("config") or {}).get("today")
    if not today_raw:
        raise ValueError(f"{path.name} is missing config.today")
    data_date = date.fromisoformat(str(today_raw))

    # Reuse a prior non-SUCCESS run for the same checksum (unique column),
    # otherwise create a fresh PENDING run.
    run = existing or ImportRun(file_checksum=checksum)
    run.source_filename = path.name
    run.data_date = data_date
    run.status = ImportStatus.PENDING
    run.error_log = None
    run.skus_created = run.skus_updated = run.snapshots_created = 0
    run.sales_rows_inserted = run.sales_rows_skipped = 0
    run.finished_at = None
    if existing is None:
        session.add(run)
    await session.flush()

    # --- Validate structure ----------------------------------------------
    try:
        parsed = InventoryFileSchema.model_validate(doc)
    except ValidationError as exc:
        run.status = ImportStatus.FAILED
        run.error_log = json.loads(exc.json())
        run.finished_at = datetime.now(UTC)
        await session.commit()
        logger.warning("Import %s failed validation: %d errors", run.id, exc.error_count())
        return ImportResult(run=run, skipped=False)

    await _ingest_skus(session, run, parsed, data_date)

    run.status = ImportStatus.PARTIAL if run.error_log else ImportStatus.SUCCESS
    run.finished_at = datetime.now(UTC)
    await session.commit()

    logger.info(
        "Import %s [%s]: skus +%d/~%d, snapshots +%d, sales +%d (skipped %d)",
        run.id,
        run.status.value,
        run.skus_created,
        run.skus_updated,
        run.snapshots_created,
        run.sales_rows_inserted,
        run.sales_rows_skipped,
    )
    return ImportResult(run=run, skipped=False)


async def _ensure_reference_data(
    session: AsyncSession,
    parsed: InventoryFileSchema,
    cats: dict[str, Category],
    sups: dict[str, Supplier],
) -> None:
    """Create any missing categories/suppliers up front, in the outer transaction.

    Reference data is shared across SKUs, so it must NOT live inside a per-SKU
    savepoint — otherwise rolling back one bad SKU could revert a category that
    other SKUs depend on (and leave a dangling cache entry)."""
    for item in parsed.skus:
        code = category_code(item.category)
        if code not in cats:
            category = Category(code=code, name=item.category)
            session.add(category)
            cats[code] = category
        if item.supplier not in sups:
            supplier = Supplier(
                name=item.supplier,
                production_lead_days=item.production_lead_days,
                shipping_days=item.shipping_days,
            )
            session.add(supplier)
            sups[item.supplier] = supplier
    await session.flush()


async def _ingest_skus(
    session: AsyncSession,
    run: ImportRun,
    parsed: InventoryFileSchema,
    data_date: date,
) -> None:
    # Preload reference data so each SKU is at most one in-memory lookup.
    cats = {c.code: c for c in (await session.scalars(select(Category))).all()}
    sups = {s.name: s for s in (await session.scalars(select(Supplier))).all()}
    skus = {s.sku_code: s for s in (await session.scalars(select(SKU))).all()}
    await _ensure_reference_data(session, parsed, cats, sups)

    errors: list[dict[str, str]] = []
    counter_fields = (
        "skus_created",
        "skus_updated",
        "snapshots_created",
        "sales_rows_inserted",
        "sales_rows_skipped",
    )

    for item in parsed.skus:
        # Each SKU is its own SAVEPOINT: a failure rolls back only that SKU's
        # rows, leaving the outer transaction usable so the rest still import.
        before = {f: getattr(run, f) for f in counter_fields}
        try:
            async with session.begin_nested():
                await _ingest_one(session, run, item, data_date, cats, sups, skus)
        except Exception as exc:  # noqa: BLE001 - record per-SKU, keep importing
            logger.exception("Failed to import SKU %s", item.sku)
            for field, value in before.items():  # undo in-memory side effects
                setattr(run, field, value)
            skus.pop(item.sku, None)
            errors.append({"sku": item.sku, "error": str(exc)})

    if errors:
        run.error_log = errors


async def _ingest_one(
    session: AsyncSession,
    run: ImportRun,
    item: SKUInput,
    data_date: date,
    cats: dict[str, Category],
    sups: dict[str, Supplier],
    skus: dict[str, SKU],
) -> None:
    # Reference data was created in _ensure_reference_data (outside this savepoint).
    category = cats[category_code(item.category)]
    supplier = sups[item.supplier]

    sku = skus.get(item.sku)
    if sku is None:
        sku = SKU(
            sku_code=item.sku,
            name=item.name,
            category_id=category.id,
            supplier_id=supplier.id,
        )
        session.add(sku)
        await session.flush()
        skus[item.sku] = sku
        run.skus_created += 1
    else:
        sku.name = item.name
        sku.category_id = category.id
        sku.supplier_id = supplier.id
        run.skus_updated += 1

    # --- Snapshot upsert; RETURNING (xmax = 0) tells insert vs update -----
    inserted = await session.scalar(
        pg_insert(SKUSnapshot)
        .values(
            sku_id=sku.id,
            snapshot_date=data_date,
            current_stock=item.current_stock,
            cost_per_unit_usd=item.cost_per_unit_usd,
            retail_price_usd=item.retail_price_usd,
            moq=item.moq,
            import_run_id=run.id,
        )
        .on_conflict_do_update(
            index_elements=["sku_id", "snapshot_date"],
            set_={
                "current_stock": item.current_stock,
                "cost_per_unit_usd": item.cost_per_unit_usd,
                "retail_price_usd": item.retail_price_usd,
                "moq": item.moq,
                "import_run_id": run.id,
            },
        )
        .returning(literal_column("(xmax = 0)", type_=Boolean()))
    )
    if inserted:
        run.snapshots_created += 1

    # --- Sales rows: ON CONFLICT DO NOTHING; RETURNING counts inserts -----
    sales = item.sales_last_30_days
    dates = _sale_dates(data_date, len(sales))
    rows = [
        {
            "sku_id": sku.id,
            "sale_date": d,
            "units_sold": units,
            "import_run_id": run.id,
        }
        for d, units in zip(dates, sales, strict=True)
    ]
    if rows:
        sales_stmt = (
            pg_insert(SKUSalesDaily)
            .values(rows)
            .on_conflict_do_nothing(index_elements=["sku_id", "sale_date"])
            .returning(SKUSalesDaily.id)
        )
        inserted_ids = (await session.execute(sales_stmt)).fetchall()
        run.sales_rows_inserted += len(inserted_ids)
        run.sales_rows_skipped += len(rows) - len(inserted_ids)
