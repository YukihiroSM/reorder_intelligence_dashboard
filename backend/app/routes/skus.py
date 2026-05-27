"""SKU metrics endpoints. Filter/sort happen in Python (20 SKUs — negligible)."""

from __future__ import annotations

from collections.abc import Callable, Sequence
from enum import Enum
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query
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


class SortKey(str, Enum):
    urgency_desc = "urgency_desc"
    days_remaining_asc = "days_remaining_asc"
    days_remaining_desc = "days_remaining_desc"
    name_asc = "name_asc"
    cost_desc = "cost_desc"

# Higher = more urgent. Drives the default sort.
_URGENCY = {
    StockHealthStatus.STOCKOUT: 3,
    StockHealthStatus.CRITICAL: 2,
    StockHealthStatus.LOW: 1,
    StockHealthStatus.HEALTHY: 0,
}


def _days_key(m: SKUMetricsDTO) -> tuple[bool, float]:
    # None (no demand) sorts last regardless of direction.
    return (m.days_of_stock is None, m.days_of_stock if m.days_of_stock is not None else 0.0)


_SORTERS: dict[SortKey, Callable[[Sequence[SKUMetricsDTO]], list[SKUMetricsDTO]]] = {
    SortKey.urgency_desc: lambda ms: sorted(
        ms, key=lambda m: (-_URGENCY[m.status], *_days_key(m))
    ),
    SortKey.days_remaining_asc: lambda ms: sorted(ms, key=_days_key),
    SortKey.days_remaining_desc: lambda ms: sorted(
        ms, key=lambda m: (m.days_of_stock is None, -(m.days_of_stock or 0.0))
    ),
    SortKey.name_asc: lambda ms: sorted(ms, key=lambda m: m.name.lower()),
    SortKey.cost_desc: lambda ms: sorted(
        ms, key=lambda m: m.estimated_reorder_cost, reverse=True
    ),
}


@router.get("/skus", response_model=list[SKUMetricsDTO])
async def list_skus(
    session: AsyncSession = Depends(get_session),
    status: Annotated[list[StockHealthStatus] | None, Query()] = None,
    category: str | None = None,
    supplier: str | None = None,
    sort: SortKey = SortKey.urgency_desc,
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

    return _SORTERS[sort](metrics)


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
