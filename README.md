# WASM SQL Workbench

Browser-local SQL workbench for **PGlite** and **SQLite WASM**. Queries run in the browser. A small Effect TS backend stores scripts, query history, and host-synced dumps.

## Quick start (Docker / Podman)

```bash
# Docker
pnpm docker:up
# or: bash deploy/docker-up.sh

# Podman
pnpm podman:up
# or: bash deploy/podman-up.sh
```

Build only (no compose):

```bash
pnpm docker:build   # deploy/docker-build.sh
pnpm podman:build   # deploy/podman-build.sh
```

Open http://localhost:8080

Host mounts:

- `config/app.yaml` — app behaviour
- `data/` — binary dumps, SQL dumps, history
- `scripts/` — saved SQL files

## Local dev

```bash
npx pnpm install
npx pnpm dev
```

- UI: http://localhost:5173
- API: http://localhost:8080 (`/api`, `/docs`)

## Tests

```bash
npx pnpm test
```

Effect-native tests (`@effect/vitest`, `it.effect`, Layer swaps, `TestClock` for sync schedules).

## Config

See `config/app.yaml`. Important knobs:

- `sync.trigger`: `manual` | `interval` | `onChange`
- `sync.format`: `binary` | `sql` | `both`
- `sync.pullOnOpen`: `prompt` | `always` | `never`
- `query.maxRows`, `query.confirmDestructive`
- `engines.pglite|sqlite.enabled`

Env overrides: `APP_PORT`, `CONFIG_PATH`, `DATA_DIR`, `SCRIPTS_DIR`, `FRONTEND_DIST`.
