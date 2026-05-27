"""AI advisor: a guarded LangGraph reasoning pipeline (prepare → reason → verify).

The deterministic math stays in `calculations.py` / `factpack.py`; the LLM only
judges, prioritises, and explains — and a deterministic `verify` node keeps it from
citing any number that isn't in the grounded fact-pack.
"""

from __future__ import annotations
