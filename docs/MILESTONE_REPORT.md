# BLADNA — Milestone Report

> **Report date:** 2026-09-23 · **Scope:** Phase 1 → Phase 11 of the master engineering spec
> (158 sections), greenfield implementation from an empty repository.
>
> **Template note:** the §155 template text lives in the spec document, which is not checked
> into this repository. This report covers the elements §155 governs — milestone scope,
> deliverables, validation evidence, honest gaps, and next steps — and should be reconciled
> against the spec's exact section order when the spec is available.

## 1. Milestone scope

A single-deployment Next.js 16 monorepo implementing the BLADNA platform: Algeria-first
volunteer identity, verified experience, opportunity discovery, organization SaaS, CSR/
sponsorship, international volunteering, trust & moderation, and a versioned JSON API.

**Status legend:** `[x]` done & validated · `[~]` partial · `[ ]` not started
(see `docs/IMPLEMENTATION_CHECKLIST.md` for the item-by-item breakdown).

| Phase | Area                                                                                 | Status                                                   |
| ----- | ------------------------------------------------------------------------------------ | -------------------------------------------------------- |
| 1     | Foundation (monorepo, schema+migrations, auth, RBAC, i18n/RTL, UI kit, seed, health) | `[~]` — seed unexecuted, Docker untested                 |
| 2     | Volunteer Core (profile, ID, skills, discovery, applications)                        | `[~]` — privacy keys enforced; stats live at `/me/stats` |
| 3     | Organization Core (CRUD, members, opportunities, pipeline, QR attendance)            | `[x]`                                                    |
| 4     | Verified Experience (hours, certificates, achievements)                              | `[x]`                                                    |
| 5     | Campaigns & Impact (hierarchy, metrics, JSON/CSV reports)                            | `[~]` — PDF export returns explicit `NOT_IMPLEMENTED`    |
| 6     | Sponsors / CSR (programs, sponsorships, dashboards)                                  | `[x]`                                                    |
| 7     | International (source attribution, disclaimers, timeline)                            | `[x]`                                                    |
| 8     | Trust (moderation, risk engine, audit log)                                           | `[x]`                                                    |
| 9     | AI                                                                                   | `[~]` — field-check assist wired; no OCR/providers       |
| 10    | Mobile-ready API                                                                     | `[~]` — contract only, no app binary                     |
| 11    | Production hardening (tests, CI, Docker, docs)                                       | `[~]` — CI/Docker written, not executed here             |

## 2. Deliverables

- **Monorepo:** `apps/web` (Next.js 16 App Router, UI + `/api/v1`) and `packages/{database,
validation, types, domain, auth, utils, ui, config}` — TypeScript `strict` throughout.
- **API:** 227 module routes across three tables — `core` 47, `platform` 115, `participants`
  65 — plus inline `GET /meta` = **228 registered endpoints**, guarded at import time by a
  cross-table duplicate assertion and independently by `scripts/check-routes.ts`.
- **Documents (PDF):** public certificate PDF (`GET /certificates/:certificateId/pdf` —
  exactly the metadata route's exposure, QR → the public verification page, `?locale=`
  default ar) and the volunteer card (`POST /me/card` issues one per profile with a unique
  `BLD-CARD-XXXXXXXX` number and the profile's public verification token as its QR;
  `GET /me/card` + `GET /me/card/pdf`). Rendering runs on pdfkit with a vendored OFL Amiri
  font (license vendored alongside; Latin **and** Arabic glyph coverage verified — fontkit's
  ArabicShaper shapes ar-locale documents). CV export: `GET /me/cv` (aggregate JSON) and
  **`GET /me/cv/pdf`** — the same shared aggregate rendered as a localized A4 PDF
  (`?locale=` default ar; sparse sections omitted, never rendered empty).
- **Security headers (site-wide):** `src/proxy.ts` applies the full header set to
  every response — per-request **nonce** `Content-Security-Policy` on documents
  (`strict-dynamic`; scripts are never `'unsafe-inline'`; `frame-ancestors 'none'`,
  `base-uri`/`form-action`/`object-src` locked), a `default-src 'none'` policy on API
  responses, HSTS (`max-age=31536000; includeSubDomains`), `nosniff`,
  `X-Frame-Options: DENY`, `Referrer-Policy: strict-origin-when-cross-origin` and
  `Permissions-Policy` (camera/geo `self` for the QR scanner and location pickers;
  microphone/payment/usb off). Verified live against `next start`: page, redirect,
  API and robots probes all carry the full set (one clean `nosniff`, a distinct
  nonce per response), and the served HTML carries the response nonce on
  **17/17 executable scripts** (the 18th tag is the app's own `application/json`
  data block, not subject to `script-src`).
- **Self-registration:** `POST /organizations` (verified email + shared §54 consent bar;
  creator seated as `OWNER`; enters `PENDING_VERIFICATION`/`PENDING` — never ACTIVE or
  VERIFIED at birth) and `POST /sponsors` (registrant seated as `SPONSOR_ADMIN`; lands
  `PENDING` — only the platform activates). Both write the `PrivacyConsent` ledger and an
  audit row tagged `source: self_registration`.
