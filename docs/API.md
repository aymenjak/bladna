# BLADNA — API conventions and endpoint reference

Source of truth for behaviour: `apps/web/src/server/http.ts` (pipeline, envelopes),
`packages/types/src/api.ts` (envelope + error model), `apps/web/src/server/router.ts`
(dispatch), and the route tables under `apps/web/src/server/routes/`. Endpoint lists
in this document are generated from the route tables as they stand today; when in
doubt, query **`GET /api/v1/meta`**, which self-describes every registered route.

## Base URL and versioning

- All API endpoints live under **`/api/v1`** (single Next.js catch-all handler:
  `apps/web/src/app/api/v1/[[...segments]]/route.ts`).
- Paths below are relative to that prefix, e.g. `GET /auth/me` = `GET /api/v1/auth/me`.
- Breaking changes will ship under a new prefix (`/api/v2`); `/api/v1` is stable.

## Response envelopes

Defined in `packages/types/src/api.ts`; every JSON response uses one of them.

**Success**

```json
{ "success": true, "data": { "…": "…" }, "meta": { "requestId": "…" } }
```

- `data` — the resource or list payload.
- `meta` — optional; always carries `requestId` from the handler wrapper, and
  pagination fields on list endpoints (see below).

**Failure**

```json
{ "success": false, "error": { "code": "VALIDATION_ERROR", "message": "…", "details": [] } }
```

- `error.code` — stable machine-readable code (table below).
- `error.message` — human-readable, safe to display.
- `error.details` — optional structured details (field paths for validation);
  stack traces are never returned — internal details are logged with the
  `requestId` only (`errorResponse` in `http.ts`).

**Exceptions to the envelope** (intentional):

- `GET /health` returns a raw probe document (`{ status, database, latencyMs, … }`).
- Binary/raw endpoints (PDF, QR PNG, CSV, document bytes) return the raw body with
  dedicated headers — handlers throw `RawResponse`.

## Error codes and HTTP status mapping

From `HTTP_STATUS_BY_ERROR_CODE` in `packages/types/src/api.ts`:

| `error.code`             | HTTP status | Typical cause                                                          |
| ------------------------ | ----------- | ---------------------------------------------------------------------- |
| `VALIDATION_ERROR`       | 400         | Body/query/path failed Zod validation; malformed JSON                  |
| `UNAUTHORIZED`           | 401         | Missing/invalid/expired/revoked access token                           |
| `FORBIDDEN`              | 403         | Authenticated but not permitted; inactive account; origin check failed |
| `MFA_REQUIRED`           | 403         | TOTP enabled but not satisfied on this session (step-up required)      |
| `NOT_FOUND`              | 404         | Unknown endpoint or resource                                           |
| `METHOD_NOT_ALLOWED`     | 405         | Path exists but not for this HTTP method (router emits this)           |
| `CONFLICT`               | 409         | Duplicate active application, QR replay, unique-constraint clash       |
| `RATE_LIMITED`           | 429         | Tier budget exhausted                                                  |
| `PAYLOAD_TOO_LARGE`      | 413         | Upload above the configured limit                                      |
| `UNSUPPORTED_MEDIA_TYPE` | 415         | Content type outside the upload allowlist                              |
| `BUSINESS_RULE_ERROR`    | 422         | Illegal state-machine transition or invariant violation                |
| `INTERNAL_ERROR`         | 500         | Unexpected failure (message is generic; details only logged)           |
| `CONFIG_ERROR`           | 500         | Missing integration credentials (operator-facing, no secrets)          |
| `NOT_IMPLEMENTED`        | 501         | Capability intentionally not wired in this build                       |
| `EXTERNAL_SERVICE_ERROR` | 502         | Upstream provider failure                                              |

Factories: `AppError.validation()`, `.unauthorized()`, `.forbidden()`, `.conflict()`,
`.rateLimited()`, `.mfaRequired()`, `.businessRule()`, `.config()`, `.notImplemented()`,
`.notFound()`, `.internal()` in `packages/types/src/api.ts`.

## Request pipeline

Every request passes through `apiHandler` (`apps/web/src/server/http.ts`):

1. Request ID — `x-request-id` header if supplied, otherwise a generated UUID;
   echoed in success `meta` and on error responses as the `x-request-id` header.
2. Rate limit — tiered (table below), default tier `public`.
3. Origin check — same-origin enforcement for mutating methods (CSRF defence,
   see below); skipped only for routes marked `skipOriginCheck` (`/health`).
4. Authentication/authorization — guards in `apps/web/src/server/guards.ts`
   (documentation-only `auth` markers on routes, enforcement inside handlers).
5. Validation — Zod on body, query and path parameters.
6. Handler → success envelope, or `AppError` → failure envelope.

## Authentication

- **Access token**: short-lived JWT (HS256 via `jose`), claims `sub` (user id),
  `sid` (session id), `jti` (token id), `roles`, `type: "access"`.
  TTL: `ACCESS_TOKEN_TTL` (default 900 s).
  - Cookie **`bladna_at`** — `HttpOnly`, `SameSite=Lax`, `Secure` in production,
    path `/` (optional `COOKIE_DOMAIN`); used by the browser app.
  - Or **`Authorization: Bearer <jwt>`** for mobile/API clients
    (`readBearerToken` in `apps/web/src/server/cookies.ts`).
- **Refresh token**: 256-bit opaque value in cookie **`bladna_rt`** (same
  attributes, TTL `REFRESH_TOKEN_TTL`, default 30 days). Stored server-side only
  as a SHA-256 hash; each `POST /auth/refresh` rotates it and rotates the access
  `jti`, so previous access JWTs stop validating immediately. Presenting a
  previously rotated refresh token revokes the whole session family (reuse
  detection — `apps/web/src/server/services/sessions.ts`).
- Locale cookie: **`bladna_locale`** (not an auth credential).

### MFA flow

1. `POST /auth/login` with correct credentials on a TOTP-enabled account
   (without a `totpCode`) returns `200` with
   `{ "user": …, "mfaRequired": true }` and sets an **MFA-pending** session —
   the session is locked to MFA endpoints only.
2. Complete the challenge with `POST /auth/mfa/verify` (TOTP code or a recovery
   code); this marks the session `mfaSatisfied` and subsequent requests pass.
3. Until satisfied, any other request fails with **403 `MFA_REQUIRED`**.
   Exempt paths (allowed pre-MFA): `/auth/mfa/*`, `/auth/logout*`, and
   `GET /auth/me` (which reports `mfaRequired` so clients can render the code
   screen) — `isMfaExemptPath` in `guards.ts`.
4. Privileged system roles (`MODERATOR`, `VERIFICATION_OFFICER`, `SUPPORT`,
   `SUPER_ADMIN` — `MFA_PROTECTED_ROLES`) additionally require a
   MFA-satisfied session for privileged endpoints, even when TOTP was only just
   enrolled.

### Authorization markers

Route tables carry a documentation-only `auth` marker: `public` · `authenticated` ·
`org` · `sponsor` · `admin`. Real enforcement is server-side in every handler:
system permissions from the RBAC matrix (`packages/domain/src/rbac.ts`) and
organization scope resolved from `OrganizationMember` rows (`requireOrgMembership`).

