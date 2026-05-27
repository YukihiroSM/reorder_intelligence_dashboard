"""Shared test fixtures. DB-backed tests use a dedicated `reorder_intel_test` DB.

Schema is created fresh per test via ``Base.metadata`` (no migrations needed —
the importer creates its own categories/suppliers), keeping tests isolated.
Override the target with the TEST_DATABASE_URL env var.
"""

from __future__ import annotations

import os
from collections.abc import AsyncIterator
from pathlib import Path

import pytest_asyncio
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from app import models  # noqa: F401  registers all tables on Base.metadata
from app.db import Base

TEST_DATABASE_URL = os.environ.get(
    "TEST_DATABASE_URL",
    "postgresql+asyncpg://reorder:changeme@localhost:5440/reorder_intel_test",
)
DATA_DIR = Path(__file__).resolve().parents[2] / "data"


@pytest_asyncio.fixture
async def session() -> AsyncIterator[AsyncSession]:
    engine = create_async_engine(TEST_DATABASE_URL)
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.drop_all)
        await conn.run_sync(Base.metadata.create_all)

    maker = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)
    async with maker() as s:
        yield s

    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.drop_all)
    await engine.dispose()
