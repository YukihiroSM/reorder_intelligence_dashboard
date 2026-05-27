# Reorder Intelligence Dashboard — Implementation Plan

> **Audience:** coding agent (Claude Code).
> **Style:** phase-by-phase. Each phase has explicit deliverables and acceptance criteria. Do NOT skip ahead. Mark phases done before moving on.

---

## 0. Project context

- **Goal:** full-stack web app that ingests SKU/sales/supplier data and surfaces reorder decisions for a non-technical operator.
- **Stack:** FastAPI (async) + SQLAlchemy 2.0 + Alembic + PostgreSQL 15+ on backend. React + Vite + TypeScript + TanStack Query + Tailwind + shadcn/ui on frontend. Deploy: own Ubuntu server behind nginx, systemd-managed uvicorn.
- **AI provider:** Anthropic Claude (Sonnet 4 model), via official SDK.
- **Data:** `inventory.json` from challenge. 20 SKUs, 4 suppliers, 30 days sales history, `today = 2026-05-25` zashitiy in config.
- **Core AI feature:** AI-suggested actions per SKU with reasoning.
- **Stretch goal:** cash flow forecast (30/60/90 day horizons).

### Non-negotiables from the spec

1. Deployed link must work first click. Test in incognito before submitting.
2. Math must be verifiable by an operator — use the formulas exactly as in the spec, document any deviation.
3. AI must add real value, not be a gimmick.
4. Configurable thresholds in UI (buffer, forecast window, growth %, status multipliers).
5. README must be honest about what's done / stubbed / broken.

---

## 1. Repository structure

```
reorder-intel/
├── backend/
│   ├── alembic/
│   │   ├── versions/
│   │   ├── env.py
│   │   └── script.py.mako
│   ├── alembic.ini
│   ├── app/
│   │   ├── __init__.py
│   │   ├── main.py              # FastAPI app factory, CORS, lifespan
│   │   ├── config.py            # env settings via pydantic-settings
│   │   ├── db.py                # engine, session factory
│   │   ├── models/              # SQLAlchemy models
│   │   │   ├── __init__.py
│   │   │   ├── enums.py
│   │   │   ├── reference.py     # Category, Supplier
│   │   │   ├── sku.py           # SKU, SKUSnapshot, SKUSalesDaily
│   │   │   ├── config.py        # AppConfig, SavedScenario
│   │   │   ├── importing.py     # ImportRun
│   │   │   └── ai.py            # AISuggestion
│   │   ├── schemas/             # Pydantic DTOs (request/response)
│   │   │   ├── sku.py
│   │   │   ├── config.py
│   │   │   ├── ai.py
│   │   │   └── cashflow.py
│   │   ├── services/
│   │   │   ├── calculations.py  # PURE FUNCTIONS, no DB. Core math.
│   │   │   ├── importer.py      # JSON → DB with dedup
│   │   │   ├── sku_metrics.py   # orchestrates: load → calculate → return
│   │   │   ├── cashflow.py      # 30/60/90 forecast
│   │   │   ├── ai_advisor.py    # builds context, calls Claude, caches
│   │   │   └── confidence.py    # confidence flag detection
│   │   ├── routes/
│   │   │   ├── skus.py
│   │   │   ├── config.py
│   │   │   ├── scenarios.py
│   │   │   ├── ai.py
│   │   │   ├── cashflow.py
│   │   │   ├── importing.py
│   │   │   └── health.py
│   │   └── prompts/
│   │       └── sku_action.py    # system + user prompts for AI advisor
│   ├── tests/
│   │   ├── conftest.py
│   │   ├── test_calculations.py     # GOLDEN test against inventory.json
│   │   ├── test_confidence.py
│   │   ├── test_importer.py
│   │   ├── test_cashflow.py
│   │   └── test_ai_advisor.py       # mocked Claude
│   ├── pyproject.toml
│   ├── .env.example
│   └── Dockerfile (optional, only if we have time)
├── frontend/
│   ├── src/
│   │   ├── main.tsx
│   │   ├── App.tsx
│   │   ├── api/                 # typed API client
│   │   ├── components/
│   │   │   ├── ConfigBar.tsx
│   │   │   ├── SKUTable.tsx
│   │   │   ├── StatusBadge.tsx
│   │   │   ├── ActionPanel.tsx
│   │   │   ├── SKUDetailDrawer.tsx
│   │   │   ├── CashflowWidget.tsx
│   │   │   └── ConfidenceFlags.tsx
│   │   ├── hooks/
│   │   │   ├── useSKUs.ts
│   │   │   ├── useConfig.ts
│   │   │   └── useAISuggestion.ts
│   │   ├── lib/
│   │   │   ├── formatters.ts
│   │   │   └── urgency.ts
│   │   └── types/
│   ├── index.html
│   ├── package.json
│   ├── tailwind.config.ts
│   ├── tsconfig.json
│   └── vite.config.ts
├── data/
│   └── inventory.json           # копія з challenge
├── deploy/
│   ├── nginx.conf.example
│   ├── reorder-intel-api.service
│   └── DEPLOY.md
├── README.md
└── .gitignore
```

---

## 2. Phase 0 — Bootstrap (must complete before Phase 1)

### Tasks

- [ ] `git init` repo. Initial commit з `.gitignore` (Python, Node, .env).
- [ ] Create directory structure above.
- [ ] `backend/pyproject.toml` with deps: `fastapi`, `uvicorn[standard]`, `sqlalchemy[asyncio]>=2.0`, `asyncpg`, `alembic`, `pydantic>=2`, `pydantic-settings`, `anthropic`, `python-dotenv`. Dev: `pytest`, `pytest-asyncio`, `pytest-postgresql` or `testcontainers[postgres]`, `ruff`, `mypy`, `httpx` (для test client).
- [ ] `frontend/package.json` via `npm create vite@latest -- --template react-ts`. Add: `@tanstack/react-query`, `axios`, `tailwindcss`, `shadcn-ui` deps, `recharts`, `clsx`, `date-fns`, `lucide-react`.
- [ ] `.env.example` for backend with: `DATABASE_URL`, `ANTHROPIC_API_KEY`, `ALLOWED_ORIGINS`, `LOG_LEVEL`.
- [ ] Copy `inventory.json` to `data/inventory.json`.
- [ ] README.md skeleton.