## Pagination

- List endpoints accept **`?page=`** and **`?limit=`**
  (`paginationQuerySchema`, `normalizePageParams` in `packages/utils/src/pagination.ts`).
- Defaults: `page = 1`, `limit = 20`; `limit` is capped at **100**; invalid or
  missing values fall back to the defaults (never an error).
- Success `meta` on list endpoints:

```json
{ "page": 1, "limit": 20, "total": 137, "totalPages": 7, "requestId": "…" }
```

- One exception: messaging history uses an optional keyset **`cursor`** parameter
  (plus `limit`, default 30, max 100) instead of page numbers.

## Validation errors

`VALIDATION_ERROR` (400) with `error.details` as a safe field list —
`toValidationError` in `packages/validation/src/errors.ts`:

```json
{
  "success": false,
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Invalid query parameters.",
    "details": [{ "path": "limit", "code": "too_big", "message": "…" }]
  }
}
```

`message` differs by entry point: body → `"Validation failed."` (or the
schema-specific message), query → `"Invalid query parameters."`, path →
`"Invalid path parameters."`, unparseable JSON → `"Request body must be valid JSON."`

## Rate limits

Tiers from `RATE_LIMIT_TIERS` (`packages/auth/src/rate-limit.ts`); each route
selects one via `options.rateLimit`, defaulting to `public`. Sliding window,
keyed by tier + client IP (requests carrying `bladna_at` get a separate bucket).
Exceeding a tier returns **429 `RATE_LIMITED`** (no `Retry-After` header today).
Client IP comes from `x-real-ip`, or the first `x-forwarded-for` entry when
`TRUST_PROXY=true`.

| Tier             | Limit | Window | Used by (examples)                                                                   |
| ---------------- | ----- | ------ | ------------------------------------------------------------------------------------ |
| `public`         | 120   | 60 s   | Default for every route without an explicit tier                                     |
| `authenticated`  | 300   | 60 s   | Reads for signed-in users, `/auth/refresh`, `/auth/logout`                           |
| `auth`           | 10    | 60 s   | Login, register, password/session/MFA mutations, org/sponsor self-registration       |
| `passwordReset`  | 5     | 15 min | `/auth/forgot-password`, `/auth/reset-password`, verification resend, member invites |
| `search`         | 40    | 60 s   | Search endpoints (reserved)                                                          |
| `messaging`      | 60    | 60 s   | Starting conversations, sending messages                                             |
| `upload`         | 20    | 60 s   | `POST /me/documents`, `POST /orgs/:orgId/documents` (validated base64 upload)        |
| `admin`          | 120   | 60 s   | Admin surfaces (reserved; most admin routes use `authenticated`/`auth`)              |
| `qrVerification` | 30    | 60 s   | QR/public verification tier (reserved)                                               |

Login additionally maintains a per-account bucket that is cleared on
successful sign-in (`rateLimiter.reset(accountKey)` in `modules/auth.ts`).

## Locale

- Send **`x-locale: ar | fr | en`** to control the language of generated
  content (emails, messages). The API defaults to **`ar`** when absent
  (`buildContext` in `http.ts`).
- Server-rendered pages derive the locale from the `/ar|/fr|/en` path prefix
  (`src/proxy.ts`) and persist it in the `bladna_locale` cookie.

## CSRF and origin notes

- Auth cookies are `SameSite=Lax` (primary CSRF defence).
- Defence in depth: for **mutating methods** (`POST`, `PUT`, `PATCH`, `DELETE`)
  the `Origin` header, when present, must match the request origin or one of
  `APP_URL` / `PUBLIC_APP_URL` / the request host — otherwise **403 `FORBIDDEN`**
  (`assertSameOrigin` in `http.ts`). Requests without an `Origin` header
  (mobile clients using `Authorization: Bearer`) pass, as they cannot be
  CSRF'd via cookies.
- Set `APP_URL` (and `PUBLIC_APP_URL` when they differ) correctly in production.

## Discovery and health

- **`GET /api/v1/meta`** — `{ ok, api: "bladna", version: "v1", routes: [...] }`
  inside the success envelope; each entry: `{ method, path, auth, summary }`.
- **`GET /api/v1/health`** — raw probe: `200 { status: "ok", database: "up" }` or
  `503 { status: "degraded", database: "down" }` (bounded 3 s database ping).

---

# Endpoint reference

Route tables: `routes/core.ts`, `routes/platform.ts` and `routes/participants.ts`
are all registered in `app/api/v1/[[...segments]]/route.ts`, plus `GET /meta`.
The tables below were extracted from `apps/web/src/server/modules/*.ts`; if they
disagree with a live server, `GET /api/v1/meta` wins.

## Platform (registered)

- `GET /health` — database health probe (public, raw body, origin check skipped)
- `GET /meta` — self-describing route index (public)

## Auth (core — registered)

- `POST /auth/register` — create an account (terms/privacy consent recorded; `dateOfBirth` required, and under 19 a `guardian` plus the `guardian_consent` purpose — Law 18-07)
- `POST /auth/login` — sign in; returns `mfaRequired: true` when a TOTP step-up is pending
- `POST /auth/mfa/verify` — verify a TOTP code or recovery code
- `POST /auth/refresh` — rotate the refresh token and access JWT
- `POST /auth/logout` — revoke the current session
- `POST /auth/logout-all` — revoke every session of the user
- `POST /auth/verify-email` — confirm email via token
- `POST /auth/verify-email/resend` — resend the confirmation email
- `POST /auth/forgot-password` — request a password-reset link
- `POST /auth/reset-password` — reset a password via token
- `POST /auth/change-password` — change password while signed in
- `POST /auth/two-factor/setup` — begin TOTP enrolment
- `POST /auth/two-factor/enable` — confirm TOTP and issue recovery codes
- `POST /auth/two-factor/disable` — disable TOTP
- `GET /auth/two-factor/status` — MFA status
- `GET /auth/me` — current identity (reports `mfaRequired` pre-step-up)
- `PATCH /auth/me` — update basic profile
- `GET /auth/sessions` — list active sessions
- `DELETE /auth/sessions/:id` — revoke one own session

## Taxonomies (core — registered)

- `GET /taxonomies/skills`
- `GET /taxonomies/languages`
- `GET /taxonomies/interests`
- `GET /taxonomies/categories`

## Locations (core — registered)

- `GET /locations/countries`
- `GET /locations/wilayas`
- `GET /locations/cities` — paginated (optional `wilayaId`, `q`; optional nearest-first
  lookup `nearLat`+`nearLng`, both required together — results ordered by squared
  distance from that point, used by the “near me” chip)

## Opportunities (core — registered)

