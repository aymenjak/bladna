# BLADNA — Product & UX/UI Research Report

> **Phase outcome:** UNDERSTAND → RESEARCH → AUDIT → STRUCTURE → RECOMMEND.
> **No application code was modified in this phase.** This document is the review
> gate before implementation begins.
>
> Method: full repository inspection (85 models, 258 API routes, 53 pages), live
> HTTP audit of 33 screens + authenticated volunteer/org journeys against the
> production build (port 3002), source-level component/usage counts, and external
> research (sources in §15). Visual/pixel judgments are deferred: no desktop
> browser was connected, so evidence below is HTML/CSS/source-based.

---

## 1. Executive summary

BLADNA is already a **deep, working product**, not a mockup: 53 localized pages,
258 API endpoints, 85 Prisma models, role-based authorization (71 permissions),
2FA, i18n (ar/fr/en with correct `lang`/`dir`), and three complete user flows
(volunteer → certificate, organization → workspace console, international →
passport). Live probes confirm every key screen returns 200 with exactly one
`h1`, one `<main>`, a skip link, correct RTL/LTR, gzip, and a strict nonce-CSP
security header set.

The gaps are **not** "the design is ugly" — they are concentrated in five areas:

1. **Honesty compliance gap (CRITICAL):** the landing "أثر المنصة حتى الآن"
   (impact so far) section presents seeded counts as real traction with **zero
   demo-dataset labelling** — organizations/campaigns pages are labelled, the
   home page is not. _(Fixed 2026-09-25 in P0 — `landing.statsNote` caption.)_
2. **Flow payoffs not reachable:** certificate PDF exists in the API but had **no
   UI link**; skills/languages/interests and local activity history had models +
   endpoints but **no UI at all** — the "build your experience" promise dead-ends.
   _(Fixed 2026-09-25 in P1 — profile + workspace certificate rows gained PDF and
   verify links, the profile gained a skillset manager and a `GET /me/activities`
   timeline, and a route-level `loading.tsx` now covers the locale tree.)_
3. **Mobile depth below the product's own rule:** touch targets of 28–40px
   violate `docs/DESIGN.md`'s ≥44px rule in an Algerian market that is 79.5%
   internet-penetrated and mobile-first (§15, S13); navigation is a hamburger
   dropdown only — no bottom bar for the four core signed-in destinations.
4. **Map is an abstract grid, not a map:** pins are correctly projected
   (north-up, verified) on a coordinate grid, but there is no recognizable
   geography — weak for a wilaya-based discovery product.
5. **Component duality (consistency debt):** 129 kit `<Button>` usages coexist
   with ~40 hand-rolled primary buttons, plus raw badges/alerts/cards/empty
   states — the system exists, adoption is ~75%.

Recommended sequencing is in §14: a ≤1-day P0 (honesty + a11y quick wins), then
flow payoffs (P1), then design-system consolidation (P2), discovery upgrade (P3),
quality/automation (P4).

---

## 2. Product understanding

### 2.1 Purpose and concept (preserved)

Algeria-first digital volunteering network: **verified volunteer identity →
verified experience (hours, attendance, certificates) → trustworthy
opportunities → organization SaaS → CSR/sponsorship → international
opportunities → public verification**, in Arabic by default with fr/en.

### 2.2 Users and roles (verified in `packages/domain/src/rbac.ts`)

| Layer                 | Values                                                                                                                        |
| --------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| SystemRole (11)       | USER, VOLUNTEER, ORGANIZATION_MEMBER/ADMIN/OWNER, SPONSOR_MEMBER/ADMIN, MODERATOR, VERIFICATION_OFFICER, SUPPORT, SUPER_ADMIN |
| Org seats (5)         | VIEWER < STAFF < MANAGER < ADMIN < OWNER                                                                                      |
| Permissions           | 71, incl. platform-scoped `*:platform`; server is authoritative ("frontend checks are UX only")                               |
| API auth distribution | public 45 · authenticated 68 · org 65 · admin 64 · sponsor 16 = 258                                                           |

### 2.3 Product-model coverage (repository-verified)

| Concept                        | Status                                          | Evidence                                                                                             |
| ------------------------------ | ----------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| Volunteer profile              | Exists                                          | `VolunteerProfile`, `/profile`, `GET/PATCH /me/profile`                                              |
| Volunteer identity/card        | Exists                                          | `VolunteerCard`, `/me/card` + PDF + CV endpoints, profile actions                                    |
| Opportunities / initiatives    | Exists (same entity; UI calls them "المبادرات") | `Opportunity*` models, 12 routes, list + detail + console                                            |
| Organizations                  | Exists                                          | 14 routes, workspace console (12 pages), KYC verification                                            |
| Applications                   | Exists                                          | 8 routes, apply form, tracking, org review + bulk actions                                            |
| Attendance                     | Exists                                          | sessions + QR + check-in page + manual confirm                                                       |
| Certificates                   | Exists — **UI gap**                             | 7 routes incl. PDF; **no UI link to PDF**                                                            |
| Verification (public)          | Exists                                          | 4 public verify pages + `GET /public/verify`                                                         |
| Map/location                   | Exists — abstract                               | `Wilaya/City`, coordinate plot, no base geography                                                    |
| Notifications                  | Exists                                          | in-app + delivery + preference matrix pages                                                          |
| International                  | Exists (deep)                                   | 25 routes, 9 pages, passport + experiences + withdrawal                                              |
| Messaging                      | Exists                                          | conversations, read receipts, blocks                                                                 |
| Billing/payments               | Exists                                          | plans, invoices, payments (`bank_transfer \| free` only)                                             |
| CSR / sponsors                 | Exists                                          | sponsor console, CSR programs, sponsorships                                                          |
| Admin                          | Exists — sub-routes (P4)                        | `/admin` + `/admin/[section]` (14 sections, role-gated, legacy `?tab=` 308-redirects)                |
| Campaigns                      | Exists                                          | 16 routes, list + detail                                                                             |
| Skills / languages / interests | Exists — UI shipped (P1)                        | `POST /me/skills` / `languages` / `interests` used by the `/profile` skillset manager                |
| Activities (local experience)  | Exists — UI shipped (P1)                        | `VolunteerActivity` via `GET /me/activities` + profile timeline                                      |
| Saved opportunities            | Exists (P5)                                     | `SavedOpportunity` via `/me/saved-opportunities` routes + `/saved` page + save button                |
| Personalized matching          | Exists (P5)                                     | `matchOpportunity` engine served by `GET /me/recommendations` + dashboard strip + `/recommendations` |
| Volunteer directory            | Exists (P5)                                     | public `GET /volunteers` → indexable `/volunteers` page (opt-in `publicProfile` only)                |

### 2.4 Navigation, pages, design system (as-built)

- **Desktop (`lg+`)**: brand · primary nav (المبادرات، الخريطة، المنظمات،
  الحملات) · signed-in additions (لوحة التحكم، ترشيحاتي، الرسائل، الإشعارات) ·
  AccountMenu (workspace, settings, billing, safety) · locale switch · auth
  buttons. Active item = `aria-current="page"` + brand tint.
- **Mobile (<lg)**: single hamburger disclosure (`size-9`, `aria-expanded`,
  Esc/outside-click/route-close, scrollable panel). No bottom tab bar, no fixed
  bars anywhere (verified grep: 0 sticky/fixed).
- **Footer**: Explore / Trust / Account columns + legal bar; verify hub linked.
- **Design system**: Tailwind v4 + `@theme` tokens (brand-50…900, sand-50…900),
  kit package (`Button, Input/Textarea/Select, Card, Badge, Alert, EmptyState,
Skeleton`), `docs/DESIGN.md` as the review law.

---

## 3. Competitor / product research

Patterns extracted (no visual copying). Sources in §15.

