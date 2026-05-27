"""Golden tests for the pure calculation core, against the real inventory.json.

`today` is locked to the dataset's config.today (2026-05-25).

NOTE — two expectations differ from IMPLEMENTATION_PLAN.md, which had arithmetic
errors vs the brief's formula (confirmed with the user, "follow the formula"):
  * GLW-001 is CRITICAL, not HEALTHY: 1240 stock / ~80/day = ~15 days < 49-day
    lead. It is still flag-free (steady data). VTC-501 is the genuine
    HEALTHY + no-flags baseline.
  * GLW-005's PO is demand-bound (~34/day x 60 ≈ 2058), not MOQ-bound at 500.
"""

from __future__ import annotations

import json
from datetime import date
from decimal import Decimal
from pathlib import Path

from app.enums import ConfidenceFlag, StockHealthStatus
from app.services.calculations import CalcConfig, SKUMetrics, compute_metrics
from app.services.confidence import detect_flags

TODAY = date(2026, 5, 25)
DATA_FILE = Path(__file__).resolve().parents[2] / "data" / "inventory.json"
DEFAULT = CalcConfig()

_doc = json.loads(DATA_FILE.read_text(), parse_float=Decimal)
SKUS = {s["sku"]: s for s in _doc["skus"]}


def compute(sku: str, config: CalcConfig = DEFAULT) -> SKUMetrics:
    item = SKUS[sku]
    sales = item["sales_last_30_days"]
    flags = detect_flags(sales, item["current_stock"], item["moq"], config)
    return compute_metrics(
        today=TODAY,
        sku_code=sku,
        current_stock=item["current_stock"],
        moq=item["moq"],
        cost_per_unit=item["cost_per_unit_usd"],
        production_lead_days=item["production_lead_days"],
        shipping_days=item["shipping_days"],
        sales=sales,
        config=config,
        confidence_flags=flags,
    )


def compute_all(config: CalcConfig = DEFAULT) -> dict[str, SKUMetrics]:
    return {code: compute(code, config) for code in SKUS}


# --------------------------------------------------------------------------- #
# Per-SKU golden assertions
# --------------------------------------------------------------------------- #
def test_glw005_critical() -> None:
    """Magnesium Glycinate: 60 stock, ~34/day -> <2 days, 49-day lead -> CRITICAL."""
    m = compute("GLW-005")
    assert m.status is StockHealthStatus.CRITICAL
    assert m.days_of_stock is not None and m.days_of_stock < 3
    assert m.reorder_date is not None and m.reorder_date < TODAY  # overdue
    # Corrected vs plan: demand (34/day x 60) dwarfs MOQ 500 -> not MOQ-bound.
    assert m.moq_binding is False
    assert m.recommended_po_qty > 1500


def test_glw006_stockout_aware() -> None:
    """Hair Growth Gummies: 0 stock, last 5 days zero. Velocity skips the tail."""
    m = compute("GLW-006")
    assert m.status is StockHealthStatus.STOCKOUT
    assert ConfidenceFlag.RECENT_STOCKOUT in m.confidence_flags
    assert Decimal(12) < m.effective_velocity < Decimal(18)


def test_vtc601_leading_zeros() -> None:
    """Probiotic Complex: first 7 days zero (launch). Healthy, not declining."""
    m = compute("VTC-601")
    assert ConfidenceFlag.LEADING_ZEROS in m.confidence_flags
    assert m.status is StockHealthStatus.HEALTHY  # 1680 stock, ~5/day
    assert ConfidenceFlag.DECLINING_TREND not in m.confidence_flags


def test_glw007_volatile_or_declining() -> None:
    """Limited Edition Bundle: low volume + declining."""
    m = compute("GLW-007")
    assert (
        ConfidenceFlag.HIGH_VOLATILITY in m.confidence_flags
        or ConfidenceFlag.DECLINING_TREND in m.confidence_flags
    )


def test_glw002_below_moq_critical() -> None:
    """Daily Greens Berry: 320 stock < MOQ 500, ~19/day, 49-day lead -> CRITICAL."""
    m = compute("GLW-002")
    assert m.status is StockHealthStatus.CRITICAL
    assert m.current_stock < m.moq


def test_vtc302_moq_overshoot() -> None:
    """Travel Multivitamin: ~3/day, MOQ 800 ≈ 280 days of demand -> overshoot."""
    m = compute("VTC-302")
    assert ConfidenceFlag.MOQ_OVERSHOOT in m.confidence_flags
    assert m.recommended_po_qty == 800
    assert m.moq_binding is True


def test_glw001_nominal_no_flags() -> None:
    """Daily Greens Tropical: steady data -> no flags. (Status is CRITICAL: 1240
    stock / ~80/day = ~15 days < 49-day lead — corrected from the plan's HEALTHY.)"""
    m = compute("GLW-001")
    assert m.confidence_flags == []
    assert m.status is StockHealthStatus.CRITICAL


def test_vtc501_healthy_baseline() -> None:
    """Vitamin D3+K2: 4800 stock, ~39/day -> ~123 days. Genuine HEALTHY + no flags."""
    m = compute("VTC-501")
    assert m.status is StockHealthStatus.HEALTHY
    assert m.confidence_flags == []


# --------------------------------------------------------------------------- #
# Scenario + edge cases
# --------------------------------------------------------------------------- #
def test_growth_scenario_shifts_reorder_dates() -> None:
    """At +30% growth, days-of-stock drops and PO qty never shrinks."""
    baseline = compute_all(DEFAULT)
    boosted = compute_all(DEFAULT.with_growth(30))
    for code, b in baseline.items():
        bo = boosted[code]
        if b.days_of_stock is not None:
            assert bo.days_of_stock is not None
            if b.days_of_stock > 0:
                assert bo.days_of_stock < b.days_of_stock  # depletes sooner
            else:
                assert bo.days_of_stock == b.days_of_stock  # already stocked out
        assert bo.recommended_po_qty >= b.recommended_po_qty


def test_velocity_zero_returns_none_days() -> None:
    """All-zero sales with stock on hand -> infinite days, no reorder date."""
    m = compute_metrics(
        today=TODAY,
        sku_code="SYN-ZERO",
        current_stock=100,
        moq=50,
        cost_per_unit=Decimal("1.00"),
        production_lead_days=20,
        shipping_days=10,
        sales=[0] * 30,
        config=DEFAULT,
    )
    assert m.days_of_stock is None
    assert m.reorder_date is None
    assert m.status is StockHealthStatus.HEALTHY


def test_critical_skus_present_in_dataset() -> None:
    """Sanity: the known-critical SKUs all resolve to CRITICAL/STOCKOUT."""
    metrics = compute_all()
    assert metrics["GLW-005"].status is StockHealthStatus.CRITICAL
    assert metrics["GLW-002"].status is StockHealthStatus.CRITICAL
    assert metrics["GLW-006"].status is StockHealthStatus.STOCKOUT
