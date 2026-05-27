"""Orchestrator: load SKU state from the DB, run the pure calc core, return DTOs.

`today` is resolved from the latest snapshot_date in the DB (never the wall clock).
Current stock/cost/moq come from the snapshot AT `today` — not the denormalized
SKU columns, which reflect whichever import ran last (could be an older date).
"""

from __future__ import annotations

from collections import defaultdict
from dataclasses import replace
from datetime import date
from decimal import Decimal
from uuid import UUID

from sqlalchemy import and_, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from ..models import (
    SKU,
    AppConfig,
    Category,
    SKUSalesDaily,
    SKUSnapshot,
    Supplier,
)
from ..schemas.sku import SKUMetricsDTO
from .calculations import CalcConfig, compute_metrics
from .confidence import detect_flags

# Sales window used for the "current" view, matching the dataset's 30-day history.
ANALYSIS_WINDOW = 30


def build_calc_config(
    app_config: AppConfig | None,
    *,
    growth_pct: float | None = None,
    forecast_window: int | None = None,
    shipping_buffer: int | None = None,
) -> CalcConfig:
    """Map the DB AppConfig (or defaults) to a pure CalcConfig, applying overrides."""
    if app_config is None:
        cfg = CalcConfig()
    else:
        cfg = CalcConfig(
            shipping_buffer_days=app_config.shipping_buffer_days,
            forecast_window_days=app_config.forecast_window_days,
            growth_pct=app_config.growth_pct,
            critical_multiplier=app_config.critical_multiplier,
            low_multiplier=app_config.low_multiplier,
            velocity_window_short=app_config.velocity_window_short,
            velocity_window_long=app_config.velocity_window_long,
            volatility_cv_threshold=app_config.volatility_cv_threshold,
            velocity_divergence_threshold=app_config.velocity_divergence_threshold,
            sparse_data_min_days=app_config.sparse_data_min_days,
            moq_overshoot_multiplier=app_config.moq_overshoot_multiplier,
        )
    if growth_pct is not None:
        cfg = replace(cfg, growth_pct=Decimal(str(growth_pct)))
    if forecast_window is not None:
        cfg = replace(cfg, forecast_window_days=forecast_window)
    if shipping_buffer is not None:
        cfg = replace(cfg, shipping_buffer_days=shipping_buffer)
    return cfg


async def resolve_today(session: AsyncSession) -> date | None:
    return await session.scalar(select(func.max(SKUSnapshot.snapshot_date)))


async def _sales_by_sku(
    session: AsyncSession, today: date, sku_id: UUID | None = None
) -> dict[UUID, list[int]]:
    stmt = (
        select(SKUSalesDaily.sku_id, SKUSalesDaily.units_sold)
        .where(SKUSalesDaily.sale_date < today)
        .order_by(SKUSalesDaily.sku_id, SKUSalesDaily.sale_date)
    )
    if sku_id is not None:
        stmt = stmt.where(SKUSalesDaily.sku_id == sku_id)
    by_sku: dict[UUID, list[int]] = defaultdict(list)
    for sid, units in (await session.execute(stmt)).all():
        by_sku[sid].append(units)
    return by_sku


def _build_dto(
    *,
    today: date,
    sku: SKU,
    snapshot: SKUSnapshot,
    category: str,
    supplier: str,
    production_lead_days: int,
    shipping_days: int,
    sales: list[int],
    config: CalcConfig,
    include_sales: bool,
) -> SKUMetricsDTO:
    flags = detect_flags(sales, snapshot.current_stock, snapshot.moq, config)
    m = compute_metrics(
        today=today,
        sku_code=sku.sku_code,
        current_stock=snapshot.current_stock,
        moq=snapshot.moq,
        cost_per_unit=snapshot.cost_per_unit_usd,
        production_lead_days=production_lead_days,
        shipping_days=shipping_days,
        sales=sales,
        config=config,
        confidence_flags=flags,
    )
    return SKUMetricsDTO(
        sku_code=sku.sku_code,
        name=sku.name,
        category=category,
        supplier=supplier,
        current_stock=snapshot.current_stock,
        moq=snapshot.moq,
        cost_per_unit_usd=float(snapshot.cost_per_unit_usd),
        retail_price_usd=float(snapshot.retail_price_usd),
        production_lead_days=production_lead_days,
        shipping_days=shipping_days,
        total_lead_days=m.total_lead_days,
        velocity_7d=float(m.velocity_7d),
        velocity_14d=float(m.velocity_14d),
        effective_velocity=float(m.effective_velocity),
        projected_velocity=float(m.projected_velocity),
        days_of_stock=float(m.days_of_stock) if m.days_of_stock is not None else None,
        reorder_date=m.reorder_date,
        recommended_po_qty=m.recommended_po_qty,
        moq_binding=m.moq_binding,
        estimated_reorder_cost=float(m.estimated_reorder_cost),
        status=m.status,
        trend=m.trend,
        confidence_flags=[f.value for f in m.confidence_flags],
        sales_last_30_days=sales if include_sales else None,
    )


def _select_rows(today: date):
    return (
        select(
            SKU,
            SKUSnapshot,
            Category.name,
            Supplier.name,
            Supplier.production_lead_days,
            Supplier.shipping_days,
        )
        .join(
            SKUSnapshot,
            and_(SKUSnapshot.sku_id == SKU.id, SKUSnapshot.snapshot_date == today),
        )
        .join(Category, Category.id == SKU.category_id)
        .join(Supplier, Supplier.id == SKU.supplier_id)
        .where(SKU.is_active.is_(True))
    )


async def get_all_sku_metrics(
    session: AsyncSession, config: CalcConfig
) -> list[SKUMetricsDTO]:
    today = await resolve_today(session)
    if today is None:
        return []
    rows = (await session.execute(_select_rows(today))).all()
    sales_by_sku = await _sales_by_sku(session, today)
    dtos: list[SKUMetricsDTO] = []
    for sku, snap, cat_name, sup_name, lead, ship in rows:
        dtos.append(
            _build_dto(
                today=today,
                sku=sku,
                snapshot=snap,
                category=cat_name,
                supplier=sup_name,
                production_lead_days=lead,
                shipping_days=ship,
                sales=sales_by_sku[sku.id][-ANALYSIS_WINDOW:],
                config=config,
                include_sales=True,  # table renders a sparkline per row
            )
        )
    return dtos


async def get_sku_metrics(
    session: AsyncSession, sku_code: str, config: CalcConfig
) -> SKUMetricsDTO | None:
    today = await resolve_today(session)
    if today is None:
        return None
    row = (
        await session.execute(_select_rows(today).where(SKU.sku_code == sku_code))
    ).first()
    if row is None:
        return None
    sku, snap, cat_name, sup_name, lead, ship = row
    sales = (await _sales_by_sku(session, today, sku.id))[sku.id][-ANALYSIS_WINDOW:]
    return _build_dto(
        today=today,
        sku=sku,
        snapshot=snap,
        category=cat_name,
        supplier=sup_name,
        production_lead_days=lead,
        shipping_days=ship,
        sales=sales,
        config=config,
        include_sales=True,
    )