- **Documents & storage:** byte uploads go through a validation gate (size → MIME
  allow-list → magic bytes → extension agreement → sha256) before storage, then the
  row — personal `/me` + tenant `/orgs/:orgId/documents*` routes, and a row-level
  authorized `GET /files` stream (public/owner/tenant/conversation/evidence, 404 on
  deny). Officer evidence review has an audited field-check assist endpoint.
- **Database:** `packages/database/prisma/schema.prisma` + 11 migrations
  (`0001_init` … `0011_opportunity_review`, each rendered to SQL for review;
  the first six were generated offline — no live database was
  available).
- **Seed:** `packages/database/src/seed.ts` — demo-guarded (`SEED_DEMO=true`), idempotent,
  natural-key lookups, never overwrites operator changes. **Never executed here.**
- **Billing console (`/billing`):** organization selector sourced from
  `GET /me/organizations` (a foreign `?org=` id is ignored, never dereferenced), current
  subscription with a two-step cancel, a plans grid **priced from data** with
  upgrade/downgrade/subscribe actions through the state machine, invoices with server-side
  status filter and per-invoice line-item expansion (subtotal/tax/total in DZD), and the
  append-only payments ledger with a record-payment step that surfaces the bank-transfer
  instructions and the PENDING state — **no checkout is simulated** (bank transfer/manual
  only, per the gateway-absence rule).
- **Administration console (`/admin`):** section access computed server-side from the
  caller's real roles (`adminSectionsFor`), `?tab=` revalidated against the grant on every
  load, an honest enable-TOTP notice for staff without 2FA (their every write would fail
  `MFA_REQUIRED`), and **twelve sections** — users, organizations, **sponsors**,
  opportunities, **international**, verification, reports, trust & risk
  (queue/signals/incidents), audit, **content** (CMS: pages/announcements/featured/home),
  settings, feature flags — each with filters, pagination and row actions. Section grants
  are `anyOf`-permission tables checked against the real RBAC matrix in
  `admin-access.test.ts`; action buttons are display-gated via
  `permissionsForSystemRoles` (e.g. `user.suspend`, `organization.suspend`,
  `opportunity.moderate`, `content.manage`, `sponsor.manage`); every write re-checks its
  own permission server-side.
- **Notification matrix (`/settings`):** 16 events × 4 channels with only EMAIL editable —
  saves **changed rows only** (max 200) to `PATCH /me/notification-preferences`, in-app is
  static "always in inbox", push/SMS are statically marked unavailable; the panel hides
  honestly when the caller lacks `volunteer.profile.read`.
- **Pages:** 22 pages under `app/[locale]` (home, opportunities, organizations, campaigns,
  international, verify + the `/verify/{certificate,volunteer,organization}` sub-routes,
  login/register/MFA/password flows, dashboard, settings, safety, messages, billing, admin)
  with ar/fr/en + RTL.
- **SEO:** root `robots.txt` + `sitemap.xml` (39 URLs: 3 locales × 13 static paths — every
  path fs-pinned to a real `page.tsx` by `sitemap.test.ts`).
- **Docs:** `README.md`, `docs/ARCHITECTURE.md`, `docs/API.md`, `docs/SECURITY.md`,
  `docs/IMPLEMENTATION_CHECKLIST.md`, **`docs/OPERATIONS.md`** (deployment both paths,
  backup/restore runbook, secret rotation, out-of-scope manifest).
- **Ops:** `Dockerfile`, `docker-compose.yml`, `.dockerignore` (keeps `.env` and host
  build state out of the image build context), `.env.example`, `.github/workflows/ci.yml`.
- **Environment wiring fix (found via live probes):** the documented root `.env` was never
  loaded by Next — `next dev|start` runs with cwd=`apps/web` — so any request carrying an
  auth cookie died with a 500 (`Missing required environment variable: AUTH_SECRET`, read
  off the server log) instead of bouncing to login. `next.config.ts` now loads the root
  file with `process.loadEnvFile`: a missing file is a no-op and real environment
  variables win (verified against `node --env-file` semantics), so the compose
  `environment:` injection is unaffected. A new `.dockerignore` additionally stops the
  Dockerfile's `COPY . .` from baking `.env` into builder and runner images — the previous
  mitigation only stripped `node_modules` and explicitly documented the missing file. The
  same root `.env` now also reaches the database tooling: `packages/database/prisma.config.ts`
  loads it before the Prisma CLI resolves the datasource — the documented `db:migrate:deploy`
  went from P1012 "Environment variable not found" to actually reaching the database (P1000
  auth-refused on this machine, which has no usable role), while `db:generate` and
  `schema:validate` stay exit 0 — and `db:seed` reads it through
  `tsx --env-file-if-exists=../../.env` (reaches the database under `SEED_DEMO=true`, refused
  before any write). The documented db scripts were live-tested end to end.

