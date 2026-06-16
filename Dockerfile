# syntax=docker/dockerfile:1
# ── base: node slim + pnpm ───────────────────────────────────────────────────
FROM node:20-slim AS base
RUN corepack enable && corepack prepare pnpm@9 --activate

# ── fetch: hydrate pnpm store from lockfile only (layer-cacheable) ───────────
FROM base AS fetch
WORKDIR /app
COPY pnpm-lock.yaml ./
RUN pnpm fetch --store-dir /pnpm-store

# ── build: install all deps offline + tsup compile ───────────────────────────
FROM fetch AS build
COPY package.json tsconfig.json ./
COPY src/ ./src/
RUN pnpm install --offline --frozen-lockfile --store-dir /pnpm-store
RUN pnpm build

# ── runtime: lean production image ───────────────────────────────────────────
FROM base AS runtime
ENV NODE_ENV=production \
    PORT=3000 \
    DATA_DIR=/data

WORKDIR /app

# Copy lockfile + manifest, then install prod-only deps from the cached store
COPY package.json pnpm-lock.yaml ./
COPY --from=fetch /pnpm-store /pnpm-store
RUN pnpm install --offline --prod --frozen-lockfile --store-dir /pnpm-store && \
    rm -rf /pnpm-store

# Copy compiled output
COPY --from=build /app/dist ./dist

# Persist data (SQLite cache + LanceDB vectors) across restarts
VOLUME ["/data"]

EXPOSE 3000

# Lightweight HTTP liveness check (requires the /health endpoint in server-core)
HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD node -e \
    "const h=require('http');h.get('http://localhost:'+process.env.PORT+'/health',r=>process.exit(r.statusCode===200?0:1)).on('error',()=>process.exit(1))"

CMD ["node", "dist/index.js"]
