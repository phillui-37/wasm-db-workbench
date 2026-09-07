#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
# shellcheck disable=SC1091
source deploy/image.env

echo "Pulling docker.io/${IMAGE_NAME}:${IMAGE_TAG} ..."
docker compose -f docker-compose.image.yml pull
docker compose -f docker-compose.image.yml up -d