| Category                    | Product(s)                                                                        | Pattern extracted for BLADNA                                                                                                                                                                                                                    |
| --------------------------- | --------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A. Volunteer platforms      | VolunteerHub, Galaxy Digital "Get Connected", Rosterfy                            | Volunteer-owned profile + hour tracking; **check-in kiosk/app** (BLADNA has QR check-in ✓); scheduling shifts; waivers; impact reporting dashboards                                                                                             |
| B. Corporate volunteering   | Benevity, BetterGood                                                              | Curated opportunity **catalog with cause pillars**, time tracking + compliance reporting in one place → informs CSR/sponsor console IA                                                                                                          |
| C. Opportunity marketplaces | Idealist × VolunteerMatch (merged 2025)                                           | Search with **location + cause + skill filters**, organization profiles, open API/syndication of listings; "multiple entry points to take action" (volunteer + event + job)                                                                     |
| D. Community/local          | JustServe, Points of Light/United Way hubs                                        | Local-first listing with distance/context; low-friction posting for small groups                                                                                                                                                                |
| E. Volunteer management     | Galaxy Digital, Track it Forward                                                  | Automated reminders, milestone tracking, **audit-ready data** (BLADNA already has append-only audit logs ✓)                                                                                                                                     |
| F. Digital identity/profile | Credly / 1EdTech Open Badges 3.0                                                  | Credentials = issuer + criteria + evidence + **verification URL**, portable/shareable; W3C Verifiable Credentials alignment (2026 de-facto). BLADNA's `BLD-CERT-*` + public verify maps well; recommendation §10                                |
| G. Map discovery            | Map UI Patterns (patterns: cluster marker, search-this-area, locate-me, blue dot) | Recognizable base geography + "search this area" + clustering + list fallback; BLADNA currently lacks base geography (§4)                                                                                                                       |
| H. Certificates/credentials | Credly verify button, Open Badges metadata                                        | **One-click verify from every credential view** (BLADNA: verify page exists but isn't linked from certificate rows)                                                                                                                             |
| I. International            | European Solidarity Corps / EU Youth Portal, UNV                                  | Flow = register → profile → search projects → eligibility criteria → apply → training → selection; explicit eligibility + funding info per listing; safety/insurance guidance (BLADNA international already mirrors this ✓ incl. safety center) |
| J. Mobile-first SaaS UX     | NN/g mobile faceted search, Baymard/Algolia search UX                             | Keep **filters and results visible simultaneously** (tray pattern), instant result feedback, active-filter chips, result counts; avoid separate filter screens with no preview                                                                  |
| K. Market context           | DataReportal Digital 2026: Algeria                                                | 37.8M internet users (79.5%), 55.6M mobile connections (117%), 27.5M social identities → **mobile is the primary device class**; Arabic-first UX is the default expectation                                                                     |

---

## 4. UX findings (prioritized)

Severity = impact on the core journeys × evidence strength. Categories: **UX**,
**UI**, **ARCH** (architecture), **TECH**, **MISSING**, **REDUNDANT**.

### CRITICAL

| #   | Cat          | Finding                                                                                                                                                                                                                                                                                                                                   | Evidence                                                         |
| --- | ------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------- |
| C1  | UX (honesty) | Landing section "أثر المنصة حتى الآن" shows "3 مبادرة منشورة · 1 منظمة نشطة · 5 متطوع مسجّل · 4 ساعة موثّقة" with **no demo-dataset qualifier** — violates the project's honesty rule (seeded metrics must be labelled). Seed _row descriptions_ elsewhere do carry `(demo dataset)` / `(demo campaign)` notes; home _aggregates_ do not. | Full-HTML regex for demo/تجريبي/بيانات… on `/ar` = **0 matches** |

### HIGH

| #   | Cat            | Finding                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      | Evidence                             |
| --- | -------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------ |
| H1  | MISSING        | **Certificate PDF unreachable from UI** — API `GET /certificates/:id/pdf` exists; no certificate row linked it. _Correction:_ profile rows already linked the **title to `/verify/certificate`** (the "rows link nothing" claim was too broad). _(Fixed 2026-09-25 in P1 — profile rows gained a "Download PDF" action; workspace rows gained PDF **and** verify links.)_                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    | grep `/pdf` = card/CV links only     |
| H2  | MISSING        | **Skills, languages, interests and local activity history have no UI** — endpoints `POST /me/skills\|languages\|interests` exist, zero callers; `VolunteerActivity` model used only by server logic. Profile depth/"build your experience" promise is empty. _(Fixed 2026-09-25 in P1 — profile skillset section + manage island reads `GET /me/profile`, writes the existing POSTs; new `GET /me/activities` powers an experience timeline.)_                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               | route definitions vs component grep  |
| H3  | UX (mobile)    | **Touch targets 28–40px** (raw `py-1.5`≈28px table actions, `py-2`≈36px, hamburger 36px, kit `h-8`=32px) violate `docs/DESIGN.md` ≥44px. Matters because Algeria is mobile-first (§3K). _(Resolved 2026-09-26 in P2 — 118 boxed-action `px-4 py-2` sites normalized across 33 files plus step/row controls; kit button sizes raised to sm/md `h-11`, lg `h-12` (all ≥44px); hamburger, nav/section tabs, account menu and consent label bumped to `min-h-11`; 40 raw inputs raised to the §8 `h-10` floor; landing decorative step badge `size-9`→`size-10`. Gates: `px-4 py-2` w/o `min-h-11` = 0 (G7), `py-1.5` outside exempt files = 0 (G8), `grid size-9` = 0 (G6). Real-browser touch verification remains P4.)_                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       | source counts                        |
| H5  | UX (discovery) | **Map = abstract coordinate grid.** Pins are projected correctly (north-up verified: lat 36.47→`top:97%`, lat 36.75→`top:3%`; lon 2.83→`left:62.5%` exact) but there is no country/wilaya outline, tiles, labels, zoom, or "search this area" — users cannot relate pins to place. Panel is also **bbox-scaled to the 3 seeded points**, so 25km-apart pins sit at panel corners. _(Resolved 2026-09-26 in P3 — base geography ships as bundled OSM boundary polygons (via GeoAlgeria; ODbL-1.0, `scripts/geo/wilaya-boundaries.geojson` → `build-map-geo.mjs`/`-geo.ts` → `apps/web/src/ui/map/algeria-geo.ts`, Douglas-Peucker 0.02°, 69 rings/2963 vertices) rendered as an SVG outline under the pins; unlabeled backdrop only (69-wilaya 2026 vintage vs the app's 58-wilaya table — no names/counts rendered, vintage documented in the data header), attribution `© OpenStreetMap contributors` visible bottom-right with the ODbL link, CSP still touches no external request. Projection is a fixed Algeria-bbox frame with shape-preserving fit (the corners bug is gone), zoom 1–8 + drag/keyboard pan (kit controls, ≥44px), and **search-this-area** re-queries `GET /api/v1/opportunities` with a new `bounds=minLng,minLat,maxLng,maxLat` filter (WGS84 + min≤max validation, city-coordinate fallback OR, documented in `API.md`; garbage → 400). List fallback unchanged.)_ | pin styles + API lat/lng cross-check |
| H6  | UI/TECH        | **Component duality** — 129 kit `<Button>` vs 96 raw `<button>` (~40 hand-rolled primaries with `bg-brand-700`), plus raw badges/alerts/cards alongside kit equivalents (§9). _(Resolved 2026-09-26 in P2 — raw `bg-brand-700` outside `packages/ui` = 0 (G1); link-CTAs → `buttonClasses` (28 usages), raw action buttons → kit `Button` (31 raw `<button>` remain: inline text actions, list-row selectors, toggle chips, nav triggers — none using brand backgrounds); 17 badge sites → canonical `StatusBadge` (48 usages) with page-local `*_TONE` maps deleted = 0 (G2); 86 raw message boxes → kit `Alert` (127) with original `role` preserved, 14 dashed placeholders → kit `EmptyState` (49), 89 card shells → kit `Card` (125, 23 documented ul/form/link/aside/p/menu skips), org logo/initials tiles → kit `Avatar`; admin console/content/international + risk moderation + initiative console tab bars → kit `Tabs` (5) — raw `role="tab"` in app source = 0.)_                                                                                                                                                                                                                                                                                                                                                                                                               | source counts                        |
| H7  | TECH           | **Doc drift:** `IMPLEMENTATION_CHECKLIST.md` said 248/249 routes and 317 tests; reality was 258 routes and 333 tests. Trust in checklists erodes. _(Fixed 2026-09-25 in P0 — live snapshot added; counts move per increment, the top snapshot is the source of truth.)_                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      | route tables + test run              |

### MEDIUM

| #   | Cat         | Finding                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         | Evidence                                        |
| --- | ----------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------- |
| M1  | UX          | **No route-level `loading.tsx`** anywhere (0 files); Suspense skeletons exist only in 5 auth/mfa/verify contexts. Navigating to slow pages yields a blank frame. _(Fixed 2026-09-25 in P1 — `app/[locale]/loading.tsx` renders a kit-`Skeleton` page shell covering the whole locale tree.)_                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    | file inventory                                  |
| M2  | UX          | **Landing rails repeat the same 3 seed opportunities** across "needs volunteers" / "needs support" / "latest" → perceived emptiness/duplication with a small dataset. _(Resolved 2026-09-26 in P3 — the landing keeps one discovery rail ("latest", 6 newest); the two needs-filtered rails (and their duplicate `discover` fetches) were removed; needs views stay one tap away through the quick chips and the rail's "view all" into canonical discover. Unused `landing.volunteersTitle`/`supportTitle` copy kept in the dictionaries.)_                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    | landing headings (§5 evidence)                  |
| M3  | UX (mobile) | **No bottom navigation** for the four high-frequency signed-in destinations (dashboard, applications, messages, notifications) — every switch costs a hamburger open. This is a "redesign for mobile, not resize" candidate (§7). _(Resolved 2026-09-26 in P3 — `bottom-nav.tsx` fixed tab bar for signed-in sessions, `lg:hidden`, ≥44px targets, safe-area padding, `aria-current` + landmark label (`nav.tabBar`); the core four are defined once in `chrome.tsx#coreNavLinks` shared with the header; the locale layout mirrors the bar with `pb-24 lg:pb-0` so the footer is never covered; the hamburger stays for the long tail.)_                                                                                                                                                                                                                                                                                                                                                                                       | component inventory (0 fixed bars)              |
| M4  | UX          | **Error-state semantics unverified** — no `aria-invalid`/`aria-describedby`/`role="alert"` present in pristine SSR forms (expected: no errors before submit). _Status 2026-09-25 (P1):_ kit fields now wire `aria-invalid` + `aria-describedby` (was missing) + `role="alert"`, and the auth forms move focus to the first invalid control (`useFocusFirstError`, DESIGN §8). _(Resolved 2026-09-26 in P4 — the real-browser confirmation pass landed: Playwright (`channel: 'chrome'`) now runs `login.spec.ts` which asserts the empty submit marks `aria-invalid` + moves focus to the first invalid control, and `volunteer-apply.spec.ts` asserts the invalid form-state copy; 15/15 E2E green.)_                                                                                                                                                                                                                                                                                                                          | SSR HTML scan + source + E2E                    |
| M5  | UX          | **Skip link label is mis-scoped**: skip link text = "العودة للرئيسية" (back-to-home) instead of "skip to content". Works, but the accessible name lies about its destination. _(Fixed 2026-09-25 in P0 — `common.skipToContent`, verified in rendered HTML for ar/fr/en.)_                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      | `app/layout.tsx` + rendered HTML                |
| M6  | UX          | **`Cache-Control: no-store` on public SSR pages** (landing, opportunities, login) — safe, but public discovery pages could be revalidated/cached for TTFB on mobile networks. _(Resolved 2026-09-26 in P4 — `src/proxy.ts` sets `Cache-Control: public, max-age=60, s-maxage=60, stale-while-revalidate=300` for anonymous GET/HEAD on allow-listed discovery paths (`/`, `/map`, `/safety`, `/terms`, `/privacy`, `/opportunities*`, `/organizations*`, `/campaigns*`, `/verify*`); session-bearing requests, auth paths and everything else keep Next's byte-identical `private, no-cache, no-store…` default. Safety rests on the gating (only cookie-less renders are marked public) because `Vary: Cookie` is replaced wholesale by the App Router and never reaches the client — verified against 15.5.26 and re-verified under Next 16.3.6; residual (shared cache may serve cookie-less chrome to a signed-in user — cosmetic, no shared cache runs in front of `next start`) documented in the proxy header comment.)_ | response headers + probe-3002                   |
| M7  | ARCH        | **Admin is a single tab shell** (`/admin?tab=`) — no sub-routes, so deep links/back-button/section-level permissions are all query-param based; fine now, fragile as admin grows. _(Resolved 2026-09-26 in P4 — admin got a sub-route shell: `/admin` redirects to the first granted section, every section is a canonical `/admin/[section]` URL (14 sections: users, organizations, sponsors, opportunities, international, verification, reports, risk, audit, content, settings, flags, exports, billing) gated by `adminSectionsFor` + `isAdminSection`, legacy `?tab=` URLs 308-redirect to their sub-route, sections a role may not see render the no-access card (no console leak), and every section page is `noindex`. E2E `admin.spec.ts` covers anonymous deep-link → sign-in with `?next` preserved, grants/canonicalize/`?tab=`/back-button.)_                                                                                                                                                                    | file inventory + E2E                            |
| M8  | TECH        | **No UI/E2E tests** — 30 Vitest files cover RBAC/state machines/validation/HTTP, but zero component/page/E2E coverage (`scripts/e2e-env.ts` exists, suites env-gated). _(Resolved 2026-09-26 in P4 — two layers landed. Component layer: kit suites (`button`, `tabs`, `field`, `surfaces`, `messages-utils`, `billing-utils`, `private-noindex`, `sitemap`, `security-headers`, `international`, `http`, …) bring the suite to **375 tests / 35 files**, run under jsdom via `@testing-library/react`. Browser layer: **Playwright 15 tests / 7 spec files** (`admin`, `discovery-ui` incl. RTL + pinch-zoom, `login`, `org-review`, `security-headers`, `verify`, `volunteer-apply`) on `channel: 'chrome'`, wired as a CI job step (`npm run test:e2e`), all green.)_                                                                                                                                                                                                                                                        | test inventory + E2E run                        |
| M9  | UI          | **No dark mode** (0 `dark:`/`prefers-color-scheme` usage) — acceptable MVP scope; note as deliberate or add later (§10).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        | source grep                                     |
| H4  | UX          | **Registration is one single-step form** (account type + name + email + phone + password + confirm + 3 consent checkboxes) — consider a two-step split for mobile onboarding. _Correction 2026-09-25:_ the first pass claimed missing `autocomplete`/WCAG 1.3.5; a case-insensitive re-check found `autoComplete` present on **every** auth input (login, register, forgot, reset, MFA `one-time-code`) — the autofill claim is withdrawn; ID kept for traceability, severity lowered from HIGH.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                | SSR re-scan `(?i)autocomplete` = 12 auth inputs |

### LOW

| #   | Cat       | Finding                                                                                                                                                                                                                                                                       | Evidence                      |
| --- | --------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------- |
| L1  | UI        | Several single-purpose pages render `h1` only (map, verify, sponsor, settings) — heading outline relies on `h1`; acceptable, but section `h2`s help screen-reader navigation on long pages.                                                                                   | heading counts                |
| L2  | REDUNDANT | Four verify routes (`/verify`, `/verify/certificate`, `/verify/volunteer`, `/verify/organization`) all surface in the footer; a single hub with tabs would reduce footer noise (routes should stay for deep links).                                                           | footer markup                 |
| L3  | REDUNDANT | Three "giving" surfaces (Campaigns, Sponsorship, CSR programs) overlap conceptually — IA should state the difference in one sentence each on their landing pages.                                                                                                             | model inventory               |
| L4  | UI        | `Skeleton` kit component is used only by the auth skeleton; no other screen uses it (M1).                                                                                                                                                                                     | usage count = 5, one file     |
| L5  | UI (i18n) | Some seeded organization rows have only an English/French description (`descriptionAr` null → fallback), so `/ar/organizations` renders English card copy containing the "(demo dataset)" note. Seed-content gap, not a code defect — fix by seeding trilingual descriptions. | `/ar/organizations` HTML scan |

---

## 5. UI findings — design inconsistencies

Each entry: **CURRENT → PROBLEM → RECOMMENDED SYSTEMATIC SOLUTION** (proposal
only; no code changed).

### 5.1 Buttons

- **CURRENT:** kit `Button` (5 variants × 3 sizes) ×129; raw `<button>` ×96;
  ~40 hand-rolled primaries (`bg-brand-700 … rounded-lg px-4 py-2`), mostly in
  workspace tables (`py-1.5`≈28px) and some page CTAs (landing hero uses
  `bg-brand-700` inline).
- **PROBLEM:** two sources of truth → drifting hover/focus/disabled/loading
  states; sub-44px targets; keyboard focus ring differs (global `:focus-visible`
  may not match hand-rolled buttons' own styles).
- **SOLUTION:** kit `Button` is mandatory for all actions; add/keep `sm` for table
  rows but raise mobile hit area (padding or `after:` overlay to ≥44px);
  codify in DESIGN.md checklist as a build-blocking rule; grep gate
  (`bg-brand-700` outside `packages/ui` = 0).

### 5.2 Cards

- **CURRENT:** kit `Card/CardTitle` ×70; raw `rounded-xl border border-sand-200
bg-white …` cards throughout opportunity/org/workspace lists.
- **PROBLEM:** radius/shadow/hover drift (e.g., map pins use `rounded-2xl`
  panels, cards `rounded-xl`, buttons `rounded-lg` — three radii in one view);
  inconsistent hover affordance (some clickable cards highlight, some don't).
- **SOLUTION:** three-step radius law (controls `rounded-lg`, cards
  `rounded-xl`, feature panels `rounded-2xl`); clickable cards get one shared
  hover/focus pattern (border-brand-300 + ring) applied by a single
  `InteractiveCard` wrapper.

### 5.3 Badges / status indicators

- **CURRENT:** kit `Badge` ×56; raw `<span class="inline-flex … bg-…-50
text-…-700">` badges for application/certificate/attendance statuses.
- **PROBLEM:** same enum can render different colors/text depending on page;
  color-only encoding in places (no icon/text redundancy).
- **SOLUTION:** one `StatusBadge` keyed by enum (`ApplicationStatus`,
  `CertificateStatus`, `AttendanceStatus`, `HourStatus`, `VerificationStatus`,
  `OrganizationStatus`, `InternationalApplicationStatus`) with a central
  map: status → {label i18n key, color role, icon}. Color never alone.
- _Status 2026-09-26 (P2):_ **done.** `apps/web/src/ui/status.tsx` is the
  single status→tone map (`STATUS_TONE` + `EXTRA_STATUS_TONE`, neutral
  fallback for unknown strings); `StatusBadge` always renders the localized
  label (color never alone) and forwards extra props (`data-testid` hooks
  kept for Playwright). Every page-local `*_TONE`/class-map helper and raw
  badge span was deleted across admin/billing/sponsor consoles, dashboard,
  profile, campaigns, applications, workspace and international surfaces —
  grep `_TONE` outside `status.tsx` = 0. Canonical-tone shifts were
  deliberate and are recorded in DESIGN §10 (e.g. `EXPIRED`→warning,
  `SUSPENDED`→danger, `CANCELLED`→neutral).

### 5.4 Alerts / empty states

- **CURRENT:** kit `Alert` ×41, `EmptyState` ×35; ~37 raw alert-like divs and
  ~5 hand-rolled empty idioms remain (per prior audit backlog).
- **PROBLEM:** duplicated copy patterns; some empties don't explain "why" —
  violating DESIGN.md's own rule ("every empty list explains why it is empty").
- **SOLUTION:** kit-only alerts; empty states must use `EmptyState` with
  title + explanation + primary action; add a lint/review grep.
- _Status 2026-09-26 (P2):_ **done.** 86 raw message/notice boxes → kit
  `<Alert tone>` (danger/success/warning/info; every original
  `role="alert"`/`role="status"` preserved so announcement priority never
  weakens) and 14 dashed placeholder paragraphs → kit `<EmptyState>` with
  title + explanation; kit counts now `Alert` ×127 / `EmptyState` ×49.
  Documented raw skips: 4 layout wrappers (dashboard stat section,
  sponsor-console stat tiles ×3) plus sand/neutral notes that have no kit
  tone. Greps: raw `px-4 py-3` message pattern = 0 (G3, 4 skips),
  dashed empties = 0 (G4), compact colored boxes = 0 (G10).

### 5.5 Spacing & rhythm

- **CURRENT:** page shell = `py-10`, sections `space-y-8/10`, container
  `max-w-6xl px-4`; earlier remediation normalized outliers (already green).
- **PROBLEM:** none material — risk is regression as new pages land.
- **SOLUTION:** keep the DESIGN.md checklist gate (spacing is one of the
  checklist rows) and add a fixture page per section type (list, detail, form,
  console) as reference.

### 5.6 Typography

- **CURRENT:** h1 `text-3xl font-bold text-sand-900` (21 pages normalized),
  h2 `text-lg font-semibold`, h3 `text-base font-semibold`; landing hero
  `text-4xl/5xl` documented exception; `html[lang=ar] body { font-size: 1.0625rem }`.
- **PROBLEM:** none outstanding; keep the exception documented.
- **SOLUTION:** unchanged — treat DESIGN.md as spec, add one line for numeric
  displays (tabular figures for hours/capacity).

### 5.7 Forms

- **CURRENT:** kit `field.tsx` (label `useId`, error `role="alert"`, `h-10`);
  7 labelled filter controls on `/opportunities`, 11 on register.
- **PROBLEM:** required marker inconsistent (`*` on required labels, but
  optional fields signal with an `(اختياري)` suffix instead of one shared
  convention); registration is a single step (H4); password requirements hint
  exists on register but its pattern isn't confirmed across all password flows.
- **SOLUTION:** one required-marker convention; keep `autocomplete`/`inputmode`
  on every new field (already correct on all auth inputs — verified 2026-09-25);
  password requirements shown inline next to the field (progressive, not modal).
- _Status 2026-09-26 (P2):_ **done.** One marker convention shipped —
  required = red ` *` appended to the label (kit `required` prop renders the
  same markup; hand-rolled labels fixed on sponsor register/console and
  opportunity detail), optional = `({dict.common.optional})` as a **label
  suffix** (all 3 `hint={dict.common.optional}` misuses moved; repo grep = 0,
  G5). The password-requirements hint is present in all three password flows
  (register, reset, settings change — source-verified). `useFocusFirstError`
  now runs in **29 files** (every form with a top-level field-error map), and
  the 4 raw-input workspace forms (invite, issue certificate, upload document,
  attendance) set `aria-invalid` from their error maps (14 controls) so the
  hook can focus their invalid controls. Real-browser confirmation landed in
  P4 (`login.spec.ts` asserts the mark + focus behavior in Chrome).

### 5.8 Navigation patterns

- **CURRENT:** desktop `lg` nav + AccountMenu disclosure; mobile hamburger
  dropdown; locale switch always visible; auth buttons hidden `<sm` in header
  (mobile panel carries them).
- **PROBLEM:** signed-in high-frequency destinations (4 items) require two taps
  on mobile (H/M3); hamburger is 36px (H3).
- **SOLUTION:** keep desktop IA (it is correct); on mobile add a **bottom tab
  bar for signed-in users** (dashboard, applications, messages, account) while
  the hamburger keeps the rest; raise trigger hit area to 44px.

### 5.9 One-off patterns to retire

- Inline `style="left:%;top:%"` pins (H5) → shared `MapPanel` component.
- Landing stat block (C1) → shared `ImpactStats` component with mandatory
  `demo` prop/label.
- Page-level `<header>` heroes on 2 pages → `PageHeader` component (keeps
  landmark semantics consistent).

---

## 6. Information-architecture findings

**What works:** the signed-out vs signed-in split, account menu for
low-frequency items, footer trust column, and locale switching are sound and
already researched-consistent.

**Issues:** (a) four verify routes inflate the footer (L2); (b) workspace
navigation lives only inside `/workspace/[orgId]` — org members entering from
the dashboard must pass through the workspace list (acceptable, but a direct
"my organization" shortcut in the account menu would save a hop); (c) admin is
one tabbed page (M7).

### Recommended sitemap

**Volunteer experience (primary nav):** المبادرات (list + detail) · الخريطة ·
المنظمات · الحملات — signed-in adds: لوحة التحكم · ترشيحاتي (applications) ·
الرسائل · الإشعارات — account menu: مساحة المنظمة · الإعدادات · الفوترة ·
السلامة. **Additions:** profile (already exists) should be reachable from the
avatar/account row, and certificates must link their PDF (H1).

**Organization experience:** `/{locale}/workspace` (list/create) →
`/{locale}/workspace/{orgId}` with sub-nav: overview · opportunities ·
applications · attendance · hours · certificates · members · documents ·
verification · campaigns · settings (all exist today — no changes proposed).

**Admin experience:** ~~keep `/admin?tab=` short-term~~ — done 2026-09-26
(P4): promoted to `/admin/{section}` sub-routes (M7 resolved, 14 sections:
users · organizations · sponsors · opportunities · international ·
verification · reports · risk · audit · content · settings · flags ·
exports · billing). Legacy `?tab=` URLs 308-redirect to their sub-route.

**Do not mix** volunteer and org navigation beyond the account menu switch —
current separation is a strength; preserve it.

---

## 7. Mobile-first audit

Context: Algeria = 79.5% internet penetration, 117% mobile connections (§15 S13)
→ assume mobile-first sessions on mid-range devices and variable networks.

| Area               | Current                                                                               | Verdict                                                           | Recommendation                                                                                                                                                                 |
| ------------------ | ------------------------------------------------------------------------------------- | ----------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Navigation         | Hamburger dropdown, 36px trigger, scrollable panel, closes on route/Escape/outside    | Functional but shallow                                            | Bottom tab bar for 4 signed-in destinations; 44px trigger; keep hamburger for the rest                                                                                         |
| Discovery          | `/opportunities` = 7 filter controls stacked above results, submit demoted to outline | Good baseline; risk = long filter block pushes results below fold | Adopt NN/g "tray" pattern: sticky compact filter row + bottom-sheet tray with results visible behind, active-filter chips + result count                                       |
| Maps               | Aspect-4/3 grid panel, `lg:grid-cols-3` split with list; pins keyboard-focusable      | Pins are links (good); grid gives no place context; no touch zoom | Real base geography (SVG wilaya outline or raster tiles), pinch/zoom + "search this area", list fallback stays as default on small screens                                     |
| Forms              | Register 11 fields one step; kit fields `h-10`; labels wired                          | Too long for mobile-first onboarding                              | Two-step (account → profile), defer optional fields; `autocomplete`/`inputmode` already correct — keep on new fields; extend the password-requirements hint to reset flows too |
| Volunteer profile  | Profile + card/CV actions; skills/languages APIs unused                               | Underpowered on mobile (identity card is the shareable artifact)  | Prioritize H2: skills/languages/interests + activity timeline; card/CV download promoted to primary mobile action                                                              |
| Application status | `/applications` list + detail tracker                                                 | Exists; empty for new users                                       | Keep; add status badge map (§5.3) so states are scannable at a glance                                                                                                          |
| Certificates       | List exists; PDF unreachable                                                          | Broken payoff on the device where sharing matters                 | PDF/download + "verify" link per certificate (H1)                                                                                                                              |
| Notifications      | Page + preference matrix                                                              | Complete                                                          | Consider unread badge in bottom tab bar (M3)                                                                                                                                   |
| Check-in           | QR token page + manual                                                                | Good; camera flow not verified without browser                    | Keep; ensure ≥44px targets on action buttons                                                                                                                                   |

**Redesign-not-resize candidates:** filter tray (discovery), bottom tab bar
(nav), two-step registration (onboarding), list-first map fallback (discovery).

---

## 8. Accessibility findings

**Strengths (verified):** exactly one `<main id="main">` per page (nested-main
bug already fixed); skip link present on every chrome page; `lang`/`dir`
correct per locale (`ar→rtl`, `fr/en→ltr`); labelled `<nav>` landmarks
throughout; `aria-current="page"` on active nav; 100 `aria-*` usages incl.
`aria-expanded/controls` on both disclosures; `role="progressbar"` with
`aria-valuenow` on capacity; 144 `role="alert|status|tablist|progressbar"`
usages; global `:focus-visible` outline (brand-600, 2px); kit field wires label
↔ input ↔ error; logical properties for RTL (14 physical→logical conversions
already done); zero Arabic leakage in fr/en and zero stray English UI words in ar
(checked on landing + key pages).

**Gaps:**

| Sev | Gap                              | Detail                                                                                                                                                                                                                              |
| --- | -------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| OK  | `autocomplete` on auth inputs    | Present on every auth input (`email`, `current-password`, `new-password`, `given-name`, `family-name`, `tel`, `one-time-code`) — verified case-insensitively 2026-09-25 after the first probe's case-sensitive regex false positive |
| MED | Skip link accessible name        | Text says "العودة للرئيسية", destination is `#main` (M5)                                                                                                                                                                            |
| MED | Error-state semantics unverified | Need post-submit check (`aria-invalid` + `aria-describedby` + focus move to first error) in a real browser (M4)                                                                                                                     |
| MED | Touch targets 28–40px            | WCAG 2.5.8 (AA) 24px minimum is met, but the product's own ≥44px rule and thumb-use reality are not (H3)                                                                                                                            |
| LOW | Color-only statuses possible     | Status badges must carry text/icon redundancy (§5.3)                                                                                                                                                                                |
| LOW | Contrast not machine-verified    | Requires a browser; recommend one axe/Lighthouse pass when a browser is available                                                                                                                                                   |

---

## 9. Component audit

**Counts (source-measured):** kit `Button` 129 · raw `<button>` 96 (~40
hand-rolled primaries) · kit `Badge` 56 · `Alert` 41 · `EmptyState` 35 ·
`Card/CardTitle` 70 · `Skeleton` 5 (single file) · kit `Input/Textarea/Select`
via `field.tsx`.

**Inventory — `packages/ui/src`:** `button`, `field` (Input/Textarea/Select),
`surfaces` (Card/CardTitle/Badge/Alert/EmptyState), `skeleton`, `cn`, barrel.

**Inventory — `apps/web/src/ui/components` (49 files):** chrome/nav (chrome,
nav-links, mobile-nav, account-menu, locale-switch, sign-out, icons), auth (10
incl. demo-access-card, auth-form-skeleton), volunteer (profile/account actions,
quick-chips, apply-form, tracker, pager, report-form, check-in,
notification-matrix, messages-view), workspace (11 + initiative-{console,map,support}

- create-org-form), campaigns/sponsor/international/misc.

**Assessment:** the system is real and ~75% adopted. The defect is dual
ownership of the same visual language (H6), not absence of a system. Unused
capabilities: `Skeleton` (only auth), `ListPager` (used — good), status badges
not centralized.

---

## 10. Design-system proposal (proposal only — do not implement yet)

### 10.1 Foundations

- **Color tokens:** keep `brand` (deep green) + `sand` ramps; add semantic
  aliases: `--color-bg`, `--color-surface`, `--color-fg`, `--color-muted`,
  `--color-border`, `--color-success/warning/danger/info` mapped onto existing
  ramps (no new hues). Status→role mapping table for every flow enum.
- **Typography:** scale 12/14/16/18/20/24/30/36/48; keep h1/h2/h3 rules from
  DESIGN.md (landing hero exception documented); `font-sans` includes Noto Sans
  Arabic; add tabular figures for hours/capacity/counters; line-heights:
  tight-headings / normal-body (1.6 for Arabic).
- **Spacing/grid:** Tailwind defaults; page `py-10`, section `space-y-8/10`;
  container `max-w-6xl px-4`; 12-col mental model; breakpoints keep `sm/md/lg`,
  reserve `xl` for dense consoles (admin/workspace tables).
- **Radius:** controls `rounded-lg` · cards `rounded-xl` · feature panels
  `rounded-2xl` (matches current usage, made explicit).
- **Shadows/elevation:** border-first (sand-200); elevation only for overlays
  (menus, dialogs, sheets): `shadow-sm` (menu) / `shadow-lg` (dialog+scrim).
- **Icons:** one stroke set (current `icons.tsx`); RTL mirroring rules: arrows
  and chevrons flip, clocks/globs/symmetric glyphs do not; icons ≥16px, hit
  areas ≥44px.

### 10.2 Components (kit extension list)

| Component                | Spec sketch                                                                                                                                                                   |
| ------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Button                   | variants primary/secondary/ghost/danger × sizes sm(≥44 touch)/md/lg + `loading`+`aria-busy`+disabled; kit-only                                                                |
| Input family             | label+optional help+error(`role=alert`) + `autocomplete` + `inputmode` + required marker convention                                                                           |
| Badge/StatusBadge        | enum→{label, role color, icon}; never color-only                                                                                                                              |
| Card / InteractiveCard   | shared hover+focus pattern; used by all domain cards                                                                                                                          |
| Tabs                     | `role=tablist` + deep-linkable (`?tab=`) — replaces ad-hoc admin tabs; **shipped** 2026-09-26 (kit `Tabs` in P2, admin deep-links via `/admin/[section]` sub-routes in P4/M7) |
| Dialog/Sheet             | focus-trapped confirm (destructive: revoke/reject) + mobile filter tray; Esc closes, focus returns                                                                            |
| Toast (optional)         | only for non-blocking confirmations; errors stay inline                                                                                                                       |
| PageHeader/SectionHeader | consistent `h1`/`h2` + description + actions slots                                                                                                                            |
| FilterBar/FilterTray     | desktop inline, mobile sheet with live counts + active chips                                                                                                                  |
| EmptyState               | mandatory for empty lists: title + why + action                                                                                                                               |
| Skeleton                 | route-level (`loading.tsx`) + list placeholders                                                                                                                               |

### 10.3 BLADNA domain components (adapt to existing, don't invent)

- **Exists — standardize:** `OpportunityCard`/`InitiativeCard` (list + rails +
  detail header), `OrganizationCard`, `WorkspaceNav`, `ApplicationRow`,
  `NotificationItem`, `MessageThread`, `ListPager`, `LegalDoc`.
- **Proposed — justified by gaps:** `CertificateRow` (status + number + PDF +
  verify link → fixes H1), `SkillsEditor` / `LanguagesEditor` /
  `InterestsEditor` / `ActivityTimeline` (fix H2), `MapPanel` (base geography +
  pins + list → fixes H5), `ImpactStats` (demo-labelled → fixes C1),
  `AttendanceStatusBadge`, `VolunteerCardView` (identity card display/share).
- **Not invented:** no generic DataTable (current tables are few and bespoke),
  no chart kit yet (analytics stay simple until requirements prove out).

---

## 11. Recommended architecture

```
Foundation (packages/ui)
├── Button · Input/Textarea/Select · Field · Card · Badge · Alert · EmptyState · Skeleton
├── (proposed) StatusBadge · Tabs · Dialog/Sheet · Toast
Layout (apps/web ui/components)
├── SiteHeader/SiteFooter (chrome) · NavLinks · AccountMenu · LocaleSwitch · MobileNav
├── (proposed) BottomTabBar · PageHeader/SectionHeader · FilterBar/FilterTray
├── AuthShell · AuthFormSkeleton · ListPager
BLADNA domain
├── OpportunityCard/InitiativeCard · OrganizationCard · WorkspaceNav
├── ApplyForm · ApplyViewTracker · CheckInActions · ReportForm
├── InitiativeConsole/Map/Support · CreateOrgForm
├── (proposed) CertificateRow · SkillsEditor · LanguagesEditor · InterestsEditor
├── (proposed) ActivityTimeline · MapPanel · ImpactStats · VolunteerCardView
Admin & platform
├── AdminConsole (+ tabs) · BillingConsole · SponsorConsole · Campaign components
└── (proposed, when admin grows) route-per-section under /admin/{section}
```

Server stays authoritative (RBAC in `packages/domain`, guards in
`server/guards.ts`); components consume the existing client (`ui/api/client.ts`)
and i18n dictionaries (types + ar/fr/en kept in sync).

---

## 12. Missing functionality (repository-verified)

1. Certificate PDF/verify links in UI (H1) — API complete.
2. Skills / languages / interests UI (H2) — **shipped in P1** (profile
   skillset manager over the manage routes).
3. Local activity/experience timeline (`VolunteerActivity` had no surface) — **shipped in P1**: `GET /me/activities` + profile timeline.
4. Saved/favorites — **shipped in P5** (`/me/saved-opportunities` routes,
   `/saved` page, save button on the initiative detail).
5. Route-level `loading.tsx` skeletons (M1) — **shipped in P1**.
6. Verified post-submit error semantics in a real browser — kit `field.tsx`
   already sets `aria-invalid` + `<p role="alert">`; focus-to-first-error
   behavior **confirmed in a real browser in P4** (Playwright `login.spec.ts`).
7. Demo-dataset label on landing impact stats (C1) — **shipped in P0**.
8. Recognizable base geography + "search this area" — **shipped in P3** (map
   clustering remains open).
9. Bottom tab bar for signed-in mobile (M3) — **shipped in P3**.
10. Touch-target compliance (≥44px) across table actions and hamburger (H3) —
    **shipped in P2** (grep gate G9).
11. E2E/UI test layer (M8) — **shipped in P4** (15 Playwright tests / 7 spec
    files + kit component suites; 375 Vitest tests / 35 files).
12. Correct skip-link accessible name (M5) — **shipped in P0**.
13. Optional: dark mode (M9) — decide deliberately, document either way.

## 13. Redundant / to-clarify

1. Four verify routes competing in one footer (L2) → hub + keep routes.
2. Campaigns vs Sponsorship vs CSR — three giving concepts without one-line
   differentiation on-page (L3).
3. Raw UI idioms duplicating kit (buttons/badges/alerts/cards/empties) — H6/§5.
4. Stale doc numbers (249 routes / 317 tests vs 258 / 333) — H7.
5. `SupportNeed`/`SupportOffer` vs `Opportunity` — landing surfaces both; ensure
   one sentence explains the difference (or they are clearly distinct UI roles).
6. Repeated landing rails over a tiny dataset (M2) — dedupe logic is cheaper
   than more seed rows.

## 14. Prioritized improvement roadmap

Each phase ends with the standing gates: `prettier` → `typecheck/lint/test` →
stop the BLADNA server (port 3002 in this workspace — port 3000 hosts an
unrelated local project and must never be killed) → one `npm run validate` →
restart → probe 153/153 (+ P1 suite 27/27 + P2 grep gates where they apply).

| Phase                                                         | Scope                                                                                                                                                                                                                                                                                                                                                                                                                                 | Effort    | Acceptance                                                                                                                                                             |
| ------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **P0 — Honesty & a11y quick wins** ✅ **(done 2026-09-25)**   | C1 demo label on landing stats; M5 skip-link name; H7 doc count refresh; M9 dark-mode stance recorded in `DESIGN.md` §10; RESEARCH corrections (H4 reclassified after case-insensitive re-scan)                                                                                                                                                                                                                                       | ≤1 day    | Landing shows demo qualifier; skip link announces "skip to content"; docs numbers match `check:routes`/`check:api-docs`/test run; validate green                       |
| **P1 — Flow payoffs** ✅ **(done 2026-09-25)**                | H1 certificate PDF+verify links (profile + workspace rows); H2 skillset manager + experience timeline (new `GET /me/activities`, `/me/profile` carries the skillset); M1 `loading.tsx`; M4 kit `aria-describedby` wiring + `useFocusFirstError` on auth forms (real-browser pass deferred to P4 — no browser here) ✅ _browser pass done 2026-09-26_                                                                                  | 2–4 days  | Volunteer can go apply → participate → certificate → download → public verify without dead ends                                                                        |
| **P2 — Design-system consolidation** ✅ **(done 2026-09-26)** | H6 kit adoption for ~40 raw primaries + raw badges/alerts/cards/empties; §5.3 StatusBadge enum map; H3 ≥44px targets; Tabs a11y; forms required-marker + password requirements                                                                                                                                                                                                                                                        | 1–2 weeks | grep gates: raw `bg-brand-700` outside kit = 0; every flow state renders one canonical badge; DESIGN.md checklist green                                                |
| **P3 — Discovery upgrade** ✅ **(done 2026-09-26)**           | H5 map base geography (bundled OSM/ODbL outlines) + zoom/pan + search-this-area (`bounds` filter) + list fallback; M2 landing rail dedupe; M3 mobile bottom tab bar; mobile filter tray (NN/g pattern: `<details>` tray + active-filter chips beside results)                                                                                                                                                                         | 1–2 weeks | Map readable without labels; filters visible with results on mobile; signed-in mobile reaches core 4 destinations in one tap                                           |
| **P4 — Quality & scale** ✅ **(done 2026-09-26)**             | M8 Playwright smoke (login, apply, org review, verify, admin, security headers, mobile discovery) + kit component tests; M6 caching strategy for public pages; M7 admin sub-routes — plus the approved Next.js 15.5 → 16.3 upgrade (proxy convention, Turbopack build) that unblocked the browser E2E run                                                                                                                             | 1 week+   | E2E suite in CI-equivalent script ✅ (15/15, 7 spec files, CI job step); no doc drift ✅; validate (375/35) + probe 119/119 + P1 27/27 + P2 ALL PASS ✅                |
| **P5 — Matching, saved & directory** ✅ **(done 2026-09-30)** | Wire the dormant `matchOpportunity` engine: `GET /me/recommendations` + dashboard strip + `/recommendations` page with localized reason chips (transparency copy in every state) + first-publish `NEW_MATCHING_OPPORTUNITY` fan-out; save/favorites (`/me/saved-opportunities` trio, `/saved` page, `SaveButton` on the initiative detail); public opt-in volunteer directory `/volunteers` (indexable, footer link, sitemap 18×3=54) | 2–4 days  | validate (396/36, 263 routes, API 264/264) exit 0 ×2 ✅; probe **153/153** + P1 27/27 + P2 ALL PASS + E2E 15/15 ✅; classification guard 34 private + 23 public + 1 ✅ |
| **P6 — Standard libraries** ✅ **(done 2026-09-30)**          | Replace hand-rolled custom code with established libraries: lucide-react icons behind the kit wrappers; sonner toasts; Radix UI (AlertDialog `useConfirm` + Dialog `usePrompt`, DropdownMenu account menu, Tabs behind the kit API); next-intl request config + provider over the existing dictionaries; Leaflet as the map engine (dynamic client import, **no tiles** — bundled OSM/ODbL base + SSR poster kept)                    | ≤1 week   | validate (403/37, 263 routes, API 264/264) exit 0 ✅; probe **153/153** + P1 27/27 + P2 ALL PASS + E2E 15/15 ✅; `window.confirm`/`window.prompt` grep = 0 ✅          |

| **P7 — Landing & discover redesign** ✅ **(done 2026-09-30)** | Upgrade the two acquisition surfaces _within_ the existing system (no retheme): landing hero (verifiability badge, bilingual headline, one white `role="search"` bar + kit outline submit, quick chips), discover rail + bento pillars + hairline stats panel on the new shared `SectionHeading`/`InitiativeCard` components, discovery-page eyebrow header + localized results count + honest empty state + mirrored chevrons; new i18n keys across `types`/`en`/`fr`/`ar`; lucide arrows replace `→` (`rtl:rotate-180`); `.hero-rise` only under `prefers-reduced-motion: no-preference`; AR `line-height: 1.75` | 1–2 days | validate (403/37, 263 routes, API 264/264) exit 0 ✅; probe **153/153** + P1 27/27 + P2 ALL PASS + E2E 15/15 ✅; DESIGN.md tokens/kit/honest-copy rules unchanged ✅ |

| **P8 — Signed-in surfaces redesign** ✅ **(done 2026-09-30)** | Rebuild all four authenticated surfaces _within_ the existing system: participant dashboard (eyebrow header, hairline `StatGrid` with icon chips, `SectionHeading` rhythm + kit `Badge`/`EmptyState` on every list, icon-led quick-link bento, `→` → RTL-mirrored lucide arrows, §58 international bar byte-identical), workspace console (verification badge header, analytics via `StatGrid`, state-toned certificate badges, `SectionHeading` results header + kit `EmptyState`, avatar rows — `#opp` selector contract intact), initiative detail (localized section eyebrows, kit meta chips, icon-led facts `dl` + `tabular-nums`, mirrored back chevron), discover (live `aria-live` count, icon'd empty state, `.rise` grid — E2E selectors untouched); new shared `stat-grid.tsx` + 10 lucide wrappers; new i18n keys ×4 files + empathetic empty-state copy; `.rise` only under `prefers-reduced-motion: no-preference` | 1–2 days | validate (403/37, 263 routes, API 264/264) exit 0 ✅; probe **153/153** + P1 27/27 + P2 ALL PASS + E2E 15/15 ✅; DESIGN.md tokens/kit/honest-copy rules unchanged ✅ |

| **P9 — "Oasis Modern" visual retheme** ✅ **(done 2026-09-30)** | Full visual retheme **at the token + kit layers** (system-wide via kit + chrome, deep passes on the five flagship surfaces): new `@theme static` ramps — deep jade `brand` (700 `#18664a` 6.9:1 on white), warmed `sand` (+ new `950` ink, 500 4.7:1 on the page bg), new decorative `clay` terracotta (text ≥ clay-700, never semantic — status sky/amber/red untouched); IBM Plex Sans Arabic (300–700) via `next/font` carrying both scripts; `--shadow-card` elevation + 8/12/14/16px radius tiers; the one deep-ink `sand-950` footer; deeper landing hero (jade→700 gradient, jade+clay glow, `text-5xl md:text-6xl`); semantic `--color-bg/surface/fg/muted/border` aliases as the recorded dark-mode prerequisite (dark still deferred); email/PDF hexes moved with the brand; DESIGN.md rewritten incl. the new §11 color system — class names + copy kept byte-stable so probe/P1/P2/E2E locks held | 1–2 days | validate (403/37, 263 routes, API 264/264) exit 0 ✅; probe **153/153** + P1 27/27 + P2 ALL PASS + E2E 15/15 ✅; contrast proofs recorded in DESIGN §11 ✅ |
| **P10 — Reference-driven Hero & dashboard pass** ✅ **(done 2026-09-30)** | From 14 curated Dribbble references (`design-refs/dribbble/` — 8 charity/nonprofit landing pages + 6 admin dashboards, each shot read as an image and compared against `page.tsx`/`dashboard/page.tsx`/`stat-grid.tsx`): hero display scale (`md:text-7xl`, direction-neutral gradient headline + clay rule), pill geometry on marketing surfaces only (kit stays 8px), hairline trust-strip fold exit with scroll cue, warm `sand-100/60` stats band with clay rules under `text-5xl` figures, two-zone dashboard (`lg:grid-cols-3`, §58 international bar byte-identical), live date under the greeting, `StatGrid` solid `brand-800` chip + `text-3xl` + honest `statOpenHint` (i18n ×4 files); recorded non-goals N1–N4 (charts, photo masks, kit-wide pills, tinted ground) | ≤1 day | validate (403/37, 263 routes, API 264/264) exit 0 ✅; probe **153/153** + P1 27/27 + P2 ALL PASS + E2E 15/15 ✅ |

| **P11 — Imagery & atlas map pass** ✅ **(done 2026-10-01)** | The imagery brief in both directions: an original layered SVG `hero-art.tsx` behind the landing hero + final CTA (decorative, `aria-hidden`, gradient headline byte-stable) and **13 CC0/PD photographs** (Openverse, `license=cc0\|pdm` only → `apps/web/public/photos/`, provenance in `design-refs/PHOTO-CREDITS.md` + `photo-picks.json`) as `InitiativeCard` covers via a new `coverImage` field (LIST_SELECT → DTO → seed) and the how-works band — photos decorative (`alt=""`), thematic, never documentary (§7); how-works badges `size-9 → size-10` (G6). Plus the `/[locale]/map` overhaul: PageHeader (`mapEyebrow` ×4 files, distinct-wilaya stats, mirrored back link), jade land tint shared by poster + overlay (`LAND_FILL`/`LAND_STROKE`), `sand-50 → sand-100` ground with a clay-north compass rose in the letterbox margin, proximity clustering (30px, `size-10 bg-brand-800` badge, click/Enter/Space zooms to split, `autoPanOnFocus: false`), enriched side list (title + Badge + location + date) with hover/focus ↔ pin `.is-hot` sync, permanent results chip + search-area column | ~1 day | validate (403/37, 263 routes, API 264/264) exit 0 ✅; probe **153/153** + P1 27/27 + P2 ALL PASS + E2E 15/15 ✅ |
| **P12 — Missing pages & existing pages pass** ✅ **(done 2026-10-01)** | Public CMS surfaces + flow depth: trilingual help centre (`/help` + `/help/[slug]`, PUBLISHED only, seeded faq/getting-started/about with en/fr/ar bodies, plain-text paragraph renderer, footer Help link, sitemap 19 paths / 57 entries); dismissible announcement banner on landing + dashboard (pinned via GET /home, fallback GET /announcements, per-row `localStorage` dismissal, all CMS fetches fail-open); featured rails (landing `HOME_*` band, discover `DISCOVER_FEATURED` strip, 5 seed placements idempotent on the placement unique key); landing hero honors an admin `HomeContent` row when present (locked copy otherwise); verify hub redesign (3 explainer cards + how-it-works + `/help/faq` link — `verify-code`/Check/"Verify a record" E2E locks intact) with mirrored back chevrons on the 3 subpages; shared `PasswordInput` reveal toggle (kit `Input` `trailing` slot, `grid size-10`) wired into login/register/reset ×4 i18n files | ~1 day | validate (403/37, 263 routes, API 264/264) exit 0 ✅; probe **153/153** + P1 27/27 + P2 ALL PASS + E2E 15/15 ✅ |
| **P13 — Organization pages presentation pass** ✅ **(done 2026-10-02)** | The organization surfaces present the tenant: profile detail rebuilt (mirrored back link, kit `Badge` type/verified chips, `Avatar`+h1+location header, hairline `StatGrid` members/opportunities/campaigns — campaign total from GET /campaigns `organizationId`), shared `InitiativeCard` 2-up grid via new `showOrganization={false}` (byline redundant on the org's own page), public campaigns rail (`StatusBadge`, dates, participants/targets, links `/campaigns/[slug]`, catch → empty), facts sidebar (type, trust, verified since, profile since + honest unverified note); directory cards link to their profile (`h2 > Link` + hover) — they were a dead end; i18n `organizations.*` ×6 in all four dictionaries; data hygiene: stray user-made PUBLISHED `slug=test` (org `nexvo`, null coordinates) demoted to DRAFT so the map-coords gate holds | ≤1 day | validate (405/37, 263 routes, API 264/264) exit 0 ✅; probe **153/153** + P1 27/27 + P2 ALL PASS + E2E 15/15 ✅ |
| **P14 — Support cards, tab bar & kit CSS source fix** ✅ **(done 2026-10-02)** | Public support-need cards rebuilt (kit `Badge` kind/goal-reached chips above the title, `dir="auto"` descriptions — the RTL page was bidi-scrambling Latin copy —, bold `tabular-nums` figure rows split from the accepted-offers meta, hairline `mt-auto` footer with the mirrored sign-in chevron, `sm:grid-cols-2`), volunteer figures harmonized, console need `dir="auto"`; kit `Tabs` redesigned (brand-600 active pill, hairline sand track, single nowrap scroll row, white hover) — and the root cause behind both user-reported bugs: **Tailwind v4 auto-detection never scanned `packages/ui`**, so kit-unique classes (tab `data-[state=active]`, login `bg-brand-700`) had zero bytes in the built CSS; fixed with `@source` in `globals.css` + a permanent computed-style E2E (`console-tabs.spec.ts`) | ≤1 day | validate (405/37, 263 routes, API 264/264) exit 0 ✅; probe **153/153** + P1 27/27 + P2 ALL PASS + E2E 16/16 ✅ |
| **P15 — Organization profile trust & presence** ✅ **(done 2026-10-02)** | The tenant gets a face: `ORG_PUBLIC_SELECT` ships `coverImage` (presentation — the contact-free rule still holds for email/phone/address/website) rendered as a rounded cover band; kit `Avatar` gains `src`/`alt` (the logo covers the tile, initials stay the fallback — profile header + every directory card); a sidebar "Team" card lists up to 4 members **who opted into the public directory** (`volunteerProfile.publicProfile`, ACTIVE membership, no soft-deleted user — the relation args live inside the select, so an unconsented roster cannot leave the query) with tile + name + role and a `+N` chip derived from the same `_count.members` the StatGrid shows; i18n `organizations.teamTitle` + `organizations.memberRoles` ×5 in all four dictionaries; seed + idempotent live `prisma db execute`: cover photo (CC0 P11 batch), original SVG mark (`logo-atlas-verts.svg`), demo volunteer seated as ACTIVE STAFF | ≤1 day | validate (406/37, 263 routes, API 264/264) exit 0 ✅; probe **153/153** + P1 27/27 + P2 ALL PASS + E2E 19/19 ✅ |
| **P16 — App bar declutter** ✅ **(done 2026-10-02)** | The signed-in header crammed eight text links + language switch + account + a bordered logout into one row (the dashboard label wrapped onto two lines in a user screenshot): desktop nav collapses to the public four + dashboard with `shrink-0 whitespace-nowrap` links; messages/notifications become icon buttons labeled from existing keys (`MailIcon`/`BellIcon` + `aria-label`/`title`); applications moves into the account menu; sign-out goes ghost; the bar becomes `sticky top-0 z-40` (nothing else in the app sticks; Radix menus/dialogs sit at z-50+); `coreNavLinks` untouched — the P3 bottom tab bar and the mobile drawer (which re-adds the icon-only pair) keep the core four | ≤1 day | validate (406/37, 263 routes, API 264/264) exit 0 ✅; probe **153/153** + P1 27/27 + P2 ALL PASS + E2E 19/19 ✅ |
| **P17 — Messages workspace** ✅ **(done 2026-10-02)** | The messages page went from plain to chat conventions (user request): conversation rows gained a peer `Avatar` tile (profile image → initials) and a start-border active state; the thread renders on a tinted `sand-50` canvas — white peer bubbles (border, sender name in `brand-700` once per turn) vs `brand-600` mine bubbles in white text (5.0:1), logical `rounded-es/ee` tail corners, one `formatDate` separator per day, turn grouping (repeated names drop, gaps tighten), new `formatTime` helper as outside-the-bubble meta, `dir="auto"` message bodies (Latin copy stops bidi-scrambling in RTL — the P14 fix applied here), 📎 emoji → `PaperclipIcon` (chip, link and picker — the file input is `sr-only` behind a focus-ringed label) + `SendIcon` in the composer, Enter-to-send (Shift+Enter newline, IME-aware), peer names under the thread title, mobile auto-scroll to the opened thread; demo data in data (seed + idempotent `prisma db execute`, subject/ON CONFLICT-guarded): an org↔volunteer 4-message thread so the page opens on real content, user-created conversations untouched. Also closed P16's residual risk — sticky-header audit at 1024/1152/1280/1440 px: no horizontal overflow, no nav/right-cluster overlap, every link 44 px | ≤1 day | validate (407/38, 263 routes, API 264/264) exit 0 ✅; probe **153/153** + P1 27/27 + P2 ALL PASS + E2E 20/20 ✅ |
| **P18 — Support offers decision room** ✅ **(done 2026-10-02)** | The offers idea rebuilt around the user's report ("didn't update when accepting offers") plus a request for more detail, distinction and beauty: both needs APIs (console `listNeeds` + the public opportunity payload) now sum accepted offer quantities (`acceptedQuantity`) beside the existing counts/amounts, and a shared `NeedProgressBar` paints two honest segments — solid `brand-600` = received `fulfilled`, lighter `brand-300` = accepted pledges still to be delivered, capped at the target with aria reporting the painted total — on the public need card, the console needs tab and the new offers group headers, so a decision moves the bar in place without pretending the goods arrived (financial keeps its accepted-amount line); the console offers tab became a decision room: three-stat summary strip (total / pending in amber / accepted in `brand-700`), instant status chips with counts (`aria-pressed`, 44 px targets), offers grouped under their need (kind pill, pending/accepted counts, bar or financial line in the header) and rich cards — status chip + large `tabular-nums` figure (amount or ×quantity), offerer `Avatar` initials + masked name + masked email, `dir="auto"` description on a start-border rule, contact note, submitted/decided dates, reject reason, primary Accept beside ghost Reject with the inline reason field; i18n +6 ×4 (`opportunity.receivedLabel`/`acceptedLabel`, `initiativeConsole.offersTotal`/`offersAll`/`offerSubmittedAt`/`offerDecidedAt`); fixture `scripts/e2e-ensure-pending-offer.ts` self-heals from Playwright global setup through a `tsx` child (ladder need + one fresh PENDING offer, stale markers dropped, user data untouched) | ≤1 day | validate (410/39, 263 routes, API 264/264) exit 0 ✅; probe **153/153** + P1 27/27 + P2 ALL PASS + E2E 21/21 ✅ |
| **P19 — Shareable conversation link** ✅ **(done 2026-10-02)** | The only way to start a conversation was a raw 36-char UUID ("uuid صعب ايجاه اعمل حل اخر"): dig your id out of Settings, share that string, paste it back into the recipient field. The account card now leads with a shareable conversation link (`/{locale}/messages?to=<user id>`, absolute after mount, truncated code chip with a full-title hover) beside a Copy link button (clipboard write + 2 s confirmation; insecure-context fallback selects the code for Ctrl+C) over the raw-ID row whose hint points at the link; the messages workspace reads `?to=` on mount and opens the new-conversation form prefilled, and the recipient field unwraps a whole pasted link (UUID extracted client-side before `POST /conversations`) so the server's existing DIRECT dedupe lands both parties on the thread they already share; i18n +3 ×4 (`settings.conversationLink`/`copyLink`/`linkCopied`) plus rewritten `yourUserIdHint`/`recipientHint` ×4; guard E2E `messages.spec.ts` +1 asserts the clipboard round-trip, the prefill and a content-carrying existing thread | ≤1 day | validate (410/39, 263 routes, API 264/264) exit 0 ✅; probe **153/153** + P1 27/27 + P2 ALL PASS + E2E 22/22 ✅ |
| **P20 — Report from the page, not a UUID** ✅ **(done 2026-10-02)** | The report form demanded a "target identifier" whose hint promised a UUID "shown in the page or profile URL", while the public pages are addressed by slug ("كيف ابلغ هنا واين اجد المعرف او الرابط او اي شي اخر"). A shared `parseReportTargetRef` (`@bladna/types`, client + server) now reads a pasted page link (path → target type: `opportunities\|organizations\|workspace\|campaigns`, `verify/certificate?code=` → CERTIFICATE; locale/query/hash stripped) or a bare slug; the server's reworked `resolveTarget` resolves `id OR slug` (free text only ever filters the slug column, never a uuid one), returns the effective type for the stored row and audit, and honestly rejects `INTERNATIONAL_OPPORTUNITY` — it used to fall through to "Message not found", and the moderation pipeline has no effect branch for it, so the type is also hidden from the menu; initiative/organization profiles gained a **Report** link opening `/safety?target=<own page link>` prefilled with the type auto-detected (the value rides the anonymous sign-in bounce); i18n `common.report` +1 ×4 and rewritten `safety.targetIdHint`/`targetIdHintCertificate` ×4; guards `report-target.test.ts` +9 and E2E `safety.spec.ts` +1 backed by the self-healing `e2e-ensure-clean-report.ts` fixture | ≤1 day | validate (419/40, 263 routes, API 264/264) exit 0 ✅; probe **153/153** + P1 27/27 + P2 ALL PASS + E2E 23/23 ✅ |
| **P21 — Review before publish + the platform's idea on the home page** ✅ **(done 2026-10-03)** | The CSJ letter's claim (initiatives pass a review before publication, accepted/rejected under platform supervision; no publishing for unverified/suspended organizations) needed code, not prose: `OPPORTUNITY_TRANSITIONS.DRAFT` listed `PUBLISHED` (a verified org could self-publish in one click), `platformAction` documented itself as deliberately exempt from the org-verification wall, and the org row rendered a Reject button that always 403'd (`opportunity.moderate` is platform-only). Now DRAFT reaches only `PENDING_REVIEW`/`ARCHIVED` (nobody jumps the queue), the tenant transition endpoint maps `PUBLISH`/`REJECT` to `opportunity.moderate` (orgs submit/withdraw/steer; the dead Reject button and its reason field left `TRANSITION_ACTIONS`), `platformAction` shares the verified+active-organization wall on every move to `PUBLISHED`, and the admin action menu filters per row through `canTransition`. The home page then states the idea: hero subtitle/badge/trust strip rewritten ×4 (badge restores the locked **Algeria-first** wording; strip = verified organizations → reviewed initiatives → append-only hours → checkable certificates) plus a new typographic **"From idea to impact"** lifecycle section — five numbered steps + a closing "space of trust" cell, ×4 i18n, no photos (the three CC0 shots stay in "How it works"); `docs/API.md` ×2 documents the rule; guards `state-machines.test.ts` (DRAFT→PUBLISHED false) and `rbac.test.ts` (no org role holds `opportunity.moderate`) | ~1 day | validate (419/40, 263 routes, API 264/264) exit 0 ✅; probe **153/153** + P1 27/27 + P2 ALL PASS + E2E 23/23 ✅ |
| **P22 — A home page that catches the eye** ✅ **(done 2026-10-03)** | The landing page was organised but visually flat: three consecutive sand sections ran through the middle, figures sat small on a light panel, and no mid-page anchor existed for the eye. Fixed with **zero new copy** (no i18n file touched — markup, classes and one guarded keyframe only): the lifecycle section turns white with clay-gradient step marks (`from-clay-500 to-clay-700` + `ring-4 ring-clay-100`, clay decorative only), the pillars bento's identity cell **inverts to the deep brand gradient** (`from-brand-700 via-brand-800 to-brand-900`, `iconFor(key, onDark)` flips the glyph to `text-brand-200`) so the grid encodes priority, and the impact panel crosses to a **dark brand band** keeping the `gap-px` instrument, clay rules and `statsNote` verbatim while figures grow to `text-5xl/6xl` in a white→`brand-200` clipped gradient. `SectionHeading` gained an optional `tone="dark"` (default renders byte-identical for every other caller); a new `.hero-breathe` keyframe (16s, transform-only, inside the `no-preference` query) animates the hero/stats/CTA washes for motion-opted-in users only; hero search/CTAs got `shadow-xl` + `motion-safe` hover lift; the verify card gained a warm two-tone wash with a masked shield watermark. Locked strings untouched (quick-chip hrefs ×1, header `href="/en/opportunities"`, **Algeria-first**, **Append-only verified hours**, `#q`/`#opp`/`#filter-tray`, M6 cache) | ≤1 day | validate (419/40, 263 routes, API 264/264) exit 0 ✅; probe **153/153** + P1 27/27 + P2 ALL PASS + E2E 23/23 ✅ |
| **P23 — Contact & trust before applying** ✅ **(done 2026-10-03)** | Before applying, an applicant must answer three questions — do volunteers actually appear, how do I reach them, and how well do I know this organizer — yet the directory published no way to contact a profile owner (opt-in rows, `publicEmail` masked by default, `GET /volunteers` returned no handle), the initiative/organization pages showed a `Contact` card only when phone/email existed, and an anonymous Message click would have dropped its target in the sign-in bounce. P23 wires the chain end to end: directory items expose the owner's `userId` (publicProfile-gated; messaging keeps its rate limit + block reads; `docs/API.md` documents it) behind a card **Message** button → `?to=`; `messages/page.tsx` re-validates `?to=`/`?org=`/`?name=` through pure helpers `parseContactParams`/`contactQuery` and folds them into `pageSession` + `?next=`, so the bounce lands on an addressed compose form (`?org=` mode swaps the recipient input for a static **Organization** row and posts `{ organizationId }` — the volunteer→org thread staff already list); initiative headers gain an org profile link + logo `Avatar` + trust badge (`workspace.verification.levels` copy, the seeded association reads **Level 2 — Organization verified**) and their contact card always renders with a **Message the organization** button; organization profiles gain the same header button. i18n +2 ×4 (`common.message`, `opportunity.messageOrganization`); guards `messages-utils.test.ts` +5 (419→424), E2E +1 anonymous bounce test + org-profile href assertion (23→24 / 13 files), probe +6 (153→159) | ≤1 day | validate (424/40, 263 routes, API 264/264) exit 0 ✅; probe **159/159** + P1 27/27 + P2 ALL PASS + E2E 24/24 ✅ |
| **P24 — Comments & ratings** ✅ **(done 2026-10-03)** | Trust, not star-count: only people who _were there_ may rate — a new `OpportunityReview` model enforces it in the data (rating 1–5 with a DB CHECK, optional body ≤2000, compound unique `[opportunityId, authorId]`, and a `source` column recording **which** path qualified the author) while `eligibilityFor` resolves the path live (ACCEPTED application on that initiative OR VERIFIED hours through its activity/attendance). Four routes in `modules/reviews.ts`: the public list is viewer-aware in one round trip (`stats{count, average, distribution}` + `viewer{authenticated, eligible, eligibility, own review}` through forwarded cookies — the detail page SSRs it straight into the section), and POST/PATCH/DELETE sit behind auth with 403 (ineligible), 409 (second review), 404 (foreign own-only rows, honest like saved/attendance), an idempotent delete, and `opportunity.review`/`opportunity.review.delete` audit records. The section (`reviews-section.tsx`) shows the average + stars + count (hidden at zero), provenance badges (**Accepted participant**/**Verified hours**), opt-in author names else the verified-participant label, an always-visible eligibility note, a star `radiogroup` of raw `role="radio"` buttons (`min-h-11`, kit-Textarea ≤2000), confirm-gated delete, `router.refresh()` after every mutation (no client/server state to reconcile) and a sign-in CTA that also appears when a mid-write 401 kills the session; `docs/API.md` ×4. i18n +17 ×4; guards `review.test.ts` (validation) +8 and `reviews.test.ts` +5 (424→437 / 40→42), E2E +1 author cycle (24→25 / 14 files), probe +8 (159→167); seed adds one demo review on the park initiative so E2E's beach-initiative CRUD never touches seeded content | ≤1 day | validate (437/42, 267 routes, API 268/268) exit 0 ✅; probe **167/167** + P1 27/27 + P2 ALL PASS + E2E 25/25 ✅ |
| **P25 — Public volunteer profile** ✅ **(done 2026-10-03)** | The directory could list volunteers but not show one: cards ignored the owner's `profileImage`, the name was dead text, and the stored privacy flags (`publicProfile`/`showWilaya`/`showHours`/`showCertificates`) controlled nothing a visitor ever saw. P25 makes the card open — a public `GET /volunteers/:id` (UUID `profileParamsSchema`, registered beside the list, participants 74→75) answers the same not-found for unknown ids, malformed uuids and opted-out profiles (no existence oracle; the API itself returns a real 404), gates the location line on `showWilaya`, withholds `achievements.verifiedHours` **without issuing the aggregate** when `showHours=false` (spec §30, mirroring `GET /public/verify`) and the certificate list when `showCertificates=false` — the first controlled surface for that stored flag, so settings ships its sixth enforced toggle (`settings.showCertificates`) — masks email unless published and never travels the phone number. The page renders the identity header (photo `Avatar` with initials fallback, verification badge, code · location, member-since, availability chips), the P23 `?to=` Message chain, digit tiles backed by honest `certificatesTotal`/`participationsTotal` next to capped lists, explicit hidden-notes instead of fake zeros, certificate rows deep-linking credential-keyed verification (`?code=BLD-CERT-…`), the top-8 participation timeline with per-row hours under the same gate, About/skillset sections and the directory's privacy footnote; directory cards gain the photo and the name link; `private-noindex.test.ts` classifies the page public while the sitemap stays pinned at 57 (the directory is the discovery surface). i18n +8 ×4; guards `volunteer-profile.test.ts` +4 (437→442 / 42→43), E2E +3 (25→28 / 15 files), probe +18 (167→185 — including the live `publicProfile:false` flip and the settings toggle) | ≤1 day | validate (442/43, 268 routes, API 269/269) exit 0 ✅; probe **185/185** + P1 27/27 + P2 ALL PASS + E2E 28/28 ✅ |
| **P26 — A landing that moves** ✅ **(done 2026-10-03)** | Clone what the user pointed at — `mjeunesse.gov.dz`, especially the landing page — "exactly, but with our information", with suitable images and motions, without moving a single locked string. The reference ships as a Vite SPA, so its anatomy came from the shipped CSS/JS bundles plus live captures: ink top strip → breaking marquee → framed photo slider with `04/10` counter → sections → dark footer; palette `#03120d`/`#062e22`/`#f6f2ea`/`#e9c9a5`; Noto Kufi Arabic display + IBM Plex Sans Arabic body; keyframes `drift`, `marquee-ltr/rtl`, `pulsering`. P26 rebuilds the composition on BLADNA content: the locked `heroBadge` (**Algeria-first**) rides an ink `bg-sand-950` strip, the P12 announcement gains `variant="ticker"` (terracotta marquee, exact-period copies, RTL keyframe, sr-only sentence with the moving track `aria-hidden`, hover/focus pause, dismissal untouched — dashboard banner unchanged), the hero splits into copy + a four-photo **slideshow** (`hero-slider.tsx`: 900ms crossfade + 16s `hero-drift`, `01/04` counter, `Show slide n` segments, play/pause `aria-pressed`, no autoplay under reduced motion, hidden tab stops advancing), sections gain `data-reveal` scroll-ins (progressive `animation-timeline: view()`, print-guarded), impact figures **count up** (`stat-counter.tsx` — SSR ships the final honest number, observed once), a four-card services grid (verify/map/directory/international, each keeping its own copy) replaces the stacked bottom cards, RTL headings switch to **Noto Kufi Arabic** (`--font-display` via `--font-kufi`, Latin keeps Plex), and the two primary pills glow via `pulsering` — every keyframe behind `prefers-reduced-motion: no-preference`. Hero photos reuse four CC0 frames already credited in PHOTO-CREDITS.md. i18n +7 ×4, E2E +4 (`landing-motion.spec.ts`, 28→32 / 16 files), probe +7 (185→192). | ≤1 day | validate (442/43, 268 routes, API 269/269) exit 0 ✅; probe **192/192** + P1 27/27 + P2 ALL PASS + E2E 32/32 ✅ |
| **P27 — The reference chrome rides every page** → **(done 2026-10-03)** | "Continue and the other pages" after P26: lift the reference's instruments into shared chrome instead of repainting pages one by one. `site-masthead.tsx` (server) renders the ink promise strip (locked `Algeria-first`) + the P12 announcement as `variant="ticker"` above the sticky header in `[locale]/layout.tsx` — every route opens with the reference's two bars; the fetch follows the P12 contract (GET /home pinned → latest active → degrade to "no ticker"); the landing dropped its private strip/ticker/fetch and the dashboard's standalone banner retired (one announcement surface, per-id dismissal unchanged). `page-masthead.tsx` gives a full-bleed deep-green title band (hero gradient + jade wash) to eleven hubs (opportunities, directory, verify, organizations, international, campaigns, map, help, safety, saved, recommendations) plus `LegalDoc` (terms/privacy): gold eyebrow → white h1 (Kufi via the P26 `[dir='rtl']` rule) → jade lead, optional note (directory privacy footnote, legal "updated" line) and action slot (map coverage figures recolored for ink), entrance = the gated `rise` keyframe; scroll reveals deliberately not extended (a full-height container in view at scroll 0 parks at partial opacity under an `entry`-ranged timeline). Zero new dictionary keys — the band borrows each page's own strings. probe +6 (192→198), E2E +2 (`site-chrome.spec.ts`, 32→34 / 17 files). | 1 day | validate (442/43, 268 routes, API 269/269) exit 0 ✅; probe **198/198** + P1 27/27 + P2 ALL PASS + E2E 34/34 ✅ |
| **P28 — The band carries detail pages & auth** ✅ **(done 2026-10-03)** | "Yes, I want" after P27: extend the reference band to the detail pages and auth. `page-masthead.tsx` gained a `children` mode (TS union — exactly one of `title`/`children`; hubs keep string mode, every caller keeps a single h1). Initiative detail moves its full identity header (back link → badges → title → organizer → save/report) into the band with ink recolors (`brand-100/200` meta, white organizer link, `clay-300` report); the organization keeps `<header>` + Message/Report in the band with the `org-cover` photo below it; the volunteer identity card is rebuilt as band content (white `text-3xl` name, `brand-200` meta, light chips/outline button unchanged). `AuthShell` renders its title/subtitle through a `max-w-md` band — login, register, forgot/reset-password, MFA, verify-email all gain the silhouette, the card starts at the form, the single `Welcome back` h1 moved into the band. Probe +5 (198→203: band presence on detail/login/profile, login 200 + h1 count, organizer-type regex widened to accept `text-brand-200`), E2E +2 (`site-chrome.spec.ts`, 34→36 / 17 files). Zero new dictionary keys. | 1 day | validate (442/43, 268 routes, API 269/269) exit 0 ✅ · probe **203/203** + P1 27/27 + P2 ALL PASS + E2E 36/36 ✅ |
| **P29 — Zoned impact-metric cards & a pinnable map** ✅ **(done 2026-10-04)** | The impact metrics printed as one interwoven line — `الفعلي: 0 / 5 مورد تعليمي · المصدر: … · تم التحقق` — on both the console's Impact tab and the public initiative page, so the actual figure hid inside prose. A new shared `impact-metric-card.tsx` zones the same data: title row (type chip, name, verified badge, console timestamp), a labelled Actual/Target pair in tabular numerals (decimal strings from the raw metric select normalise to figures; an undeclared target prints `—`), an honest `role="progressbar"` bar (aria-valuemin/max/now, visually capped at 100% while the printed figures never round, omitted without a denominator) and the source on its own muted line, hook `data-impact-metric`; labels reuse `initiativeConsole.metricActual/metricTarget/metricSource` → zero new dictionary keys. Same pass fixed the map contract the probe caught: `buildDiscoverWhere` gives `mode=map` a pinnable-row requirement (own coordinates or a coordinate-carrying city — the renderer's own fallback), so the placeless ONLINE initiative created during testing leaves the map payload while staying in the regular list; probe +2 (203→205: zoned cards + labelled figures), E2E +2 (`impact-metrics.spec.ts`, 36→38 / 18 files) | ≤1 day | validate (442/43, 268 routes, API 269/269) exit 0 ✅ · probe **205/205** + P1 27/27 + P2 ALL PASS + E2E 38/38 ✅ |

| **P30 — The platform mark** ✅ **(done 2026-10-04)** | The user supplied the official art ("first, make this the platform's logo") — a 1254² transparent PNG (Algeria map outline, crescent and star, the بلدنا calligraphy, the globe, the BLADNA wordmark and tagline). It ships as three resampled assets: `public/logo.png` (384², 167 KB — the every-page mark), `src/app/icon.png` (512²) and `src/app/apple-icon.png` (180²), the app's first document/apple icons (Next registers both from the app directory, no metadata change). The header and footer brand slots render the mark where the initial-letter `Avatar` sat (`h-11`/`h-10`, `decoding="async"`, `alt=""` so the siteName text — `BLADNA` / `بلدنا` — stays the link's accessible name), and `AuthShell` opens every auth flow with a centered mark above the back-home link. Zero new dictionary keys; probe +2 (205→207: landing ships the logo, head carries the icon), E2E +2 (`site-chrome.spec.ts`, 38→40 / 18 files) | ≤1 day | validate (442/43, 268 routes, API 269/269) exit 0 ✅ · probe **207/207** + P1 27/27 + P2 ALL PASS + E2E 40/40 ✅ |

| **P31 — Honest access & true link origins** ✅ **(done 2026-10-04)** | The two live bugs the user reported against production. (1) Workspace 404s: every workspace catch merged `FORBIDDEN || NOT_FOUND` into `notFound()`, so a member whose role lacks the page's permission (volunteer@ on hours/certificates) or a signed-in non-member at the layout gate saw "الصفحة غير موجودة" for a page the tabs visibly linked — a shared `workspace-no-access.tsx` now renders on `FORBIDDEN` (standalone h1 at the layout gate, in-shell card + back-to-overview in the eleven tabs; the streamed skeleton no longer sticks) while `NOT_FOUND` stays a real 404; **2 new keys across all four i18n files**. (2) `checkInUrl` said `http://localhost:3000`: root `.env` `APP_URL`/`PUBLIC_APP_URL` now carry the live domain (email verify/reset, invitation and certificate-verify links follow) and a new `originFor()` derives in-request links from the caller's own host (configured/local allowlist — a forged `Host`/`X-Forwarded-Host` falls back to the public URL) via `checkInUrlFor(ctx, token)`; live: domain session → `https://bladna.aymen-digital-studio.site/check-in?token=…`, localhost → `http://localhost:3002/check-in?token=…`. +4 unit tests; probe +4 (207→211), E2E +2 (`workspace-access.spec.ts`, 40→42 / 19 files) | ≤1 day | validate (446/43, 268 routes, API 269/269) exit 0 ✅ · probe **211/211** + P1 27/27 + P2 ALL PASS + E2E 42/42 ✅ |

| **P32 — One name, one message** ✅ **(done 2026-10-04)** | The user's two brand directives. (1) Name: the official art's own tagline reads «مبادرة من بلادنا إلى فرصة في العالم» and sixteen server strings already said `بلادنا`, while the AR `siteName` + eight UI strings said `بلدنا` — all nine now read **بلادنا** (replacements confined to `ar.ts`; neither spelling appears in any test or probe). (2) Message: the landing hero ran the trio every platform ships (`اكتشف، ساهم` / `Discover, contribute` / `Découvrez, contribuez`) over a process description; `landing.heroTitle`/`landing.heroSubtitle` were rewritten in all three locales around Shahinaz's couplet «نصل الخير بأهله، ونمنح العطاء أثره» and her line «من جهودٍ متفرّقة إلى أثرٍ يجمع الجزائر», flowing into the precise content (vetting, review before publication, attendance, hours, certificates) and closing on «سجلٌ واحدٌ لا يُمحى يحفظه بلادنا»; EN `No good deed goes unrecorded.` and FR `Le bien ne passe jamais inaperçu.` carry the message idiomatically — **zero new keys**, zero test touchpoints, and the CMS `home` override is empty so the dictionary edit is what renders. | ≤1 day | validate (446/43, 268 routes, API 269/269) exit 0 ✅ · probe **211/211** + P1 27/27 + P2 ALL PASS + E2E 42/42 ✅ |

| **P33 — Partnerships & CSR schema (M1)** ✅ **(done 2026-10-05)** | First of five gated phases of the approved Partnerships & CSR ecosystem (`docs/PARTNERSHIPS-CSR-DESIGN.md`; five decision points resolved long-term: Organization = the single identity anchor, `userId` stays required, M1→M5 staged, one profile model, UI at M5). Schema: **+21 models / +21 enums / zero deletions** — `EconomicInstitutionProfile` + focus-area/wilaya joins, `PartnerMatch` (deterministic `rules-v1` scorecard with a human-readable `breakdown Json`), request → proposal → partnership → agreement → obligations, commitment → installments → disbursement + receipts, in-kind, `ImpactEvidence`/`ImpactReport`, CRM quartet; only two columns touch existing tables (`Sponsor.organizationId @unique` bridge, `SupportOffer.organizationId` — `userId` still required), `CSRProgram` untouched, `NotificationType` +11. `0012_partnerships_csr` = 730 SQL lines (21 `CREATE TABLE`, 11 `ADD VALUE`, zero `DROP TABLE/COLUMN`) via `migrate diff --from-url` + `migrate deploy` (no `CREATEDB` → no shadow DB → `migrate dev` unavailable); the strict diff also surfaced latent drift — three raw-SQL indexes from `0002_constraints` the datamodel never declared were dropped — so `0013_declared_indexes` declares them (incl. `@@index([availability], type: Gin)`) and recreates them: net zero objects lost, DB **13/13**. Client regenerated (server must stop first — DLL lock), seed +16 trilingual `CSRFocusArea` rows (upsert-idempotent, demo intact), live-verified (21 tables / 2 bridges / 11 enum values / 16 areas / 4 indexes), `.prettierignore` covers the generated client so `db:generate` can never break `format:check`. Zero routes/API/UI — 268 routes and 269/269 API docs byte-identical. | ≤1 day | validate (446/43, 268 routes, API 269/269) exit 0 ✅ · probe **211/211** + P1 27/27 + P2 ALL PASS + E2E 42/42 ✅ |

| **P34 — Partnerships & CSR API + RBAC (M2)** ✅ **(done 2026-10-05)** | Second gated phase: services, routes, RBAC and state machines over the M1 substrate — **zero schema changes** (M1 was complete), no UI (M5). **43 new endpoints** in four modules: `economic.ts` (12 — economic profile GET/PATCH/activate + Sponsor-bridge derivation, focus-area replace, trilingual `CSRFocusArea` vocabulary public + `content.manage` admin CRUD, three deterministic partner-match reads), `partnerships.ts` (16 — request create/inbox/transition, versioned proposals that supersede rather than rewrite, partnership create/detail/transition, obligations with server-pinned `party`, `AGR-YYYY-######` agreements from `Counter`), `funding.ts` (11 — commitments → installments → disbursements + in-kind), impact evidence 3 (tenant upload → officer verify), core `POST /support-offers` 1 (body-addressed, optional `organizationId`, shared kind-rule validator). Domain +**11 transition maps** with exhaustive table tests (non-declared edges throw `BUSINESS_RULE_ERROR`, keys mirror the Prisma enums); RBAC +**14 permissions** (`partner.match.read` in `ORG_BASE`; `impact.evidence.verify`/`partnership.moderate` remain the only two an org OWNER cannot hold — VO/moderator-only; every permission granted to ≥1 role, test-enforced). New `partnership-access.ts` two-sided guard (wrong-side member ⇒ 403 naming the permission, outsider ⇒ 404); funding economic-only; verification officer-only; proposal `ACCEPTED` resolves sides deterministically (opportunity anchor → economic-profile side → asker = initiative), closes the request `APPROVED`, and enforces one open partnership per initiative; `{ action, reason? }` transitions with `reasonRequired` for the five closing decisions; audit action = the design contract's uppercase events. The latent `NotificationType` Prisma↔types drift ships its +11 labels in all three locales. `docs/API.md` +43 → **312/312**; route-registration test pins counts/keys. | ≤1 day | validate (489/45, 311 routes, API 312/312) exit 0 ✅ · probe **211/211** + P1 27/27 + P2 ALL PASS + E2E 42/42 ✅ |

**Explicitly out of scope (per this phase's rules):** no rewrite, no deletions,
no concept change, no copying of other platforms' visuals.

## 15. Sources

- S1 Benevity volunteering platform — https://benevity.com/products/volunteer
- S2 VolunteerHub vs Galaxy Digital features — https://volunteerhub.com/blog/volunteerhub-vs-get-connected-by-galaxy-digital
- S3 Get Connected (Galaxy Digital) — https://www.galaxydigital.com
- S4 Idealist × VolunteerMatch — https://www.idealist.org/volunteermatch · https://www.prnewswire.com/news-releases/volunteermatch-and-idealist-are-now-one-platform-302545556.html
- S5 Idealist Open Network API — https://www.idealist.org/en/open-network-api
- S6 European Solidarity Corps flows (EU Youth Portal / knowledge.unv.org) — https://knowledge.unv.org/ivy/events/international-volunteering-opportunities-european-solidarity-corps-esc-application-guide
- S7 1EdTech Open Badges — https://www.1edtech.org/standards/open-badges
- S8 Open Badges 3.0 status (2026) — https://www.virtualbadge.io/blog-articles/open-badges-3-0-what-is-the-status-in-2026
- S9 Credly Open Badge 3.0 / verify — https://info.credly.com/product/open-badge-3.0 · https://learn.credly.com/blog/digital-badges-explained-what-why-how-and-when
- S10 Map UI Patterns — https://www.mapuipatterns.com
- S11 NN/g Mobile Faceted Search with a Tray — https://www.nngroup.com/articles/mobile-faceted-search · Filters vs Facets — https://www.nngroup.com/articles/filters-vs-facets
- S12 Mobile filter UX patterns — https://www.pencilandpaper.io/articles/ux-pattern-analysis-mobile-filters · https://www.justinmind.com/ui-design/search-filters-results-page
- S13 DataReportal Digital 2026: Algeria — https://datareportal.com/reports/digital-2026-algeria
- S14 shadcn/ui vs Radix (Vercel) — https://vercel.com/i/shadcn-vs-radix · Infinum frontend handbook — https://infinum.com/handbook/frontend/react/tailwind/shadcn
- S15 RTL/Arabic web design — https://mags-group.com/insights/articles/arabic-website-design-rtl-ux · https://aivensoft.com/en/blog/rtl-arabic-website-design-guide · https://www.weglot.com/blog/rtl-web
- S16 Mobile search UX (Algolia) — https://www.algolia.com/blog/ux/mobile-search-ux-best-practices
- S17 Volunteer management comparison (2026) — https://getcommunal.com/guides/volunteers/best-volunteer-management-software-for-nonprofits

---

### Appendix — evidence artifacts (this session)

- Live probe outputs: 33 public routes (all 200; localized404 for missing reset
  token is the app's own `not-found` with full chrome — verified in RSC payload),
  authenticated volunteer + org journeys (17 pages, no login walls), TTFB
  179–258ms local, gzip on, nonce-CSP/HSTS/X-Frame-Options/nosniff present,
  API `default-src 'none'`.
- Scripts (temp, ASCII): `ux-audit-probe.ps1`, `ux-audit-analyze.ps1`,
  `ux-audit-auth.ps1`, plus `probe-3002.ps1` (91/91 at P2 → 119/119 at P4 →
  **153/153** at P5), `p1-verify.ps1` (27/27), `p2-gates.ps1` (G1–G10).
- Limitations: the P0–P3 passes had **no browser rendering** → contrast,
  visual hierarchy, animated/JS error states and touch interaction were marked
  unverified; findings are marked with their evidence type so nothing is
  claimed beyond what was verified. **Closed 2026-09-26 in P4** — a real
  Chrome (`channel: 'chrome'`) now runs the Playwright suite (chip interaction,
  RTL, pinch-zoom, focus/`aria-invalid`, confirm dialogs, nonce-CSP), which
  also exposed and led to fixing the dropped-navigation bug (see open finding
  O1 below). Lighthouse/visual-diff still out of scope (no CI browser
  budget).
- P2 completion (2026-09-26): `p2-gates.ps1` G1–G10 **ALL PASS** (with
  tallies: StatusBadge 48, Alert 127, EmptyState 49, Card 125/`as=` 7,
  Avatar 4, kit `Tabs` 5, `useFocusFirstError` 29 files), `probe-3002.ps1`
  91/91, `p1-verify.ps1` 27/27, one `npm run validate` exit 0 — all green
  against the P2 production build on port 3002.
- P4 completion (2026-09-26): M6 caching (probe asserts the public/private
  Cache-Control split), M7 `/admin/[section]` sub-routes (E2E deep-link +
  canonicalization + `?tab=` + back-button), M8 kit component suites + 7-file
  Playwright suite (15/15) wired into `.github/workflows/ci.yml` after the
  seed step. Final gates: `npm run validate` exit 0 (**375 tests / 35
  files**, 259 routes, API 260/260), `probe-3002.ps1` **119/119**,
  `p1-verify.ps1` **27/27**, `p2-gates.ps1` **ALL PASS**, `npm run test:e2e`
  **15/15 / 7 files** — all against the Next 16.3.6 production build.
- P5 completion (2026-09-30): the dormant `matchOpportunity` engine shipped
  (`GET /me/recommendations` + dashboard strip + `/recommendations` with
  localized reason chips, first-publish `NEW_MATCHING_OPPORTUNITY` fan-out),
  save/favorites (`/me/saved-opportunities` trio + `/saved` + `SaveButton`)
  and the public `/volunteers` directory (indexable, footer, sitemap 18×3=54).
  Final gates: `npm run validate` exit 0 ×2 (**396 tests / 36 files**,
  **263 routes** (core 56, platform 137, participants 70), API **264/264**),
  `probe-3002.ps1` **153/153** (34 new P5 checks), `p1-verify.ps1` **27/27**,
  `p2-gates.ps1` **ALL PASS**, `npm run test:e2e` **15/15 / 7 files**.
- P6 completion (2026-09-30): hand-rolled code replaced by standard
  libraries — lucide-react (behind the kit icon wrappers), sonner toasts,
  Radix AlertDialog/Dialog behind kit `useConfirm`/`usePrompt`
  (`window.confirm|window.prompt` = 0), DropdownMenu account menu, Radix
  Tabs behind the unchanged kit API, next-intl request config + provider
  over the same dictionaries, and Leaflet as the map engine (no tiles;
  SSR poster + ODbL contract unchanged; zoom floored at the full view,
  refit on resize). Final gates: `npm run validate` exit 0
  (**403 tests / 37 files**, **263 routes** (core 56, platform 137,
  participants 70), API **264/264**), `probe-3002.ps1` **153/153**,
  `p1-verify.ps1` **27/27**, `p2-gates.ps1` **ALL PASS**,
  `npm run test:e2e` **15/15 / 7 files**.

- P7 completion (2026-09-30): the landing + discover redesign shipped
  _within_ the system — hero (verifiability badge, bilingual headline, one
  white `role="search"` bar with kit outline submit + quick chips), discover
  rail + bento pillars + hairline stats panel on the new shared
  `SectionHeading`/`InitiativeCard`, discovery-page header / results count /
  honest empty state / mirrored chevrons, new i18n keys across
  `types`/`en`/`fr`/`ar`, lucide arrows (RTL-mirrored) instead of `→`,
  `.hero-rise` guarded by `prefers-reduced-motion: no-preference`, AR
  `line-height: 1.75`. DESIGN.md unchanged by design (tokens, kit and
  honest-copy rules all reused). Final gates: `npm run validate` exit 0
  (**403 tests / 37 files**, **263 routes** (core 56, platform 137,
  participants 70), API **264/264**), `probe-3002.ps1` **153/153**,
  `p1-verify.ps1` **27/27**, `p2-gates.ps1` **ALL PASS**,
  `npm run test:e2e` **15/15 / 7 files**.

- P8 completion (2026-09-30): all four signed-in surfaces shipped _within_
  the system — participant dashboard (eyebrow header, hairline `StatGrid`
  with icon chips, `SectionHeading` + kit `Badge`/`EmptyState` on every list,
  icon-led quick-link bento, RTL-mirrored arrows, §58 international bar
  untouched), workspace console (verification badge header, analytics via
  `StatGrid`, state-toned certificate badges, `SectionHeading` results header
  - kit `EmptyState`, avatar review rows), initiative detail (localized
    section eyebrows, kit meta chips, icon-led facts `dl`, mirrored back
    chevron), discover (live `aria-live` count, icon'd empty state, `.rise`
    grid); new shared `stat-grid.tsx` + 10 lucide wrappers; new i18n keys
    across `types`/`en`/`fr`/`ar` with rewritten empathetic empty states;
    `.rise` guarded by `prefers-reduced-motion: no-preference`. DESIGN.md
    unchanged by design. Final gates: `npm run validate` exit 0 (**403 tests /
    37 files**, **263 routes** (core 56, platform 137, participants 70), API
    **264/264**), `probe-3002.ps1` **153/153**, `p1-verify.ps1` **27/27**,
    `p2-gates.ps1` **ALL PASS**, `npm run test:e2e` **15/15 / 7 files**.

- P9 completion (2026-09-30): the "Oasis Modern" retheme shipped **at the
  token and kit layers** — new deep-jade `brand` / warmed `sand` (+`950` ink) /
  decorative `clay` ramps with WCAG proofs computed **before** shipping (every
  text pair ≥4.5:1 on the surface it actually sits on — including on the page
  bg and the dark footer — UI ≥3:1), IBM Plex Sans Arabic (one family for both
  scripts) through `next/font`, `--shadow-card` elevation + the 8/12/14/16px
  radius tiers, the `sand-950` ink footer, a deeper landing hero (display
  `text-5xl md:text-6xl`, jade+clay glow) and flagship-surface passes; the
  semantic `--color-bg/surface/fg/muted/border` aliases shipped as the
  dark-mode prerequisite (dark still deferred). Class names and copy were kept
  byte-stable so the probe/P1/P2/E2E locks held **without re-locking**; one kit
  test encoding the old card radius was re-aligned; email + PDF hexes moved
  with the brand. Final gates: `npm run validate` exit 0 (**403 tests / 37
  files**, **263 routes** (core 56, platform 137, participants 70), API
  **264/264**), `probe-3002.ps1` **153/153**, `p1-verify.ps1` **27/27**,
  `p2-gates.ps1` **ALL PASS**, `npm run test:e2e` **15/15 / 7 files**.

- P10 completion (2026-09-30): reference pass — 14 Dribbble shots curated
  into `design-refs/dribbble/` (8 landing pages + 6 dashboards; shot links,
  palette notes and provenance in its README — Dribbble's WAF required a
  reader proxy to extract the CDN URLs, and every image was downloaded at
  full size), read as images and compared against `app/[locale]/page.tsx`,
  `dashboard/page.tsx` and `stat-grid.tsx`. Shipped D1–D8 (hero display scale
  - gradient headline + clay rule, marketing-surface pills, hairline
    trust-strip exit, `sand-100/60` stats band with clay rules, two-zone
    dashboard with the §58 bar byte-identical, greeting date, `StatGrid` solid
    chip + `text-3xl` + honest `statOpenHint`) with copy and every gate-locked
    string untouched; recorded non-goals N1–N4 (charts, kit pills, photo
    masks, tinted ground). Final gates: `npm run validate` exit 0 (**403 tests
    / 37 files**, **263 routes** (core 56, platform 137, participants 70), API
    **264/264**), `probe-3002.ps1` **153/153**, `p1-verify.ps1` **27/27**,
    `p2-gates.ps1` **ALL PASS**, `npm run test:e2e` **15/15 / 7 files**.

- P11 completion (2026-10-01): imagery pass in the two allowed directions —
  original layered SVG art (`hero-art.tsx`: sky, sun, dunes, mountains,
  palm grove, kudu — `aria-hidden`, behind the hero and final CTA, gradient
  headline untouched) and **13 CC0/PD photographs** pulled from Openverse
  (`license=cc0|pdm` only) into `apps/web/public/photos/`, wired as
  `InitiativeCard` covers through a new `coverImage` field (LIST_SELECT →
  discover DTO → seed) plus the how-works band; provenance for every file
  in `design-refs/PHOTO-CREDITS.md` + `photo-picks.json`, photos
  decorative (`alt=""`) and thematic — never documentary (§7 honesty).
  Also shipped the queued `/[locale]/map` overhaul: PageHeader with the
  new `mapEyebrow` key (×4 files), distinct-wilaya coverage stats and the
  mirrored back chevron; jade land tint shared between the SSR poster and
  the Leaflet overlay (`LAND_FILL`/`LAND_STROKE`); `sand-50 → sand-100`
  ground + a decorative compass rose (clay north via `--color-clay-500`)
  in the letterbox margin; proximity clustering (`groupByProximity`,
  30 screen-px) with a `size-10 bg-brand-800 ring-2 ring-white` badge
  that zooms to split its members on click/Enter/Space; enriched side
  list (title + type Badge + MapPin location + Calendar date) with
  hover/focus ↔ pin `.is-hot` two-way sync and `viewTick` re-clustering
  on `zoomend`/`moveend`; permanent results chip (total / in-view) above
  the search-area button in a top-left column. One root cause was chased
  down empirically: Leaflet's default `autoPanOnFocus` fired a delayed
  `moveend` mid-click that rebuilt the marker layer between mousedown and
  mouseup and swallowed cluster clicks — fixed with
  `autoPanOnFocus: false` on cluster badges (recorded in DESIGN §12).
  Final gates: `npm run validate` exit 0 (**403 tests / 37 files**,
  **263 routes** (core 56, platform 137, participants 70), API
  **264/264**), `probe-3002.ps1` **153/153**, `p1-verify.ps1` **27/27**,
  `p2-gates.ps1` **ALL PASS**, `npm run test:e2e` **15/15 / 7 files**.

- P12 completion (2026-10-01): missing-pages audit — the only true gaps
  were the CMS's public surfaces (`/content/pages` + `/content/pages/:slug`,
  `/announcements` and `/featured` had handlers but no public renderers;
  achievements, CSR programs and `/public/verify` already existed — the
  reads that said otherwise were PowerShell `[locale]` wildcard artifacts).
  Shipped the help centre (PUBLISHED-only, trilingual, 3 seeded articles,
  footer link, sitemap +1 → 19 paths / 57 entries), the dismissible
  announcement banner (pinned via GET /home with a limit-1 fallback,
  per-row `localStorage` dismissal, every fetch catch → empty so the
  landing/dashboard can never 500 on a CMS outage), the featured rails
  (`HOME_*` band + `DISCOVER_FEATURED` strip, seed placements idempotent on
  `@@unique([section,targetType,targetId])`) and the `HomeContent` hero
  override (no seed row → locked copy byte-identical). Improvements: the
  verify hub became explainer cards + a how-it-works strip + a
  `/help/faq` link (E2E testids untouched), its subpages gained mirrored
  back chevrons, and a shared `PasswordInput` reveal toggle (new kit
  `Input` `trailing` slot, `grid size-10`) landed on login/register/reset.
  Two bugs were caught by live smoke before ship, both invisible to unit
  tests: `pageSession()` on public pages bounced every anonymous visitor
  to `/login`, and `invoke()` needs `params: { slug }` passed explicitly
  (path segments are not parsed into params — every detail-page caller in
  the app passes them). Final gates: `npm run validate` exit 0 (**403
  tests / 37 files**, **263 routes** (core 56, platform 137, participants
  70), API **264/264**), `probe-3002.ps1` **153/153**, `p1-verify.ps1`
  **27/27**, `p2-gates.ps1` **ALL PASS**, `npm run test:e2e` **15/15 / 7
  files**.

- P13 completion (2026-10-02): organization pages presentation pass —
  the directory cards never linked to the profiles they advertised
  (dead ends) and the detail page listed bare facts. Rebuilt
  `/organizations/[slug]` (back link, kit `Badge` chips, hairline
  `StatGrid` members/opportunities/campaigns from GET /campaigns
  `organizationId`, shared `InitiativeCard` grid via
  `showOrganization={false}`, public campaigns rail, facts sidebar +
  honest unverified note) and linked every directory card
  (`h2 > Link` + hover); i18n `organizations.*` ×6 in all four
  dictionaries. One live-data finding: a stray user-made PUBLISHED
  opportunity (`slug=test`, org `nexvo`, created through the UI on
  2026-10-01, no wilaya/city → null coordinates) failed the probe's
  `mode=map` all-items-coords check — fixed by demoting the row to
  DRAFT with `prisma db execute` (a data problem, fixed in data: the
  record is preserved, the public map is clean, and the gate stayed
  untouched). Final gates: `npm run validate` exit 0 (**405 tests / 37
  files** — the +2 vs earlier stamps are P12's two help-page entries in
  `private-noindex.test.ts` — **263 routes** (core 56, platform 137,
  participants 70), API **264/264**), `probe-3002.ps1` **153/153**,
  `p1-verify.ps1` **27/27**, `p2-gates.ps1` **ALL PASS**,
  `npm run test:e2e` **15/15 / 7 files**.

- P14 completion (2026-10-02): support cards + tab bar — the user's
  screenshots showed bidi-scrambled Latin descriptions on the public
  support-need cards and an uncolored console tab bar; the tab redesign
  (brand-600 pill, bordered sand track, nowrap scroll row) exposed the
  systemic cause: **Tailwind v4's automatic source detection never
  scanned `packages/ui`** (no `.git` for it to climb to a repo root
  from `apps/web`), so every kit-unique utility was silently missing
  from the built CSS — including the tab `data-[state=active]` rules
  and the login submit's `bg-brand-700` (white-on-white button, which
  is what the user saw). Fixed with `@source
'../../../../packages/ui/src'` in `globals.css`; cards rebuilt
  (`Badge` chips, `dir="auto"`, `tabular-nums` figure rows, hairline
  `mt-auto` footer, `sm:grid-cols-2`); permanent E2E
  `tests/e2e/console-tabs.spec.ts` asserts the active tab's **computed**
  background so a future emission miss fails CI. Final gates: `npm run
validate` exit 0 (**405 tests / 37 files** — **263 routes** (core 56,
  platform 137, participants 70), API **264/264**), `probe-3002.ps1`
  **153/153**, `p1-verify.ps1` **27/27**, `p2-gates.ps1` **ALL PASS**,
  `npm run test:e2e` **16/16 / 8 files**; live bundle re-verified
  (`bg-brand-700` / `state=active` present, 66,738 bytes).

- P15 completion (2026-10-02): organization trust & presence — the
  profile listed facts but had no face. `ORG_PUBLIC_SELECT` now ships
  `coverImage` (a presentation field; the contact-free rule still
  holds for email/phone/address/website) rendered as a rounded cover
  band, the kit `Avatar` gained an optional `src` (logo covers the
  tile, initials stay the fallback — used by the profile header and
  every directory card), and a sidebar Team card lists up to four
  members **who opted into the public directory**
  (`volunteerProfile.publicProfile` + ACTIVE + no soft-deleted user —
  the filters live inside the select's relation args, so an
  unconsented roster cannot leave the query) with tile, name, role
  and a `+N` chip derived from the same `_count.members` the
  StatGrid shows; i18n `organizations.teamTitle` +
  `organizations.memberRoles` ×5 in all four dictionaries; demo data
  fixed in data (seed + idempotent `prisma db execute`): CC0 cover
  photo, an original SVG mark (`public/photos/logo-atlas-verts.svg`),
  and the opted-in demo volunteer seated as an ACTIVE STAFF member.
  New guards: kit unit test for `Avatar src` (+1 → 406) and E2E
  `org-profile.spec.ts` (cover, logo, opted-in team on the detail;
  logo on the directory card). Final gates: `npm run validate` exit 0
  (**406 tests / 37 files**, **263 routes**, API **264/264**),
  `probe-3002.ps1` **153/153**, `p1-verify.ps1` **27/27**,
  `p2-gates.ps1` **ALL PASS**, `npm run test:e2e` **19/19 / 10
  files** (validated together with P16 in one run).

- P16 completion (2026-10-02): app bar declutter — the signed-in
  header packed eight text links + language switch + account + a
  bordered logout into one row and the dashboard label wrapped onto
  two lines (user screenshot). Desktop nav now holds the public four
  - dashboard with `shrink-0 whitespace-nowrap` links; messages and
    notifications became icon buttons labeled from the existing keys
    (`MailIcon`/`BellIcon`, `aria-label` + `title`); applications moved
    into the account menu; sign-out dropped `variant="outline"` for
    ghost; the bar is `sticky top-0 z-40` (grep confirmed nothing else
    in the app sticks; Radix menus/dialogs render at z-50+).
    `coreNavLinks` is untouched — the P3 bottom tab bar keeps the core
    four and the mobile drawer re-adds the icon-only pair, so nothing
    became desktop-exclusive. Guard: E2E `appbar.spec.ts` (sticky
    position, dashboard/opportunities visible, applications hidden,
    both icon aria-labels present). Final gates: shared with P15's run
    — `npm run validate` exit 0 (**406 tests / 37 files**), probe
    **153/153**, P1 **27/27**, P2 **ALL PASS**, E2E **19/19 / 10
    files**.

- P17 completion (2026-10-02): messages workspace — the two-pane
  list+thread adopted chat conventions: peer `Avatar` tiles and a
  start-border active row in the list; a tinted thread canvas with
  white peer bubbles vs `brand-600` mine bubbles, one date separator
  per day, turn grouping, the new `formatTime` helper as meta outside
  the bubble, `dir="auto"` bodies (Latin copy stops bidi-scrambling
  in the RTL page), and 📎 → `PaperclipIcon` (chip, link and the
  `sr-only` file input behind a focus-ringed label) plus `SendIcon`
  in the composer with Enter-to-send (Shift+Enter, IME-aware); peer
  names under the thread title and mobile auto-scroll on open. Demo
  data in data (seed + idempotent `prisma db execute`): an
  org↔volunteer 4-message thread so the page opens on real content.
  The same run closed P16's residual risk: sticky-header audit at
  1024/1152/1280/1440 px — no horizontal overflow, no nav/right-cluster
  overlap, every link 44 px. Guards: `format.test.ts` (+1 → **407/38**)
  and E2E `messages.spec.ts` (+1 → **20/20 / 11 files**). Final
  gates: `npm run validate` exit 0 (**407 tests / 38 files**, **263
  routes**, API **264/264**), `probe-3002.ps1` **153/153**,
  `p1-verify.ps1` **27/27**, `p2-gates.ps1` **ALL PASS**,
  `npm run test:e2e` **20/20 / 11 files**.

- P18 completion (2026-10-02): support offers decision room — the
  user's report ("didn't update when accepting offers") traced to
  quantity needs whose `fulfilled` only moved with the owner's manual
  counter while financial needs already summed accepted amounts: both
  needs APIs expose `acceptedQuantity`, and the shared
  `NeedProgressBar` paints received (solid `brand-600`) + accepted
  pledges (lighter `brand-300`) capped at the target — public card,
  console needs tab and offers group headers all update in place after
  a decision. The offers tab itself became a decision room: summary
  strip, instant status chips, per-need groups, and rich offer cards
  (figure, `Avatar` initials, masked email, submitted/decided dates,
  primary Accept). Fixture `scripts/e2e-ensure-pending-offer.ts`
  self-heals one PENDING offer per run (`tsx` child from global setup;
  stale markers dropped, user data untouched). Guards:
  `need-progress.test.ts` (+3 → **410/39**) and E2E `offers.spec.ts`
  (+1 → **21/21 / 12 files**: chip flip, Accept disappears, bar
  0 → 1). Final gates: `npm run validate` exit 0 (**410 tests / 39
  files**, **263 routes**, API **264/264**), `probe-3002.ps1`
  **153/153**, `p1-verify.ps1` **27/27**, `p2-gates.ps1` **ALL PASS**,
  `npm run test:e2e` **21/21 / 12 files**.

- P19 completion (2026-10-02): shareable conversation link — the
  user's report ("uuid is hard to find, make another solution")
  traced to the raw-ID handoff: Settings displayed a bare
  36-character UUID and the messages form only accepted a paste of
  it. The account card now leads with a copyable conversation link
  (`/{locale}/messages?to=<id>`, absolute after mount) and a Copy
  link button (clipboard + 2 s confirmation, insecure-context
  fallback selects the code), with the raw ID row below and a hint
  pointing at the link; `/messages?to=` prefills the recipient on
  mount and the field accepts a whole pasted link (UUID extracted
  client-side before the POST), so the server's existing DIRECT
  dedupe opens the thread the pair already shares. i18n +3 keys ×4
  (`settings.conversationLink`/`copyLink`/`linkCopied`) plus
  rewritten `settings.yourUserIdHint` and `messages.recipientHint`
  ×4. Guard: E2E `messages.spec.ts` +1 → **22/22 / 12 files**
  (clipboard round-trip → prefill → Start lands on a
  content-carrying existing thread, never a fresh empty row).
  Final gates: `npm run validate` exit 0 (**410 tests / 39 files**,
  **263 routes**, API **264/264**), `probe-3002.ps1` **153/153**,
  `p1-verify.ps1` **27/27**, `p2-gates.ps1` **ALL PASS**,
  `npm run test:e2e` **22/22 / 12 files**.

- P20 completion (2026-10-02): report from the page, not from a
  UUID — the user asked "how do I report here, and where do I find
  the id, the link, or anything else" on a form whose hint promised
  a UUID in the page URL while every public page is addressed by
  slug. A shared `parseReportTargetRef` reads a page link pasted
  from the address bar (path → target type, locale/query/hash
  stripped) or a bare slug; the server's `resolveTarget` resolves
  `id OR slug` for organization/opportunity/campaign (free text
  only ever filters the slug column), keeps uuid-only rules for
  user/message, and stores the effective type for the row and
  audit; `INTERNATIONAL_OPPORTUNITY` is hidden from the menu and
  refused honestly (it used to fall through to "Message not
  found"; the review pipeline has no effect branch for it yet).
  Initiative/organization profiles now carry a Report link opening
  `/safety?target=<own page link>` prefilled, the type
  auto-detected, and the value preserved through the anonymous
  sign-in bounce. i18n: `common.report` +1 ×4,
  `safety.targetIdHint` / `targetIdHintCertificate` rewritten ×4.
  Guards: `report-target.test.ts` +9 → **419 tests / 40 files**;
  E2E `safety.spec.ts` +1 → **23/23 / 13 files** (Report link →
  prefill → detected type → submit → "My reports" shows the
  resolved uuid, never the pasted URL), backed by the
  self-healing `e2e-ensure-clean-report.ts` fixture. Final gates:
  `npm run validate` exit 0 (**419 tests / 40 files**, **263
  routes**, API **264/264**), `probe-3002.ps1` **153/153**,
  `p1-verify.ps1` **27/27**, `p2-gates.ps1` **ALL PASS**,
  `npm run test:e2e` **23/23 / 13 files**.

- P21 completion (2026-10-03): review before publish + the home
  page states the idea. The letter's claim that initiatives pass a
  review before publication ran ahead of the code in three places:
  `OPPORTUNITY_TRANSITIONS.DRAFT` listed `PUBLISHED` (a verified
  organization could publish its own draft in one click),
  `platformAction` documented itself as deliberately exempt from
  the tenants' org-verification wall, and the workspace row
  rendered a Reject button that always 403'd because
  `opportunity.moderate` is platform-only. Now DRAFT reaches only
  PENDING_REVIEW/ARCHIVED — publication always travels the queue
  (or restores an already-published row), the tenant transition
  endpoint maps `PUBLISH`/`REJECT` to `opportunity.moderate`
  (organizations submit, withdraw and steer; the dead Reject
  button and its reason field left `TRANSITION_ACTIONS`), every
  move to `PUBLISHED` crosses the same two walls — suspended
  organization, then non-`VERIFIED` — and the admin action menu
  filters per row through `canTransition`. The landing page then
  says it out loud: hero subtitle + badge (the locked
  **Algeria-first** wording) + trust strip rewritten ×4 (verified
  organizations → reviewed initiatives → append-only hours →
  checkable certificates) and a new typographic "From idea to
  impact" section — five numbered steps closing on the shared
  "space of trust" record, ×4 i18n, no photos. Guards:
  `state-machines.test.ts` DRAFT→PUBLISHED false,
  `rbac.test.ts` no org role holds `opportunity.moderate`;
  `docs/API.md` ×2. Final gates: `npm run validate` exit 0
  (**419 tests / 40 files**, **263 routes**, API **264/264**),
  `probe-3002.ps1` **153/153**, `p1-verify.ps1` **27/27**,
  `p2-gates.ps1` **ALL PASS**, `npm run test:e2e` **23/23 / 13
  files**.

- P22 completion (2026-10-03): a home page that catches the eye,
  with zero new copy. The landing was well organised but flat —
  three consecutive sand sections in the middle, small figures on a
  light panel, no mid-page anchor. The lifecycle section now turns
  white (the discovery launcher above it carries its own `pb-10`)
  and its five step marks gain a clay gradient + `ring-4
ring-clay-100` halo (clay decorative, never semantic); the
  pillars bento's identity cell **inverts** to the deep brand
  gradient so the grid itself encodes priority — `iconFor` grew an
  `onDark` flag to flip the glyph to `text-brand-200`; and the
  impact panel crosses to a **dark brand band**, same `gap-px`
  hairline instrument, same clay figure rules, same `statsNote`
  provenance label, but figures now render at `text-5xl/6xl` in a
  white→`brand-200` clipped gradient over a jade/terracotta wash.
  `SectionHeading` gained an optional `tone="dark"` whose default
  keeps every other caller byte-identical; a new `.hero-breathe`
  keyframe (16s, transform-only, declared inside the
  `prefers-reduced-motion: no-preference` block next to
  `.hero-rise`/`.rise`) breathes the hero, stats and CTA washes;
  hero search/CTAs got `shadow-xl` + `motion-safe` hover lift; the
  verify card grew a warm two-tone wash with a masked shield
  watermark. i18n: **none** (0 keys added or changed). Locked
  strings untouched. Final gates: `npm run validate` exit 0
  (**419 tests / 40 files**, **263 routes**, API **264/264**),
  `probe-3002.ps1` **153/153**, `p1-verify.ps1` **27/27**,
  `p2-gates.ps1` **ALL PASS**, `npm run test:e2e` **23/23 / 13
  files**, full `prettier --check .` exit 0.

- P23 completion (2026-10-03): contact & trust before applying. The
  directory finally answers "how do I reach them" — cards carry a
  **Message** button and `GET /volunteers` exposes the owner's
  `userId` (opt-in rows only; messaging keeps its rate limit + block
  reads) — and the messages page became the contact entry point:
  `?to=`/`?org=`/`?name=` are re-validated through pure helpers
  (`parseContactParams`/`contactQuery`) and folded into
  `pageSession` + `?next=`, so the anonymous sign-in bounce lands on
  an already-addressed compose form; `?org=` mode swaps the
  recipient input for a static **Organization** row and posts
  `{ organizationId }`. "How do I know the organizers" moved from
  prose to chrome: initiative headers link the organizer to its
  public profile, show the logo tile and the trust-ladder badge,
  and the contact card always renders — details when published,
  always the **Message the organization** button (organization
  profiles gained the same header button). i18n +2 ×4. Final
  gates: `npm run validate` exit 0 (**424 tests / 40 files**,
  **263 routes**, API **264/264**), `probe-3002.ps1` **159/159**,
  `p1-verify.ps1` **27/27**, `p2-gates.ps1` **ALL PASS**,
  `npm run test:e2e` **24/24 / 13 files**, full
  `prettier --check .` exit 0.

- P24 completion (2026-10-03): comments & ratings, gated by the same
  trust rule as hours — only an ACCEPTED application or VERIFIED hours
  _on that initiative_ qualifies an author, and `source` records which
  path did it, so provenance ships beside every row (**Accepted
  participant** / **Verified hours**). `OpportunityReview` lands with a
  DB CHECK on 1–5, a one-review-per-volunteer-per-initiative compound
  unique, and a list index; four routes cover the viewer-aware public
  list (stats + caller eligibility + own review in one SSR round trip)
  and auth-gated create (403/409) / own-only update / idempotent
  delete (404 on foreign rows), all audited. The section renders
  server-first — opt-in names only, neutral verified-participant label
  otherwise, always-visible eligibility note, confirm-gated delete,
  sign-in CTA that also replaces the composer after a mid-write 401 —
  and `router.refresh()` keeps state honest instead of patching it
  client-side. i18n +17 ×4; guards `review.test.ts` +8 +
  `reviews.test.ts` +5 (419→...→437 / 40→42), E2E +1 author cycle
  (24→25 / 14 files), probe +8 (159→167), seed +1 demo review (park
  initiative; E2E runs its CRUD on the beach one). Final gates:
  `npm run validate` exit 0 (**437 tests / 42 files**,
  **267 routes**, API **268/268**), `probe-3002.ps1` **167/167**,
  `p1-verify.ps1` **27/27**, `p2-gates.ps1` **ALL PASS**,
  `npm run test:e2e` **25/25 / 14 files**, full
  `prettier --check .` exit 0.

- P25 completion (2026-10-03): public volunteer profile — the card
  you can finally click. Directory cards gained the owner's photo
  (`profileImage` was stored but never rendered; initials stay the
  fallback) and a name link into `/{locale}/volunteers/{id}`, served
  by a new public `GET /volunteers/:id` (UUID `profileParamsSchema`,
  registered beside the list) whose whole contract is the owner's
  consent: unknown id, malformed uuid and `publicProfile:false` all
  answer the same not-found (the API returns a real 404 — no
  existence oracle), `showWilaya` gates the location line,
  `showHours=false` withholds the verified-hours total **without
  issuing the aggregate** (spec §30, exactly what `GET /public/verify`
  already promises) and nulls each timeline row's hours,
  `showCertificates=false` withholds the certificate list — the first
  surface where that stored flag is enforced, so settings ships its
  sixth toggle — email stays masked unless published, and the phone
  number never travels the contract. The page shows the identity
  header (photo, verification badge, volunteer code · location,
  member-since, availability chips), the P23 Message chain, digit
  tiles backed by honest `certificatesTotal`/`participationsTotal`
  next to capped top-8 lists, explicit hidden-notes instead of fake
  zeros, certificate rows deep-linking credential-keyed verification,
  the participation timeline, About/skillset and the privacy
  footnote; `generateMetadata` titles it with the volunteer's name,
  `private-noindex.test.ts` classifies it public, and the sitemap
  stays pinned (the directory remains the discovery surface). i18n
  +8 ×4; guards `volunteer-profile.test.ts` +4 (437→442 / 42→43),
  E2E +3 (25→28 / 15 files), probe +18 (167→185, including the live
  `publicProfile:false` flip → withheld → restored and the settings
  toggle). Final gates: `npm run validate` exit 0 (**442 tests / 43
  files**, **268 routes**, API **269/269**), `probe-3002.ps1`
  **185/185**, `p1-verify.ps1` **27/27**, `p2-gates.ps1` **ALL PASS**,
  `npm run test:e2e` **28/28 / 15 files**, full `prettier --check .`
  exit 0.

- P26 completion (2026-10-03): a landing that moves — clone the
  composition of `mjeunesse.gov.dz` "exactly, but with our
  information", with suitable images and motions. The reference is a
  Vite SPA, so its design was recovered from the shipped CSS/JS
  bundles (palette, Noto Kufi Arabic + IBM Plex Sans Arabic,
  `drift`/`marquee-ltr,rtl`/`pulsering` keyframes) and live captures
  of the hero (framed slider with `04/10` counter) and footer,
  yielding the landing order: republic strip → breaking marquee →
  photo slider → sections → dark platforms grid → footer. The rebuild
  keeps every locked string in place while changing the skin: the
  `heroBadge` (**Algeria-first**) moves to an ink top strip, the P12
  announcement becomes a marquee `variant="ticker"` (sr-only sentence,
  `aria-hidden` moving copies, hover/focus pause, dismissal and the
  dashboard banner untouched), the hero gains a four-photo
  **slideshow** (`hero-slider.tsx`: crossfade + `hero-drift`,
  `01/04` counter, segment buttons with `aria-current`, play/pause —
  reduced motion never autoplays, hidden tabs stop advancing), all
  sections gain `data-reveal` scroll-ins behind `@supports
(animation-timeline: view())` + a print guard, the impact figures
  **count up** (`stat-counter.tsx` — SSR ships the final honest
  number; the observer replays it once), verify/map/directory/
  international merge into one four-card services grid, and RTL
  headings take **Noto Kufi Arabic** via `--font-display` while Latin
  keeps Plex. Every keyframe sits inside `prefers-reduced-motion:
no-preference`; hero photos reuse four CC0 frames already credited
  in PHOTO-CREDITS.md. i18n +7 ×4; E2E +4 (`landing-motion.spec.ts`,
  28→32 / 16 files), probe +7 (185→192). Final gates: `npm run
validate` exit 0 (**442 tests / 43 files**, **268 routes**, API
  **269/269**), `probe-3002.ps1` **192/192**, `p1-verify.ps1`
  **27/27**, `p2-gates.ps1` **ALL PASS**, `npm run test:e2e`
  **32/32 / 16 files**, full `prettier --check .` exit 0.

- P27 completion (2026-10-03): the reference chrome rides every page
  — "continue and the other pages" after the P26 landing. The strip
  and the marquee ticker moved into the locale layout
  (`site-masthead.tsx`): every route — hubs, dashboard, auth, admin
  — opens with the ink `Algeria-first` line and the P12 ticker above
  the sticky header, both scrolling away like the reference's top
  line; the landing's private copies and the dashboard's standalone
  banner were removed (one announcement surface, per-id dismissal
  unchanged). Each public hub (eleven pages) plus `LegalDoc`
  (terms/privacy) now opens on `page-masthead.tsx`, a full-bleed
  deep-green band carrying the page's existing eyebrow/title/
  subtitle — note slot for the directory's privacy footnote and the
  legal "updated" line, action slot for the map's coverage figures
  recolored for ink — with the gated `rise` entrance and automatic
  Kufi in RTL; no dictionary key was added in any locale. Scroll
  reveals were deliberately not extended to hubs (a full-height
  container in view at scroll 0 would sit at partial opacity under
  an `entry`-ranged timeline). Final gates: `npm run validate`
  exit 0 (**442 tests / 43 files**, **268 routes**, API
  **269/269**), `probe-3002.ps1` **198/198** (+6), `p1-verify.ps1`
  **27/27**, `p2-gates.ps1` **ALL PASS**, `npm run test:e2e`
  **34/34 / 17 files** (+2, `site-chrome.spec.ts`), full
  `prettier --check .` exit 0.

- P28 completion (2026-10-03): the band carries detail pages & auth
  — "yes, I want" after the P27 close-out. `page-masthead.tsx`
  accepts either a `title` (string mode, the hubs) or `children`
  (custom header markup in the same gradient), guarded by a TS
  union so every page renders exactly one h1. The initiative,
  organization and volunteer profiles move their identity headers
  inside the band with targeted recolors for the dark ground —
  cover photos, `<header>` wrappers, `org-cover`, badges and
  outline buttons keep their original markup, which reads on ink
  as well as on white. `AuthShell` shares the treatment across all
  six auth pages; the white card now starts at the form. Final
  gates: `npm run validate` exit 0 (**442 tests / 43 files**,
  **268 routes**, API **269/269**), `probe-3002.ps1` **203/203**
  (+5), `p1-verify.ps1` **27/27**, `p2-gates.ps1` **ALL PASS**,
  `npm run test:e2e` **36/36 / 17 files** (+2,
  `site-chrome.spec.ts`), full `prettier --check .` exit 0.

- P29 completion (2026-10-04): zoned impact-metric cards — the
  user asked how the indicators actually update, then for the
  display to be clearer instead of interwoven text. The metric
  is now one component (`impact-metric-card.tsx`) shared by the
  console's Impact tab and the public initiative page: a title
  row (type chip, name, verified badge, console timestamp), a
  labelled Actual/Target pair in tabular numerals (the console's
  decimal columns arrive as strings and normalise through one
  helper), an honest progress bar that caps visually while the
  printed figures never round, and the source on its own line —
  zero new dictionary keys (the console's `metricActual`/
  `metricTarget`/`metricSource` labels carry the public page
  too). The probe's map check then caught a real defect:
  `mode=map` returned rows that cannot be pinned (the ONLINE
  initiative created during testing has no place by design), so
  `buildDiscoverWhere` now requires own coordinates or a
  coordinate-carrying city in map mode — the row stays in the
  regular list and the payload, `meta.total` and pins agree.
  Final gates: `npm run validate` exit 0 (**442 tests / 43
  files**, **268 routes**, API **269/269**), `probe-3002.ps1`
  **205/205** (+2), `p1-verify.ps1` **27/27**, `p2-gates.ps1`
  **ALL PASS**, `npm run test:e2e` **38/38 / 18 files** (+2,
  `impact-metrics.spec.ts`), full `prettier --check .` exit 0.

- P30 completion (2026-10-04): the platform mark — the user
  supplied the official art and asked for it as the platform
  logo before continuing. The 1254² transparent PNG resampled
  into `public/logo.png` (384², 167 KB), `src/app/icon.png`
  (512²) and `apple-icon.png` (180²) — the app shipped no
  document icon at all until now, and Next registers both from
  `src/app/`. The header and footer brand slots render the mark
  where the initial-letter `Avatar` used to (empty `alt`, so the
  siteName text remains the link's accessible name), and every
  auth flow opens with a centered mark above the back-home link.
  No dictionary key joined the four locales. Final gates:
  `npm run validate` exit 0 (**442 tests / 43 files**, **268
  routes**, API **269/269**), `probe-3002.ps1` **207/207** (+2),
  `p1-verify.ps1` **27/27**, `p2-gates.ps1` **ALL PASS**,
  `npm run test:e2e` **40/40 / 18 files** (+2,
  `site-chrome.spec.ts`), full `prettier --check .` exit 0.

- P31 completion (2026-10-04): honest access & true link
  origins — the two live bug reports. The workspace catches
  merged `FORBIDDEN || NOT_FOUND` into `notFound()`; the fix
  splits them: `workspace-no-access.tsx` (new component,
  standalone at the layout gate, in-shell card in the eleven
  tabs) owns `FORBIDDEN`, `NOT_FOUND` keeps `notFound()`, and
  two new keys joined all four i18n files. `originFor()`
  (http.ts) derives outbound in-request links from the
  caller's own host — configured app URL or local dev — with
  forged hosts falling back to `PUBLIC_APP_URL`, and both
  `checkInUrlFor` call sites now take the request context;
  root `.env` `APP_URL`/`PUBLIC_APP_URL` moved to the live
  domain, so every environment-built link (email verify/reset,
  invitations, certificate verify) follows. Verified live
  through the domain:
  `https://bladna.aymen-digital-studio.site/check-in?token=…`
  (localhost:3002 in dev). Final gates: `npm run validate`
  exit 0 (**446 tests / 43 files**, **268 routes**, API
  **269/269**), `probe-3002.ps1` **211/211** (+4),
  `p1-verify.ps1` **27/27**, `p2-gates.ps1` **ALL PASS**,
  `npm run test:e2e` **42/42 / 19 files** (+2,
  `workspace-access.spec.ts`), full `prettier --check .` exit 0.

- P32 completion (2026-10-04): one name, one message — the
  user's two brand directives. The official art's tagline
  («مبادرة من بلادنا إلى فرصة في العالم») and sixteen server
  strings say `بلادنا` while the AR `siteName` and eight UI
  strings said `بلدنا`: `ar.ts` now reads بلادنا everywhere
  (nine replacements, nothing else touched). The landing
  hero — `landing.heroTitle`/`landing.heroSubtitle`, once
  the `Discover`/`Découvrez`/`اكتشف` trio over a process
  list — now carries Shahinaz's couplet
  «نصل الخير بأهله، ونمنح العطاء أثره» and her line
  «من جهودٍ متفرّقة إلى أثرٍ يجمع الجزائر», flowing into
  the precise content and «سجلٌ واحدٌ لا يُمحى يحفظه بلادنا»;
  EN `No good deed goes unrecorded.`
  and FR `Le bien ne passe jamais inaperçu.` match the
  message idiomatically. No new keys; no test or probe
  asserted the old copy; the CMS `home` override is empty,
  so the dictionary edit renders as-is. Final gates:
  `npm run validate` exit 0 (**446 tests / 43 files**,
  **268 routes**, API **269/269**), `probe-3002.ps1`
  **211/211**, `p1-verify.ps1` **27/27**, `p2-gates.ps1`
  **ALL PASS**, `npm run test:e2e` **42/42 / 19 files**,
  full `prettier --check .` exit 0.

- P33 completion (2026-10-05): M1, the Partnerships & CSR
  schema layer, against the approved design report (five
  decision points resolved long-term: Organization is the
  single identity anchor, `userId` stays required, one
  gated stage at a time, one profile model, UI at M5).
  `schema.prisma` gains 21 models and 21 enums with zero
  deletions — profile/focus-area/wilaya joins, the
  `PartnerMatch` rules-v1 scorecard (score + explainable
  `breakdown Json`, no black box), request → proposal →
  partnership → agreement → obligations, commitment →
  installments → disbursement, in-kind, evidence/reports,
  CRM — and only two columns on existing tables
  (`Sponsor.organizationId` unique bridge,
  `SupportOffer.organizationId`); `CSRProgram` untouched,
  `NotificationType` +11. `0012_partnerships_csr` (730
  lines, 21 CREATE TABLE, 11 ADD VALUE, zero DROP
  TABLE/COLUMN) ran through `migrate diff --from-url` +
  `migrate deploy` because the app role cannot create the
  shadow database; it also surfaced latent drift — three
  raw-SQL indexes from `0002_constraints` (audit/message
  `createdAt DESC`, availability GIN) the datamodel never
  declared were dropped by the strict diff, so
  `0013_declared_indexes` declares them (incl.
  `@@index([availability], type: Gin)`) and recreates
  them: net zero objects lost, DB 13/13. Client
  regenerated (stop `next start` first — the
  query-engine DLL is locked), the seed adds 16
  trilingual `CSRFocusArea` rows, and `.prettierignore`
  now covers the generated client. Final gates:
  `npm run validate` exit 0 (**446 tests / 43 files**,
  **268 routes**, API **269/269**), `probe-3002.ps1`
  **211/211**, `p1-verify.ps1` **27/27**, `p2-gates.ps1`
  **ALL PASS**, `npm run test:e2e` **42/42 / 19 files**,
  full `prettier --check .` exit 0.

- P34 completion (2026-10-05): M2 of the Partnerships &
  CSR ecosystem — the API layer over the M1 substrate, no
  schema change and no UI. 43 new routes (economic profile
  and match reads 12, request → proposal → partnership →
  obligations → agreements 16, funding/installments/
  disbursements/in-kind 11, impact evidence 3, body-
  addressed `POST /support-offers` 1) take the totals to
  **311 routes (core 57, platform 179)** with API docs at
  **312/312**. The domain gains 11 transition maps proven
  by exhaustive table tests and 14 permissions
  (`partner.match.read` org-wide for every role; the
  verification and moderation permissions stay unreachable
  to an org OWNER — officer/moderator system roles only).
  Access resolves the caller's side of the partnership
  (403 naming the missing permission for a wrong-side
  member, 404 for an outsider), funding writes are
  economic-only, all verification is officer-only, and
  proposal acceptance provisions the partnership
  deterministically while closing the request and auditing
  both under the design contract's uppercase event names.
  `NotificationType`'s +11 latent values gained labels in
  all three locales. Final gates: `npm run validate` exit
  0 (**489 tests / 45 files**, **311 routes**, API
  **312/312**), `probe-3002.ps1` **211/211**,
  `p1-verify.ps1` **27/27**, `p2-gates.ps1` **ALL PASS**,
  `npm run test:e2e` **42/42 / 19 files**, full
  `prettier --check .` exit 0.

### Open findings introduced by the P4 browser run

- **O1 (upstream, resolved by upgrade)** — the discovery filter-tray E2E
  (`discovery-ui.spec.ts`, single-click chip submit) timed out at 120s on
  next@15.5.26: React dropped the navigation started from the chip's click
  handler. Root cause was the **React `startTransition` bug fixed in
  facebook/react#35839** (drain condition in the transition scheduler), which
  next@15.5.26's pinned React does not contain; tracking issue
  vercel/next.js#83386. Evidence: after upgrading to next@16.3.6 — whose
  vendored React is `19.3.0-canary-cbb046ab-20260731` (post-fix) — the same
  strict single-click test passes in **~1.9s** with no code change to the
  page or the test. The spec stays strict (no `waitForURL` retry, no double
  click) so a regression in this class fails loudly.
- **O2 (Turbopack build warnings, accepted)** — `next build` (Turbopack, the
  Next 16 default) prints 12 advisory warnings: the Prisma generated CJS
  client's `export *` (2 traces) and dynamic `process.cwd()` filesystem
  access in `email.ts`/`pdf.ts`/`storage.ts` + Prisma runtime (whole-project
  tracing). Build exits 0 and output is correct; the tracing warnings only
  matter for deploy size on serverless targets (self-hosted `next start`
  unaffected). Watch on the next Prisma/Next bump.
- **O3 (Prisma dual-instance, fixed)** — Turbopack's bundling gave
  `prisma-errors.ts` a second copy of the generated client, so
  `instanceof Prisma.PrismaClientKnownRequestError` was **false** for a real
  P2002 and the duplicate-application guard leaked `INTERNAL_ERROR` instead
  of 409 (surfaced by `volunteer-apply.spec.ts`). Fixed with a structural
  fallback (`code` + `clientVersion`) + 4 dedicated tests; the E2E now sees
  the honest 409 message.
- **O4 (`Vary: Cookie` undeliverable, documented)** — verified against
  next@15.5.26 that neither proxy (middleware) nor `next.config headers()`
  can append a `Cookie` entry to `Vary`: the App Router overwrites `Vary`
  wholesale at render. M6 safety therefore rests on gating (only cookie-less
  renders are marked `public`); residual = a shared cache may serve
  cookie-less chrome to a signed-in user (cosmetic; no shared cache in front
  of `next start`). Re-verified unchanged under 16.3.6.
- **Streaming redirects** — app-level `redirect()` still ships as HTTP 200 +
  `__next-page-redirect` meta-refresh (client transition), not a 3xx;
  behavior unchanged from 15.5 → 16.3, probes assert the meta marker rather
  than a status code.
