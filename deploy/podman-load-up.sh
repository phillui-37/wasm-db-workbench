#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."

ARCHIVE="${1:-deploy/workbench-image.tar}"

if [[ ! -f "$ARCHIVE" ]]; then
  echo "Image archive not found: $ARCHIVE" >&2
  echo "Copy workbench-image.tar here, or pass a path." >&2
  exit 1
fi

podman load -i "$ARCHIVE"

if podman compose version >/dev/null 2>&1; then
  podman compose -f docker-compose.image.yml up -d
else
  podman-compose -f docker-compose.image.yml up -d
fi
