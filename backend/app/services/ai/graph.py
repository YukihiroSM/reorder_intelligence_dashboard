"""Compile the advisor graph once and expose two grounded entry points.

The graph is synchronous (the LLM client is sync); the async service layer runs it in a
worker thread so it never blocks the event loop.
"""

from __future__ import annotations

from functools import lru_cache

from langgraph.graph import END, START, StateGraph

from . import nodes
from .state import AdvisorState


@lru_cache(maxsize=1)
def _compiled():  # type: ignore[no-untyped-def]  # langgraph's CompiledGraph type
    g = StateGraph(AdvisorState)
    g.add_node("prepare", nodes.prepare)
    g.add_node("reason", nodes.reason)
    g.add_node("verify", nodes.verify)
    g.add_node("fallback", nodes.make_fallback)
    g.add_node("finalize", nodes.finalize)

    g.add_edge(START, "prepare")
    g.add_conditional_edges(
        "prepare", nodes.route_after_prepare, {"reason": "reason", "fallback": "fallback"}
    )
    g.add_conditional_edges(
        "reason", nodes.route_after_reason, {"verify": "verify", "fallback": "fallback"}
    )
    g.add_conditional_edges(
        "verify",
        nodes.route_after_verify,
        {"reason": "reason", "finalize": "finalize", "fallback": "fallback"},
    )
    g.add_edge("fallback", END)
    g.add_edge("finalize", END)
    return g.compile()


def run_advisor(initial: AdvisorState) -> AdvisorState:
    """Invoke the compiled graph and return the final state."""
    return _compiled().invoke(initial)  # type: ignore[return-value]