### Acceptance criteria

- `uv sync` (or `pip install -e .`) works in backend.
- `npm install && npm run dev` works in frontend, shows blank page.
- `inventory.json` parseable with `json.loads(open(...).read())`.

---

## 3. Phase 1 — Database schema + migrations

### Tasks

- [ ] Configure SQLAlchemy async engine in `app/db.py`. Use `asyncpg` driver. Session factory `AsyncSessionLocal`.
- [ ] Configure Alembic in `backend/alembic/`. `env.py` reads `DATABASE_URL` from settings, uses async migration runner.
- [ ] Define enums in `app/models/enums.py` (as PostgreSQL enums via `sa.Enum`):
  - `StockHealthStatus`: HEALTHY, LOW, CRITICAL, STOCKOUT
  - `ImportStatus`: PENDING, SUCCESS, PARTIAL, FAILED, SKIPPED
  - `ConfidenceFlag`: RECENT_STOCKOUT, LEADING_ZEROS, HIGH_VOLATILITY, DECLINING_TREND, VELOCITY_DIVERGENCE, SPARSE_DATA, MOQ_OVERSHOOT
  - `AIActionType`: ORDER_NOW, ORDER_SOON, WAIT, INVESTIGATE, DISCONTINUE
  - `ScenarioKind`: BASELINE, CUSTOM
- [ ] Define SQLAlchemy models matching the DBML above. Use `Mapped[...]`, `mapped_column(...)` style (SA 2.0).
  - Money columns: `Numeric(10, 2)`
  - Multipliers: `Numeric(4, 2)`
  - Timestamps: `TIMESTAMP(timezone=True)`, default `func.now()`
  - JSONB columns: `JSONB`
- [ ] Add `CHECK (id = 'active')` constraint on `app_config.id`.
- [ ] Generate initial migration: `alembic revision --autogenerate -m "initial schema"`. Review SQL — autogenerate may miss CHECK constraints; add manually with `op.execute()`.
- [ ] Add data migration that seeds 5 categories and the 4 suppliers from inventory.json. Use Alembic data migration, not seed script — guarantees consistent state.
- [ ] Add data migration that inserts the singleton `app_config` row with defaults.

### Acceptance criteria

- `alembic upgrade head` on empty DB completes without errors.
- After `upgrade head`, `SELECT * FROM categories` returns 5 rows, `suppliers` returns 4, `app_config` returns 1.
- `alembic downgrade base` cleanly removes all tables (no orphan enums).
- All FK constraints visible in `\d+ table_name` in psql.

---

## 4. Phase 2 — Importer with dedup

### Tasks

- [ ] `services/importer.py` with `import_inventory(file_path: Path) -> ImportRun`:
  1. Read file, compute `sha256` checksum.
  2. Check `import_runs` table: if checksum exists with status=SUCCESS → return existing run with status=SKIPPED.
  3. Create new `ImportRun` row with status=PENDING.
  4. Parse JSON. Validate structure with pydantic schema `InventoryFileSchema`. On validation error → status=FAILED, return.
  5. For each SKU in file:
     - UPSERT supplier by `name` (already seeded, just lookup by name).
     - UPSERT category by `code` (lowercase name).
     - UPSERT SKU by `sku_code` — update `current_stock`, `cost_per_unit_usd`, `retail_price_usd`, `moq`, denormalized columns.
     - Compute confidence flags for current state (call `services.confidence`).
     - INSERT `sku_snapshot` with `snapshot_date = config.today from file`. Use `INSERT ... ON CONFLICT (sku_id, snapshot_date) DO UPDATE SET ...` — same-day reimport updates the snapshot.
     - Build list of `sku_sales_daily` rows. Convert `sales_last_30_days[i]` to date `config.today - (29 - i) days`. INSERT with `ON CONFLICT (sku_id, sale_date) DO NOTHING`. Count inserted vs skipped.
  6. Update `ImportRun` with counts and status=SUCCESS (or PARTIAL if some SKUs had errors). Set `finished_at`.
  7. Return run.
- [ ] CLI entry point `python -m app.scripts.import_inventory data/inventory.json` for initial / repeat imports.
- [ ] FastAPI route `POST /api/import` що приймає `multipart/form-data` файл і викликає importer. Корисно для демо.
- [ ] Logging: log every import run id, counts, duration.

### Acceptance criteria

- Importing fresh `inventory.json` into clean DB:
  - Creates 1 `import_run` with status=SUCCESS.
  - Creates 20 SKUs.
  - Creates 20 `sku_snapshots` all with `snapshot_date = 2026-05-25`.
  - Creates exactly 600 `sku_sales_daily` rows (20 SKU × 30 days).
- Re-importing the SAME file:
  - Returns run with status=SKIPPED.
  - No new rows in any table (other than the SKIPPED import_run itself? — actually skip creating that too; just return existing run).
- Test: modify one byte of file, re-import → new run, 0 new sales rows (all `ON CONFLICT DO NOTHING`), snapshot updated.

---

## 5. Phase 3 — Pure calculation functions + tests

> This phase is the foundation. Do NOT proceed until tests are green for all known data quirks.

### Tasks

