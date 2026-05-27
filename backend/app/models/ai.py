"""AISuggestion: cached LLM recommendation per (sku, context_hash)."""

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
    String,
    Text,
    UniqueConstraint,
    func,
    text,
)
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from ..db import Base
from .enums import AIActionType

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
    reasoning: Mapped[str] = mapped_column(Text, nullable=False)
    suggested_po_qty: Mapped[int | None] = mapped_column(Integer, nullable=True)
    warnings: Mapped[list[str]] = mapped_column(
        JSONB, nullable=False, server_default=text("'[]'::jsonb")
    )
    model_name: Mapped[str] = mapped_column(String(100), nullable=False)
    tokens_input: Mapped[int | None] = mapped_column(Integer, nullable=True)
    tokens_output: Mapped[int | None] = mapped_column(Integer, nullable=True)
    generated_at: Mapped[datetime] = mapped_column(
        TIMESTAMP(timezone=True), nullable=False, server_default=func.now()
    )

    sku: Mapped[SKU] = relationship(back_populates="ai_suggestions")