- `GET /opportunities` — discovery: filters + full-text search, paginated (public; filters
  include `organizationId` and `campaignId` to scope by tenant or campaign, and `needs=
VOLUNTEERS|ANY|FINANCIAL|EQUIPMENT|MATERIAL|SERVICE` for the spec §11 support-need filters —
  `VOLUNTEERS` = open volunteer capacity + open deadline, `ANY` = declares any support need,
  the rest match a declared need; list items carry `acceptedCount` (joined volunteers)
  alongside `capacity`; `mode=map` returns only map fields (`id`, `slug`, localized titles,
  `latitude`/`longitude`, `wilayaId`, `cityId`, `categoryId`, `locationType`, `type`) and —
  for a city-level pin — `latitude`/`longitude` fall back to the city's coordinates when
  the initiative has none, so no `null`/`0,0` point is ever returned; the city relation
  itself is stripped from the response); optional viewport filter
  `bounds=minLng,minLat,maxLng,maxLat` (WGS84 degrees, `min ≤ max` on both axes, 400 on
  anything else) narrows results to a map viewport — matched against the initiative's own
  point, or its city's coordinates for an ungeocoded city-level pin, i.e. exactly the rows
  `mode=map` can render inside that viewport; used by the map's "search this area")
- `GET /opportunities/:slug` — detail by slug (public); the response carries the initiative
  narrative (`problem*`/`objective*` localized triplets), `coverImage`, initiative contact
  (`contactName`/`contactPhone`/`contactEmail`, falling back to the organizer), declared
  `supportNeeds` (with honest `progress`/`acceptedOffers`/`acceptedAmount` aggregates),
  self-reported `impactMetrics` (`verified=false` until the platform verifies them) and the
  organizer's `organizationType` (actor label rendered next to the organizer name)
- `POST /opportunities/:slug/view` — count a detail view (public)
- `GET /orgs/:orgId/opportunities` — tenant list (org)
- `POST /orgs/:orgId/opportunities` — create (DRAFT) (org)
- `POST /orgs/:orgId/opportunities/bulk-transition` — apply one transition to many (org)
- `GET /orgs/:orgId/opportunities/:id` — tenant detail, same response shape as the public
  detail incl. `organizationType` and narrative/contact fields (org)
- `PATCH /orgs/:orgId/opportunities/:id` — update (org)
- `DELETE /orgs/:orgId/opportunities/:id` — soft-delete draft/rejected/archived (org)
- `POST /orgs/:orgId/opportunities/:id/transition` — state-machine transition (org);
  review-before-publish: `PUBLISH`/`REJECT` need `opportunity.moderate`, so organizations
  only submit for review, withdraw and steer their own lifecycle
- `GET /admin/opportunities` — platform list across all tenants (`q`/`status`/`organizationId`,
  paginated; `opportunity.read:platform`)
- `POST /admin/opportunities/:id/action` — platform moderation: `PUBLISH`/`REJECT`/`SUSPEND`/
  `RESTORE` through the same state machine; `reason` required for `REJECT`/`SUSPEND`; reaching
  `PUBLISHED` requires a verified, non-suspended organization (`opportunity.moderate`,
  audited `AdminAction`)

## Applications (core — registered)

- `POST /opportunities/:slug/applications` — apply to a published opportunity
- `GET /me/applications` — own applications
- `GET /me/applications/:id` — own application detail
- `POST /me/applications/:id/withdraw` — withdraw own application
- `GET /orgs/:orgId/opportunities/:id/applications` — review queue per opportunity (org)
- `GET /orgs/:orgId/applications/:applicationId` — application detail, org view (org)
- `POST /orgs/:orgId/applications/:applicationId/status` — status transition (org)
- `POST /orgs/:orgId/applications/bulk` — bulk decisions (org)

## Initiative support needs & offers (core — registered)

Declared needs on an initiative (spec §5) and traceable offers against them (spec §13).
FINANCIAL needs carry a `targetAmount`; equipment/material/service needs carry an optional
`quantity` + owner-maintained `fulfilled` progress (never both kinds of measure). Nothing
moves money: a financial offer is a pledge toward an outside bank transfer (spec §33).

- `GET /orgs/:orgId/opportunities/:id/support-needs` — list declared needs (`kind` filter,
  paginated; includes `pendingOffers`/`acceptedOffers`/`acceptedAmount` aggregates; org)
- `POST /orgs/:orgId/opportunities/:id/support-needs` — declare a need: `{ kind, labelAr,
labelFr, labelEn, description?, quantity?, fulfilled?, targetAmount?, currency?, sortOrder? }`
  with deterministic rules: `FINANCIAL` requires `targetAmount` (and forbids `quantity`);
  other kinds forbid `targetAmount` (org, audited)
- `PATCH /orgs/:orgId/opportunities/:id/support-needs/:needId` — partial update, merged over
  the existing row and re-validated through the same rules (also how the owner advances
  `fulfilled` progress; `fulfilled ≤ quantity` enforced) (org, audited)
- `DELETE /orgs/:orgId/opportunities/:id/support-needs/:needId` — remove a declared need
  (cascades its offers; org, audited)
- `POST /opportunities/:slug/support-offers` — offer support toward one declared need of a
  published initiative: `{ supportNeedId, description, quantity?, amount?, currency?,
contactNote? }`; kind rules enforced server-side — `FINANCIAL` requires `amount` (currency
  must match the need) and forbids `quantity`, the reverse for other kinds; stored `PENDING`
  (authenticated, audited)
- `GET /me/support-offers` — the offerer's own history with initiative/need context
  (paginated, `status` filter)
- `POST /me/support-offers/:id/cancel` — offerer cancels their own still-`PENDING` offer
  (becomes `CANCELLED`, kept for the trace; 422 otherwise)
- `GET /orgs/:orgId/opportunities/:id/support-offers` — offers against one initiative
  (`status` filter, paginated; offerer identity masked via `maskName`/`maskEmail`;
  `contactNote` is the offerer-provided coordination channel; org)
- `POST /orgs/:orgId/opportunities/:id/support-offers/:offerId` — decision `{ action:
ACCEPT|REJECT, reason? (required for REJECT) }`; `PENDING → ACCEPTED|REJECTED`, both
  terminal (422 otherwise; sets `decidedById`/`decidedAt`; org, audited
  `support.offer.decide`)
- `POST /support-offers` — body-addressed alternative to the slug path: `{ supportNeedId,
description, quantity?, amount?, currency?, contactNote?, organizationId? }`; identical
  kind rules (shared validator), the need must sit on a published initiative, and
  `organizationId` offers on behalf of that tenant — membership required, the acting
  member stays `userId` and the audit actor; stored `PENDING` (authenticated, audited
  `support.offer.create`)

## Campaigns (platform — registered)

- `GET /campaigns` — public campaigns (never DRAFT)
- `GET /campaigns/:id` — public detail; the response also carries a `funding` block
  (`confirmedAmount`/`confirmedCount`, `pendingAmount`/`pendingCount`, `budget`, `currency`) —
  aggregates only, never donor PII (public)
- `POST /campaigns/:id/participants` — join as a volunteer
- `POST /campaigns/:id/participants/leave` — withdraw
- `POST /campaigns/:id/contributions` — record a bank-transfer contribution: `{ amount
(100…1e9), currency (must equal the campaign's), reference?, note? }`; stored `PENDING`
  until the organization decides; duplicate `reference` per campaign → 409; ACTIVE campaigns
  only (authenticated)
