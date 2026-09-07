#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."

export DOCKER_BUILDKIT=1
docker build \
  --build-arg NODE_OPTIONS=--max-old-space-size=4096 \
  -t wasm-db-workbench_workbench \
  .