## 3. Validation evidence

All commands run on this machine (Windows, Node 24.19, npm 11.17):

| Check            | Command                              | Result                                                                                           |
| ---------------- | ------------------------------------ | ------------------------------------------------------------------------------------------------ |
| Types            | `npm run typecheck`                  | **exit 0**                                                                                       |
| Lint             | `npm run lint`                       | **exit 0**                                                                                       |
| Formatting       | `npm run format:check`               | **exit 0** (all matched files Prettier-clean)                                                    |
| Unit tests       | `npm test`                           | **228 passed, 0 skipped** (27 files — DB suite executes)                                         |
| Route integrity  | `npm run check:routes`               | **227 routes, 0 duplicates**                                                                     |
| Docs ↔ code      | `npm run check:api-docs`             | **228 registered = 228 documented, 0 drift**                                                     |
| Production build | `npm run build`                      | **exit 0** (emits root `/robots.txt` + `/sitemap.xml`)                                           |
| Everything above | `npm run validate`                   | **exit 0** (re-run with DB live: 228/228, no skips)                                              |
| Prisma schema    | `npx prisma validate`                | **valid** (2322-line SQL render, exit 0)                                                         |
| Migrations       | `npm run db:migrate:deploy`          | **11/11 applied** (0001–0011, all finished, none rolled back)                                    |
| Seed             | `npm run db:seed` (`SEED_DEMO=true`) | **exit 0** — demo org, volunteer, 2 opportunities, 1 campaign, certificate `BLD-CERT-2LXHUMOJTJ` |

Reproduced after every significant change; the run above was the state of the
report at its original writing — **the live snapshot is the header of
`docs/IMPLEMENTATION_CHECKLIST.md`** (latest: 2026-10-05 P34
partnerships & CSR API + RBAC, M2 — 489 tests / 45 files, 311
routes, API 312/312, E2E 42/42, probes 211/211).

Live probes against `next start` (port 3456, production build) — 16/16 as expected:

| Probe                                                              | Result                                                                                     |                     |
| ------------------------------------------------------------------ | ------------------------------------------------------------------------------------------ | ------------------- |
| `/` (no locale)                                                    | 307 → `/ar`                                                                                | locale gate         |
| `/robots.txt`, `/sitemap.xml`                                      | 200                                                                                        |                     |
| `/en/login`                                                        | 200                                                                                        | public, indexable   |
| `/en/{billing,admin,dashboard,settings}` (no cookie)               | 307 → `/en/login?next=%2Fen%2F…`                                                           | session gate        |
| `/en/{billing,admin,dashboard,settings}` (**spoofed `bladna_at`**) | **307 → `/en/login?next=…`**                                                               | **was 500 pre-fix** |
| `GET /api/v1/auth/me` (no cookie / spoofed)                        | 401 `UNAUTHORIZED` JSON both times                                                         | API never redirects |
| `GET /api/v1/health`                                               | 503 (honest DB probe; server log shows P1000 auth-refusal, i.e. `DATABASE_URL` now loaded) |                     |
| Security headers (every response above)                            | `nosniff` + `HSTS` + `X-Frame-Options: DENY` + CSP, all present                            |                     |

The spoofed-cookie rows are the direct before/after for the root-`.env` wiring fix: pre-fix
they died with `Missing required environment variable: AUTH_SECRET` → 500; post-fix
`verifyAccessToken` runs, rejects the garbage token, and `pageSession` redirects to login.

The privacy-keys + CV-PDF increment re-probed on port 3457 (fresh production build) —
**10/10**: `GET /api/v1/me/cv/pdf?locale=fr` → 401 `UNAUTHORIZED` (new route registered —
not 404), `GET /api/v1/me/cv` → 401, `PATCH /api/v1/me/privacy` → 401 both with and
without the new keys (the auth guard runs before the body), `/api/v1/health` → 503 (DB
still unreachable — honest and unchanged), spoofed-cookie `/en/settings` → 307, `/` locale
gate → 307, and `nosniff` + HSTS present on the new route's 401.

The admin-UI + verify-subroutes increment re-probed on port 3458 (fresh production build,
18 probes) — **18/18**: locale gate `/` → 307 `/ar`; `/ar` → 200; `/en/login` → 200;
`/robots.txt` → 200; `/sitemap.xml` → 200 with **exactly 39 `<loc>` URLs**; all five
verify routes (`/en/verify`, `/en/verify/{certificate,volunteer,organization}`,
`/fr/verify/certificate`) → 200; `/api/v1/health` → 503 (honest DB probe, unchanged);
`/api/v1/auth/me` → 401; `/en/admin` with no cookie **and** with a spoofed cookie → 307 to
login both times; **cross-origin `POST` → 403 `Cross-origin request rejected.`**
(load-bearing CSRF regression — the origin check fixed this increment), while the same
POST _without_ an `Origin` header → 400 validation error (i.e. only foreign origins hit the
403 path); security headers on `/en/login` (`nosniff`, HSTS `max-age=31536000;
includeSubDomains`, `X-Frame-Options: DENY`, CSP present); `/en/dashboard` (no cookie) →
307 to login.

