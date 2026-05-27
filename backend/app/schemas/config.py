"""AppConfig read/update schemas. Ranges are validated on update."""

from __future__ import annotations

from datetime import datetime
from decimal import Decimal

from pydantic import BaseModel, ConfigDict, Field


class AppConfigOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    shipping_buffer_days: int
    forecast_window_days: int
    growth_pct: float
    critical_multiplier: float
    low_multiplier: float
    velocity_window_short: int
    velocity_window_long: int
    volatility_cv_threshold: float
    velocity_divergence_threshold: float
    sparse_data_min_days: int
    moq_overshoot_multiplier: float
    updated_at: datetime
    updated_by: str | None = None


class AppConfigUpdate(BaseModel):
    """Partial update; only provided fields change. Decimals stay Decimal to the DB."""

    shipping_buffer_days: int | None = Field(default=None, ge=0, le=90)
    forecast_window_days: int | None = Field(default=None, ge=1, le=365)
    growth_pct: Decimal | None = Field(default=None, ge=-100, le=1000)
    critical_multiplier: Decimal | None = Field(default=None, ge=0, le=10)
    low_multiplier: Decimal | None = Field(default=None, ge=0, le=10)
    velocity_window_short: int | None = Field(default=None, ge=1, le=60)
    velocity_window_long: int | None = Field(default=None, ge=1, le=120)
    volatility_cv_threshold: Decimal | None = Field(default=None, ge=0, le=10)
    velocity_divergence_threshold: Decimal | None = Field(default=None, ge=0, le=10)
    sparse_data_min_days: int | None = Field(default=None, ge=0, le=60)
    moq_overshoot_multiplier: Decimal | None = Field(default=None, ge=0, le=100)
    updated_by: str | None = None
