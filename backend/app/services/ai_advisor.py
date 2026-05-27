"""Public AI advisor service: grounded entry points with a context-hash cache.

`get_sku_suggestion` / `get_weekly_briefing` resolve the scenario, build the deterministic
fact-pack, and either return a cached row (same scenario already reasoned about) or run the
LangGraph pipeline and upsert the result. The graph is synchronous (sync LLM client), so it
runs in a worker thread to keep the event loop free.

The cache key folds in the fact-pack (which already bakes in growth/forecast/buffer) plus
PROMPT_VERSION, so changing the scenario — or the prompt — produces a fresh key.
"""

from __future__ import annotations

import asyncio
import hashlib
from datetime import datetime

from sqlalchemy import select
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.ext.asyncio import AsyncSession

from ..config import get_settings
from ..models import SKU, AIBriefing, AISuggestion
from ..prompts import PROMPT_VERSION
from ..schemas.ai import (
    AISuggestionDTO,
    BriefingAction,
    BriefingWatch,
    PortfolioFactPack,
    ScenarioEcho,
    SKUFact,
    WeeklyBriefingDTO,
)
from .ai.factpack import build_portfolio_factpack, build_sku_fact
from .ai.graph import run_advisor
from .ai.llm import llm_available
from .calculations import CalcConfig
from .sku_metrics import get_all_sku_metrics, get_sku_metrics, resolve_today

_FALLBACK_MODEL = "deterministic-fallback"


def _hash(*parts: str) -> str:
    h = hashlib.sha256()
    for p in parts:
        h.update(p.encode())
        h.update(b"\x00")
    return h.hexdigest()


def _sku_context_hash(fact: SKUFact) -> str:
    # fact JSON already encodes the scenario-adjusted numbers, so it captures growth etc.
    return _hash("sku", str(PROMPT_VERSION), fact.sku_code, fact.model_dump_json())


def _portfolio_context_hash(pack: PortfolioFactPack) -> str:
    return _hash("portfolio", str(PROMPT_VERSION), pack.model_dump_json())


def _model_label(ai_status: str) -> str:
    return get_settings().llm_model if ai_status == "ok" else _FALLBACK_MODEL


# --------------------------------------------------------------------------- #
# Per-SKU suggestion
# --------------------------------------------------------------------------- #
async def get_sku_suggestion(
    session: AsyncSession,
    sku_code: str,
    config: CalcConfig,
    *,
    force: bool = False,
) -> AISuggestionDTO | None:
    today = await resolve_today(session)
    if today is None:
        return None
    dto = await get_sku_metrics(session, sku_code, config)
    if dto is None:
        return None
    sku_id = await session.scalar(select(SKU.id).where(SKU.sku_code == sku_code))
    if sku_id is None:
        return None

    fact = build_sku_fact(dto, today)
    ctx = _sku_context_hash(fact)

    if not force:
        cached_row = await session.scalar(
            select(AISuggestion)
            .where(AISuggestion.sku_id == sku_id, AISuggestion.context_hash == ctx)
            .order_by(AISuggestion.generated_at.desc())
            .limit(1)
        )
        if cached_row is not None:
            return AISuggestionDTO(
                sku_code=sku_code,
                action=cached_row.action_type,
                urgency=cached_row.urgency,
                headline=cached_row.headline,
                reasoning=cached_row.reasoning,
                suggested_po_qty=cached_row.suggested_po_qty,
                revenue_at_risk_usd=float(cached_row.revenue_at_risk_usd),
                confidence=cached_row.confidence,
                warnings=list(cached_row.warnings),
                model_name=cached_row.model_name,
                tokens_input=cached_row.tokens_input,
                tokens_output=cached_row.tokens_output,
                generated_at=cached_row.generated_at,
                cached=True,
                ai_status=cached_row.ai_status,  # type: ignore[arg-type]
            )

    state = await asyncio.to_thread(run_advisor, {"scope": "sku", "sku_fact": fact})
    res = state["sku_result"]
    ai_status = state.get("ai_status", "ok")

    stmt = (
        insert(AISuggestion)
        .values(
            sku_id=sku_id,
            context_hash=ctx,
            context_snapshot=fact.model_dump(mode="json"),
            action_type=res.action,
            urgency=res.urgency,
            headline=res.headline,
            reasoning=res.reasoning,
            suggested_po_qty=res.suggested_po_qty,
            revenue_at_risk_usd=res.revenue_at_risk_usd,
            confidence=res.confidence,
            warnings=res.warnings,
            ai_status=ai_status,
            model_name=_model_label(ai_status),
            tokens_input=state.get("tokens_input"),
            tokens_output=state.get("tokens_output"),
        )
        .on_conflict_do_update(
            constraint="uq_ai_cache_key",
            set_={
                "context_snapshot": fact.model_dump(mode="json"),
                "action_type": res.action,
                "urgency": res.urgency,
                "headline": res.headline,
                "reasoning": res.reasoning,
                "suggested_po_qty": res.suggested_po_qty,
                "revenue_at_risk_usd": res.revenue_at_risk_usd,
                "confidence": res.confidence,
                "warnings": res.warnings,
                "ai_status": ai_status,
                "model_name": _model_label(ai_status),
                "tokens_input": state.get("tokens_input"),
                "tokens_output": state.get("tokens_output"),
                "generated_at": datetime.now().astimezone(),
            },
        )
        .returning(AISuggestion.generated_at)
    )
    generated_at = await session.scalar(stmt)
    await session.commit()

    return AISuggestionDTO(
        sku_code=sku_code,
        action=res.action,
        urgency=res.urgency,
        headline=res.headline,
        reasoning=res.reasoning,
        suggested_po_qty=res.suggested_po_qty,
        revenue_at_risk_usd=res.revenue_at_risk_usd,
        confidence=res.confidence,
        warnings=res.warnings,
        model_name=_model_label(ai_status),
        tokens_input=state.get("tokens_input"),
        tokens_output=state.get("tokens_output"),
        generated_at=generated_at or datetime.now().astimezone(),
        cached=False,
        ai_status=ai_status,
    )


