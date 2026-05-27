"""Graph nodes + routers for the advisor pipeline.

prepare → reason → verify, with conditional edges:
  - portfolio with nothing actionable short-circuits to the deterministic briefing (no LLM);
  - an LLM failure (no key / API error / unparseable) routes to fallback;
  - a verify violation loops back to reason once (with the violations fed back), then falls
    back to the grounded deterministic result if it still can't comply.
"""

from __future__ import annotations

from . import fallback as fb
from . import verify as vfy
from .llm import run_structured
from .state import AdvisorState
from ...prompts.sku_action import build_sku_messages
from ...prompts.weekly_briefing import build_briefing_messages
from ...schemas.ai import SKUSuggestionLLM, WeeklyBriefingLLM

MAX_ATTEMPTS = 2  # one initial call + one repair attempt


# --------------------------------------------------------------------------- #
# Nodes
# --------------------------------------------------------------------------- #
def prepare(state: AdvisorState) -> AdvisorState:
    if state["scope"] == "sku":
        messages = build_sku_messages(state["sku_fact"])
    else:
        messages = build_briefing_messages(state["pack"])
    return {"messages": messages, "attempts": 0, "errors": [], "llm_failed": False}


def reason(state: AdvisorState) -> AdvisorState:
    messages = state["messages"]
    try:
        if state["scope"] == "sku":
            sku_res, t_in, t_out = run_structured(messages, SKUSuggestionLLM)
            result: AdvisorState = {"sku_result": sku_res}
        else:
            brief_res, t_in, t_out = run_structured(messages, WeeklyBriefingLLM)
            result = {"briefing_result": brief_res}
    except Exception:  # noqa: BLE001 — any failure routes to the deterministic fallback
        return {"llm_failed": True, "attempts": state.get("attempts", 0) + 1}

    result["llm_failed"] = False
    result["attempts"] = state.get("attempts", 0) + 1
    result["tokens_input"] = (state.get("tokens_input") or 0) + (t_in or 0)
    result["tokens_output"] = (state.get("tokens_output") or 0) + (t_out or 0)
    return result


def verify(state: AdvisorState) -> AdvisorState:
    if state["scope"] == "sku":
        errors = vfy.verify_sku(state["sku_result"], state["sku_fact"])
        prev = state["sku_result"].model_dump_json()
    else:
        errors = vfy.verify_briefing(state["briefing_result"], state["pack"])
        prev = state["briefing_result"].model_dump_json()

    if errors and state.get("attempts", 0) < MAX_ATTEMPTS:
        feedback = (
            "Your previous answer was:\n" + prev + "\n\n"
            "It violated these grounding rules:\n- " + "\n- ".join(errors) + "\n\n"
            "Return a corrected answer that fixes every issue. Cite ONLY numbers from FACTS."
        )
        return {"errors": errors, "messages": [*state["messages"], ("human", feedback)]}
    return {"errors": errors}


def make_fallback(state: AdvisorState) -> AdvisorState:
    if state["scope"] == "sku":
        return {"sku_result": fb.fallback_sku(state["sku_fact"]), "ai_status": "fallback"}
    return {"briefing_result": fb.fallback_briefing(state["pack"]), "ai_status": "fallback"}


def finalize(state: AdvisorState) -> AdvisorState:
    return {"ai_status": state.get("ai_status", "ok")}


# --------------------------------------------------------------------------- #
# Routers
# --------------------------------------------------------------------------- #
def route_after_prepare(state: AdvisorState) -> str:
    pack = state.get("pack")
    if state["scope"] == "portfolio" and pack and not pack.actionable and not pack.watch_candidates:
        return "fallback"  # nothing to reason about — calm deterministic briefing
    return "reason"


def route_after_reason(state: AdvisorState) -> str:
    return "fallback" if state.get("llm_failed") else "verify"


def route_after_verify(state: AdvisorState) -> str:
    if not state.get("errors"):
        return "finalize"
    if state.get("attempts", 0) < MAX_ATTEMPTS:
        return "reason"  # retry with the violations fed back
    return "fallback"
