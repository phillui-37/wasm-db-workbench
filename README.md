# WASM SQL Workbench

Browser-local SQL workbench for **PGlite** and **SQLite WASM**. Queries run in the browser. A small Effect TS backend stores scripts, query history, and host-synced dumps.

Published image: [`docker.io/philluikgy/wasm-db-workbench`](https://hub.docker.com/r/philluikgy/wasm-db-workbench)

## Quick start (Docker / Podman)

Building the frontend inside the image needs roughly **3GB+ RAM**. On a small VPS the build is OOM-killed (`exit 137`) — pull the published image instead.

### Small VPS (pull from Docker Hub)

```bash
pnpm podman:pull-up
# or: pnpm docker:pull-up
```

### Build & push (machine with enough RAM)

```bash
# Docker
pnpm docker:build && pnpm docker:push

# Podman
pnpm podman:build && pnpm podman:push
```

Log in first: `docker login` / `podman login docker.io`

CI: push to `master` (or run **Publish Docker image** workflow) after setting GitHub secrets `DOCKERHUB_USERNAME` and `DOCKERHUB_TOKEN`.

### Full local compose build

```bash
pnpm docker:up    # or: pnpm podman:up
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
