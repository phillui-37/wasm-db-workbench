#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."

if [[ ! -f frontend/dist/index.html ]]; then
  echo "frontend/dist missing. Run: pnpm build" >&2
  exit 1
fi

docker compose -f docker-compose.yml -f docker-compose.prebuilt.yml up -d --build
