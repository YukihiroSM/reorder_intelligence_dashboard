"""Config endpoints: read and partial-update the singleton app_config row."""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession

from ..db import get_session
from ..models import AppConfig
from ..schemas.config import AppConfigOut, AppConfigUpdate

router = APIRouter(prefix="/api", tags=["config"])

_NOT_INITIALIZED = "app_config not initialized (run migrations)"


@router.get("/config", response_model=AppConfigOut)
async def get_config(session: AsyncSession = Depends(get_session)) -> AppConfig:
    config = await session.get(AppConfig, "active")
    if config is None:
        raise HTTPException(status_code=404, detail=_NOT_INITIALIZED)
    return config


@router.put("/config", response_model=AppConfigOut)
async def update_config(
    payload: AppConfigUpdate, session: AsyncSession = Depends(get_session)
) -> AppConfig:
    config = await session.get(AppConfig, "active")
    if config is None:
        raise HTTPException(status_code=404, detail=_NOT_INITIALIZED)
    for field, value in payload.model_dump(exclude_unset=True).items():
        setattr(config, field, value)
    await session.commit()
    await session.refresh(config)
    return config
