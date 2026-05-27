# Reorder Intelligence Dashboard

An inventory intelligence dashboard for a non-technical operator: it ingests SKU, sales,
supplier and shipping data and answers the three questions that actually matter —
**when to reorder, how much to order, and how healthy each SKU's stock position is** —
with live demand-scenario modelling and an AI advisor that turns the numbers into a
prioritised plan.

> Built for the AI Engineer Code Challenge. The brief is in `AI Engineer Code Challenge .md`.

## Live

**https://reorder-intelligence.yuk0-dev-team.pp.ua/** — public, no auth.

## What it does

- **Per-SKU maths** (the testable core, pure & `Decimal`): 7-day & 14-day velocity, a
  **stockout-/launch-aware effective velocity**, days of stock, reorder date, recommended
  PO (MOQ + forecast window), stock health, estimated reorder cost.
- **Live scenario modelling** — demand growth %, shipping buffer, forecast window. Every
  number on the page recomputes server-side and updates without a reload.
- **"This week" view** — what needs ordering, cash exposure, lead-cycle cover, active
  stockouts, sorted by urgency.
- **Sortable / filterable inventory table** — status, category, supplier, search; lead &
  shipping in every row; infinite-scroll pagination (server-side).
- **AI advisor** (see below) — a per-SKU recommendation and a portfolio weekly briefing.
- **Configurable thresholds in the UI** — growth / buffer / forecast in the scenario bar;
  the Critical/Low health multipliers in Settings (live, persisted to the backend).

## Stack & why

| Layer | Choice | Why |
|---|---|---|
| API | **FastAPI** (async) · **SQLAlchemy 2.0** async (`Mapped[...]`) · **Alembic** | Async all the way; typed ORM; real migrations (4 of them, reproducible schema). |
| DB | **PostgreSQL 16** | Snapshot time-series + `NUMERIC` money; `ON CONFLICT` dedup on import. |
| Money | **`Decimal`** end-to-end | `float` only appears at the JSON edge — no rounding drift in the maths. |
| AI | **LangChain + LangGraph**, OpenAI **`gpt-5.4-nano`** (reasoning) | Provider-agnostic (swap via `LLM_MODEL`); a graph, not a single call (see below). |
| UI | **Vite · React · TypeScript · TanStack Query · axios · lucide-react** | Server state via TanStack; charts are **hand-rolled SVG** (no chart lib) for full control of the stockout/launch overrides. Design-system CSS ported from the design handoff (no Tailwind/shadcn). |
| Deploy | **Docker** (Postgres + API) · host **nginx** + **Let's Encrypt** | SPA built to static files nginx serves; nginx proxies `/api` to the container. One-command `deploy/deploy.sh`. |

## The AI advisor — why it's not a gimmick

The maths is already deterministic and correct. An LLM that just *restates* "order now,
2 days of stock left" adds nothing. So the LLM here only does what maths can't —
**weigh trade-offs, interpret ambiguous signals, and prioritise** — over a grounded
fact-pack, with a deterministic guardrail keeping it honest.

It's a **LangGraph** pipeline, not a single call:

```
prepare ──► route ──► reason ──► verify ──► finalize
(deterministic    (skip LLM if   (LLM,        (deterministic    │
 fact-pack:        nothing        structured   grounding check)  │
 revenue-at-risk,  actionable)    output)           │            │
 stockout gap,                                  on violation ─► reason (1 retry)
 MOQ coverage)                                       └─ still bad ─► deterministic fallback
```

- **`prepare`** computes the operator-facing numbers the raw formula doesn't surface —
  `revenue_at_risk`, unavoidable stockout days, MOQ coverage days — deterministically.
  The LLM may only *cite* these.
- **`reason`** returns **structured output** (Pydantic-validated): action, urgency,
  headline, reasoning, suggested PO, confidence, warnings.
- **`verify`** re-checks every figure and action against the fact-pack (numbers within
  tolerance, MOQ respected, action consistent with status). A violation loops back once;
  if it still can't comply, a **deterministic fallback** answer ships. So the operator can
  always trust the numbers — the brief's "the operator needs to verify the maths".
- It runs in two modes off one graph: a **per-SKU** recommendation (drawer) and a
  **portfolio weekly briefing** (top actions + watch list). Both are **scenario-aware** and
  cached by a context hash, so changing the growth slider yields a fresh plan.
- **Works without an API key** — the deterministic fallback path makes the whole app
  functional and demoable; the live model just makes it more eloquent.

## Stretch goals tackled

- **AI "what should I do this week"** — the agentic weekly briefing above.
- **Confidence flags** — 7 data-quality flags (recent stockout, new launch, MOQ overshoot,
  high volatility, declining trend, velocity divergence, sparse data) with explanations.
- **Cash-flow forecast** — 30/60/90-day reorder spend, bucketed by week and category.
- **Scenario save & load** — name and reload scenarios (save/load done; side-by-side
  compare is not — see limitations).

## Data quirks handled

