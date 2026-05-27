
"""Schemas for the inventory importer: input file validation + API responses."""

from __future__ import annotations

from datetime import date
from decimal import Decimal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field

from ..enums import ImportStatus


class InventoryConfigSchema(BaseModel):
    """The `config` block of inventory.json. Extra keys (notes, defaults) ignored."""

    model_config = ConfigDict(extra="ignore")

    today: date
    data_window_days: int = 30


class SKUInput(BaseModel):
    """One SKU entry in inventory.json."""

    model_config = ConfigDict(extra="ignore")

    sku: str
    name: str
    category: str
    supplier: str
    cost_per_unit_usd: Decimal
    retail_price_usd: Decimal
    current_stock: int = Field(ge=0)
    moq: int = Field(ge=0)
    production_lead_days: int = Field(ge=0)
    shipping_days: int = Field(ge=0)
    sales_last_30_days: list[int]


class InventoryFileSchema(BaseModel):
    """Top-level inventory.json structure."""

    model_config = ConfigDict(extra="ignore")

    config: InventoryConfigSchema
    skus: list[SKUInput] = Field(min_length=1)


class ImportRunOut(BaseModel):
    """Serialized ImportRun for API responses."""

    model_config = ConfigDict(from_attributes=True)

    id: UUID
    status: ImportStatus
    source_filename: str
    data_date: date
    skus_created: int
    skus_updated: int
    snapshots_created: int
    sales_rows_inserted: int
    sales_rows_skipped: int


class ImportResponse(BaseModel):
    """POST /api/import result: whether the file was a duplicate, plus the run."""

    skipped: bool
    run: ImportRunOut
