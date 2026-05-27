"""ImportRun: one row per import attempt; drives file- and row-level dedup."""

from __future__ import annotations

import uuid
from datetime import date, datetime

from sqlalchemy import (
    TIMESTAMP,
    Date,
    Enum as SAEnum,
    Index,
    Integer,
    String,
    func,
    text,
)
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column

from ..db import Base
from ..enums import ImportStatus


class ImportRun(Base):
    __tablename__ = "import_runs"
    __table_args__ = (
        Index("ix_import_runs_status", "status"),
        Index("ix_import_runs_started_at", "started_at"),
    )

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, server_default=text("gen_random_uuid()")
    )
    file_checksum: Mapped[str] = mapped_column(String(64), unique=True, nullable=False)
    source_filename: Mapped[str] = mapped_column(String(255), nullable=False)
    data_date: Mapped[date] = mapped_column(Date, nullable=False)
    status: Mapped[ImportStatus] = mapped_column(
        SAEnum(ImportStatus, name="import_status"),
        nullable=False,
        server_default=text("'PENDING'"),
    )
    skus_created: Mapped[int] = mapped_column(
        Integer, nullable=False, server_default=text("0")
    )
    skus_updated: Mapped[int] = mapped_column(
        Integer, nullable=False, server_default=text("0")
    )
    snapshots_created: Mapped[int] = mapped_column(
        Integer, nullable=False, server_default=text("0")
    )
    sales_rows_inserted: Mapped[int] = mapped_column(
        Integer, nullable=False, server_default=text("0")
    )
    sales_rows_skipped: Mapped[int] = mapped_column(
        Integer, nullable=False, server_default=text("0")
    )
    error_log: Mapped[list | None] = mapped_column(JSONB, nullable=True)
    started_at: Mapped[datetime] = mapped_column(
        TIMESTAMP(timezone=True), nullable=False, server_default=func.now()
    )
    finished_at: Mapped[datetime | None] = mapped_column(
        TIMESTAMP(timezone=True), nullable=True
    )
