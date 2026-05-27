"""Saved scenario CRUD (named config snapshots). Powers the UI 'save & recall'."""

from __future__ import annotations

from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Response, status
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from ..db import get_session
from ..models import SavedScenario
from ..schemas.scenario import ScenarioCreate, ScenarioOut

router = APIRouter(prefix="/api", tags=["scenarios"])


@router.get("/scenarios", response_model=list[ScenarioOut])
async def list_scenarios(
    session: AsyncSession = Depends(get_session),
) -> list[SavedScenario]:
    result = await session.scalars(
        select(SavedScenario).order_by(SavedScenario.created_at)
    )
    return list(result.all())


@router.post("/scenarios", response_model=ScenarioOut, status_code=201)
async def create_scenario(
    payload: ScenarioCreate, session: AsyncSession = Depends(get_session)
) -> SavedScenario:
    scenario = SavedScenario(**payload.model_dump())
    session.add(scenario)
    try:
        await session.commit()
    except IntegrityError as exc:
        await session.rollback()
        raise HTTPException(
            status_code=409, detail=f"scenario '{payload.name}' already exists"
        ) from exc
    await session.refresh(scenario)
    return scenario


@router.delete("/scenarios/{scenario_id}", status_code=204)
async def delete_scenario(
    scenario_id: UUID, session: AsyncSession = Depends(get_session)
) -> Response:
    scenario = await session.get(SavedScenario, scenario_id)
    if scenario is None:
        raise HTTPException(status_code=404, detail="scenario not found")
    await session.delete(scenario)
    await session.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)
