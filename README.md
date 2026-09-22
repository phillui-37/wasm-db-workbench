# WASM SQL Workbench

Browser-local SQL workbench for **PGlite** and **SQLite WASM**. Queries run in the browser. A small Effect TS backend stores scripts, query history, and host-synced dumps.

Published image: [`docker.io/philluikgy/wasm-db-workbench`](https://hub.docker.com/r/philluikgy/wasm-db-workbench)

Production: https://wasm-db-workbench.kgy-production.xyz/

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

Open http://localhost:8080/

Host mounts:

- `config/app.yaml` — app behaviour
- `data/` — binary dumps, SQL dumps, history
- `scripts/` — saved SQL files

### Nginx (subdomain)

Serve at `https://wasm-db-workbench.kgy-production.xyz/` — see `deploy/nginx-wasm-db-workbench.conf.example`.

```nginx
server {
  listen 443 ssl;
  server_name wasm-db-workbench.kgy-production.xyz;
  client_max_body_size 256m;

  # Leftover URLs from the old /wasm-db-workbench subpath image
  location = /wasm-db-workbench { return 301 /; }
  location /wasm-db-workbench/ { proxy_pass http://127.0.0.1:8080/; }

  location / { proxy_pass http://127.0.0.1:8080; }
}
```

App defaults: `VITE_BASE_PATH=/`, `BASE_PATH=/`. Optional subpath deploys still work if you set both to the same prefix (for example `/wasm-db-workbench/`) and rebuild the image.

### Authentication

Login is required when `AUTH_ENABLED=true` (default in Docker images).

On the VPS, create `.env` next to compose (see `deploy/auth.env.example`):

```bash
AUTH_USERNAME=admin
AUTH_PASSWORD=your-strong-password
AUTH_SECRET=long-random-string
```

Then `git pull` and `pnpm podman:pull-up` (pulls `:latest` and recreates the container). Open `https://wasm-db-workbench.kgy-production.xyz/` and sign in.

After CI publishes a new image, the VPS must pull it. Restarting without pull keeps the old frontend, whose HTML still points at `/wasm-db-workbench/assets/...` and the browser reports MIME type `text/html`.

Local dev defaults to `AUTH_ENABLED=false` (no login). To test auth locally:

```bash
AUTH_ENABLED=true AUTH_USERNAME=admin AUTH_PASSWORD=secret pnpm start
```

## Local dev

```bash
npx pnpm install
npx pnpm dev
```

- UI: http://localhost:5173/
- API: http://localhost:8080 (`/api`, `/docs`) — Vite proxies `/api` and `/docs`

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

Env overrides: `APP_PORT`, `CONFIG_PATH`, `DATA_DIR`, `SCRIPTS_DIR`, `FRONTEND_DIST`, `BASE_PATH`, `VITE_BASE_PATH` (build-time), `AUTH_ENABLED`, `AUTH_USERNAME`, `AUTH_PASSWORD`, `AUTH_SECRET`, `AUTH_COOKIE_SECURE`.
