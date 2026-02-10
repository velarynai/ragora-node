#!/usr/bin/env bash
set -euo pipefail

echo "==> Type check"
npm run typecheck

echo "==> Build"
npm run build

echo "==> Package dry run"
npm pack --dry-run --cache /tmp/npm-cache

if [[ -n "${RAGORA_API_KEY:-}" && -n "${RAGORA_COLLECTION_ID:-}" ]]; then
  EXAMPLES=(
    "example:search"
    "example:chat"
    "example:streaming"
    "example:credits"
    "example:documents"
    "example:collections"
    "example:marketplace"
  )

  for example_script in "${EXAMPLES[@]}"; do
    echo "==> Run ${example_script}"
    npm run "${example_script}"
  done
else
  echo "==> Skipping examples"
  echo "Set RAGORA_API_KEY and RAGORA_COLLECTION_ID to run:"
  echo "  example:search, example:chat, example:streaming, example:credits,"
  echo "  example:documents, example:collections, example:marketplace"
fi
