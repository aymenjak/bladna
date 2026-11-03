# BLADNA — Architecture

> Status: living document. Updated as modules land.

## 0. Repository inspection result (2026-09-23)

| Question                                   | Answer                                                                                                                                                              |
| ------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Existing code?                             | **None.** `C:\Users\aymen\Downloads\bladna` was empty.                                                                                                              |
| Framework                                  | none → chosen below                                                                                                                                                 |
| Database                                   | none → PostgreSQL + Prisma                                                                                                                                          |
| Package manager                            | npm 11.17 (Node 24.19) — workspaces monorepo                                                                                                                        |
| Existing routes / components / auth / APIs | none                                                                                                                                                                |
| Docker / psql available on this machine    | **No** — Docker Compose files are provided and documented; migrations are validated offline (`prisma validate`, `migrate diff`), integration tests are env-guarded. |

Nothing had to be preserved because nothing existed. No conflicts with the specification were found.

## 1. Stack (justified choices)

| Layer         | Choice                                                                                                                                                                                                                                   | Why                                                                                                                                            |
| ------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| Web + API     | **Next.js 16 (App Router) + React 19 + TypeScript strict**                                                                                                                                                                               | Spec allows “Next.js server/API architecture for simple deployment”. One deployment unit, server-side authorization close to the DB.           |
| API shape     | Versioned route handlers under `/api/v1/*` with thin handlers delegating to `src/server/modules/*`                                                                                                                                       | Business logic lives in services/policies, not in UI or handlers → extractable to a standalone API later (mobile consumes the same endpoints). |
| DB            | **PostgreSQL + Prisma 6**                                                                                                                                                                                                                | Required stack; migrations via Prisma.                                                                                                         |
| Validation    | **Zod** (`@bladna/validation`)                                                                                                                                                                                                           | Central schemas shared by API + forms.                                                                                                         |
| Auth          | Access JWT (`jose`) + rotating refresh tokens stored hashed in DB (`Session`), scrypt password hashing (RFC 7914), TOTP (`otpauth`) for privileged roles                                                                                 | No custom crypto; all primitives are standard algorithms.                                                                                      |
| Queue / cache | `QueueService` + `CacheService` abstractions: in-process adapter by default, BullMQ/Redis adapter behind `REDIS_URL`                                                                                                                     | Redis is not required for dev; production config documented.                                                                                   |
| Storage       | `FileStorageService`: local disk adapter (dev), S3 adapter (prod)                                                                                                                                                                        | Spec §85.                                                                                                                                      |
| i18n          | Lightweight dictionary i18n: `ar` (RTL default), `fr`, `en`; locale cookie + `[locale]` segment; `next-intl` request config + provider on top since P6 (same dictionaries, single resolver)                                              | Spec §74, §105.                                                                                                                                |
| Styling       | Tailwind CSS v4 + design tokens, logical (RTL-safe) properties                                                                                                                                                                           | Spec §75–76.                                                                                                                                   |
| UI libraries  | **lucide-react** icons (behind kit wrappers), **Radix UI** primitives (AlertDialog/Dialog via kit `useConfirm`/`usePrompt`, DropdownMenu, Tabs), **sonner** toasts, **Leaflet** map engine (no tiles) — P6                               | Standard libraries replace hand-rolled dialog/menu/tabs/map code; the kit keeps owning all styling.                                            |
| Tests         | Vitest: unit + authorization + state-machine + validation + pure-engine tests (403 / 37 files); DB-gated suite env-guarded (`DATABASE_URL`); Playwright E2E 15/7 on `channel: 'chrome'` (`npm run test:e2e`)                             | No local Postgres in this environment; tests must still run green.                                                                             |
| PDF           | `pdfkit` behind `server/infra/pdf.ts` (`renderCertificatePdf` / `renderCardPdf` / `pdfResponse`); vendored OFL Amiri font at `apps/web/assets/fonts/` (license alongside, Latin + Arabic coverage, resolution fails loudly when missing) | Spec §26, §135.                                                                                                                                |

## 2. Monorepo layout

```
apps/web/                 Next.js app: UI shells + /api/v1 route handlers + src/server (modules, guards, infra adapters)
packages/database/        Prisma schema, client export, migrations, seed (demo), constraint helpers
packages/validation/      Zod schemas (API contracts, filters, pagination)
packages/types/           DTO / API envelope / enum types
packages/domain/          Pure business rules: RBAC matrix, status state machines, volunteer ID, matching, risk scoring
packages/auth/            Password hashing, token mint/verify, TOTP, rate-limit primitives (DB-free)
packages/utils/           Small shared utilities (slug, pagination, locale resolution)
packages/ui/              Design-system components (Button, Input, Modal, Table, …)
packages/config/          Shared tsconfig / eslint base
docs/                     Architecture, API, security, ops documentation
infra/ docker/ scripts/   Container + CI + helper scripts
```

## 3. Backend module map (`apps/web/src/server/modules`)

auth · users · volunteers · organizations · membership · verification · opportunities · applications · activities · attendance · hours · certificates · achievements · campaigns · sponsors · csr · impact · international · notifications · messaging · reports · moderation · risk · subscriptions · payments · documents · locations · analytics · audit · admin · cms

**Core object: the initiative (`Opportunity`).** Discovery, the map, dashboards and every support flow hang off it — declared `SupportNeed`s (financial / equipment / material / service, plus volunteer spots) receive traceable `SupportOffer`s, and initiative-level `ImpactMetric`s complete the need → support → execution → result loop. `Organization` stays the tenancy boundary, `Campaign` the financial vehicle, and the international module a demoted secondary surface (spec §58).

Each module: `service.ts` (business rules + authorization), `repository.ts` (Prisma queries), optional `policy.ts` (pure rules from `packages/domain`).

## 4. Multi-tenancy (§5)

- `OrganizationMember` rows are the **only** source of org permissions.
- Every org-scoped request resolves membership server-side from the authenticated user; organization IDs from the client are hints, never trust.
- Guards: `requireAuth()` → `requirePermission(permission, { organizationId })`.

## 5. Authorization (§6)

- `packages/domain/rbac.ts`: `SystemRole → Permission[]` matrix, granular permissions (`volunteer.profile.read`, `opportunity.publish`, `hours.verify`, …).
- Enforced server-side only; frontend checks are for UX.

## 6. Data integrity rules (§106–108)

- Status transitions are explicit machines (`packages/domain/state-machines.ts`); illegal transitions throw `BUSINESS_RULE_ERROR`.
- `VolunteerHour`: append-only — revoking a verified hour creates a superseding record (`supersedesId`), never a silent edit.
- Public verification uses random tokens (`certificateNumber`, `verificationToken`, `qrToken`), never sequential IDs.
- Duplicate active applications blocked by a partial unique index + service check.

## 7. Security posture (§52, §100)

Request pipeline: request-id → rate limit (tiered) → auth resolve → validation (Zod) → authorization (RBAC + tenant) → service → audit (sensitive ops) → envelope response. Never leak stack traces; structured logs without secrets.

## 8. Trust & AI (§48, §72)

- `RiskAssessmentService` (deterministic rules v1) outputs `riskScore/level/reasons/recommendedAction`.
- `AIService` behind `AIProvider` interface; AI may recommend but never performs permanent bans/verifications alone (§73).

## 9. Delivery phases

See `docs/IMPLEMENTATION_CHECKLIST.md` — phases 1→11 in spec §150 order.
