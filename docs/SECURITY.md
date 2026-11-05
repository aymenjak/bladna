# BLADNA — Threat model and security controls

This document describes controls that are **implemented and verifiable in this
codebase**, with the file that implements each one. It is not a marketing
summary; where a control is partial or absent, it is stated under
"Known gaps". Companion documents: [ARCHITECTURE.md](ARCHITECTURE.md) §7
(request pipeline) and [API.md](API.md) (envelope, error codes, rate limits).

## 1. Assets and adversaries

- **Assets**: user credentials and sessions; personal data (profiles, documents,
  hours, certificates); tenant data (organizations, sponsors); platform
  integrity (verifications, audit log, payments ledger); the signing secrets
  (`AUTH_SECRET`, `QR_SIGNING_SECRET`).
- **Assumed adversaries**: anonymous internet clients (credential stuffing,
  scraping, forged cross-site requests); authenticated low-privilege users
  (horizontal/vertical privilege escalation, tenant escapes); holders of a
  leaked refresh token or QR image; malicious tenants attacking each other.
- **Trust boundary**: everything below `/api/v1` is untrusted input; every
  authorization decision is re-made server-side on every request
  (`apps/web/src/server/guards.ts`).

## 2. Authentication

| Control                                                                                                                                                                                                                                   | Implementation                                                                                  |
| ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| Password hashing — scrypt (RFC 7914), N=2^15, r=8, p=1, 16-byte salt, 32-byte key, `timingSafeEqual` compare, NFKC normalisation                                                                                                          | `packages/auth/src/password.ts`                                                                 |
| Password policy — length-first (min 10, max 200), common-password blocklist, rejects passwords containing the email local-part (NIST SP 800-63B style)                                                                                    | `checkPasswordPolicy`, same file                                                                |
| Access tokens — short-lived JWT (HS256 via `jose`, algorithm pinned), claims `sub`/`sid`/`jti`/`roles`/`type=access`, TTL `ACCESS_TOKEN_TTL` (default 900 s)                                                                              | `packages/auth/src/tokens.ts`, `apps/web/src/server/services/sessions.ts`                       |
| **Session binding** — a JWT is only accepted if its `sid` resolves to a live session row, the row's user matches `sub`, and `jti` equals the session's current `accessTokenId`; revocation and rotation therefore take effect immediately | `getSessionUser`, `apps/web/src/server/guards.ts`                                               |
| Refresh tokens — 256-bit opaque value, stored **only** as a SHA-256 hash, delivered in an `HttpOnly` cookie                                                                                                                               | `generateRefreshToken`/`hashToken`, `packages/auth/src/tokens.ts`                               |
| Refresh **rotation** — compare-and-swap update so concurrent refreshes cannot fork a family; each rotation also rotates the access `jti`                                                                                                  | `rotateSession`, `apps/web/src/server/services/sessions.ts`                                     |
| **Reuse detection** — presenting a previously rotated refresh token proves theft: the whole session family is revoked (`revokedReason: refresh_token_reuse`) and the caller gets 401                                                      | same file                                                                                       |
| Cookies — `bladna_at` (access) and `bladna_rt` (refresh): `HttpOnly`, `SameSite=Lax`, `Secure` when `NODE_ENV=production`, path `/`, optional `COOKIE_DOMAIN`                                                                             | `apps/web/src/server/cookies.ts`                                                                |
| Session transparency — users list their active sessions and can revoke one or all                                                                                                                                                         | `GET /auth/sessions`, `DELETE /auth/sessions/:id`, `POST /auth/logout-all` in `modules/auth.ts` |
| TOTP multi-factor (RFC 6238 via `otpauth`) with **8 single-use recovery codes** (consumed via `usedAt`)                                                                                                                                   | `packages/auth/src/totp.ts`, `modules/auth.ts`                                                  |
| MFA step-up — a TOTP-enabled account gets an MFA-pending session at login that is locked to `/auth/mfa*`, `/auth/logout*` and `GET /auth/me` until the code is verified; any other request fails 403 `MFA_REQUIRED`                       | `isMfaExemptPath`/`requireAuth`, `apps/web/src/server/guards.ts`                                |
| MFA-protected privileged roles — `MODERATOR`, `VERIFICATION_OFFICER`, `SUPPORT`, `SUPER_ADMIN` must have a MFA-satisfied session for privileged endpoints                                                                                 | `MFA_PROTECTED_ROLES`, `requireSystemPermission`, `requireOrgMembership`                        |
| Email verification required for gated actions; inactive accounts (`SUSPENDED`/`BANNED`/`DELETED`) get 403                                                                                                                                 | `requireVerifiedEmail`, `requireAuth`, `guards.ts`                                              |