| Quirk | Handling |
|---|---|
| SKU at **zero stock** (GLW-006) | `STOCKOUT` status; effective velocity skips the stockout tail so it reflects true demand (~16/day) not the suppressed recent rate (~4/day). |
| **7 leading zero days** then ramp | `LEADING_ZEROS` (new-launch) flag; velocity skips the lead-in so it's not read as a declining trend. |
| **Below MOQ, dropping fast** (GLW-005/002) | `CRITICAL`, MOQ-bound PO, reorder date in the past. |
| **Volatile bundle** (GLW-007) | `HIGH_VOLATILITY` / `DECLINING_TREND`; low AI confidence. |
| **MOQ ≫ demand** (VTC-302) | `MOQ_OVERSHOOT`; AI flags it as cash tied up in ~250+ days of stock. |
| Lead times 21–42 prod / 12–21 ship | Folded into `total_lead_days` + a configurable buffer. |

## How AI tooling was used building this

- Built with **Claude Code** as the pair — scaffolding, the pure calculation core +
  golden tests, the importer dedup, and the React port of the design.
- The AI-advisor feature was **groomed before coding**: I decided the LLM must not restate
  numbers, which led to the deterministic fact-pack + `verify` guardrail design.
- Prompts are **versioned in code** with few-shot facts→output pairs (so the model learns
  the mapping, not specific numbers). Prompt version is folded into the cache key.
- Honest note: a couple of golden tests were corrected to match the brief's formula once I
  trusted the maths over my first guesses, and an independent review pass caught a
  transaction-isolation bug in the importer (fixed with per-SKU savepoints).

## Done / stubbed / known limitations

- **Done & live:** all must-haves, the AI advisor (live `gpt-5.4-nano`), confidence flags,
  cash-flow forecast, scenario save/load, UI-configurable thresholds.
- **Stubbed:** "Generate PO" is a placeholder toast — PO export (CSV/email) isn't built.
- **Limited by scope:** scenario *compare* is save/load only (no side-by-side); the
  cash-flow forecast counts one reorder cycle per SKU within the horizon; the AI briefing is
  button-triggered (not live on every slider tick) by design, to control cost/latency.
- **Out of scope:** auth, multi-tenancy, ABC classification, seasonality multipliers.

## What I'd build next (one more day)

1. **Side-by-side scenario compare** — the data model already stores saved scenarios.
2. **Real PO export** — CSV / email-ready PO for a selected batch.
3. **NL query** over the portfolio ("which SKUs need ordering before Friday?") on the same
   grounded fact-pack + verify pattern.
4. **Streaming** the AI briefing token-by-token.

### Scaling to thousands of SKUs

Today `/api/skus` loads every SKU, computes its metrics in Python, then filters, sorts and
paginates in memory — deliberately simple, and fine for the hundreds this is built for. To
take the same dashboard to thousands of SKUs I'd:

- **Precompute metrics on import, not per request** — materialise per-SKU baseline metrics
  (at the snapshot's `today`) into a table / materialized view, refreshed by the importer.
  The scenario growth % is a linear factor on velocity, so live scenarios stay a cheap SQL
  transform instead of a recompute from raw sales history.
- **Push filter / sort / pagination into Postgres** with the right indexes and **keyset
  (cursor) pagination** — a page becomes one indexed query rather than materialising the
  whole catalogue on every call (offset pagination also degrades at depth).
- **Aggregate velocity in SQL** — windowed sums over `sku_sales_daily` so a request stops
  pulling raw daily rows for every SKU.
- **Keep the AI flat-cost** — the LangGraph `prepare` node already ranks and takes only the
  **top-N actionable** SKUs, so the model never sees more than a handful regardless of
  catalogue size. The deterministic pre-filter is the scaling lever, not a bigger prompt.

The pure calculation core (`services/calculations.py`) doesn't change — only *where* and
*how often* it runs moves. That separation is exactly why this stays a config change, not a
rewrite.

## Local setup

The `.env` lives at the **repo root** (holds `DATABASE_URL`, optional `OPENAI_API_KEY`,
`LLM_MODEL`). Without a key the AI runs its deterministic fallback.

```bash
cp .env.example .env            # set DATABASE_URL (+ OPENAI_API_KEY, optional)
docker compose up -d            # dev Postgres on :5440
set -a && source .env && set +a # load DATABASE_URL etc. into the shell

# backend
cd backend
python3.13 -m venv .venv && .venv/bin/pip install -r requirements-dev.txt
.venv/bin/alembic upgrade head                                      # migrate
.venv/bin/python -m app.scripts.import_inventory ../data/inventory.json   # seed (idempotent)
.venv/bin/uvicorn app.main:app --port 8000
cd ..

# frontend (separate shell)
cd frontend && npm install && npm run dev      # http://localhost:5173 (proxies /api)
```

## Deploy

See [`deploy/DEPLOY.md`](deploy/DEPLOY.md). On a cloned repo: set the root `.env`, then
`./deploy/deploy.sh` (builds + starts Postgres + API, rebuilds the SPA into the nginx
webroot, reloads nginx, health-checks).