- `POST /campaigns/:id/contributions/:cid/cancel` — donor cancels their own still-`PENDING`
  contribution (terminal states → 422; audited)
- `GET /admin/campaigns` · `GET /admin/campaigns/:id` — platform list/detail
- `GET /orgs/:orgId/campaigns` · `POST /orgs/:orgId/campaigns` — tenant list/create
- `GET /orgs/:orgId/campaigns/:id` · `PATCH /orgs/:orgId/campaigns/:id` — tenant detail/update
- `POST /orgs/:orgId/campaigns/:id/transition` — state-machine transition
- `GET /orgs/:orgId/campaigns/:id/participants` — roster
- `GET /orgs/:orgId/campaigns/:id/contributions` — contribution ledger (`status` filter,
  paginated; donors masked via `maskName`/`maskEmail`; `organization.billing.manage`)
- `POST /orgs/:orgId/campaigns/:id/contributions/:cid` — decision `{ action:
CONFIRM|REJECT, reason? (required for REJECT) }`; `PENDING → CONFIRMED|REJECTED`, both
  terminal (422 otherwise; sets `decidedById`/`decidedAt`; `organization.billing.manage`,
  audited `campaign.contribution.decide`)

## Impact (platform — registered)

- `GET /impact` — platform totals computed from persisted rows (public)
- `GET /impact/metrics` — paginated metric list (public; filters: `campaignId`,
  `csrProgramId`, `opportunityId`)
- `GET /orgs/:orgId/impact/report` — organization report (`json`/`csv`)
- `GET /sponsors/:sponsorId/impact/report` — sponsor report (`json`/`csv`)
- `POST /orgs/:orgId/campaigns/:campaignId/metrics` — record a campaign metric
- `POST /orgs/:orgId/opportunities/:id/metrics` — record an initiative (opportunity)
  metric: `campaignId`/`csrProgramId` are rejected here; stored `verified=false` and
  surfaced on the public initiative detail (spec §14) (org, audited)
- `POST /sponsors/:sponsorId/programs/:programId/metrics` — record a CSR metric

## Sponsors (platform — registered)

- `GET /sponsors` — active sponsors (public)
- `POST /sponsors` — self-register a sponsor: verified email + §54 consents;
  lands `PENDING` (only the platform can activate); the registrant is seated as
  `SPONSOR_ADMIN` of the new workspace; audited `sponsor.create`
- `GET /sponsors/:sponsorId` — detail (workspace or public)
- `PATCH /sponsors/:sponsorId` — update profile (workspace)
- `POST /sponsors/:sponsorId/status` — archive/restore (state machine)
- `GET /sponsors/:sponsorId/members` · `POST /sponsors/:sponsorId/members` · `DELETE /sponsors/:sponsorId/members/:memberId` — workspace members
- `GET /sponsors/:sponsorId/sponsorships` · `POST /sponsors/:sponsorId/sponsorships` —
  list/propose (PROPOSED); the body carries `kind: CASH|IN_KIND` (default `CASH`) plus
  `description` — CASH requires `amount > 0`, IN_KIND requires a non-empty `description`
  (goods/services contributed; `amount` is then its estimated value and may be 0)
- `POST /sponsors/:sponsorId/sponsorships/:id/transition` — sponsorship transition
- `GET /orgs/:orgId/sponsorships` — sponsorships targeting this organization's campaigns
- `GET /admin/sponsors` · `POST /admin/sponsors` · `GET /admin/sponsors/:id` · `PATCH /admin/sponsors/:id` · `POST /admin/sponsors/:id/status` — platform management

## CSR (platform — registered)

- `GET /csr/programs` — public programs (ACTIVE/COMPLETED)
- `GET /csr/programs/:id` — public detail
- `GET /sponsors/:sponsorId/programs` · `POST /sponsors/:sponsorId/programs` — workspace list/create (DRAFT)
- `GET /sponsors/:sponsorId/programs/:programId` · `PATCH /sponsors/:sponsorId/programs/:programId` — detail/update
- `POST /sponsors/:sponsorId/programs/:programId/transition` — state-machine transition

## Partnerships & CSR ecosystem (platform — registered)

M2 of `docs/PARTNERSHIPS-CSR-DESIGN.md`: the economic profile, match reads, the
request → proposal → partnership lifecycle, obligations, numbered agreements, funding,
in-kind and evidence. Every write is audited (notifications wire up in M4); transitions
take `{ action: <target status>, reason? }` and are validated against the state machines
in `@bladna/domain` (reason required for `REJECTED`/`WAIVED`/`BREACHED`/`CANCELLED`/
`TERMINATED`); access is two-sided — `requireScopedActor` resolves which side of the
partnership the caller may act on (member without the permission ⇒ 403 naming it,
outsider ⇒ 404).

**Economic institution profile & match reads**

- `GET /orgs/:orgId/economic-profile` — profile with its focus set and preferred wilayas
  (org members; `null` until created)
- `PATCH /orgs/:orgId/economic-profile` — upsert of the supplied fields (at least one;
  sector/company size/CSR contacts/budgets/preferred sets; budget range validated;
  `economic.profile.manage`, creates on demand, audited `ECONOMIC_PROFILE_UPDATED`)
- `POST /orgs/:orgId/economic-profile/activate` — ensure the profile and derive the
  1:1 `Sponsor` bridge (slug/legal names inherited from the organization; OWNER/ADMIN
  only, idempotent, audited `ECONOMIC_PROFILE_ACTIVATED`)
- `PUT /orgs/:orgId/economic-profile/focus-areas` — full replacement of the focus set as
  `{ areas: [{ focusAreaId, priority }] }` (empty clears; OWNER/MANAGER, audited
  `ECONOMIC_FOCUS_AREAS_UPDATED`)
- `GET /csr-focus-areas` — active seeded trilingual focus vocabulary (public)
- `GET /admin/csr-focus-areas` · `POST /admin/csr-focus-areas` · `PATCH /admin/csr-focus-areas/:id` · `DELETE /admin/csr-focus-areas/:id` — platform
  vocabulary management (`content.manage`; unique `code` on create, code immutable,
  delete refuses while referenced — deactivate instead; audited `CSR_FOCUS_AREA_*`)
- `GET /orgs/:orgId/partner-matches?minScore=&wilayaId=` — the economic institution's
  matched initiatives (score desc, paginated; `partner.match.read`)
- `GET /opportunities/:id/partner-matches?minScore=` — the initiative's matched economic
  institutions (initiative owner or platform grant)
- `GET /partner-matches/:id` — one scorecard with its full explainable `breakdown`
  (both parties; the matching engine and `recompute` land in M3)

**Request → proposal → partnership**

- `POST /partnership-requests` — either party opens a conversation: `{ requesterOrganizationId,
receiverOrganizationId, opportunityId?, supportNeedId?, csrProgramId?, requestedAmount?,
currency?, message }` (requester ≠ receiver; lands `SUBMITTED` with a 30-day review
  window; `partnership.request.create` on the requester org, audited
  `PARTNERSHIP_REQUEST_CREATED`)