## 3. Authorization

- **Granular RBAC matrix** — system role → permission strings
  (`volunteer.profile.read`, `opportunity.publish`, `hours.verify`, …) defined
  in `packages/domain/src/rbac.ts`; organization roles grant permissions through
  `canPerformOrgAction`; sponsor workspaces use `SPONSOR_ROLE_PERMISSIONS`.
  Enforced server-side on every request; frontend permission maps are display
  logic only (`guards.ts` docblock).
- **MFA-gated privilege** — privileged system roles cannot use their elevated
  endpoints without a MFA-satisfied session (see table above).
- **Deactivated memberships** — a non-ACTIVE `OrganizationMember` row does not
  silently retain platform-granted access to that tenant; platform admins act
  through dedicated `/admin/*` endpoints (`requireOrgMembership`, `guards.ts`).

## 4. Multi-tenancy

- `OrganizationMember` rows are the **only** source of organization permissions;
  membership is resolved from the database on each request, never from client
  claims (`requireOrgMembership`).
- `orgId` path/query values are validated as identifiers before reaching a UUID
  column, and client-supplied organization ids are treated as hints
  (`resolveOrgId`, `guards.ts`; `ARCHITECTURE.md` §4).
- Sponsor workspaces check `SponsorMember` rows the same way
  (`requireSponsorPermission`).

## 5. CSRF and origin enforcement

- Primary defence: `SameSite=Lax` `HttpOnly` cookies (`cookies.ts`).
- Defence in depth: for `POST`/`PUT`/`PATCH`/`DELETE`, the `Origin` header (when
  present) must match the request origin or the `APP_URL`/`PUBLIC_APP_URL`/host
  allowlist, otherwise 403 — `assertSameOrigin`, `apps/web/src/server/http.ts`.
  Requests without `Origin` (mobile `Authorization: Bearer` clients) pass, as
  they cannot be forged through cookies.
- The health probe opts out explicitly (`skipOriginCheck` on `GET /health`,
  `routes/core.ts`).

## 6. Rate limiting

- Tiered sliding-window limiter (`RATE_LIMIT_TIERS`, `packages/auth/src/rate-limit.ts`):
  `public` 120/min, `authenticated` 300/min, `auth` 10/min,
  `passwordReset` 5/15 min, `search` 40/min, `messaging` 60/min,
  `upload` 20/min, `admin` 120/min, `qrVerification` 30/min.
- Applied centrally before handlers, keyed by tier + client IP with a separate
  bucket for requests carrying the access cookie (`enforceRateLimit`,
  `http.ts`); every route defaults to the `public` tier.
- Sign-in additionally keeps a per-account bucket that is reset only on
  successful authentication (`modules/auth.ts`).
- Client IP honours `x-forwarded-for` only when `TRUST_PROXY=true` (`clientIp`,
  `http.ts`). The limiter is in-process; the file documents swapping a
  Redis-backed adapter behind the same interface for multi-node deployments.

## 7. Input validation and data integrity

- **Zod on every write and every read of client input**: request bodies, query
  strings and path parameters go through `body()`/`query()`/`pathParams()` in
  `http.ts`, with shared schemas in `packages/validation`.
- Validation failures become `VALIDATION_ERROR` with a safe field list
  (`{path, code, message}`) — `packages/validation/src/errors.ts`; stack traces
  are never serialised to clients (`errorResponse`, `http.ts`).
- Status transitions are explicit state machines
  (`packages/domain/src/state-machines.ts`); illegal transitions throw
  `BUSINESS_RULE_ERROR` (422).
