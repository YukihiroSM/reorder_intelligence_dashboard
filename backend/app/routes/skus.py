"""SKU metrics endpoints. Filter/sort/paginate in Python (metrics are computed
from sales arrays, so they can't be SQL-paginated; for ~hundreds of SKUs this is
fine, and the table only ever fetches a page at a time)."""

from __future__ import annotations

from enum import Enum
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query, Response
from sqlalchemy.ext.asyncio import AsyncSession

from ..db import get_session
from ..enums import StockHealthStatus
from ..models import AppConfig
from ..schemas.sku import SKUMetricsDTO
from ..services.sku_metrics import (
    build_calc_config,
    get_all_sku_metrics,
    get_sku_metrics,
)

router = APIRouter(prefix="/api", tags=["skus"])


class SortField(str, Enum):
    urgency = "urgency"
    code = "code"
    name = "name"
    stock = "stock"
    days = "days"
    cost = "cost"


class SortDir(str, Enum):
    asc = "asc"
    desc = "desc"


# Higher = more urgent. Drives the default sort.
_URGENCY = {
    StockHealthStatus.STOCKOUT: 3,
    StockHealthStatus.CRITICAL: 2,
    StockHealthStatus.LOW: 1,
    StockHealthStatus.HEALTHY: 0,
}
_INF = float("inf")


def _days(m: SKUMetricsDTO) -> float:
    # None (no demand) sorts last.
    return m.days_of_stock if m.days_of_stock is not None else _INF


def _sort_metrics(
    metrics: list[SKUMetricsDTO], field: SortField, direction: SortDir
) -> list[SKUMetricsDTO]:
    if field is SortField.urgency:  # rank desc, then soonest-to-run-out first
        return sorted(metrics, key=lambda m: (-_URGENCY[m.status], _days(m)))
    keymap = {
        SortField.code: lambda m: m.sku_code.lower(),
        SortField.name: lambda m: m.name.lower(),
        SortField.stock: lambda m: float(m.current_stock),
        SortField.days: _days,
        SortField.cost: lambda m: m.estimated_reorder_cost,
    }
    return sorted(metrics, key=keymap[field], reverse=direction is SortDir.desc)


@router.get("/skus", response_model=list[SKUMetricsDTO])
async def list_skus(
    response: Response,
    session: AsyncSession = Depends(get_session),
    status: Annotated[list[StockHealthStatus] | None, Query()] = None,
    category: str | None = None,
    supplier: str | None = None,
    search: str | None = None,
    sort_by: SortField = SortField.urgency,
    sort_dir: SortDir = SortDir.asc,
    limit: Annotated[int | None, Query(ge=1, le=500)] = None,
    offset: Annotated[int, Query(ge=0)] = 0,
    growth_pct: float | None = None,
    forecast_window: int | None = None,
    shipping_buffer: int | None = None,
) -> list[SKUMetricsDTO]:
    app_config = await session.get(AppConfig, "active")
    config = build_calc_config(
        app_config,
        growth_pct=growth_pct,
        forecast_window=forecast_window,
        shipping_buffer=shipping_buffer,
    )
    metrics = await get_all_sku_metrics(session, config)

    if status:
        wanted = set(status)
        metrics = [m for m in metrics if m.status in wanted]
    if category:
        metrics = [m for m in metrics if m.category.lower() == category.lower()]
    if supplier:
        metrics = [m for m in metrics if m.supplier.lower() == supplier.lower()]
    if search:
        q = search.lower()
        metrics = [
            m for m in metrics if q in m.sku_code.lower() or q in m.name.lower()
        ]

    metrics = _sort_metrics(metrics, sort_by, sort_dir)

    # Total (after filtering) so the client knows when to stop loading pages.
    response.headers["X-Total-Count"] = str(len(metrics))
    if limit is not None:
        metrics = metrics[offset : offset + limit]
    return metrics


@router.get("/skus/{sku_code}", response_model=SKUMetricsDTO)
async def get_sku(
    sku_code: str,
    session: AsyncSession = Depends(get_session),
    growth_pct: float | None = None,
    forecast_window: int | None = None,
    shipping_buffer: int | None = None,
) -> SKUMetricsDTO:
    app_config = await session.get(AppConfig, "active")
    config = build_calc_config(
        app_config,
        growth_pct=growth_pct,
        forecast_window=forecast_window,
        shipping_buffer=shipping_buffer,
    )
    dto = await get_sku_metrics(session, sku_code, config)
    if dto is None:
        raise HTTPException(status_code=404, detail=f"SKU '{sku_code}' not found")
    return dto
