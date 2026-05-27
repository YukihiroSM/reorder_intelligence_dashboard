"""Versioned LLM prompts.

PROMPT_VERSION is folded into the AI cache key (context_hash). Bump it whenever a
prompt's wording or the output schema changes, so stale cached suggestions are
invalidated rather than served against a newer contract.
"""

from __future__ import annotations

PROMPT_VERSION = 1
