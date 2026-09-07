#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
# shellcheck disable=SC1091
source deploy/image.env

export DOCKER_BUILDKIT=1
docker build \
  --target runtime \
  --build-arg NODE_OPTIONS=--max-old-space-size=2048 \
  -t "$IMAGE" \
  -t "${IMAGE_NAME}:local" \
  .
echo "Built $IMAGE"