- `VolunteerHour` records are append-only: revoking verified hours creates a
  superseding record instead of an edit (`ARCHITECTURE.md` §6,
  `POST /orgs/:orgId/hours/:hourId/revoke`).
- Storage keys must match a strict charset and must not contain `..`
  (`assertKey`, `apps/web/src/server/infra/storage.ts`; mirrored as a Zod
  `refine` on `storageKey` in `modules/documents.ts`).

## 8. Audit logging

- `apps/web/src/server/services/audit.ts` records actor → action → resource →
  before/after snapshot → IP → user agent → `requestId`.
- **Append-only**: the `AuditLog` model has no update or delete API anywhere in
  this codebase (stated in the file's docblock and enforced by simply never
  exposing one); readable at `GET /admin/audit`.
- Audit writes are best-effort with loud failure logging, so a broken audit
  table cannot take a user action down silently.
- Sensitive flows audited at the call site: auth events, admin user/organization
  actions, settings/flag changes, content changes, payments, report decisions,
  certificate revocation, incident updates (grep `audit(` in `modules/*`).

## 9. Data privacy

- **Masking helpers** — `maskEmail`/`maskPhone`/`maskName`
  (`packages/utils/src/mask.ts`); moderation queues mask reporter emails
  (`maskReporter`, `modules/reports.ts`).
- **Public verification returns minimal data** — `/public/verify` exposes only
  holder/organization name, hours and status; "no PII beyond" that is a design
  rule in `modules/public.ts`; certificate metadata by id explicitly carries
  "no contact data".
- **Consent ledger** — registration persists `PrivacyConsent` rows per purpose
  (`terms`, `privacy_policy`, `data_processing`, optional `marketing_email`)
  with the `POLICY_VERSION` and client IP (`modules/auth.ts`; checkbox UI in
  `ui/components/register-form.tsx`).
- **Minors (Law 18-07)** — the date of birth is required at registration; under
  19 (age of majority) the API requires a guardian (name, relationship, email or
  phone) and the `guardian_consent` purpose, stored in `GuardianConsent`; under
  13 registration is refused (`registerSchema` in `packages/validation/src/auth.ts`,
  unit-tested in `guardian-consent.test.ts`). The guardian's own confirmation by
  email/SMS is pending email delivery (`GuardianConsent.confirmedAt`).
- **AI document gate (GDPR)** — personal documents are only ever sent to an
  external AI provider when `AI_SEND_DOCUMENTS=true`; otherwise the call fails
  with `CONFIG_ERROR` (`checkDocument`, `apps/web/src/server/infra/ai.ts`).
  Rule-based local providers are the default (`AI_PROVIDER` unset).
- **Data rights** — `PATCH /me/privacy` for visibility settings and
  `POST /me/data-request` for export/deletion requests (`modules/volunteers.ts`).

## 10. QR token signing and rotation

- QR payloads are signed: `bladna:<kind>:<id>` + HMAC-SHA256 truncated to 32
  hex characters, verified with `timingSafeEqual`
  (`apps/web/src/server/infra/qr.ts`), keyed by `QR_SIGNING_SECRET`
  (falls back to `SESSION_SECRET`, then `AUTH_SECRET` — `env.ts`).
- Attendance session QR codes **rotate on reissue**: the stored session secret
  hash changes and old images stop verifying; sessions can be revoked
  (`modules/attendance.ts` route summaries and header comments).
- Public verification tokens/certificate numbers are random or deterministic
  strings, never sequential ids (`ARCHITECTURE.md` §6).

## 11. Payments

- Only **`bank_transfer`** (manual confirmation with a state machine) and
  **`free`** (zero-amount) are functional; commercial gateways
  (`stripe`, `paypal`, `cib`, `edahabia`) return `CONFIG_ERROR` until real
  credentials exist — "never a fake _payment successful_"
  (`apps/web/src/server/infra/payments.ts` docblock).
- The org payment endpoint accepts `free` or `bank_transfer` only
  (`POST /orgs/:orgId/payments`, `modules/billing.ts`); the payment ledger is
  append-only and admin transitions (confirm/fail/refund) are audited.

