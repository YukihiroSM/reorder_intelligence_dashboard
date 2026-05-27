"""Saved scenario schemas (named config snapshots: 'baseline', '+20% holiday')."""

from __future__ import annotations

from datetime import datetime
from decimal import Decimal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field

from ..enums import ScenarioKind


class ScenarioOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    name: str
    kind: ScenarioKind
    description: str | None
    shipping_buffer_days: int
    forecast_window_days: int
    growth_pct: float
    critical_multiplier: float
    low_multiplier: float
    created_at: datetime


class ScenarioCreate(BaseModel):
    name: str = Field(min_length=1, max_length=100)
    description: str | None = None
    kind: ScenarioKind = ScenarioKind.CUSTOM
    shipping_buffer_days: int = Field(default=7, ge=0, le=90)
    forecast_window_days: int = Field(default=60, ge=1, le=365)
    growth_pct: Decimal = Field(default=Decimal(0), ge=-100, le=1000)
    critical_multiplier: Decimal = Field(default=Decimal(1), ge=0, le=10)
    low_multiplier: Decimal = Field(default=Decimal("1.5"), ge=0, le=10)
