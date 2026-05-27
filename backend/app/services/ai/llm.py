"""Thin LLM boundary: build the reasoning model lazily and run a structured call.

Kept tiny and provider-agnostic via LangChain's `init_chat_model` — switching models
is an env change (`LLM_MODEL`), not a code change. The model is built lazily so the app
boots (and every non-AI endpoint works) without an API key; the graph's fallback path
covers the keyless / call-failure case.
"""

from __future__ import annotations

from functools import lru_cache
from typing import TypeVar

from pydantic import BaseModel

from ...config import get_settings

T = TypeVar("T", bound=BaseModel)


def llm_available() -> bool:
    return bool(get_settings().openai_api_key)


@lru_cache(maxsize=1)
def _base_model():  # type: ignore[no-untyped-def]  # langchain returns a runtime union
    from langchain.chat_models import init_chat_model

    settings = get_settings()
    # reasoning_effort drives how hard gpt-5.4-nano thinks before answering.
    return init_chat_model(
        f"openai:{settings.llm_model}",
        api_key=settings.openai_api_key,
        reasoning_effort=settings.llm_reasoning_effort,
    )


def run_structured(
    messages: list[tuple[str, str]], schema: type[T]
) -> tuple[T, int | None, int | None]:
    """Invoke the model constrained to `schema`. Returns (parsed, in_tokens, out_tokens).

    Raises if no key is configured or the model fails to return a parseable object;
    the graph treats any raise as a signal to fall back to the deterministic result.
    """
    if not llm_available():
        raise RuntimeError("LLM unavailable: OPENAI_API_KEY is not set")

    structured = _base_model().with_structured_output(schema, include_raw=True)
    result = structured.invoke(messages)

    parsed = result.get("parsed")
    if parsed is None:
        err = result.get("parsing_error")
        raise RuntimeError(f"LLM returned no parseable {schema.__name__}: {err}")

    tokens_in: int | None = None
    tokens_out: int | None = None
    raw = result.get("raw")
    usage = getattr(raw, "usage_metadata", None)
    if usage:
        tokens_in = usage.get("input_tokens")
        tokens_out = usage.get("output_tokens")

    return parsed, tokens_in, tokens_out
