# BLADNA — Operations Guide (Deployment, Backup & Restore)

> Status: written from the repository's actual artifacts (`docker-compose.yml`,
> `.env.example`, `packages/database/prisma`, `apps/web/src/server/infra/storage.ts`,
> `.github/workflows/ci.yml`) and the documented npm scripts. **Validation note:** the
> machine this guide was authored on has **no Docker**, so the Docker command lines below
> are transcribed from the artifacts and **have not been executed here**. The PostgreSQL
> paths were **executed for real after this guide was first written**: a local
> PostgreSQL 16 server was provisioned with the documented least-privilege roles
> (`bladna_app` / `bladna_migrator`), `prisma migrate deploy` applied all 6 migrations,
> the seed ran, and a **backup/restore drill completed end-to-end** — `pg_dump` (205 KB)
> → restore into a scratch database → row counts verified (3 users, 2 opportunities,
> 1 certificate, 6 migration rows) → scratch database dropped. Everything else the local
> environment _can_ run (`npm run validate`, the health endpoint now returning **200**
> against the live database, `db:generate`, `schema:validate`) was executed. Treat the
> first production run of any Docker or remote-hosting command below as its own
> verification step.

## 1. What runs in production

A single web deployment plus PostgreSQL (optionally Redis):

| Piece         | Source                                        | Notes                                                                                                          |
| ------------- | --------------------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| Web app       | `Dockerfile` (image built from repo root)     | Next.js production server, serves UI + `/api/v1` on port 3000                                                  |
| PostgreSQL 16 | `docker-compose.yml` service `db`             | volume `pgdata` at `/var/lib/postgresql/data`; health-gated (`pg_isready`)                                     |
| Redis         | `docker-compose.yml` service `redis`          | **optional** (compose profile `optional`); empty `REDIS_URL` ⇒ in-process queue/cache adapters                 |
| Uploads       | `STORAGE_LOCAL_DIR` (default `./var/storage`) | local filesystem driver; the `s3` driver answers `CONFIG_ERROR` until bucket credentials exist                 |
| Emails        | `EMAIL_DRIVER=console` (default)              | renders `.eml` files to `EMAIL_FILE_DIR` (default `./var/emails`); `smtp` transport is not wired in this build |

There is **no separate worker service** and **no object-store service**: background work runs
in-process (or against Redis when configured) and uploads are files on disk.

## 2. Deployment

### 2.1 Prerequisites

- Node.js ≥ 20.9 (npm workspaces) — or Docker for the compose path.
- PostgreSQL 16 (compose provides it; any 14+ should work, CI uses 16).
- Secrets: `AUTH_SECRET` (≥ 32 chars, generate with `openssl rand -base64 48`) and
  `DATABASE_URL`. The app **fails closed** (500 with a generic error) when `AUTH_SECRET`
  is missing — set it explicitly in every environment.

### 2.2 Environment

Copy `.env.example` → `.env` and fill in the values. The root `.env` is auto-loaded by
`next.config.ts` (via `process.loadEnvFile`), by the Prisma CLI (`packages/database/prisma.config.ts`)
and by the seed script, so a repo-root `.env` is enough for local and bare-metal runs.
In containers, inject the same keys through the compose `environment:` block (real
environment variables win over the file). Key variables: `DATABASE_URL`, `AUTH_SECRET`,
`APP_URL`/`PUBLIC_APP_URL` (used for origin checks and email/QR links), `TRUST_PROXY`
(must be `true` behind a reverse proxy so client IPs are honoured), `STORAGE_LOCAL_DIR`,
`FEATURE_*` flag kill switches — full list with defaults in `.env.example`.

### 2.3 Docker Compose path

```sh
docker compose up --build -d          # db (health-gated) → app on :3000
docker compose run --rm app npm run db:migrate:deploy   # migrations are NOT automatic
docker compose run --rm app npm run db:seed             # optional demo data (SEED_DEMO=true)
```

Optional Redis: `docker compose --profile optional up -d redis` and set
`REDIS_URL: redis://redis:6379` on the app service.

> Known single-node caveat: the compose file does **not** mount a volume for
> `STORAGE_LOCAL_DIR`, so uploaded files live in the app container's filesystem and are lost
> when the container is recreated. Bind-mount `./var:/app/var` (or back up the directory with
> `docker compose cp`, see §3) before handling real uploads.

### 2.4 Bare-metal path

```sh
npm ci
npm run db:generate          # Prisma client (also required after `npm ci` on fresh checkouts)
npm run db:migrate:deploy    # apply pending migrations from packages/database/prisma/migrations
npm run build                # production build (emits /robots.txt + /sitemap.xml)
npm start                    # next start; reads the root .env
```

Run it under a process supervisor (systemd/PM2) with `NODE_ENV=production`. Put TLS in
front (Caddy/nginx) and set `TRUST_PROXY=true`.

### 2.5 Post-deploy verification

```sh
curl -fsS http://localhost:3000/api/v1/health   # 200 when the DB probe succeeds
curl -fsSI http://localhost:3000/robots.txt     # security headers present on every response
curl -fsS -o /dev/null -w '%{http_code}\n' http://localhost:3000/sitemap.xml
```

`/api/v1/health` is an **honest** probe: it returns 503 with an error envelope when the
database is unreachable (that is the expected answer in an unconfigured environment, not a
crash). A healthy production deploy returns 200. Also confirm a locale gate works
(`/` → 307 → `/ar`) and that a private page (`/en/admin`) redirects to login without a
session.

Before shipping a build, run the full gate: `npm run validate` (= typecheck → lint →
format:check → tests → route/API-doc drift checks → build).

## 3. Backup

Back up **three things**, in this order of importance:

