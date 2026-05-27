"""SKU metrics DTO — the API/UI view of one SKU. Decimals are floats at this edge."""

from __future__ import annotations

from datetime import date

from pydantic import BaseModel

from ..enums import StockHealthStatus


class SKUMetricsDTO(BaseModel):
    sku_code: str
    name: str
    category: str
    supplier: str

    current_stock: int
    moq: int
    cost_per_unit_usd: float
    retail_price_usd: float

    production_lead_days: int
    shipping_days: int
    total_lead_days: int

    velocity_7d: float
    velocity_14d: float
    effective_velocity: float
    projected_velocity: float

    days_of_stock: float | None
    reorder_date: date | None
    recommended_po_qty: int
    moq_binding: bool
    estimated_reorder_cost: float

    status: StockHealthStatus
    trend: str
    confidence_flags: list[str]

    # Only populated on the single-SKU detail endpoint (for the trend chart).
    sales_last_30_days: list[int] | None = None
