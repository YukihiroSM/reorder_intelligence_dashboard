"""SKU metrics endpoints. Filter/sort happen in Python (20 SKUs — negligible)."""

from __future__ import annotations

from collections.abc import Callable, Sequence
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


_SORTERS: dict[str, Callable[[Sequence[SKUMetricsDTO]], list[SKUMetricsDTO]]] = {
    "urgency_desc": lambda ms: sorted(
        ms, key=lambda m: (-_URGENCY[m.status], *_days_key(m))
    ),
    "days_remaining_asc": lambda ms: sorted(ms, key=_days_key),
    "days_remaining_desc": lambda ms: sorted(
        ms, key=lambda m: (m.days_of_stock is None, -(m.days_of_stock or 0.0))
    ),
    "name_asc": lambda ms: sorted(ms, key=lambda m: m.name.lower()),
    "cost_desc": lambda ms: sorted(
        ms, key=lambda m: m.estimated_reorder_cost, reverse=True
    ),
}


@router.get("/skus", response_model=list[SKUMetricsDTO])
async def list_skus(
    session: AsyncSession = Depends(get_session),
    status: Annotated[list[StockHealthStatus] | None, Query()] = None,
    category: str | None = None,
    supplier: str | None = None,
    sort: str = "urgency_desc",
    growth_pct: float | None = None,
    forecast_window: int | None = None,
) -> list[SKUMetricsDTO]:
    if sort not in _SORTERS:
        raise HTTPException(
            status_code=422,
            detail=f"unknown sort '{sort}'; valid: {sorted(_SORTERS)}",
        )
    app_config = await session.get(AppConfig, "active")
    config = build_calc_config(
        app_config, growth_pct=growth_pct, forecast_window=forecast_window
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
) -> SKUMetricsDTO:
    app_config = await session.get(AppConfig, "active")
    config = build_calc_config(
        app_config, growth_pct=growth_pct, forecast_window=forecast_window
    )
    dto = await get_sku_metrics(session, sku_code, config)
    if dto is None:
        raise HTTPException(status_code=404, detail=f"SKU '{sku_code}' not found")
    return dto