**UI batch increment (this one)** re-probed on port 3000 (fresh production build, 34
probes in a new `probe-ui` suite) — **34/34**: all six legal pages (`/en|ar|fr` ×
`/terms|/privacy`) → 200 with localized titles, `dir="rtl"` + ≥50 Arabic-range characters
on the Arabic ones, and sibling cross-links; landing `/en` → 200 with the mobile-nav
toggle (`aria-controls="mobile-nav-panel"`), hero badge, feature chips, final CTA and 13
inline SVG icons; footer links to `/en/terms` + `/en/privacy`; `/ar` → 200 + `dir="rtl"`
with 2809 Arabic characters; `/en/register` → 200 with consent links to both legal docs;
`/sitemap.xml` → **exactly 39 `<loc>` URLs** incl. `/en/terms` and `/ar/privacy`; terms
**not** noindexed; `GET /api/v1/public/verify?code=BLD-CERT-2LXHUMOJTJ` → 200
`"valid": true`; `/en/opportunities` → 200; `X-Frame-Options: DENY` on the new pages. The
prior suites were re-run against the same server: the **12-probe DB suite → 12/12** and
the **18-probe suite → 18/18** (after correcting its target port from 3458 to 3000).

One real regression was caught by those probes during development and fixed before
delivery: a `[locale]/loading.tsx` route-level skeleton streamed the shell with HTTP 200
_before_ `pageSession`'s `redirect()` ran, so `/en/admin` and `/en/dashboard` returned 200
instead of the contract-required **307 to login** (the redirect then arrived via the RSC
stream instead of an HTTP status). The `[locale]`-level `loading.tsx` was removed;
skeletons now exist only on public routes that never redirect (`organizations`,
`campaigns`, `international` — their only `notFound()` guard is unreachable behind the
locale middleware), and `validate` + all three probe suites were re-run green afterwards.

**Database brought online this session (formerly the top environment blocker):** the
local PostgreSQL 16 server was reachable but lacked the application roles — created
`bladna_app` + `bladna_migrator` (least-privilege split exactly as `.env` documents),
created/owned the `bladna` database and `public` schema for the migration credential,
granted `CREATE`/default privileges inside the correct database, then
`npm run db:migrate:deploy` **applied all 6 migrations (0001–0006)** and
`SEED_DEMO=true npm run db:seed` produced the demo dataset (org `atlas-verts`,
volunteer `PREFIX-REGION-000001`, certificate `BLD-CERT-2LXHUMOJTJ`, 2 opportunities,
1 campaign). Two failed migration attempts (permission-denied before the grants landed)
left `rolled_back` bookkeeping rows; the DB integration test **caught them** — proof the
suite works — and after cleanup all 6 rows report finished/not-rolled-back. The full
`npm run validate` was then re-run with the DB live: **exit 0, 228/228 tests, 0 skips**
(the 3 formerly-gated integration cases now execute for real).

A 12-probe DB-live suite against `next start` (port 3458) — **12/12**: `GET /health` →
**200** (was 503); `GET /public/verify?code=BLD-CERT-2LXHUMOJTJ` → 200 `"valid": true`
(seeded certificate resolved end-to-end) while an unknown code → honest 404;
`POST /auth/login` (volunteer) → 200 with a **real session cookie**;
`GET /auth/me` with that cookie → 200 + `volunteer@bladna.dz`; `/en/dashboard` and
`/en/settings` with the real cookie → **200** (the page-gate now renders instead of
redirecting); `PATCH /me/privacy` same-origin → 200 (validated write against real
storage); the **same PATCH with a real valid cookie but `Origin: https://evil.example`
→ 403 `Cross-origin`** (CSRF holds even for authenticated sessions);
`GET /opportunities?page=1&pageSize=5` → 200 paginated; `GET /me/cv/pdf?locale=fr` with
the session → 200 PDF; `/en/admin` without cookie still 307 (no gate regression). The
original 18-probe suite was re-run against the same live server — **18/18**, only
`/health` changing from 503 → 200 as expected.

**Backup/restore drill executed** (closing the "transcribed but untested" caveat in
`docs/OPERATIONS.md`): `pg_dump` of the live seeded database (205 KB) → restored into a
scratch `bladna_restore_drill` database → row counts verified via SQL file
(**3 users, 2 opportunities, 1 certificate, 6 migration rows**) → scratch database
dropped. First attempt failed for two operator reasons now understood: dumping as
`bladna_migrator` lacks lock rights on `bladna_app`-owned tables (dump must run as the
superuser/owner — exactly what the runbook implies), and inline PowerShell SQL loses
quoted identifiers (use `-f file.sql`).

## 4. Honest gap list (verified from source, not inferred)

1. **No payment webhooks**; `PAYMENT` risk signals and payment suspension return explicit
   `NOT_IMPLEMENTED` (never faked).
