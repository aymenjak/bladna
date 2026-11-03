# BLADNA — multi-stage production image for the Next.js app (apps/web).
#
# Approach note: apps/web/next.config.ts does NOT set `output: 'standalone'`
# (and this file must not edit it), so the runner stage copies the full build
# output (`.next` + node_modules + workspace sources, whose `main` points at
# TypeScript `src/`) and serves it with `next start` via the root `start`
# script — not with `standalone/output.js`.

# ── Stage 1: deps — install dependencies from the lockfile only ──────────
FROM node:24-alpine AS deps
# Prisma query engines link against OpenSSL, absent from the alpine base.
RUN apk add --no-cache openssl
WORKDIR /app

# Workspace manifests only, so this layer stays cache-friendly. The workspaces
# globs in the root package.json are `apps/*` and `packages/*`.
COPY package.json package-lock.json ./
COPY apps/web/package.json apps/web/package.json
COPY packages/auth/package.json packages/auth/package.json
COPY packages/config/package.json packages/config/package.json
COPY packages/database/package.json packages/database/package.json
COPY packages/domain/package.json packages/domain/package.json
COPY packages/types/package.json packages/types/package.json
COPY packages/ui/package.json packages/ui/package.json
COPY packages/utils/package.json packages/utils/package.json
COPY packages/validation/package.json packages/validation/package.json

# Fails when package-lock.json is out of sync with package.json.
RUN npm ci

# ── Stage 2: builder — prisma generate + next build ──────────────────────
FROM node:24-alpine AS builder
RUN apk add --no-cache openssl
WORKDIR /app

# Full source tree — .dockerignore keeps host secrets (.env*) and build state
# (node_modules, .next, var/, *.log) out of the context; the find below stays
# as belt-and-braces should that filter ever be removed …
COPY . .
RUN find . -name node_modules -prune -exec rm -rf {} \; 2>/dev/null || true
# … and restore the clean linux dependencies produced by the deps stage
# (identical manifests are simply overwritten with byte-equal files).
COPY --from=deps /app /app

# Build-time environment. AUTH_SECRET is only a placeholder so any code that
# evaluates env during `next build` passes validation — the real secret is
# provided at runtime. DATABASE_URL is never used at build time (the Prisma
# client is lazy) but is set defensively for prisma generate.
ENV NEXT_TELEMETRY_DISABLED=1 \
    AUTH_SECRET=build-time-placeholder-secret-not-for-production-use \
    DATABASE_URL=postgresql://bladna:build@localhost:5432/bladna

# Generate the Prisma client (workspace @bladna/database) before type-checking
# code that imports its types during the Next build.
RUN npm run db:generate --workspace @bladna/database

# `npm run build` → `npm run build --workspace @bladna/web` → `next build`.
RUN npm run build

# Dev dependencies are intentionally kept: `prisma` (a devDependency of
# @bladna/database) must remain available so migrations can run as a one-off
# inside this image (`npm run db:migrate:deploy`). For a smaller image, add
# `npm prune --omit=dev` here and run migrations from CI instead.

# ── Stage 3: runner — non-root production server ─────────────────────────
FROM node:24-alpine AS runner
# OpenSSL is needed at runtime by the Prisma query engine.
RUN apk add --no-cache openssl
WORKDIR /app
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=3000 \
    HOSTNAME=0.0.0.0

COPY --from=builder --chown=node:node /app /app

# Writable paths for the local storage / console email drivers (defaults of
# STORAGE_LOCAL_DIR and EMAIL_FILE_DIR).
RUN mkdir -p var/storage var/emails && chown -R node:node var

USER node
EXPOSE 3000

# Liveness/readiness: GET /api/v1/health returns 200 when the database is
# reachable and 503 (degraded) when it is not — the check follows that signal.
HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:3000/api/v1/health').then((r)=>process.exit(r.status===200?0:1)).catch(()=>process.exit(1))"

# Root script `start` → `npm run start --workspace @bladna/web` → `next start`.
CMD ["npm", "start"]
