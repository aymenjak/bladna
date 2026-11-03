# BLADNA

**Algeria-first volunteer identity, verified experience, initiatives, organization SaaS, CSR & international volunteering platform.**

BLADNA is a single-deployment Next.js application: server-rendered UI (Arabic-first, French and English) plus a versioned JSON API under `/api/v1`. Volunteers get a portable, verifiable record of their service; organizations get a tenant-scoped SaaS workspace to publish initiatives (المبادرات), declare support needs, verify members, manage attendance and issue certificates; sponsors and CSR programmes get dashboards that read real aggregates. See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) for the full design rationale.

## Feature highlights

- Volunteer profiles with a unique volunteer ID (`BLD-ALG-000001` format) and public verification tokens
- Initiative discovery (المبادرات): category/wilaya/support-kind filters, quick chips (needs volunteers / needs support / near me / this week), full-text search, a public map view, pagination; application system with a strict state machine and duplicate-application guard
- Per-initiative support: declared needs (financial / equipment / material / service + volunteer spots) with traceable offers, accept/reject decisions, and initiative-level impact metrics (need → support → execution → result)
- Organization workspaces: members, invitations, roles, verification (append-only levels with officer review)
- Attendance sessions with signed, rotating QR codes; volunteer hours that are append-only (revocation supersedes, never rewrites)
- Certificates with deterministic numbers, random verification tokens, PDF export (Arabic font embedded) and public verification pages
- Campaigns, typed impact metrics, sponsor/CSR workspaces and programmes, international opportunities with source attribution and disclaimers
- Trust & safety: moderation reports, deterministic risk engine v1 (human decision required), append-only audit log
- Notifications (in-app + email), messaging with block/report, lightweight CMS, admin dashboard, plans/invoices/payments (bank transfer & free only)
- Feature flags, demo mode, and GDPR-minded controls (consent ledger, AI document gate, masked personal data)

## Tech stack

| Layer      | Choice                                                                                          |
| ---------- | ----------------------------------------------------------------------------------------------- |
| Web + API  | Next.js 16 (App Router), React 19, TypeScript strict                                            |
| Styling    | Tailwind CSS v4 with logical (RTL-safe) properties                                              |
| Database   | PostgreSQL 16 + Prisma 6 (migrations)                                                           |
| Validation | Zod schemas shared by API and forms (`@bladna/validation`)                                      |
| Auth       | scrypt passwords, short-lived access JWTs (jose), rotating refresh cookies, TOTP MFA            |
| Tests      | Vitest (unit, authorization, state-machine, validation); integration/E2E suites are env-guarded |
| Tooling    | npm workspaces monorepo, ESLint 9, Prettier                                                     |

## Repository layout

| Path                  | Package              | Purpose                                                                                       |
| --------------------- | -------------------- | --------------------------------------------------------------------------------------------- |
| `apps/web`            | `@bladna/web`        | Next.js app: UI, `/api/v1` route handlers, server modules and infra adapters                  |
| `packages/database`   | `@bladna/database`   | Prisma schema, migrations, generated client, shared DB helpers                                |
| `packages/validation` | `@bladna/validation` | Zod schemas (API contracts, filters, pagination)                                              |
| `packages/types`      | `@bladna/types`      | DTOs, enums, API envelope and the central `AppError` model                                    |
| `packages/domain`     | `@bladna/domain`     | Pure business rules: RBAC matrix, status state machines, volunteer ID, matching, risk scoring |
| `packages/auth`       | `@bladna/auth`       | Password hashing, token mint/verify, TOTP, rate-limit primitives (DB-free)                    |
| `packages/utils`      | `@bladna/utils`      | Small shared utilities (slug, pagination, locale, masking)                                    |
| `packages/ui`         | `@bladna/ui`         | Design-system components (Button, Input, Modal, Table, …)                                     |
| `packages/config`     | `@bladna/config`     | Shared tsconfig / eslint base                                                                 |
| `docs/`               | —                    | Architecture, API, security documentation                                                     |

## Prerequisites

- Node.js >= 20.9 (developed on Node 24 / npm 11)
- PostgreSQL 16 (local install or Docker)
- Optional: Docker + Docker Compose for the containerised stack

## Quickstart

```bash
cp .env.example .env
# Edit .env: set AUTH_SECRET (>= 32 chars, e.g. `openssl rand -base64 48`)
# and DATABASE_URL pointing at your PostgreSQL database.

npm install
npm run db:generate          # generate the Prisma client
npm run db:migrate:deploy    # apply migrations
npm run db:seed              # optional: demo seed data
npm run dev                  # http://localhost:3000
```

