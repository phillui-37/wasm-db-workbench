#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."

ARCHIVE="${1:-deploy/workbench-image.tar}"

if [[ ! -f "$ARCHIVE" ]]; then
  echo "Image archive not found: $ARCHIVE" >&2
  exit 1
fi

docker load -i "$ARCHIVE"
docker compose -f docker-compose.image.yml up -d