- `GET /me/partnership-requests?status=&side=` — requests touching any organization the
  caller belongs to (paginated, org names + initiative title included)
- `GET /orgs/:orgId/partnership-requests?status=&side=` — one tenant's inbox/outbox
- `POST /partnership-requests/:id/transition` — requester acts on `SUBMITTED`/`CANCELLED`,
  the receiver reviews (`UNDER_REVIEW`/`REQUEST_INFO`/`SHORTLISTED`/`NEGOTIATION`/
  `APPROVED`/`REJECTED`/`EXPIRED`); decisions stamp `reviewedAt`/`reviewedById`/`decisionNote`
  (reason required for `REJECTED`; machine-validated, audited)
- `POST /partnership-requests/:id/proposals` — issue a new proposal version: `version++`,
  the request's live versions become `SUPERSEDED` (kept, never rewritten); proposal may
  only be revised while the request is under review/negotiation (either party,
  `partnership.proposal.manage`, audited `PROPOSAL_VERSION_CREATED`)
- `POST /partnership-proposals/:id/transition` — `ACCEPTED` provisions the `Partnership`
  (side roles resolved deterministically: opportunity anchor → else the side holding an
  economic profile → else asker = initiative side) and closes the request `APPROVED`;
  one open partnership per initiative (audited `PROPOSAL_ACCEPTED` + `PARTNERSHIP_CREATED`;
  `REJECTED`/`WITHDRAWN`/`SUPERSEDED` audited with the reason)
- `GET /partnerships?organizationId=&status=&partnershipType=` — partnerships of the
  caller's organizations (or one explicit org scope), paginated
- `POST /partnerships` — direct creation (either side, lands `PROPOSED`; one open
  partnership per initiative + economic org; `partnership.manage`, audited)
- `GET /partnerships/:id` — full detail: both parties, proposal, agreements, obligations,
  commitments with installments and disbursements, in-kind (both sides read)
- `POST /partnerships/:id/transition` — `PROPOSED/ACTIVE/PAUSED ⇄ / COMPLETED / CANCELLED /
TERMINATED` (reason required for `CANCELLED`/`TERMINATED`; either side; audited
  `PARTNERSHIP_TERMINATED` on terminate)

**Obligations & agreements**

- `GET /partnerships/:id/obligations` — both sides read
- `POST /partnerships/:id/obligations` — `{ title, description?, dueDate?, value?,
currency?, party? }`; the party is pinned to the caller's side (platform actors must
  name it); `partnership.obligation.update` (MANAGER+, audited)
- `PATCH /obligations/:id` — edit own party's row while open (`FULFILLED`/`WAIVED`/
  `BREACHED` are closed)
- `POST /obligations/:id/transition` — own party only; reason required for
  `WAIVED`/`BREACHED`, `FULFILLED` stamps `completedAt` (audited)
- `POST /partnerships/:id/agreements` — create with a `Counter`-issued number
  (`AGR-YYYY-######`); either side, `partnership.agreement.manage` (audited)
- `POST /agreements/:id/transition` — `DRAFT → PENDING_SIGNATURE → ACTIVE → EXPIRED|
TERMINATED`; `ACTIVE` stamps `signedAt`/`signedById` and audits `AGREEMENT_SIGNED`

**Funding, in-kind & evidence**

- `POST /partnerships/:id/funding-commitments` — `{ amount, currency?, csrProgramId?,
sponsorshipId?, notes? }` lands `PENDING`; **economic institution only** (youth-side
  members get 403, outsiders 404)
- `POST /funding-commitments/:id/transition` — `COMMITTED` stamps `committedAt` and audits
  `FUNDING_COMMITTED`; reason required for `CANCELLED`/`TERMINATED`
- `GET /funding-commitments/:id/installments` — both sides read
- `POST /funding-commitments/:id/installments` — schedule with `{ amount, dueAt?,
reference? }`, number = max+1 (economic side, `COMMITTED` only, audited)
- `POST /funding-installments/:id/transition` — `{ action: PAID|CANCELLED, paidAt?,
reference?, evidenceDocumentId? }`; `PAID` is terminal (audited
  `FUNDING_INSTALLMENT_PAID`)
- `POST /funding-commitments/:id/disbursements` — schedule a transfer (economic side;
  optional `installmentId` must belong to the commitment; lands `SCHEDULED`)
- `POST /disbursements/:id/transition` — `{ action: EXECUTED, executedAt?, reference?,
evidenceDocumentId? }` (economic side, audits `FUNDING_DISBURSED`)
- `POST /disbursements/:id/verify` — `{ action: VERIFIED|REJECTED, reason? }`;
  **verification officer only** (`impact.evidence.verify`), terminal, reason required
  for `REJECTED`
- `GET /partnerships/:id/in-kind` · `POST /partnerships/:id/in-kind` — both sides read;
  either side registers `{ kind?, item, quantity, unit?, estimatedValue?, marketValue?,
deliveryDate?, deliveryLocation?, notes?, evidenceDocumentId? }` (lands `PLANNED`)
- `POST /in-kind-contributions/:id/transition` — `PLANNED → DELIVERED → RECEIVED →
VERIFIED|REJECTED`: delivery/receipt by either side (`partnership.obligation.update`),
  verification **officer only** (reason required for `REJECTED`; audited `IN_KIND_*`)
- `GET /impact/metrics/:metricId/evidence` · `POST /impact/metrics/:metricId/evidence` —
  the metric's owning tenant (campaign/initiative → organization, program → sponsor)
  reads and attaches `{ type, documentId?, note? }` (at least one; lands `PENDING`;
  audited `EVIDENCE_UPLOADED`)
- `POST /impact-evidence/:id/verify` — `{ action: VERIFIED|REJECTED, reason? }`;
  **verification officer only**, terminal (audited `IMPACT_VERIFIED`/`EVIDENCE_REJECTED`)

## International (platform — registered)

- `GET /international/opportunities` — discover (paginated, public)
- `GET /international/opportunities/:id` — detail (public)
- `GET /international/experiences` — own experiences (always unverified)
- `POST /international/experiences` — declare an experience (optional `role` ≤120 and
  `opportunityId` referencing an existing international offer; always stored unverified)
- `GET /admin/international/opportunities` · `POST /admin/international/opportunities` — platform queue/create (PENDING)
- `GET /admin/international/opportunities/:id` · `PATCH /admin/international/opportunities/:id` — platform detail/update
- `GET /international/countries` — countries with ≥1 visible offer, aggregated
  (`opportunityCount` desc then `nameEn`; `page`/`limit`; public)
- `GET /international/countries/:code` — one country by case-insensitive ISO code (404 when
  unknown) plus its visible offers (deadline asc, nulls last; `page`/`limit`; public)
- `GET /international/providers` — distinct providers of visible offers with counts
  (`q` case-insensitive contains, count desc then provider; `page`/`limit`; public)
- `GET /international/opportunities/:id/eligibility` — deterministic eligibility result
  (authenticated; checks age → language → experience → availability → documents; 404 for
  hidden/missing offers, 422 until the volunteer profile exists)