1. **PostgreSQL** — the source of truth (profiles, verified records, certificates, audit log).
2. **Uploads** — `STORAGE_LOCAL_DIR` (document/evidence bytes; DB rows reference these keys).
3. **Configuration** — `.env` / compose `environment:` (secrets are not stored in the DB).
   Store it separately from backups 1–2; anyone with `AUTH_SECRET` can mint tokens.

### 3.1 Database (Docker Compose)

```sh
mkdir -p backups
docker compose exec -T db pg_dump -U bladna -d bladna -Fc > "backups/bladna-$(date +%F-%H%M).dump"
```

(`pg_dump -Fc` custom format = compressed + restorable in one step. On Windows PowerShell,
replace the `$(date …)` subshell with `Get-Date -Format 'yyyy-MM-dd-HHmm'`.)

### 3.2 Database (bare metal)

```sh
pg_dump --format=custom --no-owner --dbname="$DATABASE_URL" > "backups/bladna-$(date +%F).dump"
```

### 3.3 Uploads

```sh
tar -czf "backups/storage-$(date +%F).tar.gz" -C "$(dirname "${STORAGE_LOCAL_DIR:-./var/storage}")" storage
# inside compose, equivalently: docker compose cp app:/app/var/storage backups/storage-$(date +%F)
```

### 3.4 Schedule & retention

- **Automated, encrypted dumps:** `scripts/backup-db.sh` streams `pg_dump` straight into
  AES-256 encryption (no plaintext copy on disk), writes a SHA-256 checksum and deletes
  dumps older than `BACKUP_KEEP_DAYS` (default 30). Run it nightly from cron or the
  Windows Task Scheduler, e.g.
  `BACKUP_PASSPHRASE=… BACKUP_DB_CONTAINER=bladna-db scripts/backup-db.sh`.
  Keep the passphrase apart from the backups and from `.env`; the decrypt command is in
  the script header.
- Nightly DB dump + rolling 7 daily / 4 weekly copies is a reasonable starting point;
  take an additional dump **before every migration deploy**.
- Keep dumps and the `.env` copy in separate stores (different trust domain from the app host).
- The audit log is append-only in the application layer — a restored backup replays history
  faithfully up to the dump time; anything written after it is gone (that is your RPO).

## 4. Restore

Migrations are **forward-only** in this repository (no down migrations ship), so rollback =
restore the dump + redeploy the previous image, then `db:migrate:deploy` forward once fixed.

```sh
# 1. Stop writers first — restoring under live traffic corrupts nothing but races your result
docker compose stop app            # or stop the supervised process

# 2. Recreate the database from the dump (compose example)
docker compose exec -T db dropdb -U bladna --if-exists bladna
docker compose exec -T db createdb -U bladna bladna
docker compose exec -T db pg_restore -U bladna -d bladna --no-owner --if-exists < backups/bladna-YYYY-MM-DD.dump

# 3. Restore uploads into the app container / host
docker compose cp backups/storage-YYYY-MM-DD.tar.gz app:/tmp/ && \
  docker compose exec app tar -xzf /tmp/storage-YYYY-MM-DD.tar.gz -C /app/var

# 4. Reconcile schema with the code you are about to run
docker compose run --rm app npm run db:migrate:deploy   # no-op if dump is current

# 5. Bring the app back and verify
docker compose up -d app
curl -fsS http://localhost:3000/api/v1/health           # must be 200
```

Post-restore checks (all DB-free until login works):

1. `/api/v1/health` → 200 (database reachable).
2. `/` → 307 → `/ar`, `/sitemap.xml` → 200.
3. Sign in with a known account; open a certificate PDF and run its QR/URL through
   `/en/verify/certificate` — restores must keep **credential-keyed verification working**
   (verification tokens live in the DB, so a correct restore verifies certificates again).
4. Spot-check the audit log (`/en/admin/audit`) — rows present up to the dump time.

## 5. Routine operations

- **Deployments:** build → `npm run validate` in CI (`.github/workflows/ci.yml` runs
  typecheck/lint/format/route+docs drift/Prisma validation, then `db:migrate:deploy`
  against a postgres:16 service, tests — including the DB-gated suite — and the build) →
  roll the new image → `db:migrate:deploy` → health check. Migrations never run
  automatically; run them as an explicit step with a fresh dump in hand.
- **Secret rotation:** rotating `AUTH_SECRET` invalidates every access/refresh token and
  session (users must sign in again) — deliberate, and the correct response to a secret leak.
  Rotate `SESSION_SECRET`/`QR_SIGNING_SECRET` likewise if set separately. Database
  credentials live in `DATABASE_URL` on both sides (app + `POSTGRES_*` in compose).
- **Logs:** app logs go to stdout (supervisor/docker captures them); the console email
  driver writes rendered messages under `var/emails/`. The health endpoint's 503 body and
  Prisma's `prisma:error` lines are the first place DB problems show up.
- **Feature flags:** per-flag env kill switches (`FEATURE_<KEY>=true|false`) override both
  `FEATURE_FLAGS` and database rows — use them to disable a feature without a deploy.
- **Rate limiting / abuse:** applied in-process per IP (honouring `TRUST_PROXY`); there is
  no external rate-limit store, so horizontal scaling needs sticky sessions or a shared
  store (documented as a scaling TODO, not implemented).

## 6. Explicitly out of scope (this build)

- **Payment webhooks** — `PAYMENT_PROVIDER=bank_transfer` (default); no gateway checkout
  exists, and `PAYMENT`-type risk signals answer `NOT_IMPLEMENTED` rather than faking.
- **S3 storage / SMTP transport** — adapters exist and answer `CONFIG_ERROR` until wired.
- **Push/SMS notifications** — no provider; the settings matrix marks them unavailable.
- **Down migrations** — restore-from-backup is the rollback path (§4).
