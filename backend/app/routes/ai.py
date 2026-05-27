"""AI advisor endpoints.

Scenario overrides (growth_pct / forecast_window / shipping_buffer) are query params,
exactly as on /api/skus, so the AI reasons under the same active scenario the dashboard
is showing. `force=true` bypasses the cache (the UI's "Refresh" button).
"""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession

from ..config import get_settings
from ..db import get_session
from ..models import AppConfig
from ..schemas.ai import AISuggestionDTO, WeeklyBriefingDTO
from ..services.ai_advisor import (
    ai_enabled,
    get_sku_history,
    get_sku_suggestion,
    get_weekly_briefing,
)
from ..services.sku_metrics import build_calc_config

router = APIRouter(prefix="/api/ai", tags=["ai"])


class SuggestRequest(BaseModel):
    sku_code: str


class AIStatus(BaseModel):
    ai_enabled: bool
    model: str


async def _config(
    session: AsyncSession,
    growth_pct: float | None,
    forecast_window: int | None,
    shipping_buffer: int | None,
):  # type: ignore[no-untyped-def]
    app_config = await session.get(AppConfig, "active")
    return build_calc_config(
        app_config,
        growth_pct=growth_pct,
        forecast_window=forecast_window,
        shipping_buffer=shipping_buffer,
    )


@router.get("/status", response_model=AIStatus)
async def ai_status() -> AIStatus:
    settings = get_settings()
    return AIStatus(
        ai_enabled=ai_enabled(),
        model=settings.llm_model if ai_enabled() else "deterministic-fallback",
    )


@router.post("/suggest-action", response_model=AISuggestionDTO)
async def suggest_action(
    body: SuggestRequest,
    session: AsyncSession = Depends(get_session),
    force: bool = False,
    growth_pct: float | None = None,
    forecast_window: int | None = None,
    shipping_buffer: int | None = None,
) -> AISuggestionDTO:
    config = await _config(session, growth_pct, forecast_window, shipping_buffer)
    dto = await get_sku_suggestion(session, body.sku_code, config, force=force)
    if dto is None:
        raise HTTPException(status_code=404, detail=f"SKU '{body.sku_code}' not found")
    return dto


@router.post("/briefing", response_model=WeeklyBriefingDTO)
async def weekly_briefing(
    session: AsyncSession = Depends(get_session),
    force: bool = False,
    growth_pct: float | None = None,
    forecast_window: int | None = None,
    shipping_buffer: int | None = None,
) -> WeeklyBriefingDTO:
    config = await _config(session, growth_pct, forecast_window, shipping_buffer)
    dto = await get_weekly_briefing(session, config, force=force)
    if dto is None:
        raise HTTPException(status_code=404, detail="No inventory data loaded")
    return dto


@router.get("/history/{sku_code}", response_model=list[AISuggestionDTO])
async def history(
    sku_code: str,
    session: AsyncSession = Depends(get_session),
    limit: int = 10,
) -> list[AISuggestionDTO]:
    return await get_sku_history(session, sku_code, limit=limit)
