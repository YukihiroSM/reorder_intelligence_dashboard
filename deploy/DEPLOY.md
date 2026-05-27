# Deploy — Ubuntu server with global nginx

Runtime via Docker (Postgres + FastAPI backend); the SPA is built to static files
served by the host's nginx, which also proxies `/api` to the backend.

```
┌─ nginx (host, :443) ──────────────────────────────┐
│  /         → /var/www/reorder-intelligence (SPA)  │
│  /api/     → 127.0.0.1:8091  ─┐                    │
└───────────────────────────────┼───────────────────┘
                                 ▼
                    backend container (uvicorn :8000, published 127.0.0.1:8091)
                                 │
                                 ▼
                    postgres container (internal)
```

## Prereqs
- Docker + Docker Compose, and nginx + certbot on the host.
- DNS A-record → server for `reorder-intelligence.yuk0-dev-team.pp.ua`.

## 1. Configure secrets
Create a root `.env` (compose reads it for substitution):
```
POSTGRES_PASSWORD=<strong-password>
OPENAI_API_KEY=sk-...          # optional until the AI layer (Phase 7)
# LLM_MODEL=gpt-5.4-nano
# ALLOWED_ORIGINS=             # empty: same-origin via nginx, no CORS needed
# BACKEND_PORT=8091
```

## 2. Bring up DB + API
```
docker compose -f docker-compose.prod.yml up -d --build
```
The backend entrypoint runs `alembic upgrade head` and imports `data/inventory.json`
(idempotent) on start, then serves on `127.0.0.1:8091`.
Check: `curl http://127.0.0.1:8091/api/health`

## 3. Build the SPA into the webroot
```
sudo mkdir -p /var/www/reorder-intelligence
WEBROOT=/var/www/reorder-intelligence \
  docker compose -f docker-compose.prod.yml --profile build run --rm frontend-build
```
(No Node needed on the host — it builds in a container and copies `dist/` out.)

## 4. nginx + TLS
```
sudo cp deploy/nginx.conf /etc/nginx/sites-available/reorder-intelligence
sudo ln -s /etc/nginx/sites-available/reorder-intelligence /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl reload nginx
sudo certbot --nginx -d reorder-intelligence.yuk0-dev-team.pp.ua
```

## Updating
```
git pull
docker compose -f docker-compose.prod.yml up -d --build        # backend
WEBROOT=/var/www/reorder-intelligence \
  docker compose -f docker-compose.prod.yml --profile build run --rm frontend-build  # frontend
```

## Notes
- `/docs` and `/openapi.json` aren't exposed (they fall through to the SPA). To
  publish API docs, set FastAPI `docs_url="/api/docs"` / `openapi_url="/api/openapi.json"`,
  or add `location` blocks for them.
- The dev `docker-compose.yml` (Postgres on host :5440) is unrelated — it's for
  running the backend/frontend natively during development.
