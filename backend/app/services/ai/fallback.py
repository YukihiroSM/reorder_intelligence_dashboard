"""Deterministic fallback results.

Used when no API key is configured, the model call fails, or it can't satisfy the
verify guardrail within the retry budget. The output is plainer than the LLM's, but
fully grounded and correct — so the dashboard is always functional and demoable, and
the README can honestly say "works without a key, just less eloquent".
"""

from __future__ import annotations

from ...enums import AIActionType, AIConfidence, ConfidenceFlag, StockHealthStatus
from ...schemas.ai import (
    BriefingActionLLM,
    BriefingWatchLLM,
    PortfolioFactPack,
    SKUFact,
    SKUSuggestionLLM,
    WeeklyBriefingLLM,
)

_LOW_CONF_FLAGS = {
    ConfidenceFlag.RECENT_STOCKOUT,
    ConfidenceFlag.SPARSE_DATA,
    ConfidenceFlag.HIGH_VOLATILITY,
    ConfidenceFlag.LEADING_ZEROS,
}
_URGENCY_BY_STATUS = {
    StockHealthStatus.STOCKOUT: 5,
    StockHealthStatus.CRITICAL: 4,
    StockHealthStatus.LOW: 3,
    StockHealthStatus.HEALTHY: 1,
}


def _confidence(fact: SKUFact) -> AIConfidence:
    if any(f in _LOW_CONF_FLAGS for f in fact.confidence_flags):
        return AIConfidence.LOW
    if fact.confidence_flags:
        return AIConfidence.MEDIUM
    return AIConfidence.HIGH


def _action_for(fact: SKUFact) -> AIActionType:
    overshoot = ConfidenceFlag.MOQ_OVERSHOOT in fact.confidence_flags
    dos = fact.days_of_stock
    if fact.status is StockHealthStatus.STOCKOUT:
        return AIActionType.EXPEDITE if fact.unavoidable_stockout_days > 0 else AIActionType.ORDER_NOW
    if fact.status is StockHealthStatus.CRITICAL:
        # Rush only when we'll run out well before a PO could land — not just because a
        # long lead time makes a comfortably-stocked SKU read as "critical".
        rush = (
            dos is not None
            and dos < fact.total_lead_days * 0.5
            and fact.unavoidable_stockout_days >= 5
        )
        if rush:
            return AIActionType.EXPEDITE
        if overshoot:
            return AIActionType.REDUCE_ORDER
        return AIActionType.ORDER_NOW
    if fact.status is StockHealthStatus.LOW:
        return AIActionType.REDUCE_ORDER if overshoot else AIActionType.ORDER_SOON
    return AIActionType.REDUCE_ORDER if overshoot else AIActionType.WAIT


def _dos(fact: SKUFact) -> str:
    return "no demand" if fact.days_of_stock is None else f"{fact.days_of_stock:.0f} days"


def _reason_for(fact: SKUFact, action: AIActionType) -> str:
    if action is AIActionType.EXPEDITE:
        return (
            f"Stock covers {_dos(fact)} against a {fact.total_lead_days}-day lead, so a "
            f"~{fact.unavoidable_stockout_days}-day stockout is already locked in "
            f"(~${fact.revenue_at_risk_usd:,.0f} at risk). Order {fact.recommended_po_qty} "
            f"now and expedite to shorten the gap."
        )
    if action is AIActionType.ORDER_NOW:
        return (
            f"Only {_dos(fact)} of cover against a {fact.total_lead_days}-day lead. "
            f"Place the {fact.recommended_po_qty}-unit PO now to avoid running out."
        )
    if action is AIActionType.ORDER_SOON:
        return (
            f"{_dos(fact)} of cover; the {fact.total_lead_days}-day lead means the reorder "
            f"window is approaching. Plan the {fact.recommended_po_qty}-unit PO this week."
        )
    if action is AIActionType.REDUCE_ORDER:
        cover = f"{fact.moq_coverage_days:.0f}" if fact.moq_coverage_days else "many"
        return (
            f"Comfortable at {_dos(fact)} of cover, but the MOQ of {fact.moq} buys ~{cover} "
            f"days of demand. Negotiate a smaller MOQ or delay rather than freeze the cash."
        )
    return (
        f"{_dos(fact)} of cover against a {fact.total_lead_days}-day lead — ample buffer. "
        f"No order needed yet."
    )


