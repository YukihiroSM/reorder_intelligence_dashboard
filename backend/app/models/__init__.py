"""ORM models. Importing this package registers every table on Base.metadata."""

from __future__ import annotations

from ..db import Base
from .ai import AIBriefing, AISuggestion
from .config import AppConfig, SavedScenario
from .importing import ImportRun
from .reference import Category, Supplier
from .sku import SKU, SKUSalesDaily, SKUSnapshot

# Enums live in app.enums (db-free, single canonical path) — not re-exported here.
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
    "AIBriefing",
]
