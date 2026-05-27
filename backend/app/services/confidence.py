"""Confidence-flag detection. Pure (no DB), built on calculations.py.

Flags tell the operator when a forecast is shaky or a SKU is mis-stocked:
RECENT_STOCKOUT, LEADING_ZEROS, HIGH_VOLATILITY, DECLINING_TREND,
VELOCITY_DIVERGENCE, SPARSE_DATA, MOQ_OVERSHOOT.
"""

from __future__ import annotations

from decimal import Decimal

from ..enums import ConfidenceFlag
from .calculations import (
    CalcConfig,
    clean_series,
    coefficient_of_variation,
    daily_velocity,
    effective_velocity,
    projected_velocity,
    recommended_po_qty,
    trend_direction,
)


def detect_flags(
    sales: list[int], current_stock: int, moq: int, config: CalcConfig
) -> list[ConfidenceFlag]:
    """Return the confidence flags for a SKU, in a stable priority order."""
    flags: list[ConfidenceFlag] = []

    # RECENT_STOCKOUT / LEADING_ZEROS come from the velocity adjustment so the
    # detection logic lives in exactly one place.
    eff_vel, vel_flags = effective_velocity(
        sales, current_stock, config.velocity_window_short
    )
    if ConfidenceFlag.RECENT_STOCKOUT in vel_flags:
        flags.append(ConfidenceFlag.RECENT_STOCKOUT)
    if ConfidenceFlag.LEADING_ZEROS in vel_flags:
        flags.append(ConfidenceFlag.LEADING_ZEROS)

    # Trend/volatility on the cleaned series (launch lead-in & stockout tail removed),
    # so a launch SKU isn't falsely flagged as volatile or declining.
    cleaned = clean_series(sales, current_stock)

    if coefficient_of_variation(cleaned) > config.volatility_cv_threshold:
        flags.append(ConfidenceFlag.HIGH_VOLATILITY)

    if trend_direction(cleaned) == "down":
        flags.append(ConfidenceFlag.DECLINING_TREND)

    v_short = daily_velocity(cleaned, config.velocity_window_short)
    v_long = daily_velocity(cleaned, config.velocity_window_long)
    divergence = abs(v_short - v_long) / max(v_long, Decimal(1))
    if divergence > config.velocity_divergence_threshold:
        flags.append(ConfidenceFlag.VELOCITY_DIVERGENCE)

    nonzero_days = sum(1 for v in sales if v > 0)
    if nonzero_days < config.sparse_data_min_days:
        flags.append(ConfidenceFlag.SPARSE_DATA)

    # MOQ_OVERSHOOT: the order we'd place vastly exceeds forecast-window demand.
    proj = projected_velocity(eff_vel, config.growth_pct)
    po_qty, _ = recommended_po_qty(moq, proj, config.forecast_window_days)
    overshoot_ceiling = proj * Decimal(config.forecast_window_days) * config.moq_overshoot_multiplier
    if po_qty > overshoot_ceiling:
        flags.append(ConfidenceFlag.MOQ_OVERSHOOT)

    return flags
