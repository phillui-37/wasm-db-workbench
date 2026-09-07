#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."

# Full in-container Vite build needs ~3GB+ RAM. Exit early on small hosts.
if [[ -r /proc/meminfo ]]; then
  avail_kb="$(awk '/MemAvailable:/ {print $2}' /proc/meminfo)"
  if [[ -n "${avail_kb}" && "${avail_kb}" -lt 2500000 ]]; then
    cat <<'EOF' >&2
Available memory looks too low for an in-container frontend build (exit 137 / OOM).

On this host use a prebuilt frontend instead:
  1) On a machine with RAM:  pnpm build && pnpm podman:build:prebuilt
      then:  pnpm podman:save
  2) Copy deploy/workbench-image.tar to the VPS
  3) On the VPS:  pnpm podman:load-up

Or build only the UI here (if host has swap), then:
  pnpm build && pnpm podman:up:prebuilt
EOF
    exit 1
  fi
fi

if podman compose version >/dev/null 2>&1; then
  podman compose up -d --build
else
  podman-compose up -d --build
fi
