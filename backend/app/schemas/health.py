"""Health endpoint response schema."""

from __future__ import annotations

from datetime import date

from pydantic import BaseModel


class HealthOut(BaseModel):
    status: str
    data_date: date | None
    skus_loaded: int
