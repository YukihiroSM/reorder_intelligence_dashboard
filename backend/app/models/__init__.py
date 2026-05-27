"""ORM models. Importing this package registers every table on Base.metadata."""

from __future__ import annotations

from ..db import Base
from .ai import AISuggestion
from .config import AppConfig, SavedScenario
from .enums import (
    AIActionType,
    ConfidenceFlag,
    ImportStatus,
    ScenarioKind,
    StockHealthStatus,
)
from .importing import ImportRun
from .reference import Category, Supplier
from .sku import SKU, SKUSalesDaily, SKUSnapshot

__all__ = [
    "Base",
    "Category",
    "Supplier",
    "SKU",
    "SKUSnapshot",
    "SKUSalesDaily",
    "AppConfig",
    "SavedScenario",
    "ImportRun",
    "AISuggestion",
    "StockHealthStatus",
    "ImportStatus",
    "ConfidenceFlag",
    "AIActionType",
    "ScenarioKind",
]
