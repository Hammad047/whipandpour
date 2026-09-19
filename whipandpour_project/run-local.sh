#!/usr/bin/env bash
# Start Whip & Pour locally.
#   ./run-local.sh dev    → FastAPI :8000 + Vite dev server :5173 (hot reload)
#   ./run-local.sh prod   → build the frontend, serve everything from :8000
set -euo pipefail
cd "$(dirname "$0")"
MODE="${1:-dev}"

[ -d backend/.venv ] || python3 -m venv backend/.venv
backend/.venv/bin/pip install -q -r backend/requirements.txt
[ -d frontend/node_modules ] || (cd frontend && npm install --no-fund --no-audit)

if [ "$MODE" = "prod" ]; then
  (cd frontend && npm run build)
  echo "→ http://localhost:8000"
  (cd backend && exec .venv/bin/python -m uvicorn main:app --host 127.0.0.1 --port 8000)
else
  (cd backend && .venv/bin/python -m uvicorn main:app --host 127.0.0.1 --port 8000 --reload) &
  BACKEND_PID=$!
  trap 'kill $BACKEND_PID 2>/dev/null || true' EXIT
  echo "→ http://localhost:5173 (API proxied to :8000)"
  cd frontend && exec npm run dev
fi
