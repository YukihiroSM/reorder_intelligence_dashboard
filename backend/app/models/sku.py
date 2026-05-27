"""SKU core tables: SKU, SKUSnapshot (per-import state), SKUSalesDaily (sales history)."""

from __future__ import annotations

import uuid
from datetime import date, datetime
from decimal import Decimal
from typing import TYPE_CHECKING

from sqlalchemy import (
    TIMESTAMP,
    Boolean,
    Date,
    ForeignKey,
    Index,
    Integer,
    Numeric,
    String,
    UniqueConstraint,
    func,
    text,
)
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from ..db import Base

if TYPE_CHECKING:
    from .ai import AISuggestion
    from .reference import Category, Supplier


def _fk(target: str) -> ForeignKey:
    """FK matching db_schema.sql: DEFERRABLE INITIALLY IMMEDIATE."""
    return ForeignKey(target, deferrable=True, initially="IMMEDIATE")


class SKU(Base):
    __tablename__ = "skus"
    __table_args__ = (
        Index("ix_skus_category_id", "category_id"),
        Index("ix_skus_supplier_id", "supplier_id"),
        Index("ix_skus_is_active", "is_active"),
    )

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, server_default=text("gen_random_uuid()")
    )
    sku_code: Mapped[str] = mapped_column(String(50), unique=True, nullable=False)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    category_id: Mapped[uuid.UUID] = mapped_column(_fk("categories.id"), nullable=False)
    supplier_id: Mapped[uuid.UUID] = mapped_column(_fk("suppliers.id"), nullable=False)
    # Time-varying state (stock/cost/retail/moq) lives only on SKUSnapshot — the
    # single source of truth. The SKU row is just identity + references.
    is_active: Mapped[bool] = mapped_column(
        Boolean, nullable=False, server_default=text("true")
    )
    created_at: Mapped[datetime] = mapped_column(
        TIMESTAMP(timezone=True), nullable=False, server_default=func.now()
    )
    updated_at: Mapped[datetime] = mapped_column(
        TIMESTAMP(timezone=True), nullable=False, server_default=func.now()
    )

    category: Mapped[Category] = relationship(back_populates="skus")
    supplier: Mapped[Supplier] = relationship(back_populates="skus")
    snapshots: Mapped[list[SKUSnapshot]] = relationship(
        back_populates="sku", cascade="all, delete-orphan"
    )
    sales: Mapped[list[SKUSalesDaily]] = relationship(
        back_populates="sku", cascade="all, delete-orphan"
    )
    ai_suggestions: Mapped[list[AISuggestion]] = relationship(
        back_populates="sku", cascade="all, delete-orphan"
    )


class SKUSnapshot(Base):
    __tablename__ = "sku_snapshots"
    __table_args__ = (
        UniqueConstraint("sku_id", "snapshot_date", name="uq_sku_snapshot_date"),
        Index("ix_sku_snapshots_sku_id", "sku_id"),
        Index("ix_sku_snapshots_snapshot_date", "snapshot_date"),
        Index("ix_sku_snapshots_import_run_id", "import_run_id"),
    )

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, server_default=text("gen_random_uuid()")
    )
    sku_id: Mapped[uuid.UUID] = mapped_column(_fk("skus.id"), nullable=False)
    snapshot_date: Mapped[date] = mapped_column(Date, nullable=False)
    current_stock: Mapped[int] = mapped_column(Integer, nullable=False)
    cost_per_unit_usd: Mapped[Decimal] = mapped_column(Numeric(10, 2), nullable=False)
    retail_price_usd: Mapped[Decimal] = mapped_column(Numeric(10, 2), nullable=False)
    moq: Mapped[int] = mapped_column(Integer, nullable=False)
    import_run_id: Mapped[uuid.UUID] = mapped_column(
        _fk("import_runs.id"), nullable=False
    )
    created_at: Mapped[datetime] = mapped_column(
        TIMESTAMP(timezone=True), nullable=False, server_default=func.now()
    )

    sku: Mapped[SKU] = relationship(back_populates="snapshots")


class SKUSalesDaily(Base):
    __tablename__ = "sku_sales_daily"
    __table_args__ = (
        UniqueConstraint("sku_id", "sale_date", name="uq_sku_sale_date"),
        Index("ix_sku_sales_daily_sku_id", "sku_id"),
        Index("ix_sku_sales_daily_sale_date", "sale_date"),
        Index("idx_sku_sales_lookup", "sku_id", "sale_date"),
    )

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, server_default=text("gen_random_uuid()")
    )
    sku_id: Mapped[uuid.UUID] = mapped_column(_fk("skus.id"), nullable=False)
    sale_date: Mapped[date] = mapped_column(Date, nullable=False)
    units_sold: Mapped[int] = mapped_column(Integer, nullable=False)
    import_run_id: Mapped[uuid.UUID] = mapped_column(
        _fk("import_runs.id"), nullable=False
    )
    created_at: Mapped[datetime] = mapped_column(
        TIMESTAMP(timezone=True), nullable=False, server_default=func.now()
    )

    sku: Mapped[SKU] = relationship(back_populates="sales")
