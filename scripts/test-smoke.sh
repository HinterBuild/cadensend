#!/usr/bin/env bash
# Quick smoke test: verify all service health endpoints respond.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

API_URL="${API_URL:-http://localhost:8080}"
AI_URL="${AI_URL:-http://localhost:8000}"
WEB_URL="${WEB_URL:-http://localhost:3000}"
WORKER_URL="${WORKER_URL:-http://localhost:8081}"

check() {
  local name="$1" url="$2"
  code="$(curl -s -o /dev/null -w '%{http_code}' "$url" || echo "000")"
  if [[ "$code" != "200" ]]; then
    echo "FAIL $name ($url) -> HTTP $code"
    exit 1
  fi
  echo "OK   $name ($url)"
}

echo "Cadensend smoke tests"
check "control-api" "$API_URL/healthz"
check "ai-engine"   "$AI_URL/healthz"
check "web"         "$WEB_URL"
check "worker"      "$WORKER_URL/healthz"
echo "All smoke checks passed."