async def get_sku_history(
    session: AsyncSession, sku_code: str, limit: int = 10
) -> list[AISuggestionDTO]:
    sku_id = await session.scalar(select(SKU.id).where(SKU.sku_code == sku_code))
    if sku_id is None:
        return []
    rows = (
        await session.scalars(
            select(AISuggestion)
            .where(AISuggestion.sku_id == sku_id)
            .order_by(AISuggestion.generated_at.desc())
            .limit(limit)
        )
    ).all()
    out: list[AISuggestionDTO] = []
    for r in rows:
        out.append(
            AISuggestionDTO(
                sku_code=sku_code,
                action=r.action_type,
                urgency=r.urgency,
                headline=r.headline,
                reasoning=r.reasoning,
                suggested_po_qty=r.suggested_po_qty,
                revenue_at_risk_usd=float(r.revenue_at_risk_usd),
                confidence=r.confidence,
                warnings=list(r.warnings),
                model_name=r.model_name,
                tokens_input=r.tokens_input,
                tokens_output=r.tokens_output,
                generated_at=r.generated_at,
                cached=True,
                ai_status=r.ai_status,  # type: ignore[arg-type]
            )
        )
    return out


# --------------------------------------------------------------------------- #
# Weekly portfolio briefing
# --------------------------------------------------------------------------- #
async def get_weekly_briefing(
    session: AsyncSession, config: CalcConfig, *, force: bool = False
) -> WeeklyBriefingDTO | None:
    today = await resolve_today(session)
    if today is None:
        return None
    metrics = await get_all_sku_metrics(session, config)
    pack = build_portfolio_factpack(metrics, today, config)
    ctx = _portfolio_context_hash(pack)

    if not force:
        cached_row = await session.scalar(
            select(AIBriefing)
            .where(AIBriefing.context_hash == ctx)
            .order_by(AIBriefing.generated_at.desc())
            .limit(1)
        )
        if cached_row is not None:
            dto = WeeklyBriefingDTO.model_validate(cached_row.payload)
            dto.cached = True
            dto.generated_at = cached_row.generated_at
            return dto

    state = await asyncio.to_thread(run_advisor, {"scope": "portfolio", "pack": pack})
    res = state["briefing_result"]
    ai_status = state.get("ai_status", "ok")

    dto = WeeklyBriefingDTO(
        summary=res.summary,
        top_actions=[BriefingAction(**a.model_dump()) for a in res.top_actions],
        watch_list=[BriefingWatch(**w.model_dump()) for w in res.watch_list],
        total_cash_to_commit_usd=pack.total_cash_to_commit_usd,
        total_revenue_at_risk_usd=pack.total_revenue_at_risk_usd,
        actionable_count=len(pack.actionable),
        status_counts=pack.status_counts,
        scenario=ScenarioEcho(
            growth_pct=pack.growth_pct,
            forecast_window_days=pack.forecast_window_days,
            shipping_buffer_days=pack.shipping_buffer_days,
        ),
        model_name=_model_label(ai_status),
        tokens_input=state.get("tokens_input"),
        tokens_output=state.get("tokens_output"),
        generated_at=datetime.now().astimezone(),
        cached=False,
        ai_status=ai_status,
    )

    stmt = (
        insert(AIBriefing)
        .values(
            context_hash=ctx,
            payload=dto.model_dump(mode="json"),
            total_cash_to_commit_usd=pack.total_cash_to_commit_usd,
            total_revenue_at_risk_usd=pack.total_revenue_at_risk_usd,
            ai_status=ai_status,
            model_name=_model_label(ai_status),
            tokens_input=state.get("tokens_input"),
            tokens_output=state.get("tokens_output"),
        )
        .on_conflict_do_update(
            constraint="uq_ai_briefing_key",
            set_={
                "payload": dto.model_dump(mode="json"),
                "total_cash_to_commit_usd": pack.total_cash_to_commit_usd,
                "total_revenue_at_risk_usd": pack.total_revenue_at_risk_usd,
                "ai_status": ai_status,
                "model_name": _model_label(ai_status),
                "tokens_input": state.get("tokens_input"),
                "tokens_output": state.get("tokens_output"),
                "generated_at": datetime.now().astimezone(),
            },
        )
        .returning(AIBriefing.generated_at)
    )
    generated_at = await session.scalar(stmt)
    await session.commit()
    if generated_at is not None:
        dto.generated_at = generated_at
    return dto


def ai_enabled() -> bool:
    """Whether a live LLM is configured (UI can label fallback mode)."""
    return llm_available()