- [ ] `services/calculations.py` — all pure, no DB, no I/O. Signature pattern: take primitive args, return primitive or simple dataclass.
- [ ] Functions to implement:
  ```python
  def daily_velocity(sales: list[int], window_days: int) -> Decimal:
      """Average over the LAST `window_days` entries of sales array."""

  def effective_velocity(sales: list[int], current_stock: int, window_days: int) -> tuple[Decimal, list[ConfidenceFlag]]:
      """Stockout-aware velocity.
      If current_stock == 0 and trailing zeros in sales: skip trailing zeros, use prior window.
      If leading zeros (length >= 5): skip them, recompute window over remaining.
      Returns (velocity, flags_raised).
      """

  def projected_velocity(velocity: Decimal, growth_pct: Decimal) -> Decimal: ...

  def days_of_stock(current_stock: int, projected_velocity: Decimal) -> Decimal | None:
      """None means infinite (velocity == 0)."""

  def total_lead_days(production: int, shipping: int, buffer: int) -> int: ...

  def reorder_date(today: date, days_of_stock: Decimal | None, total_lead: int) -> date | None:
      """Date a PO must be placed. None if days_of_stock is None (no demand)."""

  def recommended_po_qty(moq: int, projected_velocity: Decimal, forecast_window: int) -> tuple[int, bool]:
      """Returns (qty, moq_was_binding)."""

  def stock_health(
      current_stock: int,
      days_of_stock: Decimal | None,
      total_lead: int,
      critical_mult: Decimal,
      low_mult: Decimal,
  ) -> StockHealthStatus:
      """STOCKOUT if stock=0. CRITICAL if days < lead*critical_mult. LOW if < lead*low_mult. else HEALTHY."""

  def estimated_reorder_cost(po_qty: int, cost_per_unit: Decimal) -> Decimal: ...

  def coefficient_of_variation(sales: list[int]) -> Decimal: ...

  def trend_direction(sales: list[int]) -> Literal["up", "down", "flat"]:
      """Compare last-7d-avg vs preceding-7d-avg, threshold 15%."""
  ```
- [ ] `services/confidence.py` — `detect_flags(sku, sales, config) -> list[ConfidenceFlag]`:
  - RECENT_STOCKOUT: stock=0 AND any of last 7 days had >0 sales earlier.
  - LEADING_ZEROS: first ≥5 sales entries are 0 AND total array has mostly non-zero rest.
  - HIGH_VOLATILITY: CV > config.volatility_cv_threshold.
  - DECLINING_TREND: trend direction "down".
  - VELOCITY_DIVERGENCE: |v_short - v_long| / max(v_long, 1) > config.velocity_divergence_threshold.
  - SPARSE_DATA: non-zero days < config.sparse_data_min_days.
  - MOQ_OVERSHOOT: po_qty > velocity * forecast_window * config.moq_overshoot_multiplier.
- [ ] `tests/test_calculations.py` — golden tests using actual `inventory.json` SKUs. Use a fixture that loads the file and locks `today = 2026-05-25`.

### Test assertions (must all pass)

```python
def test_glw005_critical():
    """Magnesium Glycinate: stock 60, velocity ~34/day → 1.7 days, lead+buf 49 → CRITICAL."""
    metrics = compute(sku="GLW-005", config=default_config)
    assert metrics.status == StockHealthStatus.CRITICAL
    assert metrics.days_of_stock < 3
    assert metrics.reorder_date < date(2026, 5, 25)  # already overdue
    assert metrics.recommended_po_qty == 500  # MOQ-bound
    assert metrics.moq_binding is True

def test_glw006_stockout_aware():
    """Hair Growth Gummies: stock=0, last 5 days zero (was stockout).
    Naive velocity = (sum/30) — wrong. Effective velocity uses pre-stockout days."""
    metrics = compute(sku="GLW-006", config=default_config)
    assert metrics.status == StockHealthStatus.STOCKOUT
    assert metrics.confidence_flags.includes(ConfidenceFlag.RECENT_STOCKOUT)
    # effective velocity should be ~15 (pre-stockout avg), not 0 or 9.8 (with zeros)
    assert 12 < metrics.effective_velocity < 18

def test_vtc601_leading_zeros():
    """Probiotic Complex: first 7 days are 0 (new launch / post-stockout).
    Trend should not flag as 'declining'; LEADING_ZEROS should fire."""
    metrics = compute(sku="VTC-601", config=default_config)
    assert ConfidenceFlag.LEADING_ZEROS in metrics.confidence_flags
    assert metrics.status == StockHealthStatus.HEALTHY  # 1680 stock, 5/day → 336 days
    assert ConfidenceFlag.DECLINING_TREND not in metrics.confidence_flags

def test_glw007_volatile_holiday_bundle():
    """Limited Edition Bundle: low volume, declining."""
    metrics = compute(sku="GLW-007", config=default_config)
    assert ConfidenceFlag.HIGH_VOLATILITY in metrics.confidence_flags or \
           ConfidenceFlag.DECLINING_TREND in metrics.confidence_flags

def test_glw002_below_moq_critical():
    """Daily Greens Berry: stock 320 < MOQ 500, velocity ~19, lead 49 → CRITICAL."""
    metrics = compute(sku="GLW-002", config=default_config)
    assert metrics.status == StockHealthStatus.CRITICAL
    assert metrics.current_stock < metrics.moq

def test_vtc302_moq_overshoot():
    """Travel Multivitamin: velocity 3/day, MOQ 800 = 267 days of demand → overshoot."""
    metrics = compute(sku="VTC-302", config=default_config)
    assert ConfidenceFlag.MOQ_OVERSHOOT in metrics.confidence_flags
    assert metrics.recommended_po_qty == 800

def test_glw001_healthy_baseline():
    """Daily Greens Tropical: nominal case, no flags."""
    metrics = compute(sku="GLW-001", config=default_config)
    assert metrics.status == StockHealthStatus.HEALTHY
    assert len(metrics.confidence_flags) == 0

def test_growth_scenario_shifts_reorder_dates():
    """At +30% growth, all reorder dates move earlier and PO qtys go up."""
    baseline = compute_all(config=default_config)
    boosted = compute_all(config=default_config.with_growth(30))
    for sku in baseline:
        b = baseline[sku]; bo = boosted[sku]
        if b.days_of_stock is not None:
            assert bo.days_of_stock < b.days_of_stock
        assert bo.recommended_po_qty >= b.recommended_po_qty

def test_velocity_zero_returns_none_days():
    """Zero-velocity SKU has infinite days of stock → reorder_date None."""
    # construct synthetic SKU with all-zero sales, stock > 0
    ...
```

