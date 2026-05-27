"""Pure inventory math. The testable core of the system.

Rules (CLAUDE.md): no DB, no I/O, no `datetime.now()`. `today` is always a
parameter. Money and velocity are `Decimal`, never `float`. Every function takes
primitives (or the frozen `CalcConfig`) and returns primitives or a dataclass.

Formulas follow the challenge brief's "The Formula" section verbatim, with one
documented refinement: `effective_velocity` is stockout-/launch-aware (it skips a
trailing zero-run when currently stocked out, and a leading zero-run on a launch).
"""

from __future__ import annotations

import math
from dataclasses import dataclass, replace
from datetime import date, timedelta
from decimal import Decimal
from typing import Literal

from ..enums import ConfidenceFlag, StockHealthStatus

TrendDirection = Literal["up", "down", "flat"]

# A launch / post-stockout zero-run of at least this length is treated as
# "not selling yet" rather than "selling zero".
ZERO_RUN_THRESHOLD = 5
# trend_direction: % change between consecutive 7-day windows to call up/down.
TREND_THRESHOLD = Decimal("0.15")


@dataclass(frozen=True)
class CalcConfig:
    """Operator-tunable knobs. Mirror of app_config, but pure (no DB)."""

    shipping_buffer_days: int = 7
    forecast_window_days: int = 60
    growth_pct: Decimal = Decimal(0)
    critical_multiplier: Decimal = Decimal(1)
    low_multiplier: Decimal = Decimal("1.5")
    velocity_window_short: int = 7
    velocity_window_long: int = 14
    volatility_cv_threshold: Decimal = Decimal("0.5")
    velocity_divergence_threshold: Decimal = Decimal("0.5")
    sparse_data_min_days: int = 14
    moq_overshoot_multiplier: Decimal = Decimal(2)

    def with_growth(self, growth_pct: float | int | Decimal) -> CalcConfig:
        return replace(self, growth_pct=Decimal(str(growth_pct)))


@dataclass(frozen=True)
class SKUMetrics:
    """Everything the API/UI needs for one SKU at a given `today` + config."""

    sku_code: str
    current_stock: int
    moq: int
    velocity_7d: Decimal
    velocity_14d: Decimal
    effective_velocity: Decimal
    projected_velocity: Decimal
    days_of_stock: Decimal | None
    total_lead_days: int
    reorder_date: date | None
    recommended_po_qty: int
    moq_binding: bool
    estimated_reorder_cost: Decimal
    status: StockHealthStatus
    trend: TrendDirection
    confidence_flags: list[ConfidenceFlag]


# --------------------------------------------------------------------------- #
# Small helpers
# --------------------------------------------------------------------------- #
def _mean(values: list[int]) -> Decimal:
    if not values:
        return Decimal(0)
    return Decimal(sum(values)) / Decimal(len(values))


def _leading_zero_run(sales: list[int]) -> int:
    n = 0
    for v in sales:
        if v != 0:
            break
        n += 1
    return n


def _trailing_zero_run(sales: list[int]) -> int:
    n = 0
    for v in reversed(sales):
        if v != 0:
            break
        n += 1
    return n


def clean_series(sales: list[int], current_stock: int) -> list[int]:
    """Series used for trend/volatility: drop a launch lead-in and a stockout tail."""
    series = list(sales)
    lead = _leading_zero_run(series)
    if lead >= ZERO_RUN_THRESHOLD:
        series = series[lead:]
    trail = _trailing_zero_run(series)
    if current_stock == 0 and 0 < trail < len(series):
        series = series[:-trail]
    return series or [0]


# --------------------------------------------------------------------------- #
# Velocity
# --------------------------------------------------------------------------- #
def daily_velocity(sales: list[int], window_days: int) -> Decimal:
    """Average daily units over the last `window_days` entries of `sales`."""
    if window_days <= 0 or not sales:
        return Decimal(0)
    window = sales[-window_days:]
    return _mean(window)


def effective_velocity(
    sales: list[int], current_stock: int, window_days: int
) -> tuple[Decimal, list[ConfidenceFlag]]:
    """Stockout-/launch-aware velocity.

    - Leading zero-run >= ZERO_RUN_THRESHOLD -> a launch; skip it (LEADING_ZEROS).
    - Currently stocked out with a trailing zero-run -> skip it so the rate
      reflects pre-stockout demand, not the forced zeros (RECENT_STOCKOUT).
    """
    flags: list[ConfidenceFlag] = []
    series = list(sales)

    lead = _leading_zero_run(series)
    if lead >= ZERO_RUN_THRESHOLD:
        flags.append(ConfidenceFlag.LEADING_ZEROS)
        series = series[lead:]

    trail = _trailing_zero_run(series)
    if current_stock == 0 and trail > 0:
        flags.append(ConfidenceFlag.RECENT_STOCKOUT)
        if trail < len(series):
            series = series[:-trail]

    return daily_velocity(series, window_days), flags


def projected_velocity(velocity: Decimal, growth_pct: Decimal) -> Decimal:
    """Apply the scenario growth %: velocity * (1 + growth/100)."""
    return velocity * (Decimal(1) + growth_pct / Decimal(100))


