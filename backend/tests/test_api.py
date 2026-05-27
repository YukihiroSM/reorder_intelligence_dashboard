"""Route-level API tests: real app over httpx ASGITransport against the test DB."""

from __future__ import annotations

import os
from collections.abc import AsyncIterator
from pathlib import Path

import pytest_asyncio
from httpx import ASGITransport, AsyncClient
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

from app import models  # noqa: F401  register tables
from app.db import Base, get_session
from app.main import create_app
from app.models import AppConfig
from app.services.importer import import_inventory

TEST_DATABASE_URL = os.environ.get(
    "TEST_DATABASE_URL",
    "postgresql+asyncpg://reorder:changeme@localhost:5440/reorder_intel_test",
)
BASE = Path(__file__).resolve().parents[2] / "data" / "inventory.json"


@pytest_asyncio.fixture
async def client() -> AsyncIterator[AsyncClient]:
    engine = create_async_engine(TEST_DATABASE_URL)
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.drop_all)
        await conn.run_sync(Base.metadata.create_all)
    maker = async_sessionmaker(engine, expire_on_commit=False)
    async with maker() as setup:
        await import_inventory(setup, BASE)
        # create_all builds tables but not seed data; mirror migration 0002's
        # app_config singleton (other columns fall back to server defaults).
        setup.add(AppConfig(id="active"))
        await setup.commit()

    app = create_app()

    async def _override() -> AsyncIterator[object]:
        async with maker() as s:
            yield s

    app.dependency_overrides[get_session] = _override
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as c:
        yield c

    app.dependency_overrides.clear()
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.drop_all)
    await engine.dispose()


async def test_health(client: AsyncClient) -> None:
    r = await client.get("/api/health")
    assert r.status_code == 200
    body = r.json()
    assert body["status"] == "ok"
    assert body["data_date"] == "2026-05-25"
    assert body["skus_loaded"] == 20


async def test_list_skus_count_and_default_sort(client: AsyncClient) -> None:
    r = await client.get("/api/skus")
    assert r.status_code == 200
    rows = r.json()
    assert len(rows) == 20
    # urgency_desc default -> the stockout leads.
    assert rows[0]["sku_code"] == "GLW-006"
    assert rows[0]["status"] == "STOCKOUT"


async def test_status_filters(client: AsyncClient) -> None:
    crit = {s["sku_code"] for s in (await client.get("/api/skus?status=CRITICAL")).json()}
    assert {"GLW-005", "GLW-002"} <= crit
    stockout = [s["sku_code"] for s in (await client.get("/api/skus?status=STOCKOUT")).json()]
    assert stockout == ["GLW-006"]


async def test_growth_override_shifts_metrics(client: AsyncClient) -> None:
    g0 = (await client.get("/api/skus/GLW-001?growth_pct=0")).json()
    g30 = (await client.get("/api/skus/GLW-001?growth_pct=30")).json()
    assert g30["days_of_stock"] < g0["days_of_stock"]
    assert g30["recommended_po_qty"] >= g0["recommended_po_qty"]


async def test_sku_detail_includes_sales(client: AsyncClient) -> None:
    d = (await client.get("/api/skus/GLW-005")).json()
    assert d["status"] == "CRITICAL"
    assert d["moq_binding"] is False
    assert len(d["sales_last_30_days"]) == 30


async def test_unknown_sku_404(client: AsyncClient) -> None:
    assert (await client.get("/api/skus/NOPE-999")).status_code == 404


async def test_bad_sort_422(client: AsyncClient) -> None:
    assert (await client.get("/api/skus?sort=bogus")).status_code == 422


async def test_config_get_and_update(client: AsyncClient) -> None:
    assert (await client.get("/api/config")).json()["forecast_window_days"] == 60
    r = await client.put("/api/config", json={"growth_pct": 20, "forecast_window_days": 90})
    assert r.status_code == 200
    after = (await client.get("/api/config")).json()
    assert after["growth_pct"] == 20.0
    assert after["forecast_window_days"] == 90


async def test_scenario_crud(client: AsyncClient) -> None:
    created = await client.post(
        "/api/scenarios", json={"name": "holiday push", "growth_pct": 20}
    )
    assert created.status_code == 201
    sid = created.json()["id"]
    assert any(s["id"] == sid for s in (await client.get("/api/scenarios")).json())
    assert (await client.delete(f"/api/scenarios/{sid}")).status_code == 204
    assert (await client.get("/api/scenarios")).json() == []