### Acceptance criteria

- All 8+ tests above pass. Run `pytest tests/test_calculations.py -v` — green.
- `mypy app/services/calculations.py` passes with no errors.
- Code review check: NO database calls, NO HTTP calls, NO time-dependent calls (no `datetime.now()`) inside this module. `today` is always a parameter.

---

## 6. Phase 4 — SKU metrics service + API routes

### Tasks

- [ ] `services/sku_metrics.py`:
  - `async def get_all_sku_metrics(session, config) -> list[SKUMetricsDTO]`: loads all active SKUs with their latest snapshot + last N days of sales (window from config), runs calculations, returns DTOs.
  - `async def get_sku_metrics(session, sku_code, config) -> SKUMetricsDTO`: single SKU variant.
  - `today` resolved from latest snapshot date in DB, not wall clock.
- [ ] Pydantic response schema `SKUMetricsDTO` with all metrics + supplier name + category name + confidence_flags as string list.
- [ ] `routes/skus.py`:
  - `GET /api/skus` — query params: `status`, `category`, `supplier`, `sort` (e.g. `urgency_desc`, `days_remaining_asc`), `growth_pct` (override config), `forecast_window` (override). Sort + filter happen in Python after compute (20 SKUs — overhead negligible).
  - `GET /api/skus/{sku_code}` — single SKU including full sales array for chart.
- [ ] `routes/config.py`:
  - `GET /api/config` — returns the singleton app_config row.
  - `PUT /api/config` — partial update, validates ranges (growth 0..1000, multipliers 0..10, etc.).
- [ ] `routes/scenarios.py` (basic CRUD for saved_scenarios — optional, but trivial to add):
  - `GET /api/scenarios`, `POST /api/scenarios`, `DELETE /api/scenarios/{id}`.
- [ ] `routes/health.py` — `GET /api/health` returns `{"status": "ok", "data_date": "2026-05-25", "skus_loaded": 20}`.
- [ ] CORS: enable for frontend dev origin via `ALLOWED_ORIGINS` env var.

### Acceptance criteria

- `curl http://localhost:8000/api/skus | jq '. | length'` → 20.
- `curl 'http://localhost:8000/api/skus?status=CRITICAL'` → returns at least GLW-005, GLW-002, GLW-006.
- `curl 'http://localhost:8000/api/skus?growth_pct=30'` → reorder dates earlier vs `growth_pct=0`.
- `curl http://localhost:8000/api/health` → 200, includes data_date.
- All routes have OpenAPI docs visible at `/docs`.

---

## 7. Phase 5 — Deploy MVP early (do NOT skip)

> Deploy after Phase 4 even if frontend is empty. Risk-mitigation: discover deploy issues now, not at 3am.

### Tasks

- [ ] On Ubuntu server: install Postgres 15+ if not present. Create DB `reorder_intel` and user.
- [ ] Provision systemd service file `deploy/reorder-intel-api.service`:
  ```ini
  [Unit]
  Description=Reorder Intelligence API
  After=network.target postgresql.service

  [Service]
  Type=simple
  User=www-data
  WorkingDirectory=/opt/reorder-intel/backend
  EnvironmentFile=/opt/reorder-intel/backend/.env
  ExecStart=/opt/reorder-intel/backend/.venv/bin/uvicorn app.main:app --host 127.0.0.1 --port 8001 --workers 2
  Restart=always
  RestartSec=5

  [Install]
  WantedBy=multi-user.target
  ```
- [ ] nginx config `deploy/nginx.conf.example`:
  - `server_name <domain>;`
  - `location /api/ { proxy_pass http://127.0.0.1:8001/api/; ... headers ... }`
  - `location / { root /var/www/reorder-intel; try_files $uri /index.html; }`
