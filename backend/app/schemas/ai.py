"""AI advisor contracts, in three layers:

1. Fact-pack (`SKUFact`, `PortfolioFactPack`) — DETERMINISTIC grounded numbers the
   `prepare` node computes. The LLM may only *cite* these; it never invents figures.
   Also serialized into the cache `context_snapshot`.
2. Structured-output schemas (`SKUSuggestionLLM`, `WeeklyBriefingLLM`) — exactly what
   the model returns via `with_structured_output`. Headline $ totals are NOT asked of
   the model (they're deterministic); the LLM only judges, prioritises, explains.
3. Response DTOs (`AISuggestionDTO`, `WeeklyBriefingDTO`) — the API/UI edge, wrapping
   the model's judgement with deterministic totals + call metadata.
"""

from __future__ import annotations

from datetime import date, datetime
from typing import Literal

from pydantic import BaseModel, Field

from ..enums import AIActionType, AIConfidence, ConfidenceFlag, StockHealthStatus

AIStatus = Literal["ok", "fallback"]


# --------------------------------------------------------------------------- #
# 1. Fact-pack — deterministic, grounded
# --------------------------------------------------------------------------- #
class SKUFact(BaseModel):
    """One SKU's grounded facts under the active scenario. The value-add numbers
    (`unavoidable_stockout_days`, `revenue_at_risk_usd`, `moq_coverage_days`) are the
    point: they surface trade-offs the raw formula doesn't, computed deterministically."""

    sku_code: str
    name: str
    category: str
    supplier: str
    status: StockHealthStatus
    trend: Literal["up", "down", "flat"]
    confidence_flags: list[ConfidenceFlag]

    current_stock: int
    moq: int
    cost_per_unit_usd: float
    retail_price_usd: float
    gross_margin_per_unit_usd: float

    velocity_7d: float  # raw last-7-day daily rate (suppressed during a stockout)
    velocity_14d: float
    effective_velocity: float  # stockout-/launch-aware — the rate we actually forecast on
    projected_velocity: float  # effective × (1 + growth%)

    days_of_stock: float | None
    total_lead_days: int
    reorder_date: date | None
    days_overdue: int  # how many days past the reorder date we are (0 if not due)

    recommended_po_qty: int
    moq_binding: bool
    estimated_reorder_cost: float
    moq_coverage_days: float | None  # how many days of demand the PO covers

    unavoidable_stockout_days: int  # gap that can't be avoided even ordering today
    revenue_at_risk_usd: float  # stockout gap × projected velocity × retail price


class PortfolioFactPack(BaseModel):
    """Portfolio-wide grounded context for the weekly briefing."""

    today: date
    growth_pct: float
    forecast_window_days: int
    shipping_buffer_days: int

    status_counts: dict[str, int]
    total_cash_to_commit_usd: float  # Σ reorder cost over actionable SKUs
    total_revenue_at_risk_usd: float

    actionable: list[SKUFact]  # status != HEALTHY, ranked most-urgent first
    watch_candidates: list[SKUFact]  # HEALTHY but carrying a warn flag


# --------------------------------------------------------------------------- #
# 2. Structured output — exactly what the LLM returns
# --------------------------------------------------------------------------- #
class SKUSuggestionLLM(BaseModel):
    """The model's judgement for a single SKU. Cite only numbers from the facts."""

    action: AIActionType = Field(description="The single best next action for this SKU.")
    urgency: int = Field(ge=1, le=5, description="1 = no rush, 5 = act today.")
    headline: str = Field(
        max_length=100,
        description="One scannable line an operator reads first. No trailing period.",
    )
    reasoning: str = Field(
        max_length=420,
        description=(
            "2-3 sentences. Name the trade-off (cash vs stockout vs MOQ overshoot) and "
            "cite concrete numbers FROM THE FACTS. Do not restate the action label."
        ),
    )
    suggested_po_qty: int | None = Field(
        default=None,
        description=(
            "Units to order now. Must be >= MOQ when ordering. Null for WAIT/"
            "INVESTIGATE/DISCONTINUE."
        ),
    )
    revenue_at_risk_usd: float = Field(
        description="Copy the facts' revenue_at_risk_usd (0 if none). Do not invent."
    )
    confidence: AIConfidence = Field(
        description="LOW if data is sparse/volatile or a stockout suppresses velocity."
    )
    warnings: list[str] = Field(
        default_factory=list,
        description="Short caveats the operator must know (e.g. unavoidable stockout window).",
    )


class BriefingActionLLM(BaseModel):
    sku_code: str = Field(description="Must be one of the actionable SKUs in the facts.")
    action: AIActionType
    urgency: int = Field(ge=1, le=5)
    headline: str = Field(max_length=100, description="What to do, one line.")
    why_now: str = Field(max_length=240, description="One sentence of grounded reasoning.")


class BriefingWatchLLM(BaseModel):
    sku_code: str
    note: str = Field(max_length=240, description="Why it's worth watching, not urgent.")


class WeeklyBriefingLLM(BaseModel):
    """The model's portfolio narrative + prioritisation. Totals are added deterministically."""

    summary: str = Field(
        max_length=600,
        description=(
            "2-3 sentences, plain English, for a non-technical operator. State the "
            "headline: how many fires, the dominant theme, what to do first."
        ),
    )
    top_actions: list[BriefingActionLLM] = Field(
        default_factory=list,
        description="Up to 5, most urgent first. Only SKUs that genuinely need action.",
    )
    watch_list: list[BriefingWatchLLM] = Field(
        default_factory=list,
        description="Up to 5 SKUs not urgent but worth flagging (overshoot, decline, volatility).",
    )


# --------------------------------------------------------------------------- #
# 3. Response DTOs — the API/UI edge
# --------------------------------------------------------------------------- #
class AISuggestionDTO(BaseModel):
    sku_code: str
    action: AIActionType
    urgency: int
    headline: str
    reasoning: str
    suggested_po_qty: int | None
    revenue_at_risk_usd: float
    confidence: AIConfidence
    warnings: list[str]

    model_name: str
    tokens_input: int | None = None
    tokens_output: int | None = None
    generated_at: datetime
    cached: bool = False
    ai_status: AIStatus = "ok"


class BriefingAction(BaseModel):
    sku_code: str
    action: AIActionType
    urgency: int
    headline: str
    why_now: str


class BriefingWatch(BaseModel):
    sku_code: str
    note: str


class ScenarioEcho(BaseModel):
    growth_pct: float
    forecast_window_days: int
    shipping_buffer_days: int


class WeeklyBriefingDTO(BaseModel):
    summary: str
    top_actions: list[BriefingAction]
    watch_list: list[BriefingWatch]

    total_cash_to_commit_usd: float
    total_revenue_at_risk_usd: float
    actionable_count: int
    status_counts: dict[str, int]
    scenario: ScenarioEcho

    model_name: str
    tokens_input: int | None = None
    tokens_output: int | None = None
    generated_at: datetime
    cached: bool = False
    ai_status: AIStatus = "ok"
