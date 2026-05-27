#!/usr/bin/env bash
# One-command deploy for the cloned repo on the server.
#   ./deploy/deploy.sh
#
# Brings up Postgres + backend (docker-compose.prod.yml), builds the SPA into the
# nginx webroot, fixes perms, reloads nginx, and health-checks the API.
#
# Env overrides: WEBROOT (default /var/www/reorder-intelligence),
#                BACKEND_PORT (default 8091).
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(dirname "$SCRIPT_DIR")"
cd "$ROOT"

COMPOSE="docker compose -f docker-compose.prod.yml"
WEBROOT="${WEBROOT:-/var/www/reorder-intelligence}"
BACKEND_PORT="${BACKEND_PORT:-8091}"

echo "==> Reorder Intelligence deploy"
echo "    repo:    $ROOT"
echo "    webroot: $WEBROOT"
echo "    backend: 127.0.0.1:$BACKEND_PORT"

# --- prerequisites ----------------------------------------------------------
command -v docker >/dev/null 2>&1 || { echo "!! docker not found"; exit 1; }
docker compose version >/dev/null 2>&1 || { echo "!! docker compose v2 not found"; exit 1; }

# --- secrets ----------------------------------------------------------------
if [ ! -f .env ]; then
  cp .env.example .env
  echo
  echo "!! Created .env from .env.example."
  echo "   Edit it now — set POSTGRES_PASSWORD (and OPENAI_API_KEY). The DB"
  echo "   password is fixed when the volume is first created, so set it BEFORE"
  echo "   the first run. Then re-run: ./deploy/deploy.sh"
  exit 1
fi

# --- database + backend -----------------------------------------------------
echo "==> Building & starting Postgres + backend (waiting for healthy)..."
$COMPOSE up -d --build --wait --wait-timeout 180

# --- frontend -> webroot ----------------------------------------------------
echo "==> Building the SPA into $WEBROOT..."
mkdir -p "$WEBROOT"
WEBROOT="$WEBROOT" $COMPOSE --profile build run --rm frontend-build
chmod -R a+rX "$WEBROOT" 2>/dev/null || true

# --- nginx (best effort) ----------------------------------------------------
if command -v nginx >/dev/null 2>&1; then
  echo "==> Reloading nginx..."
  if nginx -t 2>/dev/null; then
    systemctl reload nginx 2>/dev/null || service nginx reload 2>/dev/null || true
  else
    echo "   nginx -t failed; skipping reload (check your site config)."
  fi
fi

# --- health -----------------------------------------------------------------
echo "==> API health:"
curl -fsS "http://127.0.0.1:${BACKEND_PORT}/api/health" && echo
echo "==> Deploy complete."
