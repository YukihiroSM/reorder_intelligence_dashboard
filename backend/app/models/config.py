"""Configuration tables: AppConfig (singleton) and SavedScenario (named config snapshots)."""

from __future__ import annotations

import uuid
from datetime import datetime
from decimal import Decimal

from sqlalchemy import (
    TIMESTAMP,
    CheckConstraint,
    Enum as SAEnum,
    Index,
    Integer,
    Numeric,
    String,
    Text,
    func,
    text,
)
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from ..db import Base
from ..enums import ScenarioKind


class AppConfig(Base):
    """Singleton row (id == 'active') holding the live operator-tunable config."""

    __tablename__ = "app_config"
    __table_args__ = (CheckConstraint("id = 'active'", name="ck_app_config_singleton"),)

    id: Mapped[str] = mapped_column(
        String(20), primary_key=True, server_default=text("'active'")
    )
    shipping_buffer_days: Mapped[int] = mapped_column(
        Integer, nullable=False, server_default=text("7")
    )
    forecast_window_days: Mapped[int] = mapped_column(
        Integer, nullable=False, server_default=text("60")
    )
    growth_pct: Mapped[Decimal] = mapped_column(
        Numeric(5, 2), nullable=False, server_default=text("0")
    )
    critical_multiplier: Mapped[Decimal] = mapped_column(
        Numeric(4, 2), nullable=False, server_default=text("1")
    )
    low_multiplier: Mapped[Decimal] = mapped_column(
        Numeric(4, 2), nullable=False, server_default=text("1.5")
    )
    velocity_window_short: Mapped[int] = mapped_column(
        Integer, nullable=False, server_default=text("7")
    )
    velocity_window_long: Mapped[int] = mapped_column(
        Integer, nullable=False, server_default=text("14")
    )
    volatility_cv_threshold: Mapped[Decimal] = mapped_column(
        Numeric(4, 2), nullable=False, server_default=text("0.5")
    )
    velocity_divergence_threshold: Mapped[Decimal] = mapped_column(
        Numeric(4, 2), nullable=False, server_default=text("0.5")
    )
    sparse_data_min_days: Mapped[int] = mapped_column(
        Integer, nullable=False, server_default=text("14")
    )
    moq_overshoot_multiplier: Mapped[Decimal] = mapped_column(
        Numeric(4, 2), nullable=False, server_default=text("2")
    )
    updated_at: Mapped[datetime] = mapped_column(
        TIMESTAMP(timezone=True), nullable=False, server_default=func.now()
    )
    updated_by: Mapped[str | None] = mapped_column(String(100), nullable=True)


class SavedScenario(Base):
    """Full config snapshot saved under a name (e.g. 'baseline', '+20% holiday')."""

    __tablename__ = "saved_scenarios"
    __table_args__ = (Index("ix_saved_scenarios_kind", "kind"),)

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, server_default=text("gen_random_uuid()")
    )
    name: Mapped[str] = mapped_column(String(100), unique=True, nullable=False)
    kind: Mapped[ScenarioKind] = mapped_column(
        SAEnum(ScenarioKind, name="scenario_kind"),
        nullable=False,
        server_default=text("'CUSTOM'"),
    )
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    shipping_buffer_days: Mapped[int] = mapped_column(Integer, nullable=False)
    forecast_window_days: Mapped[int] = mapped_column(Integer, nullable=False)
    growth_pct: Mapped[Decimal] = mapped_column(Numeric(5, 2), nullable=False)
    critical_multiplier: Mapped[Decimal] = mapped_column(Numeric(4, 2), nullable=False)
    low_multiplier: Mapped[Decimal] = mapped_column(Numeric(4, 2), nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        TIMESTAMP(timezone=True), nullable=False, server_default=func.now()
    )
    updated_at: Mapped[datetime] = mapped_column(
        TIMESTAMP(timezone=True), nullable=False, server_default=func.now()
    )
