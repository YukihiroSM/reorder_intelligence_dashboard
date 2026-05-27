"""Health/readiness endpoint."""

from __future__ import annotations

from fastapi import APIRouter, Depends
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from ..db import get_session
from ..models import SKU, SKUSnapshot

router = APIRouter(prefix="/api", tags=["health"])


@router.get("/health")
async def health(session: AsyncSession = Depends(get_session)) -> dict[str, object]:
    today = await session.scalar(select(func.max(SKUSnapshot.snapshot_date)))
    skus_loaded = await session.scalar(
        select(func.count()).select_from(SKU).where(SKU.is_active.is_(True))
    )
    return {
        "status": "ok",
        "data_date": today.isoformat() if today else None,
        "skus_loaded": skus_loaded or 0,
    }
