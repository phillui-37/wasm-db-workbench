#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
# shellcheck disable=SC1091
source deploy/image.env

echo "Pulling docker.io/${IMAGE_NAME}:${IMAGE_TAG} ..."
if podman compose version >/dev/null 2>&1; then
  podman compose -f docker-compose.image.yml pull
  podman compose -f docker-compose.image.yml up -d
else
  podman-compose -f docker-compose.image.yml pull
  podman-compose -f docker-compose.image.yml up -d
fi
