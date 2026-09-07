#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
# shellcheck disable=SC1091
source deploy/image.env

echo "Pushing $IMAGE ..."
podman push "$IMAGE" "docker.io/${IMAGE_NAME}:${IMAGE_TAG}"
echo "Pushed docker.io/${IMAGE_NAME}:${IMAGE_TAG}"
