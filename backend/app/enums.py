"""Domain enums — the DB-free canonical home.

Lives at the app root (not under `models/`) so pure services like
`calculations.py` can import these without pulling in the SQLAlchemy engine.
`str` mixin so values serialize cleanly and member name == stored value.
"""

from __future__ import annotations

import enum


class StockHealthStatus(str, enum.Enum):
    HEALTHY = "HEALTHY"
    LOW = "LOW"
    CRITICAL = "CRITICAL"
    STOCKOUT = "STOCKOUT"


class ImportStatus(str, enum.Enum):
    PENDING = "PENDING"
    SUCCESS = "SUCCESS"
    PARTIAL = "PARTIAL"
    FAILED = "FAILED"
    SKIPPED = "SKIPPED"


class ConfidenceFlag(str, enum.Enum):
    RECENT_STOCKOUT = "RECENT_STOCKOUT"
    LEADING_ZEROS = "LEADING_ZEROS"
    HIGH_VOLATILITY = "HIGH_VOLATILITY"
    DECLINING_TREND = "DECLINING_TREND"
    VELOCITY_DIVERGENCE = "VELOCITY_DIVERGENCE"
    SPARSE_DATA = "SPARSE_DATA"
    MOQ_OVERSHOOT = "MOQ_OVERSHOOT"


class AIActionType(str, enum.Enum):
    ORDER_NOW = "ORDER_NOW"
    EXPEDITE = "EXPEDITE"  # order now AND pay for rush — a stockout gap is already baked in
    ORDER_SOON = "ORDER_SOON"
    WAIT = "WAIT"
    REDUCE_ORDER = "REDUCE_ORDER"  # MOQ overshoots near-term demand — don't tie up the cash
    INVESTIGATE = "INVESTIGATE"
    DISCONTINUE = "DISCONTINUE"


class AIConfidence(str, enum.Enum):
    """How much to trust the recommendation, given the underlying data quality."""

    HIGH = "HIGH"
    MEDIUM = "MEDIUM"
    LOW = "LOW"


class ScenarioKind(str, enum.Enum):
    BASELINE = "BASELINE"
    CUSTOM = "CUSTOM"
