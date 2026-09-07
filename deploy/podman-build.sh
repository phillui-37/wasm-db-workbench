#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."

podman build \
  --build-arg NODE_OPTIONS=--max-old-space-size=4096 \
  -t wasm-db-workbench_workbench \
  .