def _warnings_for(fact: SKUFact) -> list[str]:
    warnings: list[str] = []
    if fact.unavoidable_stockout_days > 0:
        warnings.append(
            f"~{fact.unavoidable_stockout_days}-day stockout can't be fully avoided from here."
        )
    if ConfidenceFlag.RECENT_STOCKOUT in fact.confidence_flags:
        warnings.append(
            f"Recent stockout suppresses the 7-day rate ({fact.velocity_7d:.1f}); "
            f"forecasting on effective {fact.effective_velocity:.1f}/day."
        )
    if ConfidenceFlag.MOQ_OVERSHOOT in fact.confidence_flags and fact.moq_coverage_days:
        warnings.append(
            f"MOQ commits ~{fact.moq_coverage_days:.0f} days of demand — heavy cash tie-up."
        )
    return warnings


def fallback_sku(fact: SKUFact) -> SKUSuggestionLLM:
    action = _action_for(fact)
    ordering = action in {
        AIActionType.ORDER_NOW,
        AIActionType.EXPEDITE,
        AIActionType.ORDER_SOON,
        AIActionType.REDUCE_ORDER,
    }
    headlines = {
        AIActionType.EXPEDITE: f"Order {fact.recommended_po_qty} now and rush — stockout already locked in",
        AIActionType.ORDER_NOW: f"Order {fact.recommended_po_qty} now — only {_dos(fact)} of cover",
        AIActionType.ORDER_SOON: f"Plan a {fact.recommended_po_qty}-unit PO this week",
        AIActionType.REDUCE_ORDER: f"MOQ {fact.moq} overshoots demand — negotiate before ordering",
        AIActionType.WAIT: f"Healthy — {_dos(fact)} of cover, no action needed",
    }
    return SKUSuggestionLLM(
        action=action,
        urgency=_URGENCY_BY_STATUS[fact.status],
        headline=headlines[action],
        reasoning=_reason_for(fact, action),
        suggested_po_qty=fact.recommended_po_qty if ordering else None,
        revenue_at_risk_usd=fact.revenue_at_risk_usd,
        confidence=_confidence(fact),
        warnings=_warnings_for(fact),
    )


def fallback_briefing(pack: PortfolioFactPack) -> WeeklyBriefingLLM:
    c = pack.status_counts
    fires = c.get("STOCKOUT", 0) + c.get("CRITICAL", 0)
    if fires:
        summary = (
            f"{fires} SKU(s) need action now and the actionable set carries "
            f"~${pack.total_revenue_at_risk_usd:,.0f} of revenue at risk against "
            f"~${pack.total_cash_to_commit_usd:,.0f} of reorder spend. Clear the "
            f"stockouts and critical lines first."
        )
    elif pack.actionable:
        summary = (
            f"No stockouts, but {len(pack.actionable)} SKU(s) are getting low — plan their "
            f"POs (~${pack.total_cash_to_commit_usd:,.0f}) before the lead windows close."
        )
    else:
        summary = "All SKUs are healthy under this scenario — no reorder action needed this week."

    top_actions = [
        BriefingActionLLM(
            sku_code=f.sku_code,
            action=_action_for(f),
            urgency=_URGENCY_BY_STATUS[f.status],
            headline=fallback_sku(f).headline,
            why_now=_reason_for(f, _action_for(f)),
        )
        for f in pack.actionable[:5]
    ]
    watch_list = [
        BriefingWatchLLM(
            sku_code=f.sku_code,
            note=(_warnings_for(f) or [f"Flagged: {[x.value for x in f.confidence_flags]}"])[0],
        )
        for f in pack.watch_candidates[:5]
    ]
    return WeeklyBriefingLLM(summary=summary, top_actions=top_actions, watch_list=watch_list)
