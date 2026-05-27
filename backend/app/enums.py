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
    ORDER_SOON = "ORDER_SOON"
    WAIT = "WAIT"
    INVESTIGATE = "INVESTIGATE"
    DISCONTINUE = "DISCONTINUE"


class ScenarioKind(str, enum.Enum):
    BASELINE = "BASELINE"
    CUSTOM = "CUSTOM"
