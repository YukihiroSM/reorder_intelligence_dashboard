"""Deterministic guardrail: catch a model response that drifts from the facts.

Pure functions returning a list of human-readable violations (empty == clean). The
graph feeds any violations back to the model for one repair attempt, then falls back to
the deterministic result. This is what lets the operator trust the numbers — the LLM
cannot ship a figure or an action that contradicts the grounded fact-pack.
"""

from __future__ import annotations

from ...enums import AIActionType, AIConfidence, ConfidenceFlag, StockHealthStatus
from ...schemas.ai import (
    PortfolioFactPack,
    SKUFact,
    SKUSuggestionLLM,
    WeeklyBriefingLLM,
)

# Actions that mean "commit a PO now" — they must carry a qty that respects MOQ.
_ORDERING = {
    AIActionType.ORDER_NOW,
    AIActionType.EXPEDITE,
    AIActionType.ORDER_SOON,
    AIActionType.REDUCE_ORDER,
}
# Flags that should cap confidence below HIGH.
_LOW_CONFIDENCE_FLAGS = {
    ConfidenceFlag.RECENT_STOCKOUT,
    ConfidenceFlag.SPARSE_DATA,
    ConfidenceFlag.HIGH_VOLATILITY,
    ConfidenceFlag.LEADING_ZEROS,
}


def _money_off(claimed: float, truth: float) -> bool:
    """True if `claimed` is outside a generous tolerance of `truth` (rounding-friendly)."""
    return abs(claimed - truth) > max(1.0, abs(truth) * 0.1)


def _action_fits_status(action: AIActionType, status: StockHealthStatus) -> str | None:
    if status is StockHealthStatus.STOCKOUT and action not in {
        AIActionType.ORDER_NOW,
        AIActionType.EXPEDITE,
        AIActionType.INVESTIGATE,
    }:
        return f"status is STOCKOUT but action is {action.value} (must order/expedite/investigate)"
    if status is StockHealthStatus.HEALTHY and action in {
        AIActionType.ORDER_NOW,
        AIActionType.EXPEDITE,
    }:
        return f"status is HEALTHY but action is {action.value} (no urgent order warranted)"
    return None


def verify_sku(result: SKUSuggestionLLM, fact: SKUFact) -> list[str]:
    errors: list[str] = []

    if _money_off(result.revenue_at_risk_usd, fact.revenue_at_risk_usd):
        errors.append(
            f"revenue_at_risk_usd={result.revenue_at_risk_usd} must equal the fact "
            f"value {fact.revenue_at_risk_usd}"
        )

    if result.action in _ORDERING:
        if result.suggested_po_qty is None:
            errors.append(f"action {result.action.value} requires a suggested_po_qty")
        elif result.suggested_po_qty < fact.moq:
            errors.append(
                f"suggested_po_qty={result.suggested_po_qty} is below MOQ {fact.moq}"
            )

    if (msg := _action_fits_status(result.action, fact.status)) is not None:
        errors.append(msg)

    if result.confidence is AIConfidence.HIGH and any(
        f in _LOW_CONFIDENCE_FLAGS for f in fact.confidence_flags
    ):
        flags = [f.value for f in fact.confidence_flags if f in _LOW_CONFIDENCE_FLAGS]
        errors.append(f"confidence HIGH is too strong given flags {flags}")

    return errors


def verify_briefing(result: WeeklyBriefingLLM, pack: PortfolioFactPack) -> list[str]:
    errors: list[str] = []

    actionable = {f.sku_code: f for f in pack.actionable}
    known = set(actionable) | {f.sku_code for f in pack.watch_candidates}

    if len(result.top_actions) > 5:
        errors.append(f"top_actions has {len(result.top_actions)} items (max 5)")
    if len(result.watch_list) > 5:
        errors.append(f"watch_list has {len(result.watch_list)} items (max 5)")

    for a in result.top_actions:
        fact = actionable.get(a.sku_code)
        if fact is None:
            errors.append(
                f"top_actions references {a.sku_code}, which is not an actionable SKU"
            )
            continue
        if (msg := _action_fits_status(a.action, fact.status)) is not None:
            errors.append(f"{a.sku_code}: {msg}")

    for w in result.watch_list:
        if w.sku_code not in known:
            errors.append(f"watch_list references unknown SKU {w.sku_code}")

    return errors
