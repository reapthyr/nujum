# syntax=docker/dockerfile:1.7
#
# Multi-stage build for the Nujum bot. Works on linux/amd64 and linux/arm64
# (Oracle Cloud Ampere shapes are arm64).
#
#   docker build -f apps/bot/Dockerfile -t nujum-bot .
#
# The runtime image contains only the compiled bot, production dependencies and
# the generated Prisma client. It never contains source, tests, devDependencies,
# the Discord token or any other secret.

ARG NODE_VERSION=22-bookworm-slim

# ── Base ─────────────────────────────────────────────────────────────────────
FROM node:${NODE_VERSION} AS base
ENV PNPM_HOME=/pnpm \
    PATH=/pnpm:$PATH \
    COREPACK_ENABLE_DOWNLOAD_PROMPT=0 \
    CI=true

# openssl is required by the Prisma query engine on debian-slim; dumb-init is PID 1
# so SIGTERM reaches the Node process and graceful shutdown works.
RUN corepack enable \
 && apt-get update \
 && apt-get install -y --no-install-recommends ca-certificates openssl dumb-init \
 && rm -rf /var/lib/apt/lists/*
WORKDIR /app

# ── Dependencies ─────────────────────────────────────────────────────────────
# Manifests first so the dependency layer is cached until the lockfile changes.
FROM base AS deps
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json .npmrc ./
COPY packages/shared/package.json packages/shared/package.json
COPY packages/shared/prisma packages/shared/prisma
COPY apps/bot/package.json apps/bot/package.json
RUN --mount=type=cache,id=nujum-pnpm,target=/pnpm/store \
    pnpm install --frozen-lockfile

# ── Build ────────────────────────────────────────────────────────────────────
FROM deps AS build
COPY tsconfig.base.json ./
COPY packages/shared packages/shared
COPY apps/bot apps/bot
RUN pnpm --filter @nujum/shared build \
 && pnpm --filter @nujum/bot build \
 && pnpm --filter @nujum/bot deploy --prod --ignore-scripts /opt/nujum

# ── Runtime ──────────────────────────────────────────────────────────────────
FROM base AS runtime
ENV NODE_ENV=production \
    BOT_API_HOST=0.0.0.0

WORKDIR /app
COPY --from=build --chown=node:node /opt/nujum ./
COPY --chown=node:node apps/bot/docker/entrypoint.sh /usr/local/bin/nujum-entrypoint
RUN chmod 0555 /usr/local/bin/nujum-entrypoint

USER node
EXPOSE 8080

HEALTHCHECK --interval=30s --timeout=5s --start-period=40s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.BOT_API_PORT||8080)+'/healthz').then((r)=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

ENTRYPOINT ["dumb-init", "--", "/usr/local/bin/nujum-entrypoint"]
CMD ["node", "dist/index.js"]
