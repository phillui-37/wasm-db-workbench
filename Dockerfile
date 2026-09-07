FROM node:22-bookworm-slim AS base

RUN corepack enable && corepack prepare pnpm@12.3.4 --activate

WORKDIR /app

FROM base AS deps

COPY pnpm-workspace.yaml package.json ./
COPY shared/package.json shared/package.json
COPY backend/package.json backend/package.json
COPY frontend/package.json frontend/package.json
COPY pnpm-lock.yaml ./

RUN pnpm install --frozen-lockfile

# Full image build (needs ~3GB+ RAM). Prefer runtime-prebuilt on small VPS.
FROM deps AS frontend-build

COPY shared shared
COPY frontend frontend
COPY tsconfig.base.json ./

ARG NODE_OPTIONS=--max-old-space-size=2048
ENV NODE_OPTIONS=$NODE_OPTIONS
ARG VITE_BASE_PATH=/wasm-db-workbench/
ENV VITE_BASE_PATH=$VITE_BASE_PATH

RUN pnpm --filter @workbench/frontend build

FROM deps AS runtime

COPY shared shared
COPY backend backend
COPY config config
COPY tsconfig.base.json ./
COPY --from=frontend-build /app/frontend/dist ./frontend/dist

ENV NODE_ENV=production
ENV APP_PORT=8080
ENV CONFIG_PATH=/app/config/app.yaml
ENV DATA_DIR=/app/data
ENV SCRIPTS_DIR=/app/scripts
ENV FRONTEND_DIST=/app/frontend/dist
ENV BASE_PATH=/wasm-db-workbench
ENV AUTH_ENABLED=true
ENV AUTH_COOKIE_SECURE=true

EXPOSE 8080

CMD ["pnpm", "--filter", "@workbench/backend", "start"]

# Build frontend on a machine with RAM, copy frontend/dist into context, then:
#   podman build --target runtime-prebuilt -t wasm-db-workbench:local .
FROM deps AS runtime-prebuilt

COPY shared shared
COPY backend backend
COPY config config
COPY tsconfig.base.json ./
COPY frontend/dist ./frontend/dist

ENV NODE_ENV=production
ENV APP_PORT=8080
ENV CONFIG_PATH=/app/config/app.yaml
ENV DATA_DIR=/app/data
ENV SCRIPTS_DIR=/app/scripts
ENV FRONTEND_DIST=/app/frontend/dist
ENV BASE_PATH=/wasm-db-workbench
ENV AUTH_ENABLED=true
ENV AUTH_COOKIE_SECURE=true

EXPOSE 8080

CMD ["pnpm", "--filter", "@workbench/backend", "start"]