The app loads the **root** `.env` automatically (`next.config.ts` reads it for
`dev`/`build`/`start`), so nothing needs to be copied into `apps/web/`. Real
environment variables always take precedence over the file — which is how the
Docker Compose stack (`environment:` block) and production deployments configure
the app; the image build ships no `.env` (see `.dockerignore`). The database
scripts read the same file: `packages/database/prisma.config.ts` hands the root
`.env` to the Prisma CLI (the workspace `db:*` commands run with
cwd=`packages/database`, where Prisma's built-in `.env` auto-load finds nothing),
and `db:seed` reads it via Node's `--env-file-if-exists`.

## Scripts

| Script                      | Command                                                              |
| --------------------------- | -------------------------------------------------------------------- |
| `npm run dev`               | `npm run dev --workspace @bladna/web`                                |
| `npm run build`             | `npm run build --workspace @bladna/web`                              |
| `npm run start`             | `npm run start --workspace @bladna/web`                              |
| `npm run typecheck`         | `tsc -p tsconfig.json --noEmit`                                      |
| `npm run lint`              | `eslint .`                                                           |
| `npm run lint:fix`          | `eslint . --fix`                                                     |
| `npm test`                  | `vitest run`                                                         |
| `npm run test:watch`        | `vitest`                                                             |
| `npm run format`            | `prettier --write .`                                                 |
| `npm run format:check`      | `prettier --check .`                                                 |
| `npm run db:generate`       | `npm run db:generate --workspace @bladna/database`                   |
| `npm run db:migrate`        | `npm run db:migrate --workspace @bladna/database`                    |
| `npm run db:migrate:deploy` | `npm run db:migrate:deploy --workspace @bladna/database`             |
| `npm run db:seed`           | `npm run db:seed --workspace @bladna/database`                       |
| `npm run db:studio`         | `npm run db:studio --workspace @bladna/database`                     |
| `npm run db:migration:diff` | `npm run db:migration:diff --workspace @bladna/database`             |
| `npm run validate`          | `npm run typecheck && npm run lint && npm run test && npm run build` |

## Environment

All configuration is read through the typed accessor in
`apps/web/src/server/env.ts`; `.env.example` documents every variable the
application reads (plus the Prisma `DATABASE_URL`). The only strictly required
values are:

- **`AUTH_SECRET`** — at least 32 characters; the app refuses to issue or verify
  access tokens without it (`openssl rand -base64 48`).
- **`DATABASE_URL`** — PostgreSQL connection string used by the Prisma
  datasource.

Everything else has a safe default (console email driver, local storage,
in-process queue/cache, `bank_transfer` payments). Per-flag kill switches are
available as `FEATURE_<FLAG_KEY>=true|false`
(`apps/web/src/server/infra/flags.ts`).

## API

All endpoints live under the base path **`/api/v1`** and are declared as route tables in `apps/web/src/server/routes/` (`core.ts`, `platform.ts`, `participants.ts`).

```bash
curl http://localhost:3000/api/v1/meta    # self-describing route index
curl http://localhost:3000/api/v1/health  # liveness/readiness probe
```

- **Self-describing index**: `GET /api/v1/meta` lists every registered endpoint with method, path, auth level and summary — the authoritative live route list.
- **Success envelope**: `{ "success": true, "data": …, "meta": { … } }` (`meta` carries pagination and `requestId`).
- **Failure envelope**: `{ "success": false, "error": { "code": "VALIDATION_ERROR", "message": "…", "details": … } }` with the matching HTTP status.
- Authentication: short-lived access JWT in the `bladna_at` cookie (or `Authorization: Bearer` for mobile), rotating refresh token in `bladna_rt`.
- Pagination: `?page=&limit=` (default 20, max 100); locale via the `x-locale` header (default `ar`).

Conventions, error codes, MFA flow, rate-limit tiers and the full endpoint tables are documented in **[docs/API.md](docs/API.md)**.

## Internationalisation

- Three locales: **`ar` (default, RTL)**, `fr`, `en`. Every page lives under a `/ar`, `/fr` or `/en` path prefix (`apps/web/src/proxy.ts` detects locale from path → cookie → `Accept-Language`).
- Dictionaries in `apps/web/src/ui/i18n/`; layout direction and `lang`/`dir` attributes follow the locale; styling uses logical properties so the RTL layout is first-class.

## Testing

```bash
npm test           # Vitest: unit, authorization, state machines, validation
npm run test:watch # watch mode
npm run validate   # typecheck + lint + test + build (what CI runs)
```

Integration and E2E suites are **env-guarded**: they skip unless `DATABASE_URL` (and for E2E, `E2E=1` plus a running stack) are set, so the default test run needs no database. CI (`.github/workflows/ci.yml`) runs install → Prisma generate → typecheck → lint → test → build on Node 24.

## Docker

```bash
docker compose up --build
# apply migrations once the database is healthy:
docker compose run --rm app npm run db:migrate:deploy
```

- `db`: postgres:16-alpine with a healthcheck and a named volume.
- `app`: builds the root `Dockerfile` (multi-stage, non-root, exposes 3000, healthcheck on `GET /api/v1/health`).
- `redis`: optional (`docker compose --profile optional up -d redis`); without `REDIS_URL` the app uses in-process queue/cache adapters.

## Operations

- `GET /api/v1/health` returns `200` when the database answers within 3 s and
  `503 { status: "degraded" }` otherwise — use it for liveness/readiness probes
  (the Docker image healthcheck does exactly this).
- Every API response carries a `requestId` (accepted from `x-request-id` or
  generated); internal errors are logged server-side with that id and never
  returned to clients.
- `DEMO_MODE=true` surfaces a demo banner; `FEATURE_FLAGS=` (comma list) or
  `FEATURE_<KEY>=true|false` override feature flags without a restart.

## Security

Server-side authorization on every request (RBAC matrix in `packages/domain/src/rbac.ts`), MFA for privileged roles, refresh-token rotation with reuse detection, tiered rate limiting, Zod validation on all writes, append-only audit log, and masked personal data. Full threat model and controls: **[docs/SECURITY.md](docs/SECURITY.md)**. Never commit `.env`; `.env.example` documents every variable.

## Project status & documentation

- [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) — stack choices, module map, multi-tenancy, data-integrity rules
- [docs/IMPLEMENTATION_CHECKLIST.md](docs/IMPLEMENTATION_CHECKLIST.md) — phase-by-phase status (in-flight and pending items are tracked there)
- [docs/API.md](docs/API.md) — API conventions and endpoint reference
- [docs/SECURITY.md](docs/SECURITY.md) — threat model and implemented controls
