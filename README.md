# Reorder Intelligence Dashboard

A full-stack inventory intelligence dashboard: ingests SKU / sales / supplier data and tells an
operator **when to reorder, how much to order, and how healthy each SKU's stock position is** —
with live demand-scenario modelling and AI-suggested actions per SKU.

> Built for the AI Engineer Code Challenge. See `AI Engineer Code Challenge .md` for the brief and
> `IMPLEMENTATION_PLAN.md` for the phase-by-phase build plan.

## Live URL

_TBD — deployed at Phase 5._ No auth required.

## Stack

- **Backend:** FastAPI (async) · SQLAlchemy 2.0 (async) · Alembic · PostgreSQL 15+ · pydantic v2
- **AI:** LangChain + LangGraph, provider-agnostic (currently OpenAI `gpt-5.4-nano`, switchable via `LLM_MODEL`)
- **Frontend:** Vite · React · TypeScript · Tailwind · shadcn/ui · TanStack Query · recharts · framer-motion
- **Deploy:** Ubuntu server · nginx · systemd · Let's Encrypt

## Local setup

### Backend

```bash
cd backend
python3.13 -m venv .venv
source .venv/bin/activate
pip install -r requirements-dev.txt
cp .env.example .env   # fill in DATABASE_URL, OPENAI_API_KEY
# alembic upgrade head        (Phase 1)
# uvicorn app.main:app --reload   (Phase 4)
```

### Frontend

```bash
cd frontend
npm install
npm run dev   # http://localhost:5173
```

## Project status

Phase-by-phase per `IMPLEMENTATION_PLAN.md`. Currently: **Phase 0 — bootstrap.**

## Stretch goal

Cash flow forecast (30/60/90-day horizons).

## What I'd build next

_TBD — filled in at Phase 9._

## How AI tooling was used

_TBD — filled in at Phase 9._