- `GET /international/recommendations` — personalized recommendation strip (authenticated;
  `limit` 1–12, default 6; reasons `category`/`country`/`international_interest`)
- `GET /international/applications` — own international applications (authenticated;
  `status` filter, `page`/`limit`, `submittedAt` desc, nested `opportunity.country`)
- `POST /international/applications` — apply to an offer (authenticated; `opportunityId`,
  optional `motivationLetter` ≤4000 / `languages` ≤200 / `availability` ≤500 /
  `previousExperience` ≤2000, required `passportReadiness`; duplicate → 409, closed offer or
  age failure → 422, hidden/missing → 404)
- `GET /international/applications/:id` — own application detail (authenticated; 404)
- `POST /international/applications/:id/withdraw` — withdraw own application (authenticated;
  allowed from DRAFT/SUBMITTED/UNDER_REVIEW/SHORTLISTED/INTERVIEW/WAITLISTED, 422 otherwise)
- `GET /international/passport` — readiness, safety toggles, preferences, date of birth,
  stats (`countries`/`programs`/`verifiedHours`/`certificates`) and the 10 newest
  experiences (authenticated; 422 until the volunteer profile exists)
- `PATCH /international/passport` — partial passport update (authenticated; all fields
  optional: `passportReadiness`, `travelReady`, `emergencyContactReady`,
  `preferredCategories` ≤12 deduped, `preferredCountryIds` ≤50 (existing ids only),
  `dateOfBirth` as `YYYY-MM-DD` showing a past date with age 10–120)
- `POST /admin/international/opportunities/:id/verification` — set an offer's verification
  status (admin, `content.manage`; `status` + optional `notes` ≤2000; stamps/clears
  `verifiedAt`, appends one append-only verification event)
- `GET /admin/international/opportunities/:id/events` — append-only verification history
  (admin, `opportunity.read:platform`; `page`/`limit`, `checkedAt` desc; 404 when the offer
  does not exist)
- `GET /admin/international/applications` — platform application queue (admin,
  `application.read`; `status`/`opportunityId` filters, `page`/`limit`, `submittedAt` desc;
  volunteer identity with the email masked unless `publicEmail`)
- `PATCH /admin/international/applications/:id` — application status transition (admin,
  `application.read`; `status` + optional `decisionNote` ≤2000; strict machine —
  422 on an illegal edge; stamps `reviewedAt`/`reviewedById` on ACCEPTED/REJECTED/COMPLETED)
- `GET /admin/international/experiences` — self-declared experiences (admin,
  `organization.verify`; `verified`/`volunteerProfileId` filters, `page`/`limit`,
  `createdAt` desc; rows carry `volunteerProfile` and the same `volunteer` identity)
- `POST /admin/international/experiences/:id/verify` — verify or un-verify one experience
  (admin, `organization.verify`; `{ verified, notes? ≤1000 }`; the note is kept in the audit
  trail — the row has no notes column; 404 when the row does not exist)

## Notifications (platform — registered)

- `GET /me/notifications` — own notifications (paginated, unread count)
- `POST /me/notifications/read` — mark read (idempotent)

## Messaging (platform — registered)

- `GET /conversations` — my conversations (paginated, unread counts)
- `POST /conversations` — start or reuse a conversation
- `GET /conversations/:id` — conversation detail
- `GET /conversations/:id/messages` — history (keyset cursor); each row carries
  `attachment { id, fileName, mimeType, downloadUrl }` while its document still exists
  (the URL is re-authorized per fetch by `GET /files` under conversation membership)
- `POST /conversations/:id/messages` — send a message (blocks honoured; optional
  `attachmentId` referencing one of your `AVAILABLE` documents)
- `POST /conversations/:id/read` — mark conversation read

## Reports / moderation (platform — registered)

- `GET /reports` — moderation queue (admin; reporter masked)
- `POST /reports` — report content or a user (one open report per target)
- `GET /reports/:id` — report detail (admin)
- `POST /reports/:id/review` — decide a report (state machine + audited effects)
- `GET /me/reports` — reports I filed

## Risk & incidents (platform — registered)

- `GET /admin/moderation/queue` — undecided risk assessments, highest score first
- `GET /admin/risk/signals` — list assessments, or compute+persist signals for a target
- `POST /admin/risk/decisions` — record a human risk decision
- `GET /admin/incidents` · `POST /admin/incidents` — incident list/create (OPEN)
- `GET /admin/incidents/:id` — incident detail
- `GET /admin/incidents/:id/events` — timeline (append-only)
- `POST /admin/incidents/:id` — update status with a required timeline note

## Admin (platform — registered)

- `GET /admin/users` · `GET /admin/users/:id` — user list/detail (no secrets exposed)
- `POST /admin/users/:id/action` — suspend/ban/reinstate/role change/force logout (reason + audit)
- `POST /admin/organizations/:id/action` — suspend/restore an organization
- `GET /admin/audit` — audit log (paginated, filterable)
- `GET /admin/settings` · `PUT /admin/settings` · `DELETE /admin/settings/:key` — platform settings (audited)
- `GET /admin/flags` · `PUT /admin/flags` · `DELETE /admin/flags/:key` — feature flags (audited)
- `POST /admin/exports` — export rows as CSV/JSON (capped and audited)
- `GET /admin/organizations` — platform organization list (`q`/`status`/`verificationStatus`/
  `organizationType`, paginated; `organization.read:platform`)

## CMS (platform — registered)

- `GET /content/pages` · `GET /content/pages/:slug` — published pages (public; drafts 404)
- `GET /announcements` — announcements inside their active window (public)
- `GET /featured` — featured placements, dead targets dropped (public)
- `GET /home` — home content + active announcement (public)
- `GET /flags` — effective feature-flag map (public)
- `GET /admin/content/pages` · `POST /admin/content/pages` · `PATCH /admin/content/pages/:id` · `DELETE /admin/content/pages/:id`
- `GET /admin/announcements` · `POST /admin/announcements` · `PATCH /admin/announcements/:id` · `DELETE /admin/announcements/:id`
- `GET /admin/featured` · `POST /admin/featured` · `DELETE /admin/featured/:id`
- `POST /home` — upsert home content (singleton, audited)

## Billing (platform — registered)

- `GET /plans` — active subscription plans (public)
- `GET /orgs/:orgId/billing` — subscription + outstanding invoice count
- `POST /orgs/:orgId/billing/action` — upgrade/downgrade/cancel (state machine + audited invoice)
- `GET /orgs/:orgId/invoices` · `GET /orgs/:orgId/invoices/:id` — invoices/detail
- `GET /orgs/:orgId/payments` — payments (append-only ledger)
- `POST /orgs/:orgId/payments` — pay an invoice/plan (`free` | `bank_transfer` only)
- `GET /billing/invoices` — invoice list by explicit `organizationId`
- `GET /admin/payments` · `GET /admin/payments/:id` · `POST /admin/payments/:id/action` — payment administration (confirm/fail/refund transitions)
- `GET /admin/invoices` · `GET /admin/subscriptions` — platform lists

