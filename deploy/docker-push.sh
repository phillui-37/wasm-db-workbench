#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
# shellcheck disable=SC1091
source deploy/image.env

echo "Pushing $IMAGE ..."
docker push "$IMAGE"
echo "Pushed $IMAGE"
