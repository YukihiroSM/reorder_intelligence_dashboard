"""CLI: import an inventory JSON file into the database.

Usage (from backend/, venv active):
    python -m app.scripts.import_inventory ../data/inventory.json
"""

from __future__ import annotations

import asyncio
import logging
import sys
from pathlib import Path

from ..config import get_settings
from ..db import AsyncSessionLocal
from ..services.importer import import_inventory

DEFAULT_PATH = "../data/inventory.json"


async def _run(path: str) -> None:
    async with AsyncSessionLocal() as session:
        result = await import_inventory(session, Path(path))
    run = result.run
    verb = "SKIPPED (duplicate file)" if result.skipped else run.status.value
    print(
        f"{verb}: {run.source_filename} (data_date={run.data_date})\n"
        f"  skus      created={run.skus_created} updated={run.skus_updated}\n"
        f"  snapshots created={run.snapshots_created}\n"
        f"  sales     inserted={run.sales_rows_inserted} skipped={run.sales_rows_skipped}"
    )


def main() -> None:
    logging.basicConfig(
        level=get_settings().log_level,
        format="%(levelname)s %(name)s: %(message)s",
    )
    path = sys.argv[1] if len(sys.argv) > 1 else DEFAULT_PATH
    asyncio.run(_run(path))


if __name__ == "__main__":
    main()
