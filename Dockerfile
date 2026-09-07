FROM node:22-bookworm-slim

RUN corepack enable && corepack prepare pnpm@12.3.4 --activate

WORKDIR /app

COPY pnpm-workspace.yaml package.json ./
COPY shared/package.json shared/package.json
COPY backend/package.json backend/package.json
COPY frontend/package.json frontend/package.json
COPY pnpm-lock.yaml ./

RUN pnpm install --frozen-lockfile

COPY shared shared
COPY backend backend
COPY frontend frontend
COPY config config
COPY tsconfig.base.json ./

RUN pnpm --filter @workbench/frontend build

ENV NODE_ENV=production
ENV APP_PORT=8080
ENV CONFIG_PATH=/app/config/app.yaml
ENV DATA_DIR=/app/data
ENV SCRIPTS_DIR=/app/scripts
ENV FRONTEND_DIST=/app/frontend/dist

EXPOSE 8080

CMD ["pnpm", "--filter", "@workbench/backend", "start"]