# --------------------------------------------------------------------------- #
# Stock position
# --------------------------------------------------------------------------- #
def days_of_stock(current_stock: int, projected_velocity: Decimal) -> Decimal | None:
    """Days until stockout at the projected rate. None == infinite (no demand)."""
    if projected_velocity <= 0:
        return None
    return Decimal(current_stock) / projected_velocity


def total_lead_days(production: int, shipping: int, buffer: int) -> int:
    return production + shipping + buffer


def reorder_date(
    today: date, days_of_stock: Decimal | None, total_lead: int
) -> date | None:
    """Date a PO must be placed to arrive before stockout. None if no demand."""
    if days_of_stock is None:
        return None
    offset = math.floor(days_of_stock - Decimal(total_lead))
    return today + timedelta(days=offset)


def recommended_po_qty(
    moq: int, projected_velocity: Decimal, forecast_window: int
) -> tuple[int, bool]:
    """Returns (qty, moq_was_binding). qty = max(MOQ, ceil(vel * window))."""
    demand_qty = math.ceil(projected_velocity * Decimal(forecast_window))
    if demand_qty < 0:
        demand_qty = 0
    qty = max(moq, demand_qty)
    return qty, moq >= demand_qty


def estimated_reorder_cost(po_qty: int, cost_per_unit: Decimal) -> Decimal:
    return Decimal(po_qty) * cost_per_unit


def stock_health(
    current_stock: int,
    days_of_stock: Decimal | None,
    total_lead: int,
    critical_mult: Decimal,
    low_mult: Decimal,
) -> StockHealthStatus:
    if current_stock <= 0:
        return StockHealthStatus.STOCKOUT
    if days_of_stock is None:  # stock on hand, no demand -> healthy
        return StockHealthStatus.HEALTHY
    lead = Decimal(total_lead)
    if days_of_stock < lead * critical_mult:
        return StockHealthStatus.CRITICAL
    if days_of_stock < lead * low_mult:
        return StockHealthStatus.LOW
    return StockHealthStatus.HEALTHY


# --------------------------------------------------------------------------- #
# Statistical signals
# --------------------------------------------------------------------------- #
def coefficient_of_variation(sales: list[int]) -> Decimal:
    """Population CV (std / mean). 0 when the mean is 0."""
    n = len(sales)
    if n == 0:
        return Decimal(0)
    mean = Decimal(sum(sales)) / Decimal(n)
    if mean == 0:
        return Decimal(0)
    variance = sum((Decimal(x) - mean) ** 2 for x in sales) / Decimal(n)
    return variance.sqrt() / mean


def trend_direction(sales: list[int]) -> TrendDirection:
    """Compare the last 7-day average vs the preceding 7-day average (±15%)."""
    n = len(sales)
    if n < 2:
        return "flat"
    half = min(7, n // 2)
    last_avg = _mean(sales[-half:])
    preceding = sales[-2 * half : -half]
    if not preceding:
        return "flat"
    prec_avg = _mean(preceding)
    if prec_avg == 0:
        return "up" if last_avg > 0 else "flat"
    change = (last_avg - prec_avg) / prec_avg
    if change > TREND_THRESHOLD:
        return "up"
    if change < -TREND_THRESHOLD:
        return "down"
    return "flat"


# --------------------------------------------------------------------------- #
# Orchestrator (still pure)
# --------------------------------------------------------------------------- #
def compute_metrics(
    *,
    today: date,
    sku_code: str,
    current_stock: int,
    moq: int,
    cost_per_unit: Decimal,
    production_lead_days: int,
    shipping_days: int,
    sales: list[int],
    config: CalcConfig,
    confidence_flags: list[ConfidenceFlag] | None = None,
) -> SKUMetrics:
    """Compute the full metric set for one SKU. `confidence_flags` may be passed
    in (from confidence.detect_flags) to avoid recomputation; if omitted they are
    left empty here so this module stays free of any confidence dependency."""
    v7 = daily_velocity(sales, config.velocity_window_short)
    v14 = daily_velocity(sales, config.velocity_window_long)
    eff, _ = effective_velocity(sales, current_stock, config.velocity_window_short)
    proj = projected_velocity(eff, config.growth_pct)

    dos = days_of_stock(current_stock, proj)
    lead = total_lead_days(production_lead_days, shipping_days, config.shipping_buffer_days)
    po_qty, moq_binding = recommended_po_qty(moq, proj, config.forecast_window_days)

    return SKUMetrics(
        sku_code=sku_code,
        current_stock=current_stock,
        moq=moq,
        velocity_7d=v7,
        velocity_14d=v14,
        effective_velocity=eff,
        projected_velocity=proj,
        days_of_stock=dos,
        total_lead_days=lead,
        reorder_date=reorder_date(today, dos, lead),
        recommended_po_qty=po_qty,
        moq_binding=moq_binding,
        estimated_reorder_cost=estimated_reorder_cost(po_qty, cost_per_unit),
        status=stock_health(
            current_stock, dos, lead, config.critical_multiplier, config.low_multiplier
        ),
        trend=trend_direction(clean_series(sales, current_stock)),
        confidence_flags=confidence_flags or [],
    )
