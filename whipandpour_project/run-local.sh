#!/usr/bin/env bash
# Start Whip & Pour locally.
#   ./run-local.sh dev    → Node backend :8000 + Vite dev server :5173 (hot reload)
#   ./run-local.sh prod   → build the frontend, serve everything from :8000
set -euo pipefail
cd "$(dirname "$0")"
MODE="${1:-dev}"

[ -d backend-node/node_modules ] || (cd backend-node && npm install --no-fund --no-audit)
[ -d frontend/node_modules ] || (cd frontend && npm install --no-fund --no-audit)

if [ "$MODE" = "prod" ]; then
  (cd frontend && npm run build)
  echo "→ http://localhost:8000"
  (cd backend-node && exec node server.js)
else
  (cd backend-node && exec node --watch server.js) &
  BACKEND_PID=$!
  trap 'kill $BACKEND_PID 2>/dev/null || true' EXIT
  echo "→ http://localhost:5173 (API proxied to :8000)"
  cd frontend && exec npm run dev
fi
