"""Deterministic fact-pack builder — the grounded numbers the LLM reasons over.

Pure (no DB, no clock, no LLM): takes already-computed `SKUMetricsDTO`s + `today`,
derives the operator-facing trade-off numbers the raw formula doesn't surface, and
packs them for one SKU or the whole portfolio. Everything the LLM is later allowed to
cite originates here, which is what makes the `verify` node able to keep it honest.
"""

from __future__ import annotations

import math
from datetime import date

from ...enums import ConfidenceFlag, StockHealthStatus
from ...schemas.ai import PortfolioFactPack, SKUFact
from ...schemas.sku import SKUMetricsDTO
from ..calculations import CalcConfig

# Flags that make an otherwise-HEALTHY SKU worth surfacing on the watch list.
_WATCH_FLAGS = {
    ConfidenceFlag.MOQ_OVERSHOOT,
    ConfidenceFlag.DECLINING_TREND,
    ConfidenceFlag.HIGH_VOLATILITY,
}

# Most-urgent-first ranking, mirroring the table's default sort.
_STATUS_RANK = {
    StockHealthStatus.STOCKOUT: 3,
    StockHealthStatus.CRITICAL: 2,
    StockHealthStatus.LOW: 1,
    StockHealthStatus.HEALTHY: 0,
}
_INF = float("inf")


def _round2(x: float) -> float:
    return round(x, 2)


def build_sku_fact(m: SKUMetricsDTO, today: date) -> SKUFact:
    """Derive one SKU's grounded facts under the scenario baked into `m`."""
    gross_margin = _round2(m.retail_price_usd - m.cost_per_unit_usd)

    days_overdue = 0
    if m.reorder_date is not None and m.reorder_date < today:
        days_overdue = (today - m.reorder_date).days

    # The gap that can't be closed even ordering today: stock runs out in
    # `days_of_stock`, a PO placed now lands in `total_lead_days`. A stocked-out SKU
    # has days_of_stock == 0, so this collapses to the full lead time.
    if m.days_of_stock is None:
        stockout_days = 0
    else:
        stockout_days = max(0, math.ceil(m.total_lead_days - m.days_of_stock))

    revenue_at_risk = _round2(stockout_days * m.projected_velocity * m.retail_price_usd)

    coverage = (
        _round2(m.recommended_po_qty / m.projected_velocity)
        if m.projected_velocity > 0
        else None
    )

    return SKUFact(
        sku_code=m.sku_code,
        name=m.name,
        category=m.category,
        supplier=m.supplier,
        status=m.status,
        trend=m.trend,
        confidence_flags=m.confidence_flags,
        current_stock=m.current_stock,
        moq=m.moq,
        cost_per_unit_usd=m.cost_per_unit_usd,
        retail_price_usd=m.retail_price_usd,
        gross_margin_per_unit_usd=gross_margin,
        velocity_7d=m.velocity_7d,
        velocity_14d=m.velocity_14d,
        effective_velocity=m.effective_velocity,
        projected_velocity=m.projected_velocity,
        days_of_stock=m.days_of_stock,
        total_lead_days=m.total_lead_days,
        reorder_date=m.reorder_date,
        days_overdue=days_overdue,
        recommended_po_qty=m.recommended_po_qty,
        moq_binding=m.moq_binding,
        estimated_reorder_cost=m.estimated_reorder_cost,
        moq_coverage_days=coverage,
        unavoidable_stockout_days=stockout_days,
        revenue_at_risk_usd=revenue_at_risk,
    )


def _rank_key(f: SKUFact) -> tuple[int, float]:
    days = f.days_of_stock if f.days_of_stock is not None else _INF
    return (-_STATUS_RANK[f.status], days)


def build_portfolio_factpack(
    metrics: list[SKUMetricsDTO], today: date, config: CalcConfig
) -> PortfolioFactPack:
    """Build the portfolio-wide grounded context for the weekly briefing."""
    facts = [build_sku_fact(m, today) for m in metrics]

    status_counts: dict[str, int] = {s.value: 0 for s in StockHealthStatus}
    for f in facts:
        status_counts[f.status.value] += 1

    actionable = sorted(
        (f for f in facts if f.status is not StockHealthStatus.HEALTHY), key=_rank_key
    )
    watch_candidates = [
        f
        for f in facts
        if f.status is StockHealthStatus.HEALTHY
        and any(flag in _WATCH_FLAGS for flag in f.confidence_flags)
    ]

    total_cash = _round2(sum(f.estimated_reorder_cost for f in actionable))
    total_risk = _round2(sum(f.revenue_at_risk_usd for f in actionable))

    return PortfolioFactPack(
        today=today,
        growth_pct=float(config.growth_pct),
        forecast_window_days=config.forecast_window_days,
        shipping_buffer_days=config.shipping_buffer_days,
        status_counts=status_counts,
        total_cash_to_commit_usd=total_cash,
        total_revenue_at_risk_usd=total_risk,
        actionable=actionable,
        watch_candidates=watch_candidates,
    )
