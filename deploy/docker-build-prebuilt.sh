#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
# shellcheck disable=SC1091
source deploy/image.env

if [[ ! -f frontend/dist/index.html ]]; then
  echo "frontend/dist missing. Run: pnpm build" >&2
  exit 1
fi

export DOCKER_BUILDKIT=1
docker build \
  --target runtime-prebuilt \
  -t "$IMAGE" \
  -t "${IMAGE_NAME}:local" \
  .
echo "Built $IMAGE"
