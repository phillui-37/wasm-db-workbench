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

Open http://localhost:8080/wasm-db-workbench/

Host mounts:

- `config/app.yaml` — app behaviour
- `data/` — binary dumps, SQL dumps, history
- `scripts/` — saved SQL files

### Nginx (subpath)

Serve at `https://{domain}/wasm-db-workbench/` — see `deploy/nginx-wasm-db-workbench.conf.example`.

```nginx
location = /wasm-db-workbench { return 301 /wasm-db-workbench/; }
location /wasm-db-workbench/ {
  proxy_http_version 1.1;
  proxy_set_header Host $host;
  proxy_set_header X-Real-IP $remote_addr;
  proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
  proxy_set_header X-Forwarded-Proto $scheme;
  proxy_pass http://127.0.0.1:8080;   # keep path prefix
}
```

App defaults: `VITE_BASE_PATH=/wasm-db-workbench/`, `BASE_PATH=/wasm-db-workbench`.

## Local dev

```bash
npx pnpm install
npx pnpm dev
```

- UI: http://localhost:5173/wasm-db-workbench/
- API: http://localhost:8080 (`/api`, `/docs`) — Vite proxies `/wasm-db-workbench/api`

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

Env overrides: `APP_PORT`, `CONFIG_PATH`, `DATA_DIR`, `SCRIPTS_DIR`, `FRONTEND_DIST`, `BASE_PATH`, `VITE_BASE_PATH` (build-time).
