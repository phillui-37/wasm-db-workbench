#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
# shellcheck disable=SC1091
source deploy/image.env

OUT="${OUT:-deploy/workbench-image.tar}"
mkdir -p "$(dirname "$OUT")"
docker save -o "$OUT" "$IMAGE"
echo "Wrote $OUT"
ls -lh "$OUT"