## 12. File storage and uploads

- `FileStorageService` drivers: `local` (implemented, `STORAGE_LOCAL_DIR`) and
  `s3` (returns `CONFIG_ERROR` until credentials are wired — no silent fake
  uploads) (`apps/web/src/server/infra/storage.ts`).
- Uploads pass a validation gate — size cap `MAX_UPLOAD_BYTES` = 10 MiB, MIME
  allowlist (`ALLOWED_UPLOAD_TYPES`: png/jpeg/webp/pdf), magic bytes, extension
  agreement, sha256 — before storage (`infra/upload.ts`, unit-tested).
- Validated documents land `AVAILABLE` with `organizationId` set; ownership for
  `/me/*` rows comes from the session, never the payload (`modules/documents.ts`
  header comment). `PENDING_SCAN`/`QUARANTINED` remain reserved for a real scan
  stage that does not exist yet.

## 13. HTTP headers and transport

- `x-content-type-options: nosniff` on every response — API JSON (success and
  error), raw exports (`json()`/`errorResponse()` in `http.ts`, CSV export in
  `modules/impact.ts`), pages and metadata — set both per-builder and centrally
  by `src/proxy.ts`.
- `X-Powered-By` disabled (`poweredByHeader: false`, `apps/web/next.config.ts`).
- Cookies become `Secure` automatically in production (`cookies.ts`).
- Site-wide headers applied by `src/proxy.ts` to **every** response: a
  per-request nonce **Content-Security-Policy** on documents (`strict-dynamic`;
  scripts are never `'unsafe-inline'`; `frame-ancestors 'none'`,
  `base-uri`/`form-action`/`object-src` locked), a `default-src 'none'` policy on
  API responses, **HSTS** `max-age=31536000; includeSubDomains`,
  `X-Frame-Options: DENY`, `Referrer-Policy: strict-origin-when-cross-origin` and
  a `Permissions-Policy` (camera/geo `self` for the QR scanner and location
  pickers; microphone/payment/usb off). Uploaded files keep their own stricter
  `sandbox` CSP — overlapping policies only intersect tighter. Verified live:
  header probes on page/redirect/API/robots from `next start`, and the rendered
  HTML carries the response nonce on 17/17 executable scripts (the 18th tag is a
  non-executable `application/json` data block). TLS termination remains a
  reverse-proxy concern.

## 14. Secrets and configuration handling

- Typed environment access fails fast with a clear message and **never logs
  secret values** (`apps/web/src/server/env.ts` header and `required()`).
- `AUTH_SECRET` must be at least 32 characters or boot-time access checks throw
  (`env.ts`).
- `AppError.internal` carries details only in `internalMessage`, which is
  written to server logs alongside the `requestId`; API clients receive the
  generic "An unexpected error occurred." (`packages/types/src/api.ts`,
  `errorResponse`, `http.ts`).
- `.env` is git-ignored; only `.env.example` (placeholders) is committed
  (`.gitignore`).

## 15. Known gaps (honest inventory)

- Rate limiting and the queue/cache are in-process unless `REDIS_URL` is set;
  per-node budgets apply until the Redis adapter is wired.
- SMTP transport and the S3 storage driver intentionally return
  `CONFIG_ERROR`/`NOT_IMPLEMENTED` rather than pretending to succeed
  (`infra/email.ts`, `infra/storage.ts`).
- Integration/E2E security regression tests are env-guarded and require a live
  database (`ARCHITECTURE.md`, `IMPLEMENTATION_CHECKLIST.md`).

## 16. Reporting a vulnerability

- Please report suspected vulnerabilities privately before any public
  disclosure: use the repository's private security-advisory channel (GitHub
  _Security_ → _Advisory_ → _Draft a new security advisory_) or contact the
  maintainers directly, and include reproduction steps and the affected
  endpoint (`/api/v1/...`) where possible.
- Do not include real personal data or live credentials in a report.
- Valid reports are acknowledged, fixed, and the fix is noted in the release
  notes; disclose only after a fix is deployed or by prior agreement.