## Volunteers (participants)

- `GET /me/profile` · `PATCH /me/profile` — own volunteer profile; the GET
  response carries the current skillset (`skills` / `languages` / `interests`
  rows) so reads don't depend on the write-only manage routes
- `POST /me/skills` · `POST /me/languages` · `POST /me/interests` — manage taxonomies on own profile
- `PATCH /me/privacy` — privacy settings: `publicProfile` / `publicPhone` /
  `publicEmail` plus the per-field flags `showWilaya` / `showHours` /
  `showCertificates` (spec §30). Enforcement: `showWilaya=false` removes
  wilaya **and** city from `GET /volunteers` items and excludes the profile
  from `?wilayaId` results entirely; `showHours=false` returns `hours: null`
  on the volunteer branch of `GET /public/verify` (the page hides the row) and
  `achievements.verifiedHours: null` on `GET /volunteers/:id` (the aggregate
  is never issued); `showCertificates=false` withholds the profile's
  certificate list — the P25 profile page is that flag's first controlled
  surface, while each listed row still resolves through credential-keyed
  verification, which never depends on mutable privacy flags.
- `GET /me/notification-preferences` · `PATCH /me/notification-preferences`
- `POST /me/data-request` — export/deletion request for personal data
- `GET /me/stats` — personal activity statistics
- `GET /me/activities` — own participation timeline (paginated
  `VolunteerActivity` rows: title, description, organization, linked
  opportunity, dates, status, verified/pending hour sums, issued
  certificates; `orderBy startedAt desc`)
- `POST /me/card` — issue own volunteer card (one per profile → 409; unique
  `BLD-CARD-XXXXXXXX` number with re-roll retries; QR token **is** the profile's
  public verification token; verification level mirrored at issue; audited
  `volunteer_card.issue`)
- `GET /me/card` — own card (+ `qr.dataUrl` / `verifyUrl`; 404 before issuing)
- `GET /me/card/pdf` — own card as a PDF (credit-card proportions, embedded
  OFL font; `?locale=ar|fr|en`, default `ar`)
- `GET /me/cv` — own CV export: profile, contact, skills/languages/interests,
  verified-hour aggregates, certificates/achievements/experiences (aggregate
  document, not a list endpoint — collections stay paginated on their routes)
- `GET /me/cv/pdf` — the same aggregate rendered as a localized A4 PDF
  (`?locale=ar|fr|en`, default `ar`): identity header, summary, availability,
  skills/languages/interests, verified hours, certificates (with status),
  achievements and international experiences; sparse sections are omitted,
  never rendered empty
- `GET /volunteers` — public directory (opt-in profiles; items carry the owner's
  `userId` so a card can deep-link into `/messages?to=` — the same handle the
  shareable conversation link uses, and the messaging API still enforces blocks
  plus the `messaging` rate limit server-side; `wilaya`/`city` are `null` when
  the profile set `showWilaya=false`, and such profiles are excluded from
  `?wilayaId` filter results)
- `GET /volunteers/:id` — public volunteer profile (P25, the directory card's
  click-through). 404 unless the profile opted into `publicProfile` — an
  unknown id and a withheld profile answer identically (no existence oracle).
  Returns the identity header (name, photo, `volunteerId`, verification
  status, availability, member-since, masked-or-published email — never a
  phone number), the skillset rows (`skills`/`languages`/`interests`) and
  `achievements`: `verifiedHours` (`null` when `showHours=false`), the valid
  certificate list (`null` when `showCertificates=false`; each row carries
  its `certificateNumber` so the UI can deep-link credential-keyed
  verification) and the top-8 participation timeline (per-row `verifiedHours`
  follows the same `showHours` gate)

## Initiative reviews & ratings (participants — registered)

Participant social proof on the initiative page (P24): a 1–5 rating plus an
optional written body, one row per author per initiative. Reading is public;
writing requires an **ACCEPTED** application on that initiative **or**
VERIFIED hours tied to it (through the activity or the attendance row) —
`source` records which path qualified the author at review time. Author names
are emitted only for profiles with an opt-in public profile; everyone else
renders as a neutral verified-participant label, so a review never
de-anonymizes a volunteer who never joined the directory.

- `GET /opportunities/:slug/reviews` — public, paginated, newest first: items
  carry `rating`/`body`/`source`/`createdAt`/`updatedAt`/`isMine` plus the
  author's public `name` (or `null`), `stats` carries `count`/`average` and a
  5-slot `distribution` histogram, and `viewer` answers `eligible`,
  `eligibility` (`PARTICIPANT`|`HOURS`) and the caller's own `review` (all
  falses when anonymous) — one round trip for the whole section
- `POST /opportunities/:slug/reviews` — `{ rating: 1–5, body? }` with the body
  capped at 2000 chars, on a published initiative: authenticated + eligible
  (403 otherwise), one review per author (409 on a second, double-submit
  included via the compound unique); audited `opportunity.review`
- `PATCH /opportunities/:slug/reviews/:reviewId` — edit your own review:
  `rating?` and/or `body?` (`body: null` clears the text), at least one field
  required (422 otherwise), foreign rows read as 404; audited
  `opportunity.review.update`
- `DELETE /opportunities/:slug/reviews/:reviewId` — remove your own review
  (idempotent, `{ deleted: false }` when the row was already gone); audited
  `opportunity.review.delete`

## Saved opportunities (participants)

- `GET /me/saved-opportunities` — own saved/favorite initiatives (paginated,
  newest save first; optional `?opportunityId=` exact-id membership check —
  how the save button learns its initial state without a status route;
  deleted initiatives fall out through the `deletedAt` guard, ones that later
  left `PUBLISHED` stay listed so the UI can say "no longer open")
- `POST /me/saved-opportunities/:id` — save an initiative (idempotent upsert
  on the `[volunteerProfile, opportunity]` unique → `{ saved: true, savedAt }`;
  404 for unknown/deleted initiatives; audited `opportunity.save`)
- `DELETE /me/saved-opportunities/:id` — remove a saved initiative
  (idempotent → `{ saved: false }`; audited `opportunity.unsave` only when a
  row actually went away)

## Matching (participants)

- `GET /me/recommendations` — deterministic top-N of still-open published
  initiatives ranked by `@bladna/domain`'s `matchOpportunity` against the
  signed-in volunteer's signals. Each item carries
  `match: { score, reasons: [{ code, weight, detail }] }` — the transparent
  reason codes the strip/page render as localized chips (age and any
  protected attribute are never scoring inputs) — plus a `saved` flag.
  `?limit=1–12` (default 6); scores below 30 are dropped (profile-completion
  empty state instead of noise); candidates are a recency window of 200
  published initiatives whose deadline is still open and that the volunteer
  has not already applied to. `meta: { limit, minScore, candidates }`.
  On first publish the same engine fires `NEW_MATCHING_OPPORTUNITY` to the
  top-scoring candidates (score ≥ 40, scan cap 300, notify cap 50,
  fire-and-forget — a notification failure never fails the transition).

## Organizations (participants)

