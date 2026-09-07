# WASM SQL Workbench

Browser-local SQL workbench for **PGlite** and **SQLite WASM**. Queries run in the browser. A small Effect TS backend stores scripts, query history, and host-synced dumps.

## Quick start (Docker)

```bash
npx pnpm install
docker compose up --build
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
