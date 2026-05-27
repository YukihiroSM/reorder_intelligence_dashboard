# CLAUDE.md

> Entry point for Claude Code. Read this first, then follow `IMPLEMENTATION_PLAN.md`.

## What we're building

A full-stack inventory intelligence dashboard for the **AI Engineer Code Challenge** (see `AI Engineer Code Challenge .md`). Operators see what to reorder this week, model demand scenarios live, and get AI-powered per-SKU recommendations.

**Submission deadline-driven.** A working deployed MVP beats a polished half-deployed one.

## Read in this order

1. `AI Engineer Code Challenge .md` — the brief from the company. Hard requirements live here.
2. `IMPLEMENTATION_PLAN.md` — phase-by-phase plan with acceptance criteria. **Follow it sequentially.** Do not jump phases.
3. `db_schema.sql` — finalized PostgreSQL schema. Source of truth for the data model.
4. `inventory.json` — the dataset. Has 4+ deliberate data quirks the system must handle (see Plan §3).
5. `design/` — design handoff from Claude Design (HTML/CSS/JSX prototype). **Read at Phase 6** (frontend), ignore until then. Treat as a pixel reference, NOT a source to copy.

## Stack (locked)

- **Backend:** FastAPI (async) · SQLAlchemy 2.0 (async, with `Mapped[...]`) · Alembic · PostgreSQL 15+ · pydantic v2 · `anthropic` SDK
- **Frontend:** Vite · React · TypeScript · Tailwind · shadcn/ui · TanStack Query · recharts · framer-motion
- **Deploy:** Own Ubuntu server · nginx · systemd · Let's Encrypt
- **Python tooling:** `uv` for dep management, `ruff` for lint, `mypy --strict` for types, `pytest` + `pytest-asyncio` for tests

## Non-negotiable rules

These are easy to violate by accident. Don't.

1. **`today` is a parameter, never `datetime.now()`.** Resolve from the latest `sku_snapshots.snapshot_date` at the API edge. All calculation functions take `today: date` explicitly. The dataset has `today = 2026-05-25` baked into `config.today`.
2. **Money & velocity use `Decimal`, never `float`.** DB columns are `NUMERIC`. Python code uses `decimal.Decimal`. `float` enters only in JSON serialization at the edge.
3. **`services/calculations.py` is pure.** No DB session, no I/O, no `datetime.now()`. All inputs are primitives or simple dataclasses. This is the testable core.
4. **Stockout-aware velocity is core, not an edge case.** `GLW-006` has trailing zeros from a stockout — naive velocity gives 0 and says "Healthy ∞ days". The `effective_velocity()` function must skip stockout tail. See Plan §3 for the algorithm.
5. **Importer dedup is two-layered.** File-level via `import_runs.file_checksum` (sha256). Row-level via `ON CONFLICT DO NOTHING` on `(sku_id, sale_date)` and `(sku_id, snapshot_date)`. Both required.
6. **Tests for calculations come before API routes.** Plan §3 lists 8+ golden assertions tied to specific SKU codes. They must be green before moving to Phase 4.
7. **Deploy MVP at Phase 5, before the frontend exists.** This is forced into the plan. Don't skip; deploy issues found late are the #1 way this challenge fails.

## Data quirks reference (memorize these SKU codes)

| SKU | Quirk | Expected handling |
|---|---|---|
| `GLW-006` | `current_stock=0`, last 5 days zero sales (was stocked out) | `STOCKOUT` status, `RECENT_STOCKOUT` flag, effective velocity ~15 (pre-stockout), not 0 |
| `GLW-005` | Stock 60, velocity ~34/day, 49-day lead | `CRITICAL`, reorder date in past, MOQ-bound PO |
| `GLW-002` | Stock 320 (< MOQ 500), 17 days left, 49-day lead | `CRITICAL`, MOQ-bound |
| `VTC-601` | First 7 days zero (new launch / post-stockout), then ramp | `LEADING_ZEROS` flag, must NOT flag as `DECLINING_TREND` |
| `GLW-007` | Holiday bundle, 1-3 units/day, declining | `HIGH_VOLATILITY` + `DECLINING_TREND` flags |
| `VTC-302` | Velocity 3/day, MOQ 800 = 267 days of demand | `MOQ_OVERSHOOT` flag |
| `GLW-001` | Nominal baseline | `HEALTHY`, no flags |

## Design handoff (read at Phase 6)

The `design/` directory contains a working HTML/CSS/JSX prototype produced by Claude Design after iteration with the user. It defines the visual language, layout, and interaction patterns for the dashboard. **Treat it as a pixel reference**, not a source to copy — we re-implement it in React + TS + Tailwind + shadcn/ui.

### Key files

```
design/
├── README.md                              # Claude Design's handoff README (read first)
├── chats/chat1.md                         # Full design iteration history with rationale
└── project/
    ├── Reorder Intelligence Dashboard.html  # HTML entry, links sources
    ├── styles.css                           # 760 lines — full design token system
    └── src/
        ├── sample-data.jsx                  # Reference SKU data + AI_RECOMMENDATIONS + FLAG_DEFS
        ├── atoms.jsx                        # Icon, StatusBadge, Sparkline, Dropdown
        ├── sticky-bar.jsx                   # Sticky header + scenario controls
        ├── this-week.jsx                    # Section 1: action cards
        ├── portfolio-health.jsx             # Section 2: donut + cash horizon + runway
        ├── inventory-table.jsx              # Section 3: sortable filterable table
        ├── drawer.jsx                       # SKU detail drawer with AI card
        └── app.jsx                          # Root composition
```

