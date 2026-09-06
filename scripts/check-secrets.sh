#!/usr/bin/env bash
# Scan tracked files for common secret patterns. Fails CI if any match.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

PATTERNS=(
  'sk-or-v1-[a-zA-Z0-9]{20,}'
  'sk-proj-[a-zA-Z0-9]{20,}'
  'ghp_[a-zA-Z0-9]{20,}'
  'gho_[a-zA-Z0-9]{20,}'
  'xox[baprs]-[a-zA-Z0-9-]+'
  'AKIA[0-9A-Z]{16}'
  'SG\.[a-zA-Z0-9_-]{20,}'
  'xkeysib-[a-zA-Z0-9-]+'
)

FOUND=0
for pattern in "${PATTERNS[@]}"; do
  if git ls-files -z | xargs -0 rg -n "$pattern" 2>/dev/null; then
    FOUND=1
  fi
done

# Block hardcoded OpenRouter keys in compose/env (must use ${OPENROUTER_API_KEY})
if git ls-files -z | xargs -0 rg -n 'OPENROUTER_API_KEY:\s*"sk-' 2>/dev/null; then
  FOUND=1
fi
if git ls-files -z | xargs -0 rg -n 'OPENROUTER_API_KEY=sk-' 2>/dev/null; then
  FOUND=1
fi

if [[ "$FOUND" -eq 1 ]]; then
  echo "ERROR: Possible secrets detected in tracked files. Remove them before committing."
  exit 1
fi

echo "No secrets detected in tracked files."