2. **AI beyond the field-check assist** — `checkDocument` is wired to
   `POST /admin/verifications/:id/check` (deterministic local rules, audited); no OCR
   exists, so cloud document _reading_ and the classification/moderation/risk providers
   remain `NOT_IMPLEMENTED` (never faked).

**Known limitation (not a numbered gap):** outbound notification **email is the only
enforced channel** — in-app notices always reach the inbox, push and SMS have no provider
behind them, and the `/settings` matrix says exactly that (interactive EMAIL column,
static in-app ✓, push/SMS marked "not yet available") rather than saving choices nothing
would read.

**Closed to date:** documents pipeline dead end, AI adapter reachability, organization
document routes (documents increment); organization + sponsor self-registration
(former gaps 1 + sponsor half of old gap 5); **certificate PDF, volunteer card and the
CV endpoint** (this increment — former gap 1 above; note the old text claimed "no
`cardNumber` field", which was wrong: the `VolunteerCard` model always existed — what
was missing were the endpoints, now delivered and tested); **site-wide CSP/HSTS
security headers** (latest increment — per-request nonce CSP on documents,
`default-src 'none'` on API responses, and HSTS/nosniff/frame/referrer/permissions
headers on every response, verified live), and **user console pages + `noindex`** (this
increment — `/settings`, `/safety`, `/messages`, the shared `pageSession` session gate,
signed-in nav with sign-out; former gap 4 narrowed to `/admin` + `/billing`), and
**`/admin` + `/billing` UI pages and the notification matrix** (this increment — the
billing console, the nine-tab role-gated admin console, and the `/settings` matrix for
`/me/notification-preferences`; **gap 4 fully closed**), and **CV PDF rendering +
per-field privacy flags** (latest increment — `GET /me/cv/pdf` renders the shared CV
aggregate as a localized A4 PDF, ar/fr/en full renders plus a sparse-profile render
unit-tested; migration `0006_volunteer_privacy` adds the three visibility columns,
`PATCH /me/privacy` now stores all six keys (**501 removed**), `showWilaya` gates
directory location and `?wilayaId` filter membership, `showHours` gates the
public-verify volunteer hours (`null` → row hidden client-side); `showCertificates` is
stored but has no public listing surface — certificate reads stay credential-keyed by
design; **former gaps 1+2 closed** — 170 passed + 3 DB-gated skipped at that increment).

## 5. What could not be validated in this environment

- **Database:** ~~no usable `DATABASE_URL`~~ — **resolved this session**: roles
  `bladna_app` + `bladna_migrator` created against the local PostgreSQL 16 server,
  database/schema ownership and grants fixed, **all 6 migrations applied**, seed
  executed, the `tests/db` assertions **run for real (3/3 pass, 0 skips)**, and a
  12-probe live suite passed 12/12 against the seeded database (login session,
  dashboard/settings renders, privacy write, certificate verification).
- **Containers:** no Docker ⇒ `Dockerfile`/`docker-compose.yml` are written but untested.
- **Git/CI:** no `git` binary ⇒ nothing committed; `.github/workflows/ci.yml` never ran
  (every command it invokes was verified locally except `docker build`). The workflow was
  extended in this milestone to run format, route/doc drift and Prisma schema checks, a
  **postgres:16 service with `db:migrate:deploy` before the tests** (so the DB-gated
  suite runs against a real migrated database instead of skipping), plus the docker
  image build — the service and migrate steps stay unproven until CI first runs.
- **External providers:** AI/payment/map calls require credentials; endpoints answer
  `CONFIG_ERROR`/`NOT_IMPLEMENTED` rather than simulating success.
- **Browser enforcement of the new CSP:** no browser is connected to this session, so
  the policy was validated structurally instead — header probes against `next start`
  (page/redirect/API/robots) plus the served HTML, where all 17 executable script tags
  carry exactly the response nonce (the 18th tag is a non-executable
  `application/json` data block). HSTS _processing_ requires an HTTPS origin: the
  header is emitted everywhere and browsers ignore it over plain HTTP, by design.
