#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."

if podman compose version >/dev/null 2>&1; then
  podman compose up -d --build
else
  podman-compose up -d --build
fi