- [ ] certbot for HTTPS (Let's Encrypt).
- [ ] Deploy script `deploy/deploy.sh` що: pulls latest, runs migrations, builds frontend, restarts systemd.
- [ ] `DEPLOY.md` with manual steps and how `deploy.sh` is used.

### Acceptance criteria

- Hitting `https://<your-domain>/api/health` from incognito browser returns 200 with correct data.
- `https://<your-domain>/api/skus` returns full SKU list.
- `systemctl status reorder-intel-api` → active.
- Nginx access log shows requests.

---
# IMPLEMENTATION_PLAN.md — Phase 6 (revised)

> **Patch instructions:** replace the existing `## 8. Phase 6 — Frontend skeleton + table` section in `IMPLEMENTATION_PLAN.md` with everything below.
> The design handoff (`design/`) is now the visual source of truth — this phase is a port, not a design exercise.

---

## 8. Phase 6 — Frontend implementation (design port)

> **Read `CLAUDE.md` §"Design handoff" first.** This phase ports the prototype in `design/` to production React. The design is locked; don't redesign.

### Phase 6.0 — Scaffold + design token import (~45 min)

- [ ] Vite + React + TS scaffold (`npm create vite@latest frontend -- --template react-ts`).
- [ ] Install deps: `@tanstack/react-query`, `axios`, `clsx`, `date-fns`, `framer-motion`, `lucide-react`, `recharts`, `tailwindcss`, `tailwindcss-animate`, `class-variance-authority`. Run `npx shadcn-ui@latest init` and add components: `button`, `card`, `badge`, `input`, `dropdown-menu`, `tooltip`, `slider`, `select`, `sheet` (drawer), `skeleton`, `toast`.
- [ ] **Port design tokens.** Open `design/project/styles.css` lines 1-45 (the `:root { ... }` block). Translate every CSS variable into `tailwind.config.ts` `theme.extend` under `colors`, `fontFamily`, etc. Use exact hex values. Verify the names match `CLAUDE.md` and `DESIGN_BRIEF.md`.
- [ ] Add `Inter` and `JetBrains Mono` via Google Fonts in `index.html` (same `<link>` as in the prototype's HTML).
- [ ] Global CSS: enable `font-variant-numeric: tabular-nums` on `.tabular` utility class. Apply it to all table numeric cells.

**Acceptance:**
- `npm run dev` opens a blank page on `:5173`.
- A throwaway `<div className="bg-stockout-bg text-stockout-fg">test</div>` renders with correct color.
- `font-mono` class on a `<span>1234</span>` shows JetBrains Mono.

---

### Phase 6.1 — API client + types + scenario hook (~1 h)

- [ ] `src/api/client.ts`: axios instance with `baseURL` from `VITE_API_URL`, interceptor for error logging.
- [ ] `src/types/sku.ts`: TypeScript interfaces mirroring backend Pydantic schemas. Manually keep in sync — note in code comments which backend schema each maps to. **Status enum must include `STOCKOUT` (not collapsed into `CRITICAL`).**
- [ ] `src/api/skus.ts`: typed wrappers — `getSKUs(params)`, `getSKU(code)`, `getConfig()`, `updateConfig(...)`, `getAISuggestion(skuCode)`, `getCashflow(params)`.
- [ ] `src/hooks/useSKUs.ts`: TanStack Query hook. Query key includes scenario params so cache invalidates on slider change.
- [ ] `src/hooks/useConfig.ts`: GET + PUT, optimistic update on PUT.
- [ ] **`src/hooks/useScenarioMetrics.ts` — THE critical refactor flagged in CLAUDE.md.** Takes `rows` and `scenario`, returns `enrichedRows` with `_adjVel`, `_adjDays`, `_totalLead`, `_needsThisWeek` already computed once. All four sections consume from this hook — no recomputation per component.

**Acceptance:**
- `useSKUs({ growth_pct: 0 })` returns 20 SKUs in dev tools network panel.
- Changing growth in scenario state triggers a refetch with new params.
- `useScenarioMetrics` returns enriched rows; spot-check `GLW-005._adjDays < 2` at growth=0.

---

### Phase 6.2 — Sticky bar with scenario controls (~1 h)

> Reference: `design/project/src/sticky-bar.jsx` + `design/project/styles.css` (sections `.sticky-bar`, `.scenario-bar`, `.scenario-segment`).

- [ ] `components/StickyBar.tsx`: brand row (logo + title + `Data as of {date}` badge + History + Settings buttons).
- [ ] On-scroll shadow: `position: sticky; top: 0` with `bg-white/90 backdrop-blur` + bottom border that appears when `window.scrollY > 4`.
- [ ] `components/ScenarioControls.tsx`:
  - **Growth slider** — native `<input type="range">` styled, snap values `[-20, -10, 0, 10, 20, 30, 50, 100]`. Tick labels absolutely positioned at `left: calc(7px + (100% - 14px) * frac)` (this is the alignment fix from the design — copy exact).
  - **Lead buffer** — segmented control `[0, 7, 14, 21]` (not a slider — discrete).
  - **Forecast window** — segmented `[30, 60, 90]`.
  - **Reset** + **Save scenario** buttons.
- [ ] **History dropdown** — shows recent imports (from `/api/import_runs` if exposed, else stub for MVP). Includes a row for the saved `+20% holiday` scenario that, on click, sets scenario to `{growth: 20, leadBuffer: 7, forecastDays: 90}`. This is the demo "save & recall" UX hook.
- [ ] **Settings dropdown** — drop from MVP if it can't be wired to backend. Better to ship without than ship a broken stub. Note in README.

**Acceptance:**
- Drag growth slider → ticks remain visually aligned with thumb at every value.
- Click a tick → growth snaps to it.
- Click "Reset" → all three controls return to defaults (`0`, `7d`, `60d`).
- Sticky bar gets a 1px bottom border after scrolling down 5px.

---

### Phase 6.3 — Section 1: This Week (~1 h)

> Reference: `design/project/src/this-week.jsx` + styles `.card.hero`, `.allclear`, `.tw-list`, `.cash-breakdown`, `.stockout-card`.

- [ ] `components/ThisWeekSection.tsx` with three cards in a `grid-cols-3 gap-3` layout.
- [ ] **Card 1: Needs ordering.** From `useScenarioMetrics`, filter rows where `_needsThisWeek === true`, sort STOCKOUT-first then by `_adjDays` asc, slice to 4. Show count + list (clickable rows → open drawer).
- [ ] **Card 2: Cash exposure.** Sum `poCost` for the same set; show mini-bars per SKU as horizontal stacked breakdown. Footer button "Open cashflow →" scrolls to `#cash-horizon-anchor`.
- [ ] **Card 3: Active stockouts.** If 0 stockouts → render the "All SKUs in stock ✓" healthy variant. If ≥1 → render the red variant with `pulseDot` on the badge dot + 2px left border accent. Show `est. $X/day lost` per SKU computed as `v14d * retailPrice`.
- [ ] All three cards' click targets work: card 1 row → open SKU drawer; card 2 → scroll to cash horizon; card 3 row → open drawer for that stockout SKU.

**Acceptance:**
- At growth=0, Card 1 lists `GLW-005`, `GLW-002`, `GLW-006` at minimum.
- At growth=+30%, Card 1 includes additional SKUs (typically VTC-302 enters the danger zone).
- Card 2's cash number changes when growth slider moves.
- Click GLW-005 in Card 1 → drawer opens with that SKU.

---

### Phase 6.4 — Section 2: Portfolio Health (~2 h)

> Reference: `design/project/src/portfolio-health.jsx`. Three custom-SVG charts. The prototype uses raw SVG, not recharts.

**Decision: keep custom SVG, do NOT switch to recharts for these three.** Why: the chart specs are tight and bespoke (donut center text, week-stacked bars with fixed week count, runway bars with diagonal stripe pattern). recharts adds bundle weight and fights against custom needs here. Save recharts for the drawer's sales trend chart where it shines.

- [ ] `components/portfolio/StatusDonut.tsx`: 4 slices (HEALTHY/LOW/CRITICAL/STOCKOUT), inner radius 50 outer 70, center label `{total}` + `SKUS TOTAL`. Hover legend row dims other slices to 25% opacity. STOCKOUT dot pulses.
- [ ] `components/portfolio/CashHorizon.tsx`: 12-week stacked bar chart, x-axis labels `W1` … `W12`, y-axis in `$Xk` format. Stack by category using the categorical viz palette. Tooltip on hover shows breakdown. **Includes 3-cell KPI strip above the chart** (`30d / 60d / 90d` totals) + **the post-bug-fix legend** (sorted by category total DESC with — for zero categories). Wrapper div has `id="cash-horizon-anchor"` for scroll-to.
- [ ] `components/portfolio/RunwayBars.tsx`: horizontal bars per category, sorted asc by avgDays. Bar color from `healthColor()` rule. **Stockout category gets the diagonal stripe gradient** (`repeating-linear-gradient(45deg, #FEE2E2 0 6px, #FCA5A5 6px 12px)`). Bottom legend with three swatches.
- [ ] All three charts subscribe to `useScenarioMetrics` so they re-stack on slider change without explicit prop drilling.

**Acceptance:**
- At growth=0, donut shows correct breakdown matching real data from API (not the mocked 17/2/1 from the prototype).
- Cash horizon `90d` total roughly matches sum of all `poCost` for SKUs reordering within window.
- Beauty category (which contains GLW-006 stockout) shows striped bar with `STOCKOUT` label.
- Clicking "Open cashflow →" in Section 1 smooth-scrolls to the cash horizon chart with a brief blue ring flash (copy the `boxShadow` flash from `app.jsx:36-39`).

---

### Phase 6.5 — Section 3: Inventory Table (~2 h)

> Reference: `design/project/src/inventory-table.jsx` + styles `.inv`, `.days-cell`, `.reorder`, `.moq-bound`, `.sortable`, `.filters`.

- [ ] `components/InventoryTable.tsx` — 11 columns as specified in design brief §4. Use a real `<table>` element with `<th scope="col">` and `aria-sort` for accessibility.
- [ ] Columns (left-to-right): SKU code (mono) · Product (name + category caption) · Status (badge) · Stock (mono, right-aligned) · 30d trend (sparkline) · 7d/14d velocity (dual stat) · Days left (big number, status-tinted background) · Reorder by (date + overdue caption) · PO qty (with MOQ tag) · Cost · Flags.
- [ ] Sort by clicking headers (sortable cols: code, name, stock, days, cost, status urgency). Default sort: urgency desc.
- [ ] Filter bar above table: multi-select Status dropdown, Category dropdown, Supplier dropdown, search input, `[Clear]` button (only visible when any filter active), `{filtered} of {total}` counter on the right.
- [ ] Empty state when filters yield 0: centered text + Clear button.
- [ ] Row click → opens drawer + updates URL `?sku=GLW-005`.
- [ ] Selected row has visible highlight (`.selected` class — left accent border + subtle bg).
- [ ] `table-wrap` div has `overflow-x: auto` and table has `min-width: 1180px` so narrow viewports get horizontal scroll (this is one of Andrii's fixes from the design chat — copy exact).

- [ ] **Sparkline component** — port `Sparkline` from `atoms.jsx` lifting:
  - The `trendOf()` function with the ±6% threshold
  - The `TREND_COLORS` palette (green/red/blue)
  - Trailing-zeros stockout override (red at 55% opacity)
  - Leading-zeros launch override (stone-300 at 60% opacity)
  - The 7d MA overlay line in the trend color
  - The end indicator (↗/↘/—) with the tinted background

**Acceptance:**
- 20 rows render. GLW-005 / GLW-002 / GLW-006 at top by default sort.
- Sparkline for GLW-006 shows red trailing bars + red downward indicator.
- Sparkline for VTC-601 shows light-gray leading bars + green/blue indicator (post-launch growth).
- Filter "STOCKOUT" → only GLW-006 visible.
- Click any row → drawer opens + URL gets `?sku=...`.
- Refresh page with `?sku=GLW-005` in URL → drawer reopens automatically.

---

### Phase 6.6 — SKU Detail Drawer (~2 h)

> Reference: `design/project/src/drawer.jsx` + styles `.drawer`, `.metric-grid`, `.metric-cell`, `.flag-strip`, `.ai-card`.

- [ ] `components/SKUDetailDrawer.tsx` using shadcn `<Sheet side="right">`. Width 560px on desktop.
- [ ] **Header:** SKU code (mono caption) + name (page-title size) + category·supplier·MOQ·cost-per-unit metadata line + large status badge.
- [ ] **Sales trend chart** — use recharts `ComposedChart` here (this is where recharts shines). Bars for daily sales + 2 line overlays: MA7 (solid darker) + MA14 (dashed lighter). Vertical reference line at trailing-zeros-start for stockout SKUs. Y-axis 4 ticks, X-axis labels every 7 days. Tooltip on hover shows date / units / both MA values.
- [ ] **Operational metrics grid** — 3×3 `MetricCell` cards. Cells separated by hairline borders only.
  - When `scenario.growth !== 0`, render the inline `adjusted @ +X%` badge in the section title (color = critical-fg if growth>0, healthy-fg if growth<0).
  - Each `MetricCell` props: `label`, `value`, `caption`, `formula?`, `highlight?` (bool). If `formula` present, hover shows shadcn `<Tooltip>` with the formula text — **this is the gap flagged in CLAUDE.md, build it now**.
  - Highlight CRITICAL/STOCKOUT cells with a subtle status-bg tint (mainly "Days of stock" cell).
- [ ] **Confidence flags strip** — horizontal scrollable pills. Click a pill → expands an explanation panel beneath using the FLAG_DEFS text from sample data. Only one flag expanded at a time.
- [ ] **AI Recommendation card** — collapsed by default with a primary button `Get AI recommendation`. On click → shimmer skeleton for ~1.5s (or until API responds, whichever is longer — keep minimum delay so cache hits don't look buggy). On result:
  - Action badge colored by action type (`ORDER_NOW` red, `WAIT` neutral, `INVESTIGATE` amber, `DISCONTINUE` red-muted)
  - 5 urgency dots (filled per level)
  - Reasoning text (preserve `<mark>` tags for highlighted numbers; render as `<mark>` HTML, not text)
  - Warnings list as inline yellow alerts
  - Footer: `Generated 2s ago · Sonnet 4 · 412 tokens · [Refresh ↻]` — **the refresh button is the second gap from CLAUDE.md, build it**. Bypasses cache via a force flag in the API call.
- [ ] **Footer:** primary button `[Generate PO · $X,XXX]` (stub — opens a toast "PO export coming soon" for MVP) + ghost button `[AI history]` (also stub).
- [ ] **Keyboard:** ESC closes drawer. Focus traps inside while open. On close, focus returns to the originating row.

**Acceptance:**
- Open drawer for GLW-005 → all 9 metric cells populated.
- Hover "Days of stock" cell → tooltip shows formula `60 / 33.6 = 1.79`.
- Click `Get AI recommendation` for GLW-005 → skeleton then ORDER_NOW result.
- Click Refresh on AI card → new API call (verifiable by network panel), result re-renders.
- Move growth slider while drawer is open → metrics update + `adjusted @ +X%` badge appears in section title.
- Press ESC → drawer closes, URL `?sku=...` clears.

---

### Phase 6.7 — Errors, loading, polish (~1 h)

- [ ] **API error toasts** — shadcn `<Toast>` triggered from axios interceptor. Persistent until dismissed. Has retry button when possible.
- [ ] **Skeleton states** — every section gets a skeleton when `isLoading`. Match prototype heights so layout doesn't shift.
- [ ] **Status bar at bottom of page** — small footer with `Reorder Intelligence · v1.0 · 20 SKUs · 5 categories · 8 suppliers · data refreshed {time}`. Stub the timestamp for MVP.
- [ ] **prefers-reduced-motion fallback:** disable pulse animation on STOCKOUT dot if user has the setting.
- [ ] **Focus ring** uses `--focus: #0EA5E9`. Verify via keyboard tab through the whole UI — no missing focus.
- [ ] **Console silent** — no errors, no warnings, no unhandled promise rejections in dev mode.

**Acceptance:**
- Disconnect backend → app shows error toast with retry, doesn't white-screen.
- Slow 3G in DevTools → skeletons render in every section, no layout shift on data arrival.
- Tab through entire UI from sticky bar to footer → every interactive element has a visible focus ring.

---

### Definition of done for Phase 6

- [ ] All 7 sub-phases acceptance criteria green.
- [ ] Visual side-by-side against `design/project/Reorder Intelligence Dashboard.html`: no obvious mismatches in spacing, colors, typography, layout.
- [ ] All 20 real SKUs render correctly with their actual confidence flags (not the prototype's mocked numbers).
- [ ] Scenario slider moves → all three sections + drawer (if open) update with no flicker, no stale numbers.
- [ ] No console errors. No `any` types in code under `src/`. Lint clean.

---

### Out of scope for Phase 6 (deferred or dropped)

- Saved scenarios full CRUD UI (data model supports it; only "load saved" works in MVP via history dropdown).
- AI history view (button stubbed → toast).
- PO export (button stubbed → toast).
- Settings dropdown beyond placeholder (drop if can't wire to backend in time).
- Mobile layout — single breakpoint at tablet (768px+) only.
- Dark mode — explicitly light mode only.

---

## 9. Phase 7 — AI suggested actions

### Tasks

- [ ] `services/ai_advisor.py`:
  ```python
  async def get_suggestion(session, sku_code: str, config: AppConfig) -> AISuggestionDTO:
      """1. Load SKU + metrics + sales.
         2. Build context dict.
         3. Compute context_hash.
         4. Lookup ai_suggestions table by (sku_id, context_hash). If hit, return.
         5. Else: build prompt, call Claude, parse response, store in DB, return.
      """
  ```
- [ ] `prompts/sku_action.py`:
  - **System prompt** (locked, versioned in code): explains role (inventory advisor), available action types with definitions, the formula bible (copy from spec), how to use confidence flags, output schema (JSON with `action_type`, `urgency`, `reasoning`, `suggested_po_qty`, `warnings`), rules: never invent numbers, prefer ORDER_NOW only when math supports it, recommend INVESTIGATE on conflicting signals, be concise (≤3 sentences in reasoning).
  - **User prompt template**: structured context with all metrics, sales array, confidence flags, config.
- [ ] Use Anthropic SDK with `messages.create`, model `claude-sonnet-4-5-20250929` or latest available. Use JSON mode or `response_format` hint; parse defensively.
- [ ] Cache key (`context_hash`): sha256 over JSON dumps of:
  - `sku_code`, `current_stock`, `moq`, `cost_per_unit_usd`
  - `tuple(sales_last_30_days)`
  - relevant config: `growth_pct, forecast_window_days, shipping_buffer_days, critical_multiplier, low_multiplier`
  - prompt version constant (bump when prompt changes → invalidates cache)
- [ ] `routes/ai.py`:
  - `POST /api/ai/suggest-action` body `{sku_code: str}` (config implicit from app_config or query overrides). Returns `AISuggestionDTO`.
  - `GET /api/ai/history/{sku_code}` — returns past suggestions for this SKU (audit trail).
- [ ] Frontend integration in `SKUDetailDrawer`:
  - Button "Get AI recommendation" → triggers POST.
  - Loading state, then renders action badge + urgency stars + reasoning text + warnings.
  - "Refresh" button bypasses cache (adds nonce or force flag).
- [ ] Token usage budget: limit max_tokens to 800. Reasoning text ≤500 chars target.

### Acceptance criteria

- Calling AI on GLW-005 returns `action_type=ORDER_NOW`, urgency 4-5, reasoning mentions math (current days vs lead).
- Calling AI on GLW-006 returns `action_type=ORDER_NOW` or `INVESTIGATE`, reasoning notes stockout.
- Calling AI on GLW-001 (healthy baseline) returns `WAIT`, reasoning notes ample stock.
- Calling AI on VTC-302 (overshoot candidate) — model may recommend `DISCONTINUE` or `INVESTIGATE` due to MOQ vs velocity mismatch.
- Second call to same SKU with same config → cache hit (DB lookup, no LLM call). Verifiable by token counter = 0 or by log.
- All AI calls under 2s on warm cache, ~4-8s on cold.

---

## 10. Phase 8 — Cash flow forecast (stretch goal)

### Tasks

- [ ] `services/cashflow.py`:
  - `async def forecast(session, config, horizons=[30,60,90]) -> CashflowForecast`:
    - For each SKU, compute reorder cycles within horizon: first reorder_date (from metrics), then subsequent reorders every `forecast_window_days` until horizon end.
    - Each cycle adds `po_qty * cost_per_unit` to the bucket containing `reorder_date`.
    - Return total per horizon + breakdown by SKU + breakdown by category + breakdown by supplier.
- [ ] `routes/cashflow.py`: `GET /api/cashflow?growth_pct=...&forecast_window=...` returns the forecast.
- [ ] `CashflowWidget.tsx`:
  - Three large numbers: $X (30d), $Y (60d), $Z (90d). Each clickable → expands inline breakdown.
  - Mini sparkline showing weekly spend distribution.
  - Updates live with growth slider.
- [ ] Test edge cases:
  - SKU with no reorder needed in horizon → contributes 0.
  - SKU with multiple reorder cycles → sums correctly.
  - Critical SKU with reorder_date in past → counted in 30d bucket.

### Acceptance criteria

- Total 30-day spend roughly equals: sum of `po_qty * cost_per_unit` for SKUs with reorder_date <= today+30.
- At growth +30%, total spend increases by a non-trivial percentage (≥10%).
- Clicking the widget shows top contributing SKUs.
- Cashflow numbers are formatted with currency + thousands separator.

---

## 11. Phase 9 — Polish + README + Loom

### Tasks

- [ ] README sections:
  - **What it is**: one-paragraph pitch.
  - **Live URL**: with note "no auth required".
  - **Stack choices**: brief justification for FastAPI, Postgres, etc.
  - **Architecture**: ASCII diagram of nginx → uvicorn → Postgres + Claude API.
  - **Core feature: AI advisor** — what it does, why this over alternatives.
  - **Stretch tackled**: cash flow forecast — explain calc.
  - **Data quirks handled**: list each (GLW-006 stockout-aware velocity, VTC-601 leading-zeros, GLW-005 critical, GLW-007 volatility, VTC-302 MOQ overshoot).
  - **How AI tooling was used in development**: honest list (which parts written by Claude Code, which prompt-engineered, which by hand).
  - **What's done / stubbed / known limitations**: e.g. "no auth", "single-tenant", "no historical scenario compare UI (data model supports it)", etc.
  - **What I'd build next with one more day**: 3-4 items max.
  - **Local setup**: `docker-compose up` or step-by-step.
  - **Deploy**: link to `DEPLOY.md`.
- [ ] Visual polish:
  - Empty states for filters with no results.
  - Loading skeletons in table and widget.
  - Error toast on API failure.
- [ ] Final smoke test:
  - Visit production URL in incognito.
  - Walk every interaction: filter, sort, slider, AI button, scenario, cashflow drill-down.
  - Check console for errors.
  - Mobile breakpoint sanity check.
- [ ] Loom recording (≤2 min):
  - 0:00-0:20 — what it is, who it's for.
  - 0:20-0:50 — open prod URL, point at CRITICAL SKUs, show how confidence flags catch GLW-006 stockout.
  - 0:50-1:20 — change growth slider live, show table updating, show cashflow widget moving.
  - 1:20-1:45 — click into a SKU, run AI advisor, read recommendation.
  - 1:45-2:00 — one non-obvious decision (stockout-aware velocity), what I'd build next.

### Acceptance criteria

- README passes the "could someone fork and run locally" smell test.
- Live URL works in incognito on first click.
- Loom is exactly ≤2:00 and covers all four required points from spec.

---

## 12. Risk register

| Risk | Mitigation |
|---|---|
| Deploy fails at last minute | Deploy MVP after Phase 4 (forced into plan). |
| AI gives wrong action confidently | Lock prompt with formula bible, include warnings field, never auto-execute. |
| Numeric precision drift | Use `Decimal` everywhere money/velocity, `Numeric` in DB, never `float`. |
| Re-importing breaks state | `ON CONFLICT` on every insert, file-checksum check at top. |
| Frontend out of sync with backend types | Single source of truth: backend OpenAPI. For challenge scale, manual sync OK but cite limitation in README. |
| Claude API key leaked | `.env` in `.gitignore`, prod env via systemd `EnvironmentFile`. |
| `today` confusion (wall clock vs data) | All code paths take `today` as explicit parameter, resolved from latest snapshot date at the edge. |

---

## 13. Definition of Done

- [ ] All Phase 0-9 checkboxes ticked.
- [ ] `pytest backend/tests/` green.
- [ ] Live URL passes incognito test.
- [ ] README explains everything claimed; nothing claimed that isn't true.
- [ ] Loom recorded, ≤2:00, link in submission.
- [ ] Repo URL ready to share (public or invite reviewers).

---

## 14. Out of scope (explicitly)

- Authentication / authorization
- Multi-tenancy (would need org_id everywhere + RLS)
- WebSocket live updates (polling via TanStack Query is enough at this scale)
- ABC classification (stretch we did NOT pick)
- Scenario save/compare UI (data model supports it; UI not built unless time permits)
- PO CSV export
- Seasonality multipliers
- Email/notifications
- Audit log on data updates beyond `import_runs`

These are mentioned in README "what I'd build next" if time permits.
