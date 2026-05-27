"""Generate dated inventory variants from the base inventory.json, for testing.

Reconstructs plausible *earlier* snapshots by walking the real data backwards:
for a snapshot `offset` days before the base date we

  * shift the sales window back `offset` days (drop the newest `offset` entries,
    prepend `offset` synthetic earlier days sampled around each SKU's baseline), and
  * raise `current_stock` by the units sold since then (stock depletes over time).

This exercises the importer's row-level dedup (overlapping sale_dates are skipped)
and snapshot accumulation, and gives the dashboard a real import history.

Usage (from backend/):
    python -m app.scripts.generate_inventories            # default offsets
    python -m app.scripts.generate_inventories 1 5 10     # custom day-offsets
"""

from __future__ import annotations

import json
import random
import sys
from datetime import date, timedelta
from pathlib import Path

BASE_FILE = Path(__file__).resolve().parents[3] / "data" / "inventory.json"
OUT_DIR = BASE_FILE.parent
DEFAULT_OFFSETS = [1, 2, 3, 7, 14]


def _synth_early(rng: random.Random, baseline: float, n: int) -> list[int]:
    """`n` synthetic daily-sales values around a per-SKU baseline (0 stays 0)."""
    if baseline <= 0:
        return [0] * n
    return [max(0, round(baseline * rng.uniform(0.8, 1.2))) for _ in range(n)]


def build_variant(base: dict, offset: int) -> tuple[date, dict]:
    base_date = date.fromisoformat(base["config"]["today"])
    target = base_date - timedelta(days=offset)
    variant = json.loads(json.dumps(base))  # deep copy
    variant["config"]["today"] = target.isoformat()
    variant["config"]["generated_from"] = f"{BASE_FILE.name} (-{offset}d)"

    for sku in variant["skus"]:
        sales = sku["sales_last_30_days"]
        n = len(sales)
        rng = random.Random(f"{sku['sku']}|{target.isoformat()}")
        baseline = sum(sales[:7]) / 7
        early = _synth_early(rng, baseline, offset)
        sku["sales_last_30_days"] = early + sales[: n - offset]
        # Stock `offset` days ago = today's stock + everything sold since.
        sku["current_stock"] = sku["current_stock"] + sum(sales[n - offset :])

    return target, variant


def main() -> None:
    offsets = [int(a) for a in sys.argv[1:]] or DEFAULT_OFFSETS
    base = json.loads(BASE_FILE.read_text())
    window = base["config"].get("data_window_days", 30)

    for offset in offsets:
        if not 0 < offset < window:
            print(f"skip offset {offset} (must be 0 < offset < {window})")
            continue
        target, variant = build_variant(base, offset)
        out = OUT_DIR / f"inventory_{target.isoformat()}.json"
        out.write_text(json.dumps(variant, indent=2) + "\n")
        print(f"wrote {out.name}  (today={target}, -{offset}d)")


if __name__ == "__main__":
    main()
