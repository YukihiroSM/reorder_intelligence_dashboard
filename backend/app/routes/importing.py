"""Import route: upload an inventory JSON file and ingest it. Wired in Phase 4."""

from __future__ import annotations

import tempfile
from pathlib import Path

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile
from sqlalchemy.ext.asyncio import AsyncSession

from ..db import get_session
from ..schemas.importing import ImportResponse, ImportRunOut
from ..services.importer import import_inventory

router = APIRouter(prefix="/api", tags=["import"])


@router.post("/import", response_model=ImportResponse)
async def import_file(
    file: UploadFile = File(...),
    session: AsyncSession = Depends(get_session),
) -> ImportResponse:
    """Ingest an uploaded inventory JSON file (file-level + row-level dedup)."""
    raw = await file.read()
    with tempfile.NamedTemporaryFile(
        suffix=".json", delete=True, mode="wb"
    ) as tmp:
        tmp.write(raw)
        tmp.flush()
        named = Path(tmp.name)
        try:
            result = await import_inventory(session, named)
        except ValueError as exc:
            raise HTTPException(status_code=422, detail=str(exc)) from exc

    # Preserve the uploaded name rather than the temp file's name.
    result.run.source_filename = file.filename or result.run.source_filename
    return ImportResponse(
        skipped=result.skipped,
        run=ImportRunOut.model_validate(result.run),
    )