### What to lift directly

- **All design tokens** (`styles.css:1-45` `:root { ... }`). Port into `tailwind.config.ts` extend block 1:1. Variable names match `DESIGN_BRIEF.md`.
- **All `FLAG_DEFS` explain strings** (`sample-data.jsx`). Use for confidence flag tooltips in the UI.
- **All `AI_RECOMMENDATIONS` text** (`sample-data.jsx`). These are the gold-standard examples — show them to the AI advisor prompt as few-shot in `prompts/sku_action.py`.
- **Sparkline trend logic** (`atoms.jsx`, function `trendOf`). The threshold ±6%, the up/down/stable colors, the stockout/launch zero-bar overrides — all good, copy the rules.
- **`pulseDot` animation + diagonal stripe gradient** for stocked-out runway bar. CSS exact.
- **MOQ-bound badge** in PO qty cell. Small `(MOQ)` tag pattern.
- **Days-of-stock cell with status-tinted background.** Improves table scannability.
- **Slider tick alignment fix:** `left: calc(7px + (100% - 14px) * frac)` — accounts for thumb radius. Easy to miss.

### What NOT to copy

- **The Babel-in-browser setup, `window.X = X` exports.** Artifacts of the prototype environment.
- **`app.jsx` structure with `useState` everywhere.** Replace with TanStack Query for server state + smaller `useState` for ephemeral UI state.
- **Inline `style={{ ... }}` blocks.** Move to Tailwind classes or CSS modules during port.
- **The 14 SKUs hardcoded in `sample-data.jsx`.** The real data has 20 SKUs and comes from the backend API. Numbers in donut / KPIs in the prototype don't match real data — that's expected.

### Critical refactor (don't skip)

The prototype duplicates scenario-adjusted math in 4 places: `this-week.jsx:6-15`, `inventory-table.jsx:14-19`, `portfolio-health.jsx:105-115`, `drawer.jsx:288-291`. Same `factor = 1 + scenario.growth / 100` pattern, recomputed per component. **In the React port, extract this into one hook**: `useScenarioMetrics(rows, scenario) → enrichedRows`. Single source of truth, no drift. Otherwise the drawer numbers will silently diverge from the table after the first config change.

### Gaps in the design (will need to be built during Phase 6/7)

- **MetricCell formula tooltips** — prop is defined but no visible hover state. Add via shadcn `<Tooltip>`.
- **AI refresh button** — needed but not in prototype. Add to AI card footer.
- **API error toasts + skeleton states** — prototype works on static data. Real impl needs both.
- **Settings dropdown is a UI stub.** Either wire to real config or remove for MVP.

### One UX subtlety worth preserving

When `scenario.growth ≠ 0`, the drawer's "Operational metrics" header shows an inline `adjusted @ +20%` badge (in CRITICAL color when positive, HEALTHY when negative). Small detail, but it tells the operator "you're looking at a scenario, not baseline" — keeps them oriented. Replicate.

## Where things live (after Phase 0)

```
backend/app/services/calculations.py   ← pure math, the foundation
backend/app/services/confidence.py     ← flag detection
backend/app/services/importer.py       ← JSON → DB with dedup
backend/app/services/sku_metrics.py    ← orchestrator: load → calc → DTO
backend/app/services/ai_advisor.py     ← Claude API + cache
backend/app/services/cashflow.py       ← stretch goal: 30/60/90 forecast
backend/app/prompts/sku_action.py      ← AI system + user prompts
backend/tests/test_calculations.py     ← golden tests
frontend/src/hooks/useScenarioMetrics.ts  ← single source of scenario math
frontend/src/components/               ← see IMPLEMENTATION_PLAN.md §8 for layout
```

## Environment

`backend/.env` needs:
```
DATABASE_URL=postgresql+asyncpg://reorder:<pwd>@localhost:5432/reorder_intel
ANTHROPIC_API_KEY=sk-ant-...
ALLOWED_ORIGINS=http://localhost:5173,https://<prod-domain>
LOG_LEVEL=INFO
```

`frontend/.env`:
```
VITE_API_URL=http://localhost:8000
```

## How to verify you're on track

Per phase, the acceptance criteria in `IMPLEMENTATION_PLAN.md` are precise (curl outputs, pytest results, row counts). Before declaring a phase done, run them. If something fails, fix it before continuing.

The earliest "everything works" checkpoint:
```bash
# Phase 4 complete:
curl http://localhost:8000/api/skus | jq '. | length'   # → 20
curl 'http://localhost:8000/api/skus?status=CRITICAL' | jq '.[].sku_code'
# → should contain "GLW-005", "GLW-002", "GLW-006" (STOCKOUT) at minimum
```

## When you're unsure

- About the math: re-read the formula bible in the challenge brief, §"The Formula".
- About a quirk: re-read this file's data quirks table.
- About architecture: re-read `IMPLEMENTATION_PLAN.md`. Don't improvise.
- About visual specifics at Phase 6: open `design/project/styles.css` and the matching `.jsx`. Don't guess colors or spacing.
- About something genuinely ambiguous: stop and ask. Wrong-direction work is more expensive than a clarifying question.

## What's explicitly out of scope

Auth, multi-tenancy, soft delete, WebSocket live updates, ABC classification, PO CSV export, seasonality multipliers, email/notifications. These get a one-line mention in README under "what I'd build next" if and only if time permits.

## First action

Start with Phase 0 in `IMPLEMENTATION_PLAN.md`. Bootstrap the repo structure. Do not skip ahead.