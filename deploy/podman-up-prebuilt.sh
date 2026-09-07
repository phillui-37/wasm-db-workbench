#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."

if [[ ! -f frontend/dist/index.html ]]; then
  echo "frontend/dist missing. Run: pnpm build" >&2
  exit 1
fi

if podman compose version >/dev/null 2>&1; then
  podman compose -f docker-compose.yml -f docker-compose.prebuilt.yml up -d --build
else
  podman-compose -f docker-compose.yml -f docker-compose.prebuilt.yml up -d --build
fi