- **Test distribution caveat:** the suite is now **223 passing tests + 3 DB-gated
  skipped (27 files)**: the upload gate +
  local field checker, registration schema tests, the PDF renderer suites (bundled-font
  resolution, Latin **and** Arabic glyph-coverage heuristic, ar/fr/en certificate, card
  **and CV** renders asserted as real `%PDF` output — including a sparse-profile CV — and
  the response-header contract), the security-header
  suites (nonce CSP construction, API lockdown policy, full header-set application), the
  message-DESC merge/ordering helpers behind the Messages UI, the admin section-grant suite
  (`admin-access.test.ts`, 6 cases asserted against the real RBAC matrix — now covering all
  twelve sections), the billing
  plan-action helper suite (5 cases), the admin validation-schema suite (16 cases over the
  two platform query schemas, the opportunity-action schema and the user-action schema),
  a page source-scan that pins `noindex` on all **10 private/transient pages**
  (adding `/billing` and `/admin`) and its absence on the 10 public ones — 20 assertions,
  and **this increment's server-layer suites**: `router.test.ts` (path matching + dispatch
  404/405/root/trailing-slash + describe registry, 11 cases), `http.test.ts` (25 cases:
  request-context build, body/query/path parsing, envelopes, error sanitization, the
  **`assertSameOrigin` CSRF matrix**, full `apiHandler` pipeline incl. rate-limit tier and
  origin-check-before-handler ordering), `guards.test.ts` (8 cases: resolveOrgId,
  verified-email gate, MFA-protected roles), `page-session.test.ts` (6 cases: login/MFA
  redirects, non-session rethrow — the repo's first `vi.mock` usage), and
  `sitemap.test.ts` (3 cases fs-pinning 13 static paths × 3 locales = 39 URLs to real
  `page.tsx` files). **Playwright/E2E browser coverage did not exist at this
  increment — it landed in P4 (2026-09-26): 15 tests / 7 spec files on real
  Chrome.** The
  **DB-backed suite's three assertions now execute locally and pass** (database brought
  online this session — see §3); rendered-page-with-session coverage exists as live
  HTTP probes (dashboard/settings 200 with a real cookie) rather than browser tests —
  those remain next steps rather than claimed coverage (also closed in P4).
- **Prettier:** the repo had 123 files failing `format:check` (pre-existing); they were
  reformatted in this milestone so `npm run format:check` now passes — mechanical formatting
  only, confirmed still green by the full `validate` run.

## 6. Next steps (priority order)

1. ~~**Unblock documents → verification**~~ — **done** this increment: validation gate →
   `putObject` → rows with `organizationId` + `AVAILABLE`, `/orgs/:orgId/documents*`,
   `GET /files`, and `checkDocument` wired to `POST /admin/verifications/:id/check`
   (former gaps 2, 4, 9 closed; messaging attachments now qualify too).
2. ~~**Organization self-registration + sponsor self-registration**~~ — **done** this
   increment: `POST /organizations` (creator → `OWNER`, `PENDING_VERIFICATION`) and
   `POST /sponsors` (registrant → `SPONSOR_ADMIN`, `PENDING`), shared §54 consent bar,
   `PrivacyConsent` ledger, audited (former gap 1 + sponsor half of gap 5 closed).
