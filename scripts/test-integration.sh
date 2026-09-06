#!/usr/bin/env bash
# Integration test runner: unit suites + optional live-stack smoke when services are up.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

echo "==> Go unit tests (control-api)"
(cd backend/control-api && go test ./... -count=1)

echo "==> Go unit tests (control-worker)"
(cd backend/control-worker && go test ./... -count=1)

echo "==> Python unit tests (ai-engine)"
pip install -q -r ai-service/ai-engine/api/requirements.txt -r ai-service/ai-engine/api/requirements-dev.txt
python -m pytest ai-service/ai-engine/api/tests/ -v --tb=short

echo "==> Frontend unit tests"
(cd frontend/web && npm test -- --ci --passWithNoTests)

if curl -sf "${API_URL:-http://localhost:8080}/healthz" >/dev/null 2>&1; then
  echo "==> Live stack smoke (services detected)"
  ./scripts/test-smoke.sh
else
  echo "==> Skipping live smoke (stack not running; start with docker compose up)"
fi

echo "Integration test run complete."