- `GET /organizations` — public directory (ACTIVE tenants); filters `?q`,
  `?type`, `?verifiedOnly`, `?slug` (exact-slug lookup used by the public
  organization detail page — ACTIVE-only like the rest of the directory)
- `POST /organizations` — self-register a tenant: verified email + §54 consents
  required; the creator becomes `OWNER`; enters `PENDING_VERIFICATION` /
  `PENDING` (never ACTIVE/VERIFIED at birth); slug race → 409; audited
  `organization.create`
- `GET /orgs/:orgId` · `PATCH /orgs/:orgId` — detail/update
- `GET /orgs/:orgId/members` · `POST /orgs/:orgId/members/invite` — members and invitations
- `GET /orgs/:orgId/members/invitations` · `POST /orgs/:orgId/members/invitations/:invitationId/revoke`
- `POST /orgs/:orgId/members/:memberId/role` · `DELETE /orgs/:orgId/members/:memberId`
- `GET /me/invitations` · `POST /me/invitations/:token/accept` — invitation flow
- `GET /me/organizations` — my ACTIVE memberships with a compact organization summary
  (paginated; drives `/billing`'s tenant picker and the dashboard card)
- `GET /orgs/:orgId/analytics` — tenant activity aggregates

## Organization verification (participants)

- `POST /orgs/:orgId/verifications` — submit request with documents
- `GET /orgs/:orgId/verifications` — history (paginated)
- `GET /admin/verifications` — platform queue
- `GET /admin/verifications/:id` — verification detail with evidence documents (officer only;
  each file carries a `downloadUrl` whose access is re-checked server-side against
  officer role + evidence link)
- `POST /admin/verifications/:id/decide` — decide (state machine, append-only)
- `POST /admin/verifications/:id/check` — review assist: compare officer-read
  fields of one evidence document against the organization record
  (`{ documentId, fields: [{ name, value }] }`; observed values come from the
  officer who read the bytes — never from the tenant; expected values are
  loaded from the org record, and a field with no source value is a 400).
  The local provider runs deterministic rules; cloud providers answer
  `CONFIG_ERROR`/GDPR-gate/`NOT_IMPLEMENTED` — they never pretend to have read
  the file. Result audited as `organization.verification_document_check`.

## Attendance (participants)

- `POST /attendance/sessions` — create a QR check-in session and issue its first QR
  (the QR image and the `checkInUrl` response field both encode the caller's own
  origin — the configured app URL behind the reverse proxy, localhost in dev,
  else `PUBLIC_APP_URL` — plus `/check-in?token=…`; `src/proxy.ts` prefixes the locale
  on scan)
- `GET /attendance/sessions` — tenant sessions (paginated)
- `POST /attendance/sessions/:sessionId/qr` — reissue (rotates the token; old QRs die;
  response also carries `checkInUrl`)
- `POST /attendance/sessions/:sessionId/revoke` — revoke a session
- `POST /attendance/manual` — manual record (day-level duplicate guard)
- `GET /attendance` — tenant records (paginated)
- `POST /attendance/check-in` — check in by scanning (409 on replay)
- `POST /attendance/:id/confirm` — confirm/reject (appends a pending hour)

## Volunteer hours (participants)

- `GET /me/hours` — own hours (paginated, filterable)
- `GET /orgs/:orgId/hours` — tenant hours (paginated)
- `POST /orgs/:orgId/hours/verify` — bulk verify/reject (per-row results)
- `POST /orgs/:orgId/hours/:hourId/verify` — verify/reject one record
- `POST /orgs/:orgId/hours/:hourId/revoke` — revoke with reason (append-only supersession)

## Certificates (participants)

- `GET /certificates/verify` — public verification by number/token (404 when unknown)
- `GET /certificates/:certificateId` — public certificate metadata by id/number/token (no contact data)
- `GET /certificates/:certificateId/pdf` — public certificate PDF: exactly the
  metadata route's exposure (holder/org/hours/number/effective status, **no
  contact data**), embedded OFL font (Arabic shapes correctly), QR → the
  public verification page; `?locale=ar|fr|en` (default `ar`)
- `POST /orgs/:orgId/certificates` — issue (unique number + token)
- `GET /orgs/:orgId/certificates` — tenant list (paginated)
- `POST /certificates/:certificateId/revoke` — revoke (organization derived from the row, state machine, audited)
- `GET /me/certificates` — own certificates (paginated)

## Achievements (participants)

- `GET /me/achievements` — evaluate and list own achievements (thresholds)
- `GET /achievements` — active catalog (public, paginated)

## Documents (participants)

Uploads carry their bytes; validation runs **before** anything is written
(`server/infra/upload.ts`): base64 shape → `MAX_UPLOAD_BYTES` size cap → MIME
allow-list (png/jpeg/webp/pdf) → magic-byte sniff → extension agreement →
`sha256` checksum. Storage is written first, then the row (bytes are removed
if the insert fails), so a row only ever describes bytes that passed the gate.
`AVAILABLE` therefore means "passed the upload validation gate" — **this build
ships no malware scanner**; `PENDING_SCAN`/`QUARANTINED` stay reserved for a
real scan stage and are never assigned artificially.

- `GET /me/documents` — own document metadata (paginated, `?type=` filter;
  storage keys and checksums never exposed)
- `POST /me/documents` — upload `{ type, fileName, mimeType, contentBase64,
visibility? }` → validated, stored, registered with `ownerId` = session
  (default `PRIVATE`, audited `document.create`, `upload` rate tier)
- `GET /orgs/:orgId/documents` — tenant documents (`document.read`, paginated,
  `?type=`)
- `POST /orgs/:orgId/documents` — tenant upload (`document.upload`): sets
  **both** `ownerId` (the uploader) and `organizationId` — the exact shape
  verification evidence requires (default `ORGANIZATION` visibility)
- `DELETE /orgs/:orgId/documents/:documentId` — soft-delete (uploader, or a
  manager via `organization.update`; 409 while attached to a verification under
  review; audited `document.delete`)
- `GET /files?key=…` — stream stored bytes with **row-level** authorization:
  `PUBLIC` is open, owners always read their own, active tenant members read
  non-`PRIVATE` tenant files, conversation members read attachments shared in
  their threads (tombstoned messages grant nothing), and verification officers
  only reach bytes the tenant actually submitted as evidence (MFA-satisfied
  session, §145). Unknown _and_ denied keys answer `404` so key existence never
  leaks; responses carry `nosniff` plus a `sandbox` CSP — uploaded files cannot
  execute or embed in a foreign origin.

File names must be path-safe (no separators, `..`, or control characters);
the storage key is a server-generated UUID and is never accepted from the
client.

## Public verification (participants)

- `GET /public/verify?code=…` — one code resolves in strict order: certificate
  number/verification token → volunteer public token → organization slug.
  A known certificate always answers `200` (`valid: false` when revoked/expired);
  only an unknown code is `404`. No session required; payload carries no PII
  beyond holder/org name, hours and status. On the volunteer branch the
  verified-hour total is `null` when the holder set `showHours=false`;
  certificate facts are never withheld (verification must not depend on
  mutable privacy flags).
