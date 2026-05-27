#!/bin/sh
# Bootstrap on container start: migrate the DB, import the dataset (idempotent via
# file checksum), then serve. Postgres readiness is guaranteed by compose
# depends_on: service_healthy.
set -e

echo "[entrypoint] alembic upgrade head"
alembic upgrade head

echo "[entrypoint] importing inventory (skips if already imported)"
python -m app.scripts.import_inventory /data/inventory.json || echo "[entrypoint] import skipped/failed (continuing)"

echo "[entrypoint] starting uvicorn"
exec uvicorn app.main:app --host 0.0.0.0 --port 8000 --workers 2
