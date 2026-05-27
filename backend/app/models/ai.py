"""AI advisor persistence: per-SKU suggestions and portfolio briefings.

Both tables double as a cache (keyed by `context_hash`) and an audit trail. The hash
folds in the grounded fact-pack + config + prompt version, so a cache hit means the
exact same scenario was already reasoned about — no second LLM call.
"""

from __future__ import annotations

import uuid
from datetime import datetime
from typing import TYPE_CHECKING

from sqlalchemy import (
    TIMESTAMP,
    Enum as SAEnum,
    ForeignKey,
    Index,
    Integer,
    Numeric,
    String,
    Text,
    UniqueConstraint,
    func,
    text,
)
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from ..db import Base
from ..enums import AIActionType, AIConfidence

if TYPE_CHECKING:
    from .sku import SKU


class AISuggestion(Base):
    __tablename__ = "ai_suggestions"
    __table_args__ = (
        UniqueConstraint("sku_id", "context_hash", name="uq_ai_cache_key"),
        Index("ix_ai_suggestions_sku_id", "sku_id"),
        Index("ix_ai_suggestions_context_hash", "context_hash"),
        Index("ix_ai_suggestions_generated_at", "generated_at"),
        Index("idx_sku_history", "sku_id", "generated_at"),
    )

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, server_default=text("gen_random_uuid()")
    )
    sku_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("skus.id", deferrable=True, initially="IMMEDIATE"), nullable=False
    )
    context_hash: Mapped[str] = mapped_column(String(64), nullable=False)
    context_snapshot: Mapped[dict] = mapped_column(JSONB, nullable=False)
    action_type: Mapped[AIActionType] = mapped_column(
        SAEnum(AIActionType, name="ai_action_type"), nullable=False
    )
    urgency: Mapped[int] = mapped_column(Integer, nullable=False)
    headline: Mapped[str] = mapped_column(String(200), nullable=False, server_default="")
    reasoning: Mapped[str] = mapped_column(Text, nullable=False)
    suggested_po_qty: Mapped[int | None] = mapped_column(Integer, nullable=True)
    revenue_at_risk_usd: Mapped[float] = mapped_column(
        Numeric(14, 2), nullable=False, server_default=text("0")
    )
    confidence: Mapped[AIConfidence] = mapped_column(
        SAEnum(AIConfidence, name="ai_confidence"),
        nullable=False,
        server_default=text("'MEDIUM'"),
    )
    warnings: Mapped[list[str]] = mapped_column(
        JSONB, nullable=False, server_default=text("'[]'::jsonb")
    )
    ai_status: Mapped[str] = mapped_column(
        String(20), nullable=False, server_default=text("'ok'")
    )
    model_name: Mapped[str] = mapped_column(String(100), nullable=False)
    tokens_input: Mapped[int | None] = mapped_column(Integer, nullable=True)
    tokens_output: Mapped[int | None] = mapped_column(Integer, nullable=True)
    generated_at: Mapped[datetime] = mapped_column(
        TIMESTAMP(timezone=True), nullable=False, server_default=func.now()
    )

    sku: Mapped[SKU] = relationship(back_populates="ai_suggestions")


class AIBriefing(Base):
    """A cached weekly portfolio briefing. No `sku_id` — it spans the portfolio."""

    __tablename__ = "ai_briefings"
    __table_args__ = (
        UniqueConstraint("context_hash", name="uq_ai_briefing_key"),
        Index("ix_ai_briefings_generated_at", "generated_at"),
    )

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, server_default=text("gen_random_uuid()")
    )
    context_hash: Mapped[str] = mapped_column(String(64), nullable=False)
    # Full WeeklyBriefingDTO content (summary, top_actions, watch_list, scenario, counts).
    payload: Mapped[dict] = mapped_column(JSONB, nullable=False)
    total_cash_to_commit_usd: Mapped[float] = mapped_column(Numeric(14, 2), nullable=False)
    total_revenue_at_risk_usd: Mapped[float] = mapped_column(Numeric(14, 2), nullable=False)
    ai_status: Mapped[str] = mapped_column(
        String(20), nullable=False, server_default=text("'ok'")
    )
    model_name: Mapped[str] = mapped_column(String(100), nullable=False)
    tokens_input: Mapped[int | None] = mapped_column(Integer, nullable=True)
    tokens_output: Mapped[int | None] = mapped_column(Integer, nullable=True)
    generated_at: Mapped[datetime] = mapped_column(
        TIMESTAMP(timezone=True), nullable=False, server_default=func.now()
    )
