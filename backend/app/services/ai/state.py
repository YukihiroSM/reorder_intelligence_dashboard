"""Shared LangGraph state for the advisor pipeline.

One graph serves both modes; `scope` selects which input/output slots are live.
Lists are managed explicitly by the nodes (no reducers needed)."""

from __future__ import annotations

from typing import Literal, TypedDict

from ...schemas.ai import (
    PortfolioFactPack,
    SKUFact,
    SKUSuggestionLLM,
    WeeklyBriefingLLM,
)

Scope = Literal["sku", "portfolio"]


class AdvisorState(TypedDict, total=False):
    scope: Scope

    # Inputs — exactly one is populated per `scope`.
    sku_fact: SKUFact
    pack: PortfolioFactPack

    # LLM plumbing.
    messages: list[tuple[str, str]]
    attempts: int
    errors: list[str]  # verify violations, fed back to the model on retry
    llm_failed: bool  # set when a call raises → route to deterministic fallback

    # Outputs — one per `scope`; absent until reason/fallback fills it.
    sku_result: SKUSuggestionLLM
    briefing_result: WeeklyBriefingLLM

    # Call metadata.
    tokens_input: int | None
    tokens_output: int | None
    ai_status: Literal["ok", "fallback"]