3. ~~**Certificate PDF, volunteer card, CV endpoint**~~ — **done** this increment:
   `GET /certificates/:certificateId/pdf` (public, same exposure as the metadata route),
   `POST /me/card` / `GET /me/card` / `GET /me/card/pdf` (unique `BLD-CARD-` number,
   QR = the profile's public verification token), `GET /me/cv` (aggregate JSON export);
   pdfkit now actually renders, with a vendored OFL Amiri font (Arabic shaping verified,
   license vendored) — former gap 1 fully closed (the residual CV document gap now ships
   as `GET /me/cv/pdf`).
4. ~~**Security headers (site-wide CSP/HSTS)**~~ — **done** this increment: every response
   now carries the header set from `src/proxy.ts` — per-request nonce CSP on
   documents (`strict-dynamic`, no `unsafe-inline` scripts), `default-src 'none'` on API
   responses, HSTS, nosniff, `X-Frame-Options: DENY`, referrer and permissions policies;
   verified live via header probes and the nonce contract on the rendered HTML (former
   gap 3 closed).
5. ~~**User console pages + `noindex`**~~ — **done**: `/settings`,
   `/safety`, `/messages`, the shared `pageSession` gate, signed-in nav with sign-out, and
   `noindex` on the private/transient pages (auth-flow pages live-probed, the rest pinned
   by a source-scan test).
6. ~~**`/admin` + `/billing` UI pages and the notification matrix**~~ — **done this
   increment**: `/billing` (org selector honoring `?org=`, subscription + two-step cancel,
   plans grid priced from data, invoices with line-item expansion, payments ledger + honest
   bank-transfer record step — never a simulated checkout), `/admin` (twelve role-gated
   sections,
   `?tab=` revalidated server-side, staff TOTP notice, display-only action gating via
   `permissionsForSystemRoles`, filters + pagination on every list), and the `/settings`
   notification matrix (EMAIL-only edits, changed rows only, ≤200) — **former gap 4
   closed**; 19 pages total, `noindex` pinned on 10 private pages by a 20-assertion
   source scan.
7. ~~**DB-backed tests**~~ — **written and now executing locally**: `tests/db/database.test.ts`
   (migration state, `0006` column contract, schema↔table coverage — **3/3 pass against
   the live local database**, wired to CI's postgres service as well); route/guard/
   page-session suites landed too (`router`, `http` incl. the CSRF-origin regression matrix,
   `guards`, `page-session`, `sitemap`). ~~Still
   outstanding: **Playwright E2E**~~ — **done in the P4 increment
   (2026-09-26)**: 15 tests / 7 spec files green + a CI job step; then run the
   CI workflow (now including its service + migrate steps) on a machine with Docker
   and git.
8. ~~**Execute `db:seed` and `migrate deploy`** against a real PostgreSQL~~ — **done**
   this session: 6/6 migrations applied, seed produced the full demo dataset, verified
   end-to-end by the 12-probe live suite (login → session → dashboard, certificate
   `BLD-CERT-2LXHUMOJTJ` resolves `"valid": true`, cross-origin mutation with a real
   cookie still 403).

## 7. CRUD UI gap-fill increment (2026-09-24)

Every endpoint that previously had no UI now has one, built in six parallel workstreams and an
integration pass (server modules touched twice, both additive):

- **Volunteer**: `/applications` (withdraw per `APPLICATION_TRANSITIONS`), `/notifications`
  (unread filter + mark-read), `/invitations/accept` (token survives the login bounce),
  `/profile` (hours/certificates/achievements/card/CV/data-rights), `/check-in` landing.
- **QR check-in closed end-to-end**: the session QR now encodes the public `/check-in?token=…`
  landing URL (it previously held opaque token text no client could act on), both QR responses
  carry `checkInUrl`, and the attendance panel shows a copy-link — the login bounce preserves
  the token.
- **Public details**: `/organizations/[slug]` (new `?slug` filter on `GET /organizations`,
  ACTIVE-only), `/campaigns/[id]` (join/leave), `/international/[id]` (experience submit) —
  indexable with true 404s.
- **Organization workspace**: picker + guarded shell with 10 tabs (analytics, opportunities,
  campaigns, applications, members, attendance, hours, certificates, documents, verification,
  settings) — every mutation re-checked server-side, transitions gated by the state machines.
- **Sponsor workspace**: register (caller seated `SPONSOR_ADMIN`), overview, profile,
  sponsorships, CSR programs, members; admin controls behind a real `sponsor.manage` probe.
- **Admin console → 14 sections**: `exports` (CSV/JSON blob download with real counts) and
  `billing` (payments/invoices/subscriptions + status actions behind `payment.manage`).
- **Integration fixes found and closed**: `invoke` does not derive path params (workspace layout
  - 3 tabs omitted `params: { orgId }` → would have 500'd every tab); the org→opportunities
    filter link now actually filters; trust level renders humanized labels; `loading.tsx` removed
    from 3 public segments (parent skeleton streamed 200 shells before `notFound()` could set the
    status — a known Next.js streaming limitation); check-in link added to dashboard quick links.

**Validation**: `npm run validate` exit 0 — 254 tests (private-noindex source scan now 46
assertions incl. an exhaustiveness check over every `page.tsx`), 227 routes / 228 documented,
build with all 54 app routes; live probes **52/52 anonymous + 30/30 authenticated** (public
200s, detail 404s, private 307s, signed-in 200 + `noindex`, robots disallows, `?slug` filter,
guarded endpoints 401/405, RTL/LTR).

**New honest gaps**: (a) no endpoint enumerates a user's sponsor workspaces (console opens by
`?id=` or post-registration only); (b) admin billing rows carry UUIDs only — no org-name join
or invoice currency in those responses; (c) no browser was connected to this session, so the
visual/Lighthouse pass did not run — status codes and rendered HTML were verified over HTTP
instead.

## 8. BLADNA INTERNATIONAL (extension delivered 2026-09-24)

Additive extension of the INTERNATIONAL track (74 sections) on top of the shipped platform —
no rebuild, no reset, no drops: migration `0007_international_gapfill` is additive (three enums,
the `InternationalApplication` + `InternationalVerificationEvent` models, and profile /
opportunity / experience columns).

- **API:** 17 new routes (eligibility, recommendations, countries, providers, application
  lifecycle, passport read/update, admin verification write + append-only history, admin
  applications queue + transitions, experience list/verify) — 244 module routes total, with
  `docs/API.md` documenting 245/245 (0 drift).
- **Pages:** enriched public list/detail (category/country filters, benefits grid, source
  badges, eligibility box, share/report, landing section) plus new
  `/international/{countries,countries/[code],providers,safety,apply/[id]}`; private
  `/international/{applications,passport}` (`noindex`, session-gated) with a dashboard
  section; the admin console's `international` section gained verification actions,
  append-only history, an applications queue and experience verification.
- **Determinism & honesty:** eligibility is a fixed rule matrix (age bounds vs date of birth,
  free-text requirements resolve to UNKNOWN, deadline/duplicate gates; passport readiness is
  informational, never a gate); recommendations score transparently (+2 preferred category,
  +2 preferred country) and return machine reasons — no AI, no volunteer ranking, no
  official/guarantee claims, and passport copy states it is not a travel or government
  document.
- **Pins:** i18n keys owned in `ui/i18n` (ar/fr/en); sitemap grew to **48 URLs** (fs-pinned);
  robots disallows `/*/international/{apply,passport}`; `private-noindex.test.ts` classifies
  all **53 pages** (31 private + 22 public) with an exhaustiveness check.
- **Validation:** `npm run validate` exit 0 — **303 tests / 28 files**, 244 routes / 245
  documented, clean build — then live probes **170/170** (52 anonymous + 30 authenticated +
  88 international) against `next start` seeded with a demo dataset (4 countries; 4 offers in
  VERIFIED / UNDER_REVIEW / PENDING states).

**Deferred INTERNATIONAL scope (honest):** partner/verified-partner system, provider accounts
& workspace, source-ingestion adapters + a refresh scheduler, deadline-reminder jobs (BullMQ
exists in `server/infra/queue.ts` but is not wired to deadlines), traveler stories, CMS-backed
guide content, the opportunity map, achievements, skills-verified levels, language proficiency
levels, and the mobile app binary. Admin transition/verification flows are covered by unit
tests rather than a live TOTP admin probe (documented cookie-jar limitation in this
environment); Docker/compose build, git commit and CI remain unexecuted here (no binaries on
this machine), and no browser was connected for a visual/Lighthouse pass.

## 9. Core-loop fixes (delivered 2026-09-24)

Four approved fixes closing the loop campaign creation → organization visibility → volunteer
discovery → sponsorship/funding. Additive only: migration `0008_campaign_funding` applied
(`CampaignContribution` + `ContributionStatus`, `SponsorshipKind` + `Sponsorship.description`) —
no drops, no resets, payment/billing stays `bank_transfer | free`.

- **Opportunity ↔ campaign link**: the workspace opportunity form gained a campaign selector
  (loaded from `GET /orgs/:orgId/campaigns?limit=100`; the server cross-checks the campaign
  belongs to the org) plus structured requirements (≤15), benefits (≤10) and application
  questions (≤10, CHOICE options entered one per line); an unchanged `questions` array is
  omitted from PATCH (`questionsSnapshot` compare) so the server-side snapshot guard fires only
  on a real edit.
- **Discovery**: `GET /opportunities` accepts a UUID-validated `campaignId` filter;
  `/opportunities?campaignId=` mirrors the `organizationId` search param end-to-end; campaign
  details render related published opportunities (limit 6) with a view-all deep link and an
  honest empty state (`campaigns.noRelatedOpportunities`).
- **In-kind sponsorship**: `SponsorshipKind { CASH | IN_KIND }` — CASH requires `amount > 0`;
  IN_KIND requires a non-empty `description` (amount = estimated value, may be 0); the sponsor
  console shows a kind selector, a description field and both values on every row.
- **Campaign funding**: `CampaignContribution` with a strict machine (`PENDING → CONFIRMED |
REJECTED`, both terminal; REJECT requires a reason). Four routes (create / cancel / org ledger
  / org decide), the donor cancels only while still `PENDING`, duplicate `[campaignId,
reference]` returns `409`, invalid transitions return `422`, and `GET /campaigns/:id` returns a
  `funding` block of **aggregates only** (confirmed/pending amounts and counts + budget/currency
  — no donor PII, honest `confirmedAmount` naming). The UI ships a new `campaign-contribute.tsx`
  island (login bounce on 401), a campaign-page funding section stating that transfers go
  directly to the organization and the platform only records the pledge (no electronic gateway
  is claimed anywhere), and a `CampaignContributions` panel on the workspace campaigns tab
  (masked donors, reason input, Confirm/Reject).

**Validation:** `npm run validate` exit 0 — **317 tests / 29 files** (incl. the new
`server/campaign-funding.test.ts`, 14 DB-free assertions over the transition machine, create/
decision schemas, CASH|IN_KIND refines, `campaignId` filter and route registration), **248
routes / 249 documented** (0 drift), clean build — then live probes **234/234** (52 anonymous +
30 authenticated + 88 international + **64 funding/core-loop**) against `next start`. The funding
suite uses a genuinely TOTP-satisfied org session (fresh RFC 6238 code from the dev-only helper
`scripts/totp-code.ts`) and walked: create → validation `400` → duplicate `409` → donor cancel
`200`/`404` → masked-donor ledger with status filter → REJECT-without-reason `400` → REJECT/CONFIRM
`200` → second decision `422` → cancel-after-decision `422` → public `confirmedAmount` reflecting
the CONFIRM → an org `PATCH …/opportunities/:id { campaignId }` link returned by the public
filter → campaign page rendering the funding section, contribute form, honest bank-transfer
sentence and the related-opportunities section; anonymous `401` walls and the volunteer→org
`403` wall were probed too.

**Honest notes:** sponsorship `IN_KIND` is covered by unit tests only — the seed has no sponsor
demo account, so no live sponsor-session probe exists; there is no donor-side contribution
history endpoint (cancel works with the id returned by `create`) and no admin contributions UI
(the ledger is org-only by design, documented in `docs/API.md`); Docker/compose, git commit and
CI remain unexecuted here, and no browser was connected for a visual/Lighthouse pass.

## 10. Sign-off statement

Every claim in this report maps to a file or a command result produced in this session.
Nothing is marked `[x]` without a passing check; everything requiring a database, container
runtime, credentials, or git is explicitly marked unvalidated in §5.
