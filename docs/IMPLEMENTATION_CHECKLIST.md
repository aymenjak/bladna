# BLADNA — Implementation Checklist

Legend: `[x]` done & validated · `[~]` partial/exists but limited · `[ ]` not started
“Validated” = `npm run typecheck && npm run lint && npm test && npm run build` pass (and live checks where the environment allows).

> **Validation snapshot (2026-10-05, P34 partnerships & CSR API + RBAC, M2)** — `npm run validate` **exit 0**, comprising:
> `typecheck` 0 ✅ · `lint` 0 ✅ · `format:check` 0 ✅ · `test` **489 passed, 0 skipped** (45 files) ✅ · `check` ✅ — **311 module routes (core 57, platform 179, participants 75), 0 duplicates**, `docs/API.md` documents **312/312** (0 drift) ✅ · `build` 0 (12 known warnings) — this increment shipped **P34 (M2)**, second of the five gated phases of the approved Partnerships & CSR ecosystem (`docs/PARTNERSHIPS-CSR-DESIGN.md`): services, API and RBAC over the M1 substrate — **43 new endpoints** (42 platform + 1 core) in four modules (economic profile & partner-match reads 12, request → proposal → partnership → obligations → agreements 16, funding/installments/disbursements/in-kind 11, impact evidence 3, body-addressed `POST /support-offers` 1 core), **zero schema changes** (M1 was complete) so no migration. The domain layer gains **11 state-machine transition maps** with exhaustive table tests (every declared edge flies, every other throws `BUSINESS_RULE_ERROR`, every key mirrors its Prisma enum) and **14 new permissions** (`partner.match.read` sits in `ORG_BASE` so every org role incl. VIEWER can read its scorecards; `impact.evidence.verify` and `partnership.moderate` remain the only two an org OWNER cannot hold — VO/moderator-only, each granted to at least one role per the RBAC test). Access is two-sided through the new `partnership-access.ts` helper — member of the wrong side without the permission ⇒ 403 naming it, outsider ⇒ 404 — with obligations pinning `party` server-side, funding writes economic-only (youth-side 403, outsider 404), disbursement/in-kind/impact verification officer-only, and proposal `ACCEPTED` resolving partnership sides deterministically (opportunity anchor → side holding an economic profile → asker = initiative side) while closing the request `APPROVED` under a one-open-partnership-per-initiative guard. Every transition takes `{ action, reason? }` with `reasonRequired` for the five closing decisions, counters issue `AGR-YYYY-######`, and every write lands the design-contract audit action (`PARTNERSHIP_*`, `PROPOSAL_*`, `AGREEMENT_*`, `FUNDING_*`, `IN_KIND_*`, `ECONOMIC_*`, …). `POST /support-offers` shares its kind-rules validator with the slug path and accepts `organizationId` (membership-checked; the acting member stays `userId` and audit actor). `docs/API.md` documents all 43 (312/312), and the latent `NotificationType` Prisma↔types drift ships its **+11 labels in all three locales**. Live gates: **E2E 42/42 (19 files)**, probe **211/211**, P1 **27/27**, P2 **ALL PASS**, full `prettier --check .` exit 0.

> **Validation snapshot (2026-10-05, P33 partnerships & CSR schema, M1)** — `npm run validate` **exit 0**, comprising:
> `typecheck` 0 ✅ · `lint` 0 ✅ · `format:check` 0 ✅ · `test` **446 passed, 0 skipped** (43 files) ✅ · `check` ✅ — **268 module routes (core 56, platform 137, participants 75), 0 duplicates**, `docs/API.md` documents **269/269** (0 drift) ✅ · `build` 0 (12 known warnings) — this increment shipped **P33 (M1)**, first of five gated phases of the approved Partnerships & CSR ecosystem (`docs/PARTNERSHIPS-CSR-DESIGN.md`; the five decision points resolved long-term — Organization is the single identity anchor, `userId` stays required on offers, stages M1→M5 ship one gated increment at a time, one `EconomicInstitutionProfile`, UI at M5). The schema gains **+21 models / +21 enums / zero deletions**: the economic profile with its focus-area and wilaya joins, `PartnerMatch` (the deterministic `rules-v1` scorecard storing a human-readable `breakdown Json` beside the score — no black box), the chain request → proposal → partnership → agreement → obligations, the funding lifecycle commitment → installments → disbursement + receipts, `InKindContribution`, `ImpactEvidence`/`ImpactReport` and the CRM quartet (contacts, interactions, follow-ups, notes) — exactly two columns touch existing tables (`Sponsor.organizationId @unique` compatibility bridge; `SupportOffer.organizationId` with `userId` still the required author), `CSRProgram` untouched, `NotificationType` +11 values. Migration **`0012_partnerships_csr`** — 730 lines: 21 `CREATE TABLE`, 11 `ALTER TYPE … ADD VALUE`, zero `DROP TABLE/COLUMN`; authored via `migrate diff --from-url` and applied with `migrate deploy` because the app role cannot `CREATE DATABASE` for `migrate dev`'s shadow schema. The strict diff also surfaced latent drift: three raw-SQL indexes from `0002_constraints` (`AuditLog`/`Message` `createdAt DESC`, `availability` GIN) that the datamodel never declared were dropped in 0012 — so **`0013_declared_indexes`** declares all three in `schema.prisma` (including `@@index([availability], type: Gin)`) and recreates them: **net zero objects lost, DB 13/13**. Prisma client regenerated (server stopped first — the query-engine DLL is locked while `next start` runs); the seed adds **16 trilingual `CSRFocusArea` rows** (upsert-by-code, idempotent) with the demo dataset intact, and a live query confirmed 21 tables / 2 bridge columns / 11 enum values / 16 areas / all four indexes. `.prettierignore` gains `packages/database/src/generated/` — every `db:generate` rewrites it (same reasoning as `next-env.d.ts`), so generated output can never fail `format:check` again. Zero routes, zero API, zero UI — 268 routes and 269/269 API docs are identical before and after; M2 (service modules + API + RBAC) is next. Live gates: **E2E 42/42 (19 files)**, probe **211/211**, P1 **27/27**, P2 **ALL PASS**, full `prettier --check .` exit 0.

> **Validation snapshot (2026-10-04, P32 one name, one message)** — `npm run validate` **exit 0**, comprising:
> `typecheck` 0 ✅ · `lint` 0 ✅ · `format:check` 0 ✅ · `test` **446 passed, 0 skipped** (43 files) ✅ · `check` ✅ — **268 module routes (core 56, platform 137, participants 75), 0 duplicates**, `docs/API.md` documents **269/269** (0 drift) ✅ · `build` 0 (12 known warnings) — this increment shipped **P32**: the brand voice. (1) One name — the official art's own tagline reads «مبادرة من بلادنا إلى فرصة في العالم» and sixteen server strings already said `بلادنا`, while the AR `siteName` and eight more UI strings said `بلدنا`; all nine now read **بلادنا** (`ar.ts`; no test or probe referenced either spelling). (2) One message — the landing hero ran the trio every platform ships (`اكتشف، ساهم` / `Discover, contribute` / `Découvrez, contribuez`) over a process list; `landing.heroTitle`/`landing.heroSubtitle` now open with Shahinaz's couplet «نصل الخير بأهله، ونمنح العطاء أثره» and her line «من جهودٍ متفرّقة إلى أثرٍ يجمع الجزائر», flowing into the precise content — vetting, review before publication, attendance, hours, certificates — and closing on «سجلٌ واحدٌ لا يُمحى يحفظه بلادنا»; EN `No good deed goes unrecorded.` / FR `Le bien ne passe jamais inaperçu.` carry the same message idiomatically — **zero new keys**, zero test touchpoints, the CMS `home` override is empty so the dictionary renders as-is. Live gates: **E2E 42/42 (19 files)**, probe **211/211**, P1 **27/27**, P2 **ALL PASS**, full `prettier --check .` exit 0.

> **Validation snapshot (2026-10-04, P31 honest access & true link origins)** — `npm run validate` **exit 0**, comprising:
> `typecheck` 0 ✅ · `lint` 0 ✅ · `format:check` 0 ✅ · `test` **446 passed, 0 skipped** (43 files) ✅ · `check` ✅ — **268 module routes (core 56, platform 137, participants 75), 0 duplicates**, `docs/API.md` documents **269/269** (0 drift) ✅ · `build` 0 (12 known warnings) — this increment shipped **P31**: the two live bugs the user reported against production. (1) Workspace 404s — every workspace catch merged `FORBIDDEN || NOT_FOUND` into `notFound()`, so a member whose role lacks the page's permission (volunteer@ on the hours/certificates tabs) or a signed-in non-member at the layout gate saw "الصفحة غير موجودة" for a page the tabs visibly linked; the shared `workspace-no-access.tsx` panel now renders on `FORBIDDEN` (standalone h1 at the layout gate, in-shell card with back-to-overview in the eleven tabs) while `NOT_FOUND` stays a real 404 — **2 new dictionary keys across all four i18n files** (`workspace.noAccessTitle/Body`). (2) The check-in link read `http://localhost:3000` — root `.env` `APP_URL`/`PUBLIC_APP_URL` now carry the live domain (email verify/reset, invitation and certificate-verify links follow), and a new `originFor()` derives in-request links from the caller's own host (configured/local allowlist; a forged `Host`/`X-Forwarded-Host` falls back to the configured public URL) via `checkInUrlFor(ctx, token)`. Live proof: domain session → `https://bladna.aymen-digital-studio.site/check-in?token=…`, localhost → `http://localhost:3002/check-in?token=…`. +4 `originFor` unit tests. Live gates: **E2E 42/42 (19 files, +2 `workspace-access.spec.ts`)**, probe **211/211 (+4 checks)**, P1 **27/27**, P2 **ALL PASS**, full `prettier --check .` exit 0.

> **Validation snapshot (2026-10-04, P30 the platform mark)** — `npm run validate` **exit 0**, comprising:
> `typecheck` 0 ✅ · `lint` 0 ✅ · `format:check` 0 ✅ · `test` **442 passed, 0 skipped** (43 files) ✅ · `check` ✅ — **268 module routes (core 56, platform 137, participants 75), 0 duplicates**, `docs/API.md` documents **269/269** (0 drift) ✅ · `build` 0 (12 known warnings) — this increment shipped **P30**: the user supplied the official art ("first, make this the platform's logo") and it became the platform's mark everywhere the brand speaks. The provided 1254² transparent PNG resampled into three assets — `public/logo.png` (384², 167 KB, loaded on every page), `src/app/icon.png` (512²) and `src/app/apple-icon.png` (180²), the app's **first** document/apple icons (Next registers both from the app directory, no metadata change). The header and footer brand slots render the mark where the initial-letter `Avatar` sat (`h-11`/`h-10`, `decoding="async"`, `alt=""` so the siteName text — `BLADNA` / `بلدنا` — stays the link's accessible name), and every auth flow opens with a centered mark above the back-home link. **Zero new i18n keys**. Live gates: **E2E 40/40 (18 files, +2 `site-chrome.spec.ts`)**, probe **207/207 (+2 logo/icon checks)**, P1 **27/27**, P2 **ALL PASS**, full `prettier --check .` exit 0.

> **Validation snapshot (2026-10-04, P29 zoned impact-metric cards)** — `npm run validate` **exit 0**, comprising:
> `typecheck` 0 ✅ · `lint` 0 ✅ · `format:check` 0 ✅ · `test` **442 passed, 0 skipped** (43 files) ✅ · `check` ✅ — **268 module routes (core 56, platform 137, participants 75), 0 duplicates**, `docs/API.md` documents **269/269** (0 drift) ✅ · `build` 0 (12 known warnings) — this increment shipped **P29**: impact-metric cards that zone their data instead of jamming it into one run-on line. `impact-metric-card.tsx` (new, shared by the workspace console's Impact tab and the public initiative page) prints a title row (type chip, name, verified badge, console timestamp), a labelled Actual/Target figure pair in tabular numerals (decimal strings from the raw metric select normalise to figures; an undeclared target prints `—`), an honest `role="progressbar"` bar that caps visually at 100% while the printed figures never round (omitted without a real denominator), and the source on its own muted line — hook `data-impact-metric`. **Zero new i18n keys** (the console's metric labels ride the public page too). Same increment: `mode=map` now demands a pinnable row (own coordinates or a coordinate-carrying city — the renderer's own fallback) in `buildDiscoverWhere`, so the placeless ONLINE initiative created during testing can no longer break the spec §16 map contract; it stays in the regular list. Live gates: **E2E 38/38 (18 files, +2 `impact-metrics.spec.ts`)**, probe **205/205 (+2 metric checks)**, P1 **27/27**, P2 **ALL PASS**, full `prettier --check .` exit 0.

> **Validation snapshot (2026-10-03, P28 the band carries detail pages & auth)** — `npm run validate` **exit 0**, comprising:
> `typecheck` 0 ✅ · `lint` 0 ✅ · `format:check` 0 ✅ · `test` **442 passed, 0 skipped** (43 files) ✅ · `check` ✅ — **268 module routes (core 56, platform 137, participants 75), 0 duplicates**, `docs/API.md` documents **269/269** (0 drift) ✅ · `build` 0 (12 known warnings) — this increment shipped **P28**: the band carries detail pages and auth. `page-masthead.tsx` grew a `children` mode (TS union — exactly one of `title`/`children`, so every caller keeps a single h1), and the three public detail surfaces move their identity headers inside it: the initiative's back link → badges → title → organizer line → save/report, the organization's header (with `<header>`, badges and the Message/Report entries) with the `org-cover` photo now below the band, the volunteer's identity card rebuilt as band content (white `text-3xl` name, `brand-200` meta, light chips and the outline button keep their fills). `AuthShell` hands its title/subtitle to a `max-w-md` band, so all six auth pages — login, register, forgot-password, reset-password, MFA, verify-email — share the silhouette and the white card starts at the form; the `Welcome back` h1 moved with it (still exactly one). **Zero new i18n keys**; light-on-light copy recolored for ink (`brand-100/200`, `clay-300`). Live gates: **E2E 36/36 (17 files)**, probe **203/203**, P1 **27/27**, P2 **ALL PASS**, full `prettier --check .` exit 0.

> **Validation snapshot (2026-10-03, P27 reference chrome everywhere)** — `npm run validate` **exit 0**, comprising:
> `typecheck` 0 ✅ · `lint` 0 ✅ · `format:check` 0 ✅ · `test` **442 passed, 0 skipped** (43 files) ✅ · `check` ✅ — **268 module routes (core 56, platform 137, participants 75), 0 duplicates**, `docs/API.md` documents **269/269** (0 drift) ✅ · `build` 0 (12 known warnings) — this increment shipped **P27**: the reference chrome rides every page. `site-masthead.tsx` lives in the locale layout, so the ink promise strip (locked **Algeria-first**) and the P12 marquee ticker sit above the sticky header on every route — the landing's private copies and the dashboard's standalone banner retired (per-id dismissal unchanged). `page-masthead.tsx` gives eleven public hubs plus `LegalDoc` (terms/privacy) a full-bleed deep-green title band — gold eyebrow → white h1 (Kufi in RTL) → jade lead, the map's coverage figures in the action slot, the directory's privacy footnote as the note line — with the gated `rise` entrance and **zero new i18n keys**. Live gates: **E2E 34/34 (17 files)**, probe **198/198**, P1 **27/27**, P2 **ALL PASS**, full `prettier --check .` exit 0.

> **Validation snapshot (2026-10-03, P26 reference-style landing)** — `npm run validate` **exit 0**, comprising:
> `typecheck` 0 ✅ `lint` 0 ✅ `format:check` 0 ✅ `test` **442 passed, 0 skipped** (43 files) ✅ `check` → **268 module routes (core 56, platform
> 137, participants 75), 0 duplicates**, `docs/API.md` documents **269/269** (0 drift) ✅ `build` 0 (12 known warnings) — this increment shipped
> **P26**: the landing rebuilt in the image of `mjeunesse.gov.dz` — the Ministry of Youth site the user asked to clone "exactly, but with our
> information", with suitable images and motions. The composition mirrors the reference while every locked string stays put: an ink top strip
> carries the locked **Algeria-first** promise (the heroBadge moved up from its pill), the P12 announcement becomes a marquee **ticker**
> (`variant="ticker"` — terracotta track with two exact-period copies, RTL keyframe mirroring the reference's `marquee-rtl`, one sr-only sentence
> for assistive tech with the moving copies `aria-hidden`, hover/focus pauses it, per-id dismissal untouched; the dashboard banner keeps the
> default variant byte-identical), the hero splits into copy left and a framed four-photo **slideshow** right (`hero-slider.tsx`: 900ms
> crossfade + 16s `hero-drift` zoom, `01 / 04` counter, per-segment `Show slide n` buttons with `aria-current`, play/pause `aria-pressed` — reduced
> motion never autoplays and a hidden tab stops advancing), the sections gain `data-reveal` scroll-ins, the impact band **counts up**
> (`stat-counter.tsx` — SSR ships the final honest figure, an IntersectionObserver replays it once for motion-opted-in eyes, reduced motion reads
> the final figure immediately), a new four-card **digital-services grid** (verify + map + volunteer directory + international, each keeping its
> own section copy) replaces the two stacked bottom cards, and the final CTA keeps the P11 dunes as its bookend with a `pulsering` glow. Display
> face: **Noto Kufi Arabic** (`--font-kufi` → `--font-display`) resolved by an `[dir='rtl'] h1…h4` rule — Arabic headlines take the reference's
> family, Latin locales keep Plex; every keyframe lives inside `prefers-reduced-motion: no-preference`, reveals are progressive
> (`@supports (animation-timeline: view())`, print-guarded). Hero photos reuse four CC0 frames (community, environment-beach, humanitarian,
> youth — already credited in PHOTO-CREDITS.md). i18n **+7 ×4** (`landing.sliderLabel`/`slideShow`/`playShow`/`pauseShow`,
> `eyebrows.services`, `servicesTitle`, `servicesMapBody`); E2E **+4** (`landing-motion.spec.ts`: promise strip + slider segment jump, ticker +
> counters + services links, reduced-motion stays paused, Arabic RTL — 28→32 / 16 files), probe **+7** (185→192: strip, features line, slider
> present, four frames, play/pause control, four counters, services heading). Locked strings untouched — quick-chip hrefs ×1 each, header
> `href="/en/opportunities"`, **Algeria-first** (now the top strip), **Append-only verified hours** (still in the trust strip),
> `#q`/`#opp`/`#filter-tray`, M6 cache, footer `href="/en/volunteers"`.
>
> Live gates: probe **192/192** ✅ P1 suite **27/27** ✅ P2 grep gates **ALL PASS** ✅
> E2E **32/32 (16 files)** ✅ full `prettier --check .` exit 0 ✅.
>
> **Validation snapshot (2026-10-03, P25 public volunteer profile)** — `npm run validate` **exit 0**, comprising:
> `typecheck` 0 ✅ `lint` 0 ✅ `format:check` 0 ✅ `test` **442 passed, 0 skipped** (43 files) ✅ `check` → **268 module routes (core 56, platform
> 137, participants 75), 0 duplicates**, `docs/API.md` documents **269/269** (0 drift) ✅ `build` 0 — this increment shipped **P25**: the public
> volunteer profile the directory promised but never delivered — a card you can finally click. The directory's cards now carry the photo
> (`Avatar src=profileImage`, initials stay the fallback) and turn the name into a link to the new `GET /volunteers/:id` (public tier,
> registered beside the list; `profileParamsSchema` UUID guard), and `volunteers/[id]/page.tsx` renders the identity header (photo, name,
> verification badge, volunteer code · wilaya — only under `showWilaya` — member-since, availability chips), the Message deep link (the P23
> `?to=` chain) and a masked-or-published email — the phone number never travels the contract. The achievements half is gated by spec §30
> exactly as documented: `verifiedHours` (`null` when `showHours=false`, the aggregate is never issued — the `GET /public/verify` rule), the
> valid certificate list (`null` when `showCertificates=false` — now the first surface where that stored flag controls anything, each row
> carrying its `certificateNumber` into credential-keyed verification) and the top-8 participation timeline whose per-row hours follow the
> same gate; honest totals (`certificatesTotal`/`participationsTotal`) keep capped lists from posing as whole stories and withheld sections
> print an explicit note instead of a fake 0. Unknown id, malformed uuid and opted-out profile all answer the same not-found page (the API
> answers a real 404 — no existence oracle); the page is classified public in `private-noindex.test.ts` and deliberately absent from the
> sitemap (the directory stays the discovery surface). Settings gained its sixth enforced privacy toggle — `showCertificates`
> (`settings.showCertificates` ×4), the control the settings comment had been waiting to give. i18n +8 ×4 (`directory.profileBack` …
> `profileCertsHidden`, `directory.availabilitySlots`, `settings.showCertificates`); guards `server/volunteer-profile.test.ts` +4, E2E +3
> (`volunteer-profile.spec.ts`: card→profile achievements, not-found for unknown/malformed ids + the real API 404, Arabic locale; 25→28 / 15
> files), probe +18 (167→185 — including the live opt-in flip: PATCH `publicProfile:false` → profile withheld → restored). Locked strings
> untouched — quick-chip hrefs ×1 each, header `href="/en/opportunities"`, **Algeria-first**, **Append-only verified hours**,
> `#q`/`#opp`/`#filter-tray`, M6 cache, footer `href="/en/volunteers"`, probe privacy strings (`Phone numbers are never shown` — the profile
> footnote reuses the ASCII prefix).
>
> Live gates: probe **185/185** ✅ P1 suite **27/27** ✅ P2 grep gates **ALL PASS** ✅
> E2E **28/28 (15 files)** ✅.
>
> **Validation snapshot (2026-10-03, P24 comments & ratings)** — `npm run validate` **exit 0**, comprising:
> `typecheck` 0 ✅ `lint` 0 ✅ `format:check` 0 ✅ `test` **437 passed, 0 skipped** (42 files) ✅ `check` → **267 module routes (core 56, platform
> 137, participants 74), 0 duplicates**, `docs/API.md` documents **268/268** (0 drift) ✅ `build` 0 — this increment shipped **P24**: participant
> reviews & ratings — who gets to speak on an initiative (an ACCEPTED application or VERIFIED hours on _this_ one) and what readers learn from
> it. A new `OpportunityReview` model (1–5 rating with a DB CHECK, optional body ≤2000, `source` recording which eligibility path qualified the
> author, one review per volunteer per initiative) is served by four routes in `modules/reviews.ts`: a public viewer-aware list (`items` + `meta`
>
> - `stats{count, average, 5-slot distribution}` + `viewer{authenticated, eligible, eligibility, own review}` — the detail page fetches it SSR, so
>   one round trip yields the whole section) and authenticated create / own-only update / delete (403 without eligibility, 409 on a second review,
>   foreign rows 404, delete idempotent, audited `opportunity.review` + `opportunity.review.delete`). The page renders it through a new
>   `reviews-section.tsx`: stats row (average, stars, count — hidden at zero), provenance badges (**Accepted participant** / **Verified hours**)
>   beside every row, author names only for `publicProfile` opt-ins (otherwise the verified-participant label), an always-visible eligibility note,
>   and a composer gated exactly like the server — star `radiogroup` of raw `role="radio"` buttons (`min-h-11`), `Textarea` ≤2000, edit/delete of
>   your own review behind the kit confirm dialog, `router.refresh()` after every mutation, and a sign-in CTA when anonymous or when a dead
>   session surfaces as 401. i18n +17 ×4 (`opportunity.reviewsTitle` … `reviewSignin`; label-first `Reviews: {count}` following `Results: {count}`);
>   guards: `validation/src/review.test.ts` +8 + `server/reviews.test.ts` +5 (424→437 / 40→42), E2E +1 full author cycle (24→25 / 14 files),
>   probe +8 (159→167); seed adds one idempotent demo review on `algiers-park-cleanup` (E2E does its CRUD on the beach initiative so the demo row
>   survives). Locked strings untouched — quick-chip hrefs ×1 each, header `href="/en/opportunities"`, **Algeria-first**, **Append-only verified
>   hours**, `#q`/`#opp`/`#filter-tray`, M6 cache, footer `href="/en/volunteers"`, probe privacy strings (`Phone numbers are never shown`).
>
> Live gates: probe **167/167** ✅ P1 suite **27/27** ✅ P2 grep gates **ALL PASS** ✅
> E2E **25/25 (14 files)** ✅.
>
> **Validation snapshot (2026-10-03, P23 contact & trust before applying)** — `npm run validate` **exit 0**, comprising:
> `typecheck` 0 ✅ `lint` 0 ✅ `format:check` 0 ✅ `test` **424 passed, 0 skipped** (40 files) ✅ `check` → **263 module routes (core 56, platform
> 137, participants 70), 0 duplicates**, `docs/API.md` documents **264/264** (0 drift) ✅ `build` 0 — this increment shipped **P23**: the three
> questions an applicant asks before applying — do volunteers actually appear, how do I reach them, and how well do I know this organizer?
> The public directory's cards now carry a **Message** button: `GET /volunteers` items expose the owner's `userId` (opt-in `publicProfile` rows
> only; the messaging API keeps enforcing blocks and the `messaging` rate limit; documented on `docs/API.md`), and the link rides `?to=` straight
> into the compose prefill. The messages page became a real contact entry point: it reads `?to=`/`?org=`/`?name=` from `searchParams`,
> re-validates them through new pure helpers `parseContactParams`/`contactQuery` (`ui/messages-utils.ts` — exact UUID ids, the display name capped
> at 120 and only ever emitted beside a valid org) and folds the result into the path that `pageSession` and the catch-block `?next=` both use, so
> an anonymous visitor who clicked Message signs in and lands on an already-addressed form. In the workspace, `?org=<id>&name=` opens the
> new-conversation form with a static **Organization** row instead of the raw-UUID recipient input (the id is fixed by the link, posted as
> `{ organizationId }` — the volunteer→org thread the staff side already lists), the Start button enables without a recipient, and closing or
> succeeding clears the target. Initiative headers gained organizer identity: the name links to the public profile, a logo `Avatar` sits beside
> it, a trust badge renders the organization's ladder (the same `workspace.verification.levels` copy the profile page uses), and the contact card
> **always** renders — published phone/email when there is any, and always a **Message the organization** button (`?org=`), so "no contact
> channel" no longer dead-ends. Organization profiles gained the same **Message** button in their header. i18n +2 ×4 (`common.message`,
> `opportunity.messageOrganization`) — guards: `messages-utils.test.ts` +5 (419→424), E2E +1 anonymous bounce test + an org-profile href
> assertion (23→24 / 13 files), probe +6 (153→159). Locked strings untouched — quick-chip hrefs ×1 each, header `href="/en/opportunities"`,
> **Algeria-first**, **Append-only verified hours**, `#q`/`#opp`/`#filter-tray`, M6 cache, footer `href="/en/volunteers"`, probe privacy strings
> (`Phone numbers are never shown`).
>
> Live gates: probe **159/159** ✅ P1 suite **27/27** ✅ P2 grep gates **ALL PASS** ✅
> E2E **24/24 (13 files)** ✅.
>
> **Validation snapshot (2026-10-03, P22 a home page that catches the eye)** — `npm run validate` **exit 0**, comprising:
> `typecheck` 0 · `lint` 0 · `format:check` 0 · `test` **419 passed, 0 skipped** (40 files) · `check` → **263 module routes (core 56, platform
> 137, participants 70), 0 duplicates**, `docs/API.md` documents **264/264** (0 drift) · `build` 0 — this increment shipped **P22**: the home
> page given its visual punch, with **zero new copy** (no dictionary touched — every change is markup, class and one guarded keyframe). The
> page now has an anchor rhythm instead of a flat sand run: the journey section turns **white** and its step marks gain a clay gradient +
> halo (`ring-4 ring-clay-100`), the identity cell of the pillars bento **inverts to the deep brand gradient** (`from-brand-700 via-brand-800
to-brand-900`, icon flips to `text-brand-200` via `iconFor(key, onDark)`) so the grid encodes priority the way §3 always claimed, and the
> impact panel **crosses to a dark brand band** — same `gap-px` hairline instrument, same clay figure rules, same `statsNote` provenance
> label, but figures now render at `text-5xl/6xl` in a white→`brand-200` clipped gradient over a breathing glow. The hero glow, the stats
> wash and the final CTA's wash all breathe on a new `.hero-breathe` keyframe (16s, transform-only) declared **inside** the
> `prefers-reduced-motion: no-preference` block, so opted-out users still get a fully static page; hero search/CTAs got `shadow-xl` +
> `motion-safe:hover:-translate-y-0.5`, and the verify card grew a warm two-tone wash with a masked shield watermark. `SectionHeading`
> gained an optional `tone="dark"` (default `'light'` keeps every other surface byte-identical). Locked strings untouched — quick-chip
> hrefs, header `href="/en/opportunities"`, **Algeria-first**, **Append-only verified hours**, `#q`/`#opp`/`#filter-tray`, M6 cache.
>
> Live gates: probe **153/153** · P1 suite **27/27** · P2 grep gates **ALL PASS** ·
> E2E **23/23 (13 files)**.
>
> **Validation snapshot (2026-10-03, P21 review before publish + the platform's idea on the home page)** — `npm run validate` **exit 0**, comprising:
> `typecheck` 0 · `lint` 0 · `format:check` 0 · `test` **419 passed, 0 skipped** (40 files) · `check` → **263 module routes (core 56, platform
> 137, participants 70), 0 duplicates**, `docs/API.md` documents **264/264** (0 drift) · `build` 0 — this increment shipped **P21**: the letter's
> claim that initiatives pass a review before publication is now enforced by code, not prose. `OPPORTUNITY_TRANSITIONS.DRAFT` no longer lists
> `PUBLISHED` (a draft enters the review queue first — nobody jumps it), the tenant transition endpoint maps **`PUBLISH`/`REJECT` →
> `opportunity.moderate`** so organizations only submit, withdraw and steer (the org-side Reject button that always 403'd disappeared with
> `TRANSITION_ACTIONS`, reason field included), the **admin console now shares the tenants' verification wall** — `platformAction` refuses
> `SUSPENDED`/non-`VERIFIED` organizations on every move to `PUBLISHED`, where its doc comment used to say it was deliberately exempt — and its
> action menu filters per row through `canTransition` (a DRAFT row shows no actions instead of an always-on PUBLISH that the machine refuses).
> The home page then _states_ the idea: hero subtitle + badge + trust strip rewritten ×4 (badge restores the locked **Algeria-first** wording;
> strip = verified organizations → reviewed initiatives → append-only hours → checkable certificates) and a new typographic **"From idea to
> impact"** lifecycle section (register → describe → review → run → document → one shared record — five numbered cards + a trust cell, ×4 i18n,
> no photos: the three CC0 shots stay in "How it works"). Locked strings untouched. Guards: `state-machines.test.ts` DRAFT→PUBLISHED **false** +
> `rbac.test.ts` no organization role holds `opportunity.moderate` (419 kept)
>
> - `docs/API.md` documents the review rule on both transition endpoints.
>   Live gates: probe **153/153** · P1 suite **27/27** · P2 grep gates **ALL PASS** ·
>   E2E **23/23 (13 files)**.
>
> **Validation snapshot (2026-10-02, P20 report from the page, not a UUID)** — `npm run validate` **exit 0**, comprising:
> `typecheck` 0 · `lint` 0 · `format:check` 0 · `test` **419 passed, 0 skipped** (40 files) · `check` → **263 module routes (core 56, platform
> 137, participants 70), 0 duplicates**, `docs/API.md` documents **264/264** (0 drift) · `build` 0 — this increment shipped **P20**: the report
> form stopped demanding a raw UUID ("كيف ابلغ هنا واين اجد المعرف او الرابط او اي شي اخر") — the public pages are addressed by slug, so a
> shared `parseReportTargetRef` (`@bladna/types`, one set of rules for client and server) reads a **page link pasted from the address bar**
> (path → target type: `opportunities|organizations|workspace|campaigns`, `verify/certificate?code=` → CERTIFICATE, locale/query/hash
> stripped) or a bare slug, and the server's reworked `resolveTarget` resolves `id OR slug` per type (free text only ever filters the slug
> column, never a uuid column) and returns the effective type for the stored row and audit; `INTERNATIONAL_OPPORTUNITY` is hidden from the
> menu and rejected honestly — the moderation pipeline has no effect branch for it, and it used to fall through to "Message not found".
> Every initiative/organization profile now carries a **Report** link (`dict.common.report`, new key ×4) that opens
> `/safety?target=<own page link>` prefilled, the type auto-detected on mount and on paste, the value riding the anonymous sign-in bounce;
> hints rewritten ×4 ("paste the page link from the address bar…"). Locked strings untouched. Guards: `report-target.test.ts` (+9 → 419)
>
> - E2E `safety.spec.ts` (Report link → prefill → detected type → submit → "My reports" shows the resolved uuid, never the pasted URL)
>   backed by a self-healing `e2e-ensure-clean-report.ts` fixture.
>   Live gates: probe **153/153** · P1 suite **27/27** · P2 grep gates **ALL PASS** ·
>   E2E **23/23 (13 files)**.
>
> **Validation snapshot (2026-10-02, P19 shareable conversation link)** — `npm run validate` **exit 0**, comprising:
> `typecheck` 0 · `lint` 0 · `format:check` 0 · `test` **410 passed, 0 skipped** (39 files) · `check` → **263 module routes (core 56, platform
> 137, participants 70), 0 duplicates**, `docs/API.md` documents **264/264** (0 drift) · `build` 0 — this increment shipped **P19**: nobody should
> hunt for a raw UUID ("uuid صعب ايجاه اعمل حل اخر") — the account card in Settings now leads with a shareable **conversation link**
> (`/{locale}/messages?to=<user id>`, absolute after mount, truncated code chip with a full-title hover) beside a **Copy link** button that
> writes it to the clipboard (2 s confirmation; insecure-context fallback selects the code for a manual Ctrl+C) over the raw-ID row, whose
> hint points at the link; the messages workspace reads `?to=` on mount and opens the new-conversation form with the recipient already
> filled, and the recipient field accepts a whole pasted link (the UUID is extracted client-side before `POST /conversations` — the server's
> existing DIRECT dedupe then opens the thread the pair already shares). i18n +3 keys ×4 (`settings.conversationLink`/`copyLink`/`linkCopied`)
> plus rewritten `settings.yourUserIdHint` and `messages.recipientHint` ×4; locked strings untouched. Guards: E2E `messages.spec.ts` +1
> (clipboard round-trip → `?to=` prefill → Start opens a content-carrying existing thread).
> Live gates: probe **153/153** · P1 suite **27/27** · P2 grep gates **ALL PASS** ·
> E2E **22/22 (12 files)**.
>
> **Validation snapshot (2026-10-02, P18 support offers decision room)** — `npm run validate` **exit 0**, comprising:
> `typecheck` 0 · `lint` 0 · `format:check` 0 · `test` **410 passed, 0 skipped** (39 files) · `check` → **263 module routes (core 56, platform
> 137, participants 70), 0 duplicates**, `docs/API.md` documents **264/264** (0 drift) · `build` 0 — this increment shipped **P18**: the offers
> concept rebuilt around the user's report ("didn't update when accepting offers") — both needs APIs now sum **accepted offer quantities**
> (`acceptedQuantity`) beside the existing counts/amounts, and a shared `NeedProgressBar` paints two honest segments (solid `brand-600` =
> received `fulfilled`, lighter `brand-300` = accepted pledges still to be delivered, capped at the target, aria reporting the painted total)
> on the public need card, the console needs tab and the new offers group headers, so a decision moves the bar in place without pretending
> the goods arrived (financial keeps its accepted-amount line). The console offers tab became a decision room: a three-stat summary strip
> (total / pending in amber / accepted in `brand-700`), instant status chips with counts (`aria-pressed`, 44 px targets), offers grouped
> under their need (kind pill, counts, bar or financial line in the header) and rich cards — status chip + large `tabular-nums` figure
> (amount or ×quantity), offerer `Avatar` initials + masked name + masked email, `dir="auto"` description on a start-border rule, contact
> note, submitted/decided dates, reject reason, primary Accept button. i18n +6 keys ×4
> (`opportunity.receivedLabel`/`acceptedLabel`, `initiativeConsole.offersTotal`/`offersAll`/`offerSubmittedAt`/`offerDecidedAt`). Fixture:
> `scripts/e2e-ensure-pending-offer.ts`, self-healing from Playwright global setup through a `tsx` child (ladder need + one fresh PENDING
> offer; stale marker offers dropped, user data untouched). Guards: `need-progress.test.ts` (+3 → 410 tests) + E2E `offers.spec.ts` (accept
> → chip flip, Accept disappears, bar 0 → 1 in place).
> Live gates: probe **153/153** · P1 suite **27/27** · P2 grep gates **ALL PASS** ·
> E2E **21/21 (12 files)**.
>
> **Validation snapshot (2026-10-02, P17 messages workspace)** — `npm run validate` **exit 0**, comprising:
> `typecheck` 0 · `lint` 0 · `format:check` 0 · `test` **407 passed, 0 skipped** (38 files) · `check` → **263 module routes (core 56, platform
> 137, participants 70), 0 duplicates**, `docs/API.md` documents **264/264** (0 drift) · `build` 0 — this increment shipped **P17**: the
> messages workspace adopted chat conventions — conversation rows gained a peer `Avatar` tile (profile image, initials fallback) and a
> start-border active state; the thread renders on a tinted `sand-50` canvas with white peer bubbles (sender name in `brand-700`, shown
> once per turn) vs `brand-600` mine bubbles in white text, one `formatDate` separator per day, turn grouping (repeated names drop, gaps
> tighten), `formatTime` meta moved outside the bubble, `dir="auto"` on message bodies (Latin copy stops bidi-scrambling inside the RTL
> page), and the 📎 emoji replaced by `PaperclipIcon` — including an `sr-only` file input behind a focus-ringed label — plus `SendIcon`
> in the composer, Enter-to-send (Shift+Enter keeps the newline, IME composition excluded), peer names under the thread title, and
> mobile auto-scroll to the opened thread. Demo data in data (seed + idempotent `prisma db execute`, subject/ON CONFLICT-guarded): an
> org↔volunteer 4-message thread so the page opens on real content. Guards: `format.test.ts` (+1 → 407 tests) + E2E `messages.spec.ts`
> (list → thread → bubbles → composer labels). Same run closed P16's residual risk — sticky-header audit at 1024/1152/1280/1440 px: no
> horizontal overflow, no nav/right-cluster overlap, every link 44 px.
> Live gates: probe **153/153** · P1 suite **27/27** · P2 grep gates **ALL PASS** ·
> E2E **20/20 (11 files)**.
>
> **Validation snapshot (2026-10-02, P16 app bar declutter)** — `npm run validate` **exit 0**, comprising:
> `typecheck` 0 · `lint` 0 · `format:check` 0 · `test` **406 passed, 0 skipped** (37 files) · `check` → **263 module routes (core 56, platform
> 137, participants 70), 0 duplicates**, `docs/API.md` documents **264/264** (0 drift) · `build` 0 — this increment shipped **P16**: the
> signed-in header decluttered from eight text links + language switch + account + a bordered logout (the dashboard label wrapped onto two
> lines in a user screenshot) down to the public four + dashboard as `shrink-0 whitespace-nowrap` text links, messages/notifications as
> icon buttons labeled from the existing dictionary keys, applications moved into the account menu, sign-out dropped `variant="outline"`
> for ghost, and the bar became `sticky top-0 z-40` (nothing else in the app sticks; Radix menus/dialogs render at z-50+). `coreNavLinks`
> stays untouched — the P3 bottom tab bar and the mobile drawer (which re-adds the icon-only pair) keep the core four. E2E
> `appbar.spec.ts` pins the sticky position, the visible destinations and both icon aria-labels.
> Live gates: probe **153/153** · P1 suite **27/27** · P2 grep gates **ALL PASS** ·
> E2E **19/19 (10 files)**.
>
> **Validation snapshot (2026-10-02, P15 organization profile trust & presence)** — `npm run validate` **exit 0**, comprising:
> `typecheck` 0 · `lint` 0 · `format:check` 0 · `test` **406 passed, 0 skipped** (37 files) · `check` → **263 module routes (core 56, platform
> 137, participants 70), 0 duplicates**, `docs/API.md` documents **264/264** (0 drift) · `build` 0 — this increment shipped **P15**: the
> organization profile gains a face — `coverImage` joined `ORG_PUBLIC_SELECT` (presentation; email/phone/address/website stay excluded)
> rendered as a rounded cover band, kit `Avatar` gained `src`/`alt` (the tenant's logo covers the identity tile, initials stay the
> fallback — profile header + every directory card), and a sidebar Team card lists up to four members **who opted into the public
> directory** (relation args inside the select: `publicProfile` + ACTIVE + no soft-deleted user) with name, role and a `+N` chip derived
> from the same `_count.members` the StatGrid shows; i18n `organizations.teamTitle` + `organizations.memberRoles` ×5 in all four
> dictionaries; demo data fixed in data (seed + idempotent `prisma db execute`): CC0 cover photo, an original SVG mark
> (`logo-atlas-verts.svg`), the opted-in demo volunteer seated as ACTIVE STAFF. Guards: kit unit test for `Avatar src` (+1 → 406 tests) +
> E2E `org-profile.spec.ts` (cover/logo/team on the detail, logo on the directory card) — validated in one run together with P16.
> Live gates: probe **153/153** · P1 suite **27/27** · P2 grep gates **ALL PASS** ·
> E2E **19/19 (10 files)**.
>
> **Validation snapshot (2026-10-02, P14 support cards, tab bar & kit CSS source fix)** — `npm run validate` **exit 0**, comprising:
> `typecheck` 0 · `lint` 0 · `format:check` 0 · `test` **405 passed, 0 skipped** (37 files) · `check` → **263 module routes (core 56, platform
> 137, participants 70), 0 duplicates**, `docs/API.md` documents **264/264** (0 drift) · `build` 0 — this increment shipped **P14**: the public
> support-need cards rebuilt (kit `Badge` kind/goal-reached chips above the title, `dir="auto"` descriptions so Latin copy stops being
> bidi-scrambled inside the RTL page, bold `tabular-nums` figure rows split from the accepted-offers meta — financial needs now show it too
> —, a hairline `mt-auto` footer pinning the sign-in CTA / closed note to the card bottom, `grid gap-4 sm:grid-cols-2` instead of one tall
> column), volunteer-slot figures harmonized to the same typography, console need descriptions get the same `dir="auto"` fix, and the kit
> tab bar redesigned (bordered `sand-100` track as a single nowrap scroll row, `h-11 shrink-0 px-4` triggers, active =
> `bg-brand-600 text-white shadow-sm`, inactive hover `bg-white` — API and roles unchanged). The pass surfaced the systemic bug behind the
> user's screenshots: **Tailwind v4 source detection never scanned `packages/ui`**, so every kit-unique utility — including the tab
> `data-[state=active]` rules and the login submit's `bg-brand-700` — was silently absent from the built CSS (white-on-white button,
> uncolored active tab); `globals.css` now pins the tree with `@source '../../../../packages/ui/src'`, and a new permanent E2E spec
> (`tests/e2e/console-tabs.spec.ts`) asserts the active tab's **computed background** so this failure mode cannot hide again.
> Live gates: probe **153/153** · P1 suite **27/27** · P2 grep gates **ALL PASS** ·
> E2E **16/16 (8 files)**.
>
> **Validation snapshot (2026-10-02, P13 organization pages presentation pass)** — `npm run validate` **exit 0**, comprising:
> `typecheck` 0 · `lint` 0 · `format:check` 0 · `test` **405 passed, 0 skipped** (37 files) · `check` → **263 module routes (core 56, platform
> 137, participants 70), 0 duplicates**, `docs/API.md` documents **264/264** (0 drift) · `build` 0 — this increment shipped **P13**: the
> organization surfaces present themselves — the public profile (`/organizations/[slug]`) rebuilt with a mirrored back link, kit `Badge`
> type/verified chips over an `Avatar`+h1+location header, a hairline `StatGrid` band (members · opportunities · campaigns — the campaign
> figure is the GET /campaigns `organizationId` total), opportunities in the shared `InitiativeCard` 2-up grid through a new
> `showOrganization={false}` prop (the byline is redundant on the org's own page), a public campaigns rail (`StatusBadge` + dates +
> participants/targets, title links `/campaigns/[slug]`, catch → empty), and a facts sidebar (type, trust level, verified since, profile
> since + honest unverified note); directory cards now link to their profile (`h2 > Link` + hover affordance — they were a dead end).
> i18n `organizations.*` ×6 in all four dictionaries. Data hygiene: a stray user-made PUBLISHED opportunity (`slug=test`, org `nexvo`, no
> location → null coordinates) failed the probe's `mode=map` coords check and was demoted to DRAFT (record preserved, public surfaces
> clean).
> Live gates: probe **153/153** · P1 suite **27/27** · P2 grep gates **ALL PASS** ·
> E2E **15/15 (7 files)**.
>
> **Validation snapshot (2026-10-01, P12 missing pages & existing pages pass)** — `npm run validate` **exit 0**, comprising:
> `typecheck` 0 · `lint` 0 · `format:check` 0 · `test` **403 passed, 0 skipped** (37 files) · `check` → **263 module routes (core 56, platform
> 137, participants 70), 0 duplicates**, `docs/API.md` documents **264/264** (0 drift) · `build` 0 — this increment shipped **P12**: the public
> CMS surfaces and the auth/verify improvements — a trilingual help centre (`/help` + `/help/[slug]`, PUBLISHED rows only, seeded
> faq/getting-started/about articles, footer Help link, sitemap +1 → **19 paths / 57 entries**), a dismissible announcement banner on the
> landing hero + dashboard (pinned row via GET /home with a GET /announcements limit-1 fallback, per-row `localStorage` dismissal, every
> fetch catch→empty so a CMS failure never 500s a public page), featured rails (landing `HOME_*` band + discover `DISCOVER_FEATURED` strip,
> 5 seed placements idempotent on `@@unique([section,targetType,targetId])`), the admin `HomeContent` hero override honored when a row
> exists (no seed row → locked copy byte-identical), a redesigned verify hub (3 explainer cards + how-it-works strip + `/help/faq` link —
> `verify-code`/Check/"Verify a record" E2E locks intact) with mirrored back chevrons on its three subpages, and password reveal toggles
> everywhere (new kit `Input` `trailing` slot → shared `PasswordInput` wired into login, register ×2 and reset ×2, i18n show/hide ×4 files).
> Live gates: probe **153/153** · P1 suite **27/27** · P2 grep gates **ALL PASS** ·
> E2E **15/15 (7 files)**.
>
> **Validation snapshot (2026-10-01, P11 imagery & atlas map pass)** — `npm run validate` **exit 0**, comprising:
> `typecheck` 0 · `lint` 0 · `format:check` 0 · `test` **403 passed, 0 skipped** (37 files) · `check` → **263 module routes (core 56, platform
> 137, participants 70), 0 duplicates**, `docs/API.md` documents **264/264** (0 drift) · `build` 0 — this increment shipped **P11**: the imagery
> brief in both directions — an original layered SVG `hero-art.tsx` (Algerian landscape: sky, sun, dunes, mountains, palm grove, kudu —
> `aria-hidden`, gradient headline byte-stable) behind the landing hero and final CTA, and **13 CC0/PD photographs** (Openverse,
> `license=cc0|pdm` only → `apps/web/public/photos/`, provenance in `design-refs/PHOTO-CREDITS.md` + `photo-picks.json`) as `InitiativeCard`
> covers (new `coverImage` field: LIST_SELECT → discover DTO → seed) and the how-works band — photos decorative (`alt=""`), thematic, never
> documentary (§7); how-works number badges `size-9 → size-10` (G6). Plus the `/[locale]/map` overhaul: `PageHeader` with the new `mapEyebrow`
> key (×4 files) + distinct-wilaya coverage stats + mirrored back chevron; atlas canvas finish (jade `LAND_FILL`/`LAND_STROKE` shared by the
> SSR poster and the Leaflet overlay, `sand-50 → sand-100` ground, clay-north compass rose in the letterbox margin); proximity clustering
> (`groupByProximity`, 30px → `size-10 bg-brand-800 ring-2 ring-white` badge; click/Enter/Space zooms to split, `autoPanOnFocus: false`);
> enriched side list (title + type Badge + location + date, `max-h-[26rem] lg:max-h-[34rem]`) with hover/focus ↔ pin `.is-hot` two-way sync
> and `viewTick` re-clustering; permanent results chip + search-area in one top-left column.
> Live gates: probe **153/153** · P1 suite **27/27** · P2 grep gates **ALL PASS** ·
> E2E **15/15 (7 files)**.
>
> **Validation snapshot (2026-09-30, P10 reference-driven Hero & dashboard pass)** — `npm run validate` **exit 0**, comprising:
> `typecheck` 0 · `lint` 0 · `format:check` 0 · `test` **403 passed, 0 skipped** (37 files) · `check` → **263 module routes (core 56, platform
> 137, participants 70), 0 duplicates**, `docs/API.md` documents **264/264** (0 drift) · `build` 0 — this increment shipped **P10**: the
> reference pass over 14 curated Dribbble shots (`design-refs/dribbble/`, 8 charity/nonprofit landings + 6 admin dashboards — each read as an
> image and compared against the code) → decisions D1–D8: hero display `md:text-7xl` with a direction-neutral white→`brand-200` gradient
> headline + aria-hidden clay rule; pill geometry **on marketing surfaces only** (hero/final CTAs + search bar; kit controls keep the P9 8px
> tier — recorded non-goal N2); a hairline trust strip + scroll cue as the hero's fold exit; a warm `bg-sand-100/60` stats band with clay rules
> under `text-5xl` figures (values still from GET /impact); the dashboard split into two zones (`max-w-6xl`, `lg:grid-cols-3` — work column +
> rail, quick links `lg:grid-cols-2`, the §58 international bar's probe-locked classes byte-identical); a live date under the greeting;
> `StatGrid` with solid `bg-brand-800 text-white` icon chips (G1 keeps brand-700 kit-only) + `text-3xl` figures + an honest `statOpenHint` on
> the applications cell (new i18n key ×`types`/`en`/`fr`/`ar`); recorded non-goals N1 charts (no real time-series), N3 photo-masked headlines
> (no photo library), N4 tinted dashboard ground.
> Live gates: probe **153/153** · P1 suite **27/27** · P2 grep gates **ALL PASS** ·
> E2E **15/15 (7 files)**.
>
> **Validation snapshot (2026-09-30, P9 "Oasis Modern" visual retheme)** — `npm run validate` **exit 0**, comprising:
> `typecheck` 0 · `lint` 0 · `format:check` 0 · `test` **403 passed, 0 skipped** (37 files — incl. `surfaces.test.tsx`
> re-aligned to the card surface: `rounded-card` + `shadow-card`) · `check` → **263 module routes (core 56, platform
> 137, participants 70), 0 duplicates**, `docs/API.md` documents **264/264** (0 drift) · `build` 0 (Turbopack,
> `next/font` fetching IBM Plex Sans Arabic) — this increment shipped **P9**: a full visual retheme _at the token and
> kit layers_ (class names, copy and selectors byte-stable, so probe/P1/P2/E2E locks survived by construction — only
> values, fonts and radius changed): new `@theme static` ramps in `globals.css` — deep jade `brand` (700 `#18664a`
> = 6.9:1 on white, 600 = 5.0:1), warmed `sand` (500 `#746c5d` = 4.7:1 on the page bg, new `950` ink) and a new
> decorative `clay` terracotta ramp (text ≥ clay-700, never semantic — status stays sky/amber/red); IBM Plex Sans
> Arabic (300–700, `next/font` → `--font-plex` → `--font-sans`, arabic+latin subsets) carrying both scripts;
> `--shadow-card` elevation + the 8/12/14/16px radius tiers with kit `Card`/`Alert`/`EmptyState`/tabs/dialogs
> aligned (kit buttons keep the 8px control tier, matching the 100+ raw controls, and gain `shadow-sm` +
> `motion-safe:hover:-translate-y-px`); the footer becomes the one deep-ink surface (`bg-sand-950`, links
> `text-sand-300` hover `text-brand-300`, pairs ≥6.4:1); the landing hero deepens (gradient `from-brand-900
via-brand-800 to-brand-700`, jade+clay glow hexes, `text-5xl md:text-6xl` display type, clay step marks,
> `text-4xl` stats); semantic `--color-bg/surface/fg/muted/border` aliases ship as the recorded dark-mode
> prerequisite (dark still deferred — DESIGN §10/§11); email CTA/shell hexes + the PDF card header move with the
> brand (`#18664a` / `#0f4030`); DESIGN.md rewritten (§3 one-family typography, §5 radius/elevation/buttons/ink
> footer, §10 P9 decision, new §11 color system with contrast proofs).
> Live gates: probe **153/153** · P1 suite **27/27** · P2 grep gates **ALL PASS** ·
> E2E **15/15 (7 files)**.
>
> **Validation snapshot (2026-09-30, P8 signed-in surfaces redesign)** — `npm run validate` **exit 0**, comprising:
> `typecheck` 0 · `lint` 0 · `format:check` 0 · `test` **403 passed, 0 skipped** (37 files) · `check` → **263 module
> routes (core 56, platform 137, participants 70), 0 duplicates**, `docs/API.md` documents **264/264** (0 drift)
> · `build` 0 (Turbopack) — this increment shipped **P8**: all four signed-in surfaces upgraded _within_ the
> system (DESIGN.md tokens, kit components and honest-copy rules unchanged — no retheme): the participant
> dashboard (eyebrow greeting header, hairline `StatGrid` with icon chips, `SectionHeading` rhythm on every list
> card, kit `Badge`/`EmptyState` replacing raw pills/dashed boxes, icon-led quick-link bento, all `→` literals →
> RTL-mirrored lucide arrows; the spec §58 international bar kept byte-identical for the probe + G3 four-hit
> contract), the workspace console (verification kit `Badge` in the header, analytics onto the shared
> `StatGrid`, certificate counts as state-toned kit Badges, `SectionHeading` results header + kit `EmptyState`
> with the `#opp`/`#status` selector contract untouched), the initiative detail (localized eyebrow sections via
> `SectionHeading`, kit `Badge` meta chips, icon-led facts `dl` with hairline dividers + `tabular-nums`,
> mirrored back chevron) and a discover pass (live `aria-live` results count, icon'd empty state, `.rise`
> results grid — E2E selector contract untouched). New shared `stat-grid.tsx`; 10 new lucide wrappers
> (`Clock`, `Send`, `Bell`, `Mail`, `QrCode`, `Eye`, `Target`, `ClipboardCheck`, `Inbox`, `UserRound`); new
> i18n keys across `types.ts` + `en`/`fr`/`ar` (`dashboard.eyebrow`, `dashboard.quickLinksTitle`,
> `opportunity.eyebrows.*`, `workspace.overview.eyebrow`) plus rewritten empathetic empty-state copy in all
> three languages; `.rise` animation declared only inside `@media (prefers-reduced-motion: no-preference)`
> (verified in the shipped CSS bundle, minified spelling).
> Live gates: probe **153/153** · P1 suite **27/27** · P2 grep gates **ALL PASS** ·
> E2E **15/15 (7 files)**.
>
> **Validation snapshot (2026-09-30, P7 landing & discover redesign)** — `npm run validate` **exit 0**, comprising:
> `typecheck` 0 · `lint` 0 · `format:check` 0 · `test` **403 passed, 0 skipped** (37 files) · `check` → **263 module
> routes (core 56, platform 137, participants 70), 0 duplicates**, `docs/API.md` documents **264/264** (0 drift)
> · `build` 0 (Turbopack) — this increment shipped **P7**: the landing + discover pages upgraded _within the
> system_ (DESIGN.md tokens, kit components and honest-copy rules unchanged — no retheme): a reworked hero
> (verifiability badge, "Discover, contribute, and prove your impact" / «اكتشف، ساهم، ووثّق أثرك», one white
> `role="search"` bar with a kit outline submit + quick chips), the discover rail built on the new shared
> `SectionHeading`/`InitiativeCard`, a bento pillar grid (identity cell `sm:col-span-2`), a hairline `gap-px`
> stats panel keeping the `statsNote` demo-data qualifier, and a discovery-page pass (eyebrow header, localized
> results count, honest empty state, shared result cards, mirrored prev/next chevrons). New i18n keys across
> `types.ts` + `en`/`fr`/`ar` (identical key sets, zero literal copy); `→` literals replaced by kit lucide
> arrows (`rtl:rotate-180`); `.hero-rise` animation declared only inside
> `@media (prefers-reduced-motion: no-preference)`; shipped bundle also carries
> `html[lang='ar'] body { line-height: 1.75 }`.
> Live gates: probe **153/153** · P1 suite **27/27** · P2 grep gates **ALL PASS** ·
> E2E **15/15 (7 files)**.
>
> **Validation snapshot (2026-09-30, P6 standard libraries: icons · toasts · dialogs · menu · tabs · i18n · map)** — `npm run validate` **exit 0** (final run; two clean code-freeze runs), comprising:
> `typecheck` 0 · `lint` 0 · `format:check` 0 · `test` **403 passed, 0 skipped** (37 files — incl. the new
> `packages/ui/src/confirm.test.tsx` and the rewritten `tabs.test.tsx`, 7/7 each) · `check` → **263 module
> routes (core 56, platform 137, participants 70), 0 duplicates**, `docs/API.md` documents **264/264** (0 drift)
> · `build` 0 (Turbopack) — this increment shipped **P6**: hand-rolled code replaced by established libraries —
> **lucide-react** behind the kit icon wrappers, **sonner** toasts, **Radix UI** (AlertDialog `useConfirm`,
> Dialog `usePrompt`, DropdownMenu account menu, Tabs behind the kit API), **next-intl** (request config +
> provider over the existing dictionaries) and **Leaflet** as the map engine (dynamic client import, **no
> tiles** — bundled OSM/ODbL geography + SSR poster contract unchanged; zoom floored at the full view, 1–8
> range). `window.confirm`/`window.prompt` greps = 0.
> Live gates: probe **153/153** · P1 suite **27/27** · P2 grep gates **ALL PASS** ·
> E2E **15/15 (7 files)**.
>
> **Validation snapshot (2026-09-30, P5 matching · saved · volunteer directory)** — `npm run validate` **exit 0** (run twice), comprising:
> `typecheck` 0 · `lint` 0 · `format:check` 0 · `test` **396 passed, 0 skipped** (36 files — incl. the new
> `server/matching.test.ts`, P5 validation cases and the grown classification guard) · `check` → **263 module
> routes (core 56, platform 137, participants 70), 0 duplicates**, `docs/API.md` documents **264/264** (0 drift)
> · `build` 0 (Turbopack; `/saved`, `/recommendations`, `/volunteers` in the route list) — this increment shipped
> **P5**: the dormant `matchOpportunity` engine became user-facing (`GET /me/recommendations` + dashboard strip +
> `/recommendations` page with localized reason chips and unconditional transparency copy, first-publish
> `NEW_MATCHING_OPPORTUNITY` fan-out), **save/favorites** (`/me/saved-opportunities` trio + `/saved` page +
> `SaveButton`), and the **public volunteer directory** (`/volunteers`, indexable, footer link, sitemap 18×3=54).
> Live gates: probe **153/153** (34 new P5 checks) · P1 suite **27/27** · P2 grep gates **ALL PASS** ·
> E2E **15/15 (7 files)**.
>
> **Validation snapshot (2026-09-26, P4 quality & scale + Next 16 upgrade)** — `npm run validate` **exit 0**, comprising:
> `typecheck` 0 · `lint` 0 · `format:check` 0 · `test` **375 passed, 0 skipped** (35 files — incl. the new kit
> component suites and `prisma-errors.test.ts`) · `check` → **259 module routes (core 56, platform 137,
> participants 66), 0 duplicates**, `docs/API.md` documents **260/260** (0 drift) · `build` 0 — this increment
> shipped the RESEARCH P4 scope: **M6 caching** (`src/proxy.ts` sets `public, max-age=60, s-maxage=60,
stale-while-revalidate=300` for anonymous GET/HEAD on allow-listed discovery paths; session/auth responses
> keep `private, no-store`; `Vary: Cookie` limitation documented in RESEARCH M6/O4), **M7 admin sub-routes**
> (`/admin/[section]`, 14 role-gated sections, legacy `?tab=` 308-redirects, `noindex`, no-access card), and
> **M8 tests** (kit component suites + a **Playwright E2E suite: 15 tests / 7 spec files** wired into
> `.github/workflows/ci.yml` after the seed step). It also includes the **approved Next.js 15.5.26 → 16.3.6
> upgrade** (`middleware.ts` → `src/proxy.ts`, Turbopack build, vendored React `19.3.0-canary-cbb046ab-20260731`
> which contains the facebook/react#35839 fix for the dropped-navigation bug the E2E caught — vercel/next.js#83386;
> Turbopack prints 12 advisory warnings: Prisma CJS `export *` + dynamic `process.cwd()` fs tracing, build exit 0)
> and a Prisma dual-instance fix (`prisma-errors.ts` structural fallback so P2002 → 409 again, +4 tests).
> `.prettierignore` now excludes the generated `next-env.d.ts`. Live gates after rebuild: `probe-3002.ps1`
> **119/119** + `p1-verify.ps1` **27/27** + `p2-gates.ps1` **G1–G10 ALL PASS** + `npm run test:e2e`
> **15/15 (7 files)** — all against the Next 16.3.6 production build on port 3002.
>
> **Previous snapshot (2026-09-26, P3 discovery upgrade)** — `npm run validate` **exit 0**, comprising:
> `typecheck` 0 · `lint` 0 · `format:check` 0 · `test` **333 passed, 0 skipped** (30 files) · `check` → **259 module
> routes (core 56, platform 137, participants 66), 0 duplicates**, `docs/API.md` documents **260/260** (0 drift) ·
> `build` 0 — this increment shipped the RESEARCH P3 fixes: the **map** gained bundled OSM/ODbL wilaya outlines
> (H5, attributed, unlabeled backdrop), fixed-frame projection with zoom/pan and **search this area** (new
> `bounds` discover filter, documented in `docs/API.md`); the landing keeps **one** discovery rail (M2); signed-in
> small screens get the fixed **bottom tab bar** with the core four (M3) and `/opportunities` gained the
> **filter tray + active-filter chips** (NN/g). Live probes after rebuild: **107/107** (`probe-3002`, 16 new P3
> assertions) + **27/27** P1 suite + `p2-gates.ps1` **G1–G10 ALL PASS**.
>
> **Previous snapshot (2026-09-25, P1 flow payoffs)** — `npm run validate` **exit 0**, comprising:
> `typecheck` 0 · `lint` 0 · `format:check` 0 · `test` **333 passed, 0 skipped** (30 files) · `check` → **259 module
> routes (core 56, platform 137, participants 66), 0 duplicates**, `docs/API.md` documents **260/260** (0 drift) ·
> `build` 0 — this increment shipped the RESEARCH P1 fixes: certificate **PDF + verify links** on profile and
> workspace certificate rows (H1); a profile **skillset manager** for skills/languages/interests (reads via
> `GET /me/profile`, writes via the existing `POST /me/*`) plus a new **`GET /me/activities`** experience timeline
> (H2); route-level `app/[locale]/loading.tsx` built on the kit `Skeleton` (M1); kit `aria-describedby` wiring and
> `useFocusFirstError` (focus → first invalid control, DESIGN §8) on login/register/reset/2FA (M4 — a real-browser
> confirmation pass stays open for P4, none is available in this environment). Documented in `docs/API.md`
> (new `/me/activities` entry + `/me/profile` skillset note) and `docs/RESEARCH.md` (findings stamped). Live probes
> after rebuild: **91/91** (`probe-3002`) regression + a new **27/27** P1 suite (`p1-verify.ps1`: PDF magic bytes,
> profile/workspace PDF+verify links, skillset arrays, activities timeline, skills add/remove roundtrip, validation
> error envelope).
>
> **Previous snapshot (2026-09-25, UX/UI research + P0 fixes)** — `npm run validate` **exit 0**, comprising:
> `typecheck` 0 · `lint` 0 · `format:check` 0 · `test` **333 passed, 0 skipped** (30 files) · `check` → **258 module
> routes (core 56, platform 137, participants 65), 0 duplicates**, `docs/API.md` documents **259/259** (0 drift) ·
> `build` 0. Shipped in this increment: the product/UX audit (`docs/RESEARCH.md`) plus its P0 fixes — landing impact
> figures now carry the seeded-demo provenance label (`landing.statsNote`), the skip link's accessible name is
> `common.skipToContent` (was the mis-scoped `backHome`), dark-mode deferral + the metric-provenance rule are
> recorded in `docs/DESIGN.md` §10, and the stale counts in this file were refreshed (RESEARCH H7). Live probes
> after rebuild: **91/91** (`probe-3002`) + visible-HTML assertions for the stats caption and skip link in
> `ar`/`fr`/`en`.
>
> **Previous snapshot (2026-09-24, core-loop fixes)** — `npm run validate` **exit 0**, comprising:
> `typecheck` 0 · `lint` 0 · `format:check` 0 · `test` **317 passed, 0 skipped** (29 files — incl. the new
> `server/campaign-funding.test.ts`: contribution transition machine, create/decision schemas, CASH|IN_KIND
> sponsorship refines, `campaignId` discover filter, 4 registered routes) · `check` → **248 module routes
> (core 47, platform 136, participants 65), 0 duplicates**, `docs/API.md` documents **249/249** (0 drift) ·
> `build` 0 — migration **`0008_campaign_funding` applied** (additive: `CampaignContribution` +
> `ContributionStatus`, `SponsorshipKind` + `Sponsorship.description`) — then live probes against
> `next start`: **52/52 anonymous + 30/30 authenticated + 88/88 INTERNATIONAL + 64/64 funding/core-loop**
> (the funding suite runs with a fresh RFC 6238 code from `scripts/totp-code.ts`, a dev-only helper, so the
> org session is genuinely TOTP-satisfied): `GET /campaigns/:id` funding aggregates with no donor PII,
> `?campaignId=` discovery filter + related-opportunities, contribution create → validation `400` →
> duplicate `409` → donor cancel `200`/`404` → masked-donor ledger → REJECT-without-reason `400` →
> CONFIRM/REJECT `200` → second decision `422` → cancel-after-decision `422` → `confirmedAmount` updated →
> opportunity linked via `PATCH …/campaignId` and returned by the public filter → campaign page rendering
> the funding section, contribute form, honest bank-transfer sentence and related opportunities.
>
> **Previous snapshot (2026-09-24, BLADNA INTERNATIONAL extension)** — `npm run validate` **exit 0**, comprising:
> `typecheck` 0 · `lint` 0 · `format:check` 0 · `test` **303 passed, 0 skipped** (28 files — incl. the new
> `server/international.test.ts` eligibility/transition matrix and `private-noindex` grown to **53 assertions**
> over every classified page) · `check` → **244 module routes (core 47, platform 132, participants 65), 0
> duplicates**, `docs/API.md` documents **245/245** (0 drift) · `build` 0 — then live probes against
> `next start`: **52/52 anonymous + 30/30 authenticated + 88/88 INTERNATIONAL** (countries/providers/category
> filter, seeded offers in VERIFIED/UNDER_REVIEW/PENDING states, eligibility engine, application lifecycle
> create → 409 duplicate → withdraw → 422 double-withdraw, passport PATCH/GET, recommendations with
> preference reasons, self-declared experiences, signed-in pages 200 + `noindex`, anonymous walls 307/401,
> robots/sitemap pins incl. 48 sitemap URLs).
>
> **Previous snapshot (2026-09-24, CRUD UI gap-fill)** — `npm run validate` **exit 0**, comprising:
> `typecheck` 0 · `lint` 0 · `format:check` 0 · `test` **254 passed, 0 skipped** (27 files — incl. the
> extended `private-noindex` source scan: 28 private + 17 public + 1 exhaustiveness assertion that every
> `page.tsx` on disk is classified, and the 14-section `admin-access` matrix) · `check` → **227 module
> routes (core 47, platform 115, participants 65) + inline `/meta` = 228 registered, 0 duplicates, and
> `docs/API.md` documents 228/228 (0 drift)** · `build` 0 (54 app routes) — then live probes against
> `next start`: **52/52 anonymous** (public 200s, detail 404s, private 307s, robots disallows, the
> `?slug` directory filter, guarded endpoints 401/405) and **30/30 authenticated** (signed-in pages 200 +
> `noindex`, nav links, RTL/LTR, public details stay indexable).
>
> **This machine has no Docker, no `psql`, no `git` binary, and no connected browser for this pass**
> (visual/Lighthouse checks weren't executable — status codes and rendered HTML were verified over HTTP
> instead). Anything requiring a live database, a container build or a repository commit is marked
> `[~]`/`[ ]` below and is listed under “Cannot be validated in this environment”.

## Phase 1 — Foundation

- [x] Repository inspection & architecture report (`docs/ARCHITECTURE.md`)
- [x] Monorepo scaffold (npm workspaces, TS strict, ESLint, Vitest)
- [x] Prisma schema (all core entities, §8 + supporting) + initial migration (`0001_init`)
- [x] Hand-written constraints migration (CHECKs, partial unique index for applications) — `0002_constraints`
- [x] Hand-written `Message(attachmentId)` index migration — `0005_message_attachment`
- [x] Environment configuration (`.env.example`, typed env module) — **root `.env` auto-load fixed**: `next dev|build|start` now reads the repo-root `.env` from `next.config.ts` via `process.loadEnvFile` (missing file = no-op, real environment variables win — same semantics as `node --env-file`, empirically verified); before the fix `next start` ran with cwd=`apps/web` and never saw `AUTH_SECRET`/`DATABASE_URL` (root-caused from server logs during the spoofed-cookie probe: `Missing required environment variable: AUTH_SECRET` → 500 on any cookie-bearing request); **CLI + seed paths closed too** — `packages/database/prisma.config.ts` walks up to load the same root `.env` before the Prisma CLI resolves the datasource (README `db:migrate:deploy` went from P1012 "Environment variable not found" to reaching the database — P1000 auth-refused here, no usable local role; `db:generate` and `schema:validate` remain exit 0) and `db:seed` reads it via `tsx --env-file-if-exists=../../.env` (reaches the database under `SEED_DEMO=true`, auth-refused before any write) — **live-probed end to end**: 16/16 probes against `next start` (spoofed-cookie private pages **500 → 307 login**, sessionless 307 with `?next=`, `/auth/me` 401 JSON both ways, `/health` honest 503, `/` → `/ar`, login/robots/sitemap 200, security headers on all)
- [~] Docker (`Dockerfile`, `docker-compose.yml`: **app/db/redis** — redis behind the `optional` profile; health checks (compose description previously claimed "web/postgres/redis/minio/worker", which never matched the file — no minio, no worker, service is `app`); **new `.dockerignore`** excluding `.env*`/`node_modules`/`.next`/`var` from the build context — closes a real secret-leak path: the previous `COPY . .` carried the local `.env` into builder **and** runner images, and the Dockerfile's own comment admitted no `.dockerignore` existed; comment updated, `find node_modules` kept as belt-and-braces) — files written, **not build-tested (no Docker here)**
- [x] Authentication: register, email verification, login, refresh rotation, logout, password reset, sessions list, TOTP 2FA (privileged roles)
- [x] RBAC permission matrix + server-side guards + authorization tests
- [x] Localization ar/fr/en + RTL layout
- [x] Design system (`packages/ui`)
- [~] Seed script (`packages/database/src/seed.ts`) — demo-guarded, idempotent, typecheck/lint clean; **never executed (no database here)**
- [x] Health endpoint — **`GET /api/v1/health`** (not `/api/health`)

## Phase 2 — Volunteer Core

- [x] Volunteer profile (CRUD, unique volunteer ID `BLD-ALG-000001`, configurable format) — privacy `PATCH /me/privacy` stores **all six keys** (migration `0006_volunteer_privacy`; column defaults preserve pre-migration behavior): `showWilaya=false` removes wilaya **and** city from `GET /volunteers` items and excludes the profile from `?wilayaId` results entirely, `showHours=false` returns `hours: null` on the volunteer branch of `GET /public/verify` (the page hides the row; the aggregate is never queried), `showCertificates` is stored/returned but has no public listing surface (certificate reads stay credential-keyed verification by design); the settings UI ships 5 enforced toggles — a sixth would be a control with no controlled thing
- [x] Skills / languages / interests (normalized tables, verification levels)
- [x] Volunteer ID + public verification token
- [x] Opportunity discovery: server-side filters, pagination, full-text search (Postgres `tsvector` + GIN index from migration `0002`, plus indexed `contains` fallback)
- [x] Application system (state machine, duplicate guard, answers)
- [x] Saved opportunities
- [~] Personal activity aggregation — real endpoint is **`GET /api/v1/me/stats`**; the previously claimed `/volunteers/me/dashboard` **does not exist**

## Phase 3 — Organization Core

- [x] Organization CRUD + slug + tenant-scoped members (invite/accept/roles)
- [x] Organization self-registration — `POST /organizations`: verified email + shared §54 consent bar, creator seated as `OWNER` in the same transaction, enters `PENDING_VERIFICATION`/`PENDING`, `PrivacyConsent` ledger, slug race → 409, audited `organization.create`
- [x] Organization verification (append-only levels, officer decide, evidence field-check assist) — evidence chain unblocked: uploads pass the validation gate → stored → row lands `AVAILABLE` **with** `organizationId`, so `POST /orgs/:orgId/verifications` can qualify; officers/recipients fetch bytes through row-authorized `GET /files`; the officer review UI ships in `/admin` (verification tab: queue, evidence documents with authorized download links, decide form)
- [x] Opportunity management (draft → pending review → publish, benefits, requirements, questions)
- [x] Application pipeline (status transitions, bulk-safe server validation)
- [x] Attendance sessions + QR check-in (short-lived hashed tokens)

## Phase 4 — Verified Experience

- [x] Volunteer hours (PENDING → VERIFIED / REVOKED with superseding records + audit)
- [x] Certificates (deterministic numbers, random verification token, issue/revoke, public verify page)
- [x] Certificate PDF service — `GET /certificates/:certificateId/pdf`: pdfkit renders with a vendored OFL Amiri font (`apps/web/assets/fonts/` + `OFL-Amiri.txt`; Latin **and** Arabic glyph coverage unit-tested — fontkit's ArabicShaper shapes ar documents), QR → the public verification page, `?locale=ar|fr|en` (default ar), **exactly the metadata route's exposure (no contact data)**, ar/fr/en renders asserted as real `%PDF` output
- [x] Volunteer card — `POST /me/card` (one per profile → 409; unique `BLD-CARD-XXXXXXXX` re-roll retries; QR token **is** the profile's public verification token → resolves against today's `GET /public/verify`; verification level mirrored at issue; audited `volunteer_card.issue`), `GET /me/card` (+ QR data URL), `GET /me/card/pdf` — note: the `VolunteerCard` model always existed; the endpoints did not
- [x] Achievements (factual thresholds)
- [x] Volunteer CV — `GET /me/cv` delivers the aggregate JSON export (profile, contact, skills/languages/interests, verified-hour totals, certificates/achievements/experiences), and **`GET /me/cv/pdf` renders the same shared aggregate** (`buildCv` is the single source for both) as a localized A4 PDF: identity header (name, volunteer ID, verification level, location, contact), summary, availability, skills (+ years), languages (+ level), interests, verified-hour total, certificates with number/hours/date and non-VALID status lines, achievements, international experiences; `?locale=ar|fr|en` (default ar), sparse sections omitted rather than rendered empty

## Phase 5 — Campaigns & Impact

- [x] Campaigns + participants + hierarchy (campaign → opportunities → attendance → hours)
- [x] Impact metrics (typed, sourced, `verified` flag only with source)
- [~] Impact report service — aggregation + **JSON/CSV export work**; `format=pdf` returns an explicit `NOT_IMPLEMENTED` error (never a stub)

## Phase 6 — Sponsors / CSR

- [x] Sponsor + members + CSR programs + sponsorships (money never touches volunteer verification — enforced)
- [x] Sponsor self-registration — `POST /sponsors`: verified email + consents, lands `PENDING` (only the platform activates), registrant seated as `SPONSOR_ADMIN`, audited `sponsor.create`
- [x] Sponsor/CSR dashboards reading real aggregates

## Phase 7 — International

- [x] InternationalOpportunity entity + source attribution (`OFFICIAL | VERIFIED_PARTNER | EXTERNAL`) + disclaimers (ar/fr/en)
- [x] International experience section on volunteer timeline

## Phase 8 — Trust

- [x] Reports/moderation queue + statuses
- [x] Risk engine v1 (deterministic scoring, reasons, recommended action, human decision required); `PAYMENT`-type signals and payment suspension return explicit `NOT_IMPLEMENTED`
- [x] Audit log on every sensitive operation + admin action records
- [ ] Safety center page + legal/policy placeholders — **no page exists** (`docs/SECURITY.md` only)

## Phase 9 — AI

- [~] `server/infra/ai.ts` adapter (`AI_PROVIDER`: local/openai/anthropic/gemini, GDPR `AI_SEND_DOCUMENTS` gate, honest `CONFIG_ERROR`/`NOT_IMPLEMENTED`) — **wired**: `checkDocument` is imported by `modules/verification.ts` (`POST /admin/verifications/:id/check`); no classification/moderation/risk providers
- [x] AI-assisted document verification wired into an endpoint — officer-read fields vs the org record, deterministic local rules, audited `organization.verification_document_check`; honest limits: no OCR (a human reads the bytes), cloud document reading answers `NOT_IMPLEMENTED`
- [ ] AI ranking improvements / embedding-based similarity (needs provider credentials)

## Phase 10 — Mobile

- [~] Mobile-ready API: versioned endpoints, compact payloads, `GET /me/stats` aggregate, no HTML in API
- [ ] Flutter/React Native app binary (out of scope for this milestone — API contract documented in `docs/API.md`)

## Phase 11 — Production Hardening

- [x] Unit/authorization/state-machine/validation tests (Vitest) — **170 passing + 3 DB-gated skipped**, 22 files (first `apps/web` suites: upload gate + local field checker; registration consent-bar schema tests; PDF renderer suites — bundled-font resolution, Latin+Arabic glyph coverage, ar/fr/en certificate/card/CV renders as real `%PDF` incl. a sparse-profile CV; security-header suites — nonce CSP, API lockdown policy, full header set; message-DESC merge/ordering helpers behind the Messages UI; `admin-access.test.ts` section-grant cases asserted against the real RBAC matrix; `billing-utils` plan-action cases; `packages/validation/src/admin.test.ts` schema cases; `private-noindex.test.ts` source scan pinning `noindex` on all 10 private/transient pages and its absence on the 10 public ones — 20 assertions; **plus this increment's server-layer suites**: `router.test.ts` (path matching + dispatch 404/405/root/trailing-slash + describe registry), `http.test.ts` (request-context build, body/query/path parsing, response envelopes, error sanitization, the **`assertSameOrigin` CSRF matrix — a well-formed foreign-origin POST now gets `FORBIDDEN` where the old self-allowlisting check passed it through**, and the full `apiHandler` pipeline incl. rate-limit tier + origin-check ordering), `guards.test.ts` (resolveOrgId, verified-email gate, MFA-protected roles), `page-session.test.ts` (login/MFA redirects, non-session rethrow — first `vi.mock` usage in the repo), and `sitemap.test.ts` (fs-pins all 13 static paths × 3 locales = 39 URLs to real `page.tsx` files); plus `tests/db/database.test.ts`: 3 read-only integration cases — migration folders applied/finished/not-rolled-back, migration `0006`'s three NOT NULL DEFAULT true columns, schema↔database table coverage both ways — behind a one-shot connectivity probe + `describe.skipIf`, **now executing locally — 3/3 pass against the live database (brought online this session: roles created, 6/6 migrations applied, seed executed), 228 passed / 0 skipped total**, and CI is wired to run them too against a postgres:16 service + `db:migrate:deploy` step (workflow never executed — no git))
- [x] Live integration tests — **written** as `tests/db/database.test.ts` (strictly read-only: migration state, migration `0006`'s column contract, schema↔database table coverage both directions; one-shot connectivity probe → `describe.skipIf`) — **executed locally and passing 3/3** since the database was brought online this session (roles `bladna_app`/`bladna_migrator` created, `bladna` database + `public` schema ownership fixed, all 6 migrations applied, seed run; the suite itself caught 2 leftover `rolled_back` migration rows from failed attempts before cleanup — proving the assertions work); CI's postgres service + migrate step remains unexecuted (no git)
- [x] Playwright E2E — **shipped in P4 (2026-09-26)**: `playwright.config.ts` (`channel: 'chrome'`,
      `reuseExistingServer` against port 3002, `globalSetup` waits out the `/auth/login` rate-limit bucket) + **15 tests / 7 spec files** in `tests/e2e/` (`admin`, `discovery-ui`, `login`, `org-review`,
      `security-headers`, `verify`, `volunteer-apply`), wired into CI after the seed step
      (`npm run test:e2e`); latest run **15/15** on the Next 16.3.6 production build
- [x] Rate limiting, input validation, secure cookies — present; `ALLOWED_UPLOAD_TYPES` **enforced** at the upload boundary (magic-byte/extension gate + size cap, unit-tested); **site-wide security headers live in `src/proxy.ts`** — per-request nonce CSP on documents (`strict-dynamic`, no `unsafe-inline` scripts, `frame-ancestors 'none'`), `default-src 'none'` policy on API responses, HSTS `max-age=31536000; includeSubDomains`, `nosniff`, `X-Frame-Options: DENY`, referrer + permissions policies — **verified live**: header probes against `next start` (page/redirect/API/robots) and the rendered HTML where 17/17 executable scripts carry the response nonce (the 18th tag is the app's own non-executable `application/json` data block); `GET /files` keeps its stricter `sandbox` CSP (overlapping policies only intersect tighter)
- [~] CI config (`.github/workflows/ci.yml`: **postgres:16 service (health-gated)** → install → `db:generate` → typecheck → lint → format check → route/doc drift check → Prisma schema validation → **`db:migrate:deploy` against the service** → test (DB-gated suite runs for real there) → build → **docker image build**) — steps written and each command verified locally where possible; **the workflow itself never executed (no git/GitHub here), docker build untestable (no Docker), and the service + migrate steps stay unproven until CI first runs**
- [x] Backup/restore documentation — **`docs/OPERATIONS.md`** §3–§4 (pg_dump custom-format dumps for compose + bare metal, upload-dir tar/`compose cp`, config stored separately, restore = stop writers → dropdb/createdb/pg_restore → uploads → `db:migrate:deploy` → health 200, forward-only-migrations rollback note, post-restore verification incl. certificate re-verification)
- [x] Deployment documentation — **`docs/OPERATIONS.md`** §1–§2 (compose + bare-metal paths, env/secret requirements, explicit migration step, health/header post-deploy probes, `npm run validate` gate) + README

## Phase 12 — CRUD UI gap-fill (2026-09-24)

Every API surface that shipped without a UI now has one. Server modules were touched only twice,
both additive (`?slug` on `GET /organizations`; `checkInUrl` in the attendance QR responses).

- [x] Volunteer self-service — `/applications` (filter + pagination + withdraw gated by
      `APPLICATION_TRANSITIONS`), `/notifications` (unread filter, mark-read incl. read-all),
      `/invitations/accept?token=` (token preserved through the login/MFA bounce), `/profile`
      (stats, hours, certificates → public verify links, achievements, card issue + PDF, CV PDF,
      data-rights EXPORT/DEACTIVATE/DELETE behind explicit confirms)
- [x] QR check-in end-to-end — `/check-in?token=` landing page (private; token survives the
      login bounce); the session QR now **encodes the public landing URL** instead of opaque token
      text (the locale prefixer in `src/proxy.ts` runs on scan), both QR responses carry `checkInUrl`, and the
      attendance session panel gained a copy-link button (additive change in `modules/attendance.ts`)
- [x] Public detail pages — `/organizations/[slug]` (via the new `?slug` filter on
      `GET /organizations`, ACTIVE-only), `/campaigns/[id]` (join/leave + participant list),
      `/international/[id]` (experience submit + list) — indexable, true 404s
- [x] Organization workspace — `/workspace` picker + `/workspace/[orgId]` shell (layout-level
      membership guard, `robots` noindex) with 10 tabs: overview analytics, opportunities
      CRUD + state-machine transitions (REJECT reason), campaigns CRUD + transitions +
      participants, applications status/bulk actions, members + invitations + role changes,
      attendance sessions/QR/manual/confirm, hours verify/revoke, certificates issue/revoke,
      documents upload/delete, verification submit, settings edit
- [x] Sponsor workspace — `/sponsor`: self-register (caller seated as `SPONSOR_ADMIN`),
      overview counts, profile edit, sponsorships create/transition, CSR programs, members —
      server-computed transition buttons, admin controls behind a real `sponsor.manage` probe
- [x] Admin console — **fourteen sections**: new `exports` (`POST /admin/exports`, CSV/JSON
      blob download with the server's real count/truncation) and `billing` (payments/invoices/
      subscriptions lists + payment status actions gated on `payment.manage`)
- [x] Index-policy + navigation pins — `private-noindex.test.ts` extended to **46 assertions**
      (28 private + 17 public + 1 exhaustiveness check over every `page.tsx` on disk);
      `robots.ts` disallows `/*/applications`, `/*/notifications`, `/*/invitations`, `/*/profile`,
      `/*/workspace`, `/*/sponsor`, `/*/check-in`; signed-in chrome nav and dashboard quick links
      gained applications / notifications / workspace / check-in
- [x] Soft-404 fix — removed `campaigns`/`organizations`/`international` `loading.tsx`: the
      parent-segment skeleton streamed a 200 shell before `notFound()` could set the status (known
      Next.js streaming limitation); detail 404s verified live
- [x] Live probe suites — **52/52 anonymous + 30/30 authenticated** (scripts kept outside the
      repo; login uses the seeded volunteer, cookies attached per-request because the .NET probe
      jar refuses `Secure` cookies over `http://localhost`)

## Core-loop fixes (2026-09-24)

Closes the loop campaign creation → organization visibility → volunteer discovery →
sponsorship/funding. Additive only: migration `0008_campaign_funding` (no drops, no resets).

- [x] Opportunity ↔ campaign link — `workspace-opportunities.tsx` gained a campaign `<select>`
      (client-fetched `GET /orgs/:orgId/campaigns?limit=100`, server cross-checks the campaign
      belongs to the org) plus structured requirements (≤15), benefits (≤10) and application
      questions (≤10, CHOICE options entered one per line with an `optionsHint`); an unchanged
      `questions` array is omitted from the PATCH body (`questionsSnapshot` compare) so the
      server's guard fires only on a real edit
- [x] Discovery linkage — `GET /opportunities` accepts a UUID-validated `campaignId` filter
      (`buildDiscoverWhere`, documented in `docs/API.md`); the `/opportunities` page exposes it
      as a search param with full parity with `organizationId` (UUID check, `pageHref`,
      `hasFilters`, hidden input, invoke query); campaign detail renders related published
      opportunities (limit 6, degrade-to-empty, honest `campaigns.noRelatedOpportunities` empty
      state) plus a view-all deep link → `/opportunities?campaignId=…`
- [x] In-kind sponsorship — additive `SponsorshipKind { CASH, IN_KIND }` enum and
      `Sponsorship.description` column; CASH requires `amount > 0`, IN_KIND requires a non-empty
      `description` (amount = estimated value, may be 0); sponsor console kind selector +
      description textarea (`inKindHint`) and kind/description displayed on each row
- [x] Campaign funding — additive `CampaignContribution` table + `ContributionStatus` enum; 4 new
      routes (create / cancel / org ledger / org decide) behind `CONTRIBUTION_TRANSITIONS`
      (PENDING → CONFIRMED | REJECTED, both terminal, REJECT requires a reason, `422` on invalid
      transitions), unique `[campaignId, reference]` → `409`, donor may cancel only their own
      still-`PENDING` row; `GET /campaigns/:id` returns a `funding` aggregates block
      (confirmed/pending amount + count, budget, currency — **no donor PII, no invented totals**);
      UI: new `campaign-contribute.tsx` island (login bounce on 401/`MFA_REQUIRED`, submit/cancel),
      campaign-page funding section with the honest bank-transfer sentence (platform records the
      pledge; no gateway claimed), and a `CampaignContributions` panel on the workspace campaigns
      tab (masked donors, per-row reason input, Confirm/Reject, `router.refresh()` on decision)
- [x] Validation + docs + tests — contribution create/decision schemas, sponsorship
      CASH/IN_KIND refines and the `campaignId` filter live in `packages/validation`; 14 DB-free
      tests in `server/campaign-funding.test.ts`; every new i18n key added to `types.ts` +
      `ar`/`fr`/`en` (type-checked contract, incl. `campaigns.noRelatedOpportunities`); all 4 new
      endpoints + the `funding` block + sponsorship `kind`/`description` + the `campaignId` filter
      documented in `docs/API.md` (249/249 at the time; 264/264 today — latest snapshot at the top)

**Honest (unit-tested, not live-probed):** sponsorship `IN_KIND` — the seed has no sponsor demo
account, so no sponsor-session HTTP probe exists. **No donor history endpoint:** a donor cancels
with the id returned by `create` (there is no `GET /me/contributions`). **No admin contributions
UI/endpoints** — the ledger is org-only by design, documented in `docs/API.md`.

## P2 — Design-system consolidation (2026-09-26)

Closes RESEARCH H3 + H6 and §5.3 / §5.4 / §5.7. Additive: kit gained button
sizes ≥44px, `buttonClasses`, `Alert tone`, `Avatar`, generic
`Tabs`/`TabPanel`, `Card as=`, and the canonical `ui/status.tsx` badge.

- [x] Kit-first controls — link-CTAs use `buttonClasses` (28), raw action
      buttons use kit `Button`; 31 raw `<button>` remain by design (inline
      text actions, list-row selectors, toggle chips, nav triggers — none
      with brand backgrounds); `bg-brand-700` outside `packages/ui` = **0**
      (G1); org logo/initials tiles use kit `Avatar`
- [x] One status → one badge — `ui/status.tsx` is the single status→tone map;
      17 badge sites converted to `StatusBadge` (48 usages), page-local
      `*_TONE` maps deleted = **0** (G2); `StatusBadge` always renders the
      localized label and forwards `data-testid` for Playwright
- [x] Alerts / empties → kit — 86 raw message boxes → `<Alert tone>` (every
      original `role` preserved), 14 dashed placeholders → `<EmptyState>`;
      raw message pattern = **0** with 4 documented layout-wrapper skips
      (G3), dashed empties = **0** (G4), compact colored boxes = **0** (G10)
- [x] Cards → kit — 89 card shells → `<Card>` (125 total, layout padding kept,
      `shadow-sm` added); `as` preserves semantics where the tag matters
      (li ×4, named section ×2, article ×1); 23 documented skips stay on
      their original `ul`/`form`/`<Link>`/`aside`/`p`/menu elements
- [x] Touch targets (H3) — 118 boxed-action sites across 33 files plus
      step/row controls normalized, hamburger/nav/section tabs/consent label
      to `min-h-11`, 40 raw inputs to the `h-10` floor, landing step badge
      `size-9`→`size-10`; gates G6/G7/G8 = **0**
- [x] Tabs a11y — kit `Tabs`/`TabPanel` (roving tabindex, Arrow/Home/End,
      labelled panels) in 5 tab bars: admin console/content/international,
      risk moderation, initiative console (new `initiativeConsole.tabsLabel`
      key in en/fr/ar); raw `role="tab"` in app source = **0**
- [x] Forms (§5.7) — required = red ` *` on labels, optional =
      `({dict.common.optional})` label suffix (16 marker fixes + 3 hint-slot
      misuses corrected; grep `hint={dict.common.optional}` = 0, G5);
      password-requirements hint present in register/reset/settings;
      `useFocusFirstError` in **29 files** + `aria-invalid` on the 4
      raw-input workspace forms
- [x] P2 grep gates — `p2-gates.ps1` G1–G10 **ALL PASS**; tallies:
      StatusBadge 48, Alert 127, EmptyState 49, Card 125 (`as=` 7),
      Avatar 4, kit `Tabs` 5
- [x] Real-browser verification of touch/focus/tabs — **done in P4
      (2026-09-26)**: Playwright on real Chrome asserts focus-to-first-invalid
      (`login.spec.ts`), confirm-dialog gating (`org-review.spec.ts`) and
      the tab/deep-link flows (`admin.spec.ts`)

**Gates (2026-09-26):** `prettier` → `typecheck` → `lint` → 333 tests → one
`npm run validate` **exit 0** → probes **91/91** + **27/27** → P2 gates
**ALL PASS**.

## P3 — Discovery upgrade (2026-09-26)

Closes RESEARCH H5 + M2 + M3 and the §5 filter-tray/discovery items
(NN/g S11/S12). Additive: discover `bounds` filter (documented in
`docs/API.md`), vendored geo source + generator (`npm run build:map-geo`),
`ui/map/algeria-geo.ts`, `bottom-nav.tsx`, `filter-tray.tsx`, 7 i18n keys
(`opportunity.zoomIn/zoomOut/resetView/searchThisArea/resultsInView`,
`nav.tabBar`, `opportunity.removeFilter`) kept in sync across en/fr/ar.

- [x] Map base geography (H5) — bundled OSM wilaya outlines via GeoAlgeria
      (`scripts/geo/wilaya-boundaries.geojson`, ODbL-1.0, byte-identical
      upstream copy excluded via `.prettierignore`) → `npm run build:map-geo`
      generates `apps/web/src/ui/map/algeria-geo.ts` (69 rings, 2963 vertices,
      Douglas-Peucker 0.02°, header records provenance/vintage/ODbL). SVG
      outline layer under the pins; unlabeled backdrop (69-wilaya 2026 vintage
      vs the app's 58-wilaya table); `© OpenStreetMap contributors` attribution
      linked bottom-right; CSP untouched (no external request)
- [x] Map interaction (H5) — fixed Algeria-bbox frame with shape-preserving
      fit (the old results-bbox corner scaling is gone), zoom 1–8 + drag pan +
      arrow-key pan (kit controls, ≥44px), pins re-projected per view,
      non-scaling strokes; side list + graticule kept for probe/keyboard
      parity; empty view → `opportunity.noResults`
- [x] Search this area (H5) — `bounds=minLng,minLat,maxLng,maxLat` on
      `GET /api/v1/opportunities` (zod transform + WGS84/min≤max refine →
      400 on garbage), `buildDiscoverWhere` matches own point **or** the
      city-fallback coordinates (same resolution `mode=map` renders), reset
      restores the unfiltered fetch; `docs/API.md` updated
- [x] Landing rail dedupe (M2) — one "latest" rail; the two needs rails and
      their duplicate `discover` fetches removed (chips + view-all keep the
      filtered views)
- [x] Bottom tab bar (M3) — `bottom-nav.tsx` fixed bar, signed-in only,
      `lg:hidden`, ≥44px, wraps never truncates, `env(safe-area-inset-bottom)`,
      `aria-current` + `nav.tabBar`; core four defined once in
      `chrome.tsx#coreNavLinks` (header + bar share it); layout reserves
      `pb-24 lg:pb-0`; hamburger keeps the long tail
- [x] Mobile filter tray — native `<details>` tray around the existing GET
      form (open in SSR = no-JS intact; collapsed below `lg` after hydration
      with a media-query listener that re-opens at `lg`), "Filters (n)"
      trigger, active-filter chips beside the results (each chip drops exactly
      its own filter; org/campaign scopes survive)
- [x] Real-browser verification (tray collapse, RTL, pinch-zoom) — **done in
      P4 (2026-09-26)**: `discovery-ui.spec.ts` asserts the tray collapses/
      submits on touch, the Arabic locale renders `rtl`, and the viewport meta
      never blocks pinch zoom; touch pan/zoom gestures themselves stay out of
      scope (no touch driver)

**Gates (2026-09-26):** `prettier` → `typecheck` → `lint` → 333 tests → one
`npm run validate` **exit 0** → probes **107/107** + **27/27** → P2 gates
**ALL PASS**.

## P4 — Quality & scale (2026-09-26)

Closes RESEARCH M6 + M7 + M8 + the M4 real-browser pass, plus the approved
**Next.js 15.5.26 → 16.3.6 upgrade** (`middleware.ts` → `src/proxy.ts`
convention, Turbopack build — vendored React `19.3.0-canary-cbb046ab-20260731`
contains the facebook/react#35839 fix for the dropped-navigation bug the new
E2E run caught, tracking vercel/next.js#83386).

- [x] M6 caching — `src/proxy.ts#applyPageCachePolicy`: anonymous GET/HEAD on
      allow-listed discovery paths (`/`, `/map`, `/safety`, `/terms`,
      `/privacy`, `/opportunities*`, `/organizations*`, `/campaigns*`,
      `/verify*`) gets `public, max-age=60, s-maxage=60,
stale-while-revalidate=300`; session-bearing, auth-excluded and non-GET
      responses keep Next's byte-identical `private, no-cache, no-store…`
      default; API untouched. `Vary: Cookie` cannot be delivered (App Router
      overwrites `Vary` — verified 15.5.26, re-verified 16.3.6), so safety
      rests on the gating; residual documented in RESEARCH M6/O4 + the proxy
      header comment. Probe asserts the split both ways
- [x] M7 admin sub-routes — `/admin` → first granted section, every section
      at `/admin/[section]` (14 sections, `adminSectionsFor` + `isAdminSection`
      server-side), legacy `?tab=` 308-redirects, ungranted sections render
      the no-access card, all `noindex`; E2E `admin.spec.ts` covers anonymous
      deep-link → sign-in `?next`, grants, canonicalization, `?tab=`,
      back-button
- [x] M8 component tests — kit suites bring Vitest to **375 tests / 35
      files** (jsdom + `@testing-library/react`), including the new
      `prisma-errors.test.ts` (4 cases pinning the Turbopack dual-instance
      structural fallback: P2002 → 409, not 500)
- [x] M8 browser layer — `playwright.config.ts` + `tests/e2e/` **15 tests /
      7 spec files** on `channel: 'chrome'`, `npm run test:e2e` in CI after
      the seed step; latest run **15/15** against the production build
- [x] Next 16 upgrade — `next@16.3.6`, `src/proxy.ts` (`export function
proxy`), docs/README version strings updated, `.prettierignore` += the
      generated `next-env.d.ts`; build is Turbopack with 12 advisory warnings
      (Prisma CJS `export *`, dynamic `process.cwd()` fs tracing in
      email/pdf/storage/prisma) — exit 0, documented in RESEARCH O2

**Gates (2026-09-26):** `prettier` → `typecheck` → `lint` → 375 tests → one
`npm run validate` **exit 0** (259 routes, API 260/260, Turbopack build) →
restart → probes **119/119** + **27/27** → P2 gates **ALL PASS** →
`npm run test:e2e` **15/15 (7 files)**.

## P5 — Matching, saved & volunteer directory (2026-09-30)

- [x] Recommendations (dormant engine wired) — `server/modules/matching.ts`:
      `GET /me/recommendations` ranks still-open published initiatives through
      `@bladna/domain`'s `matchOpportunity` against the signed-in volunteer's
      signals (skills/interests/languages/wilaya/availability/preferences +
      verified hours), floors at score ≥ 30 (`MATCH_STRIP_MIN_SCORE`), a
      200-candidate recency window, excludes already-applied initiatives;
      every item ships `match = { score, reasons: [{ code, weight, detail }] }`
      rendered as localized chips (all 8 engine codes labeled ar/fr/en);
      `LIST_SELECT` extracted to `server/opportunity-select.ts` as the
      circular-import breaker (`opportunities.ts` + `matching.ts` share it)
- [x] Matching surfaces — dashboard strip (`MatchingCard`, top 3, shows the
      guided empty state for thin profiles and hides only when the session
      has no volunteer profile at all), full `/recommendations` page (h2 rows + the "no black box" transparency note in **every** state), saved
      quicklink; both pages `noindex` (classified in `private-noindex.test.ts`)
- [x] First-publish fan-out — `announceMatching` at the three publish spots
      (transition / bulk / admin; only `target === 'PUBLISHED' && !publishedAt`)
      → `notifyMatchingVolunteers`: indexed OR terms (shared skill / same
      wilaya / shared interest → nobody on an empty OR), score ≥ 40, scan cap
      300, notify cap 50, verified hours via one `groupBy`,
      `NEW_MATCHING_OPPORTUNITY` `MATCH_NOTICE` ar/fr/en, fire-and-forget —
      logged failures never fail the transition
- [x] Save/favorites — `server/modules/saved.ts`: `GET /me/saved-opportunities`
      (paginated, `?opportunityId=` membership check = the save button's
      initial state), idempotent `POST`/`DELETE` pair → `{ saved: true|false }`
      (404 unknown/deleted, `deletedAt` guard, rows survive later status
      changes so the card can say "no longer open" instead of breaking the
      link), audited `opportunity.save`/`opportunity.unsave`; `/saved` page +
      `SaveButton` (optimistic toggle with rollback, `BookmarkIcon`,
      signed-in detail page only — anonymous visitors never see it)
- [x] Public volunteer directory — `/volunteers` over the existing public
      `GET /volunteers` (q/wilaya/skill/verifiedOnly plain GET form, verification
      badges, avatar initials, privacy-aware `Contact` row, privacy footnote),
      **indexable** on purpose + sitemap entry (18 static paths × 3 = 54
      URLs) + footer Explore link (`nav.volunteers`)
- [x] Contract + tests — 4 new endpoints documented (`docs/API.md` 264/264, 0
      drift), `savedListQuerySchema`/`recommendationQuerySchema` + 4 validation
      cases, **396 tests / 36 files** incl. `server/matching.test.ts` (signal
      builders, ranking stability on ties, strip floor vs empty profiles,
      route tables, localized reason codes) and the grown classification guard
      (34 private + 23 public + 1 exhaustiveness = 58)

**Gates (2026-09-30):** `prettier` → `typecheck` → `lint` → 396 tests → one
`npm run validate` **exit 0** ×2 (263 routes, API 264/264, Turbopack build) →
restart → probes **153/153** (34 new P5 checks) + P1 **27/27** → P2 gates
**ALL PASS** → `npm run test:e2e` **15/15 (7 files)**.

## P34 — Partnerships & CSR API + RBAC, M2 (2026-10-05)

Context: phase 2 of the five gated phases of
`docs/PARTNERSHIPS-CSR-DESIGN.md` — services, routes, RBAC
and state machines over the M1 substrate. Schema untouched
(M1 was complete), UI deferred to M5; matching recompute,
dashboards and notifications are M3/M4.

- [x] Domain — **11 transition maps** added to
      `state-machines.ts` (request, proposal, partnership,
      agreement, obligation, funding commitment,
      installment, disbursement, in-kind, evidence, impact
      report) with exhaustive table tests: every key
      mirrors its Prisma enum, every declared edge passes,
      every non-declared edge throws
      `BUSINESS_RULE_ERROR`.
- [x] RBAC — **14 new permissions**; `partner.match.read`
      in `ORG_BASE` (all org roles incl. VIEWER read their
      scorecards), STAFF +5 (request/proposal/evidence/CRM),
      MANAGER +6 (profile, partnership, agreement, funding,
      obligation, report); `impact.evidence.verify` and
      `partnership.moderate` stay officer/moderator-only —
      the two an org OWNER cannot hold — and the P34 test
      proves every new permission is granted to at least
      one role.
- [x] Validation — `partnerships.ts` (+`reasonRequired`
      superRefine: `REJECTED`/`WAIVED`/`BREACHED`/
      `CANCELLED`/`TERMINATED` demand a reason) with its
      own test file; `createOrgSupportOfferSchema` extends
      the existing offer schema with optional
      `organizationId`.
- [x] Access — `lib/partnership-access.ts`:
      `loadPartnership` + two-sided `requireScopedActor`
      (wrong-side member without the permission ⇒ 403
      naming it, outsider ⇒ 404) + `sideScopes`; obligations
      pin `party` to the caller's side (platform actors
      name it), funding is economic-only, verification is
      officer-only.
- [x] Routes — **43 new endpoints** in four modules:
      `economic.ts` 12 (profile GET/PATCH/activate,
      focus-areas replace, trilingual CSR focus-area
      vocabulary public + admin, three partner-match
      reads), `partnerships.ts` 16 (requests, versioned
      proposals, partnerships, obligations, numbered
      agreements), `funding.ts` 11 (commitments,
      installments, disbursements, in-kind), impact
      evidence 3, core `POST /support-offers` 1. Platform
      137→179, total 268→**311**.
- [x] Behaviour — proposal `ACCEPTED` provisions the
      partnership deterministically (opportunity anchor →
      economic-profile side → asker = initiative side),
      closes the request `APPROVED` and audits both events;
      one open partnership per initiative; `AGR-YYYY-######`
      from `Counter`; `ACTIVE` stamps signedAt; `COMMITTED`
      stamps committedAt; audit action = the design
      contract's uppercase event names on every transition.
- [x] i18n — the +11 `NotificationType` values shipped in
      M1 gained their labels in **all three locales**
      (ar/en/fr `notificationTypes`), closing the latent
      Prisma↔types drift.
- [x] Docs — `docs/API.md` gains the full section (43
      endpoints → **312/312**, 0 drift); route-registration
      test (`partnerships-routes.test.ts`) pins the counts,
      table membership and lifecycle-critical keys; tests
      446→**489** (+43 across state-machine, RBAC,
      validation and route coverage; 43→45 files).

**Gates (2026-10-05):** `npm run validate` **exit 0**
(489/45, 311 routes, API 312/312, 12 known warnings) → E2E
**42/42 (19 files)** → probe **211/211** → P1 **27/27** →
P2 **ALL PASS** → full `prettier --check .` exit 0.

## P33 — Partnerships & CSR schema, M1 (2026-10-05)

Context: the approved Partnerships & CSR brief
(`docs/PARTNERSHIPS-CSR-DESIGN.md`) with its five decision
points resolved toward the long-term shape — Organization
is the single identity anchor, `userId` stays required,
stages M1→M5 ship one gated increment at a time, one
profile model, UI last. M1 lays the substrate only: no
route, no API, no UI.

- [x] Schema — **+21 models, +21 enums, zero
      deletions** in one additive pass (`prisma validate`
      green on the first run): `EconomicInstitutionProfile`
      with focus-area and wilaya joins, `PartnerMatch`
      (rules-v1 scorecard with a human-readable
      `breakdown Json`), request → proposal →
      partnership → agreement → obligations, commitment →
      installments → disbursement + receipts,
      `InKindContribution`, `ImpactEvidence`/`ImpactReport`,
      CRM (contacts, interactions, follow-ups, notes).
- [x] Existing tables touched by **two columns only** —
      `Sponsor.organizationId` (unique, 1:1 compatibility
      bridge; legacy sponsors keep NULL) and
      `SupportOffer.organizationId` (userId stays the
      required author; the org hint is re-resolved
      server-side). `CSRProgram` untouched;
      `NotificationType` +11 values.
- [x] Migrations `0012_partnerships_csr` (730 lines: 21
      `CREATE TABLE`, 11 `ALTER TYPE … ADD VALUE`, zero
      `DROP TABLE/COLUMN`) and `0013_declared_indexes`
      (9 lines: 3 `CREATE INDEX`). `migrate dev` cannot
      run — the app role may not `CREATE DATABASE` for the
      shadow schema — so the SQL came from
      `migrate diff --from-url` against the live,
      migration-consistent database and applied via
      `migrate deploy`; DB now **13/13**. The strict diff
      surfaced latent drift: three raw-SQL indexes from
      `0002_constraints` (`AuditLog`/`Message`
      `createdAt DESC`, `availability` GIN) the datamodel
      never declared were dropped in 0012; 0013 declares
      them (`@@index([availability], type: Gin)` included)
      and recreates them — **net zero objects lost**, and
      future diffs can never take them again.
- [x] Client + seed — regenerated (stop `next start`
      first: the query-engine DLL is locked while the
      server runs), then **+16 trilingual `CSRFocusArea`
      rows** upserted by code (idempotent) with the demo
      dataset untouched; a live query confirmed 21 tables,
      2 bridge columns, 11 enum values, 16 areas and all
      four indexes.
- [x] Housekeeping — `.prettierignore` covers
      `packages/database/src/generated/` (every
      `db:generate` rewrites it; same argument as
      `next-env.d.ts`), keeping `format:check` stable
      across regenerations.

**Gates (2026-10-05):** `npm run validate` **exit 0**
(446/43, 268 routes, API 269/269, 12 known warnings) → E2E
**42/42 (19 files)** → probe **211/211** → P1 **27/27** →
P2 **ALL PASS** → full `prettier --check .` exit 0. (A
`start-3002.bat` instance had booted mid-build — started
12:07:35 against a BUILD_ID written 12:08:59 — serving a
half-written `.next`; it was stopped and restarted clean
before the live gates, per the batch file's own lifecycle
rule.)

## P32 — One name, one message (2026-10-04)

Context: the user's two brand directives in one sitting —
"أريد صحح بلدنا (بلادنا)" and "ركز على الرسالة التسويقية
… عاطفية وإيقاع لغوي احترافي … كلمات ماشي متداولة …
عبارة كي تسمعها تشدّ الانتباه وكي تعاود تسمعها تربطها
بالمنصة".

- [x] One name — the official art says **بلادنا** (its own
      tagline: «مبادرة من بلادنا إلى فرصة في العالم») and
      sixteen server strings already read `بلادنا`, yet the
      AR `siteName` beside the emblem read `بلدنا` with
      eight more UI strings to match; all nine now read
      بلادنا, so the wordmark and the mark agree.
- [x] One message — `landing.heroTitle` and
      `landing.heroSubtitle` rewritten in all three
      locales. AR adopts Shahinaz's couplet
      «نصل الخير بأهله، ونمنح العطاء أثره» (نصل/نمنح,
      أهله/أثره) and opens the lead with her
      «من جهودٍ متفرّقة إلى أثرٍ يجمع الجزائر», then lands
      the precise content and closes on
      «سجلٌ واحدٌ لا يُمحى يحفظه بلادنا». EN:
      `No good deed goes unrecorded.`
      FR: `Le bien ne passe jamais inaperçu.`
      The `Discover`/`Découvrez`/`اكتشف` trio and the
      process-only description are gone. Same keys, zero
      new i18n keys, no assertion anywhere referenced the
      old copy.
- [x] Plumbing verified — the live hero renders the
      dictionary defaults (CMS `home` override empty in
      all three locales), so the dictionary edit is what
      ships; live HTML checked for EN/AR/FR after restart.

**Gates (2026-10-04):** `npm run validate` **exit 0**
(446/43, 268 routes, API 269/269, 12 known warnings) → E2E
**42/42 (19 files)** → probe **211/211** → P1 **27/27** →
P2 **ALL PASS** → full `prettier --check .` exit 0.

## P31 — Honest access & true link origins (2026-10-04)

Context: two live bugs the user hit on production. (1)
Every workspace sub-page answered "الصفحة غير موجودة" to
members whose role lacks that page's permission — and the
layout did the same to signed-in non-members — because the
catch mapped `FORBIDDEN || NOT_FOUND` to `notFound()` while
the tabs visibly linked to the page. (2) The attendance
check-in link read `http://localhost:3000/…`: the stale root
`.env` origin every absolute link was built from.

- [x] Access panel — `workspace-no-access.tsx` (new) renders
      on `FORBIDDEN`: standalone page (title as the h1, no
      org name) at the layout gate, in-shell card with a
      back-to-overview link in the eleven tab pages;
      `NOT_FOUND` keeps `notFound()` and the UNAUTHORIZED/MFA
      redirects are untouched.
- [x] Copy — 2 new keys (`workspace.noAccessTitle/Body`)
      across all four i18n files (types + en/ar/fr).
- [x] Link origins — `originFor()` in `http.ts` (forwarded
      host/proto aware, configured-host allowlist, local dev
      hosts, forged host → configured public URL),
      `checkInUrlFor(ctx, token)` at both call sites.
- [x] `.env` — `APP_URL`/`PUBLIC_APP_URL` now the live
      domain, so email verify/reset, invitation and
      certificate-verify links stop pointing at localhost.
- [x] Tests — +4 `originFor` unit tests (446 total); E2E
      `workspace-access.spec.ts` +2 (volunteer denied ≠ 404,
      owner control); probe +4 (volunteer hours 200, access
      panel, session created, check-in origin on
      localhost:3002).

**Gates (2026-10-04):** `npm run validate` **exit 0**
(446/43, 268 routes, API 269/269, 12 known warnings) → E2E
**42/42 (19 files)** → probe **211/211** → P1 **27/27** →
P2 **ALL PASS** → full `prettier --check .` exit 0; live
proof through the domain: `checkInUrl` =
`https://bladna.aymen-digital-studio.site/check-in?token=…`.

## P30 — The platform mark (2026-10-04)

Context: the user supplied the official BLADNA art ("first,
make this the platform's logo") before the next phase — the
Algeria-map emblem with crescent and star, the بلدنا
calligraphy, the globe and the BLADNA wordmark on a
transparent 1254² canvas. The swap is asset-first: three
optimized derivatives, three brand slots, no strings touched.

- [x] Assets — the source PNG resampled to `public/logo.png`
      (384², 167 KB — the every-page mark), `src/app/icon.png`
      (512²) and `src/app/apple-icon.png` (180²); Next
      auto-registers the latter two as the document and
      apple-touch icons (the app had no icon of its own before).
- [x] Brand slots — `chrome.tsx` header and footer render the
      mark (`h-11`/`h-10`, `decoding="async"`, empty `alt` so
      the link's accessible name stays the siteName text) where
      the initial-letter `Avatar` sat (its now-unused import
      left the file), and `AuthShell` centers the mark above the
      back-home link, so every auth flow opens with the brand on
      the white side.
- [x] Contracts — zero new i18n keys (`BLADNA`/`بلدنا` carry
      every locale), probe +2 (landing ships `src="/logo.png"`,
      `rel="icon"` resolves to `icon.png`) → 207, E2E +2 in
      `site-chrome.spec.ts` (header mark decodes real pixels and
      links home; auth and footer marks decode too) → 40 in 18
      files.
- [x] Gates: `npm run validate` **exit 0** (442 tests/43 files,
      268 routes, API 269/269, build clean) → restart → E2E
      **40/40 (18 files)** → probe **207/207** → P1 **27/27** →
      P2 **ALL PASS** → full `prettier --check .` exit 0.

## P29 — Zoned impact-metric cards & a pinnable map (2026-10-04)

Context: the user asked how the impact indicators actually
update, then pointed at the console's metric lines — "الفعلي:
0 / 5 مورد · المصدر: …" — asking for everything to be clearer
instead of interwoven text. One shared component carries both
surfaces; the probe's map contract surfaced a real bug in the
same pass.

- [x] `impact-metric-card.tsx` — one card, two surfaces: title
      row (type chip, name, verified badge, optional console
      date), a labelled Actual/Target pair in `text-2xl` tabular
      numerals (brand-800 actual, sand-700 target, `—` when no
      target is declared), an honest `role="progressbar"` bar
      (aria-valuemin/max/now; caps visually at 100% while the
      figures never round; hidden when there is no denominator),
      and the source on its own muted line. Decimal columns that
      arrive as JSON strings (the console's raw metric select)
      normalise through one `figure()` helper; `data-impact-metric`
      is the shared probe/E2E hook.
- [x] Wired into the workspace console Impact tab (bordered `p-4`
      rows, chip + timestamp kept) and the public initiative page
      (no chip — the section heading already groups it); labels
      reuse `initiativeConsole.metricActual`/`metricTarget`/
      `metricSource` and `common.verified` → zero new i18n keys.
- [x] Map contract (spec §16): `buildDiscoverWhere` gives
      `mode=map` a pinnable-row requirement — own coordinates or
      a city that has them, the same fallback the renderer uses —
      so the placeless ONLINE initiative created during testing
      stops leaking into the payload; it stays in the regular
      list, and the probe's map check reads `got 3` again.
- [x] Gates: `npm run validate` **exit 0** ×2 (442 tests/43
      files, 268 routes, API 269/269, build clean) → restart →
      E2E **38/38 (18 files, +2 `impact-metrics.spec.ts`)** →
      probe **205/205 (+2)** → P1 **27/27** → P2 **ALL PASS** →
      full `prettier --check .` exit 0.

## P28 — The band carries detail pages & auth (2026-10-03)

Context: the user's "yes, I want" after the P27 close-out —
extend the reference treatment beyond the hubs: the detail pages
(initiative, organization, volunteer profile) and the auth pages.
One component change unlocks the richer headers; every string,
badge and probe contract stays where it was.

- [x] `page-masthead.tsx` children mode — a TS union makes the
      band accept exactly one of `title` (string mode: unchanged
      for the eleven hubs + legal) or `children` (custom header
      markup inside the same gradient, wash and gated `rise`), so
      a detail page keeps its own single h1 inside the band and
      nothing renders twice.
- [x] Initiative detail — the whole identity header (view
      tracker, back link, badges, title, organizer identity,
      opened-on line, save/report) moves into the band with its
      DOM order intact; light-on-light classes recolored for ink
      (`text-brand-100/200` meta, white organizer link,
      `text-clay-300` report). Cover and two-column body stay on
      the white side; probe's organizer-type span now matches
      `text-brand-200` too.
- [x] Organization profile — back link, badges, Message/Report
      entries, avatar + h1 + location ride the band (`<header>`
      stays their wrapper); the cover photo — including
      `data-testid="org-cover"` — sits directly below the band on
      white, StatGrid and columns unchanged.
- [x] Volunteer profile — the identity card becomes band content:
      white `text-3xl` name + StatusBadge, `brand-200` id/
      location/member-since/email lines, availability chips and
      the outline Message button keep their light fills (readable
      on ink); achievement, timeline, bio and skillset cards
      follow on white under `max-w-4xl`.
- [x] Auth — `AuthShell` renders title/subtitle through a
      `max-w-md` band above the existing card, giving login,
      register, forgot-password, reset-password, MFA and
      verify-email the silhouette in one change; the card now
      starts at the form, the back-home link keeps its white-side
      position, and the single `Welcome back` h1 lives in the band
      (probe pins the count).
- [x] Tests — probe +5 (198→203: `data-page-masthead` on the
      initiative detail, `/en/login` body with a 200 and exactly
      one `>Welcome back<`, the volunteer profile; the
      organizer-type regex widened for the recolored span) and
      E2E `site-chrome.spec.ts` +2 (34→36 / 17 files): the auth
      band wraps the h1 with the Sign-in button still on the
      white card, the detail band carries `Organized by`.

**Gates (2026-10-03):** `npm run validate` **exit 0** (442 tests /
43 files, 268 routes, API 269/269, build 12 known warnings) + clean
restart on :3002 (P28 build) + probe **203/203** + P1 **27/27** + P2
gates **ALL PASS** + `npm run test:e2e` **36/36 (17 files)** + full
`prettier --check .` exit 0. Locked strings untouched (quick-chip
hrefs ×1 each, header `href="/en/opportunities"`, **Algeria-first**
once per body, **Append-only verified hours**, `#q`/`#opp`/
`#filter-tray`, M6 cache, footer `href="/en/volunteers"`). No i18n
key added in any locale; hub bands, landing reveals and the
dashboard ticker behavior unchanged.

## P27 — The reference chrome rides every page (2026-10-03)

Context: the user's scope statement after the P26 landing —
"continue and the other pages". The landing learned the reference's
silhouette; this phase lifts its instruments into shared chrome so
the whole site wears it, and gives every public hub the same title
band without touching a single string.

- [x] Sitewide chrome — `ui/components/site-masthead.tsx` (server)
      renders the ink promise strip (the locked `Algeria-first`
      heroBadge) and the P12 announcement as `variant="ticker"`
      above the sticky header in `[locale]/layout.tsx`, so every
      route — hubs, dashboard, auth, admin — opens with the
      reference's two bars. The fetch follows the P12 contract
      (GET /home pinned → latest active → degrade to "no
      ticker"); the landing dropped its private strip/ticker/
      fetch/imports (its `home` read stays for the hero copy) and
      the dashboard's standalone banner block retired: one
      announcement surface, per-id dismissal untouched, the
      default variant still byte-identical in the component.
- [x] Page-title band — `ui/components/page-masthead.tsx`: a
      full-bleed `from-brand-900 to-brand-800` band (the hero's
      gradient + centred jade wash) carrying eyebrow → h1 → lead →
      optional note, with an `action` slot and a per-page `inner`
      width. Applied to eleven hubs — opportunities, directory,
      verify, organizations, international, campaigns, map, help,
      safety, saved, recommendations — plus `LegalDoc` (terms +
      privacy share it): the directory keeps its privacy footnote
      as the note, legal pages keep intro + "updated", the map
      keeps its two coverage figures as the action (dt/dd
      recolored for ink). Every string is the page's existing
      dictionary entry; `[dir='rtl']` renders Arabic titles in
      Kufi via the P26 `--font-display` rule; the entrance is the
      gated `rise` keyframe — hubs deliberately do NOT get `view()`
      scroll reveals (a full-height container in view at scroll 0
      would park at partial opacity).
- [x] Tests — probe +6 (192→198: strip/ticker/band on
      `/en/opportunities`, strip + band on `/en/volunteers`) and
      E2E `tests/e2e/site-chrome.spec.ts` +2 (32→34 / 17 files):
      the chrome rides a hub with the band's `Initiatives` h1, and
      the AR verify band renders under `dir="rtl"`.

**Gates (2026-10-03):** `npm run validate` **exit 0** (442 tests /
43 files, 268 routes, API 269/269, build 12 known warnings) + clean
restart on :3002 (P27 build) + probe **198/198** + P1 **27/27** + P2
gates **ALL PASS** + `npm run test:e2e` **34/34 (17 files)** + full
`prettier --check .` exit 0. Locked strings untouched (quick-chip
hrefs ×1 each, header `href="/en/opportunities"`, **Algeria-first**
once per body — the layout strip owns it, **Append-only verified
hours**, `#q`/`#opp`/`#filter-tray`, M6 cache, footer
`href="/en/volunteers"`). No i18n key added in any locale; the
landing's `data-reveal` set unchanged; dashboard console and auth
pages only gained the two chrome bars.

## P26 — A landing that moves (2026-10-03)

Context: the user's scope statement — they liked the design of
`mjeunesse.gov.dz` (the Ministry of Youth site), "especially the landing
page", and asked for exactly that design but with BLADNA's own
information, suitable images and motions. P22 already dressed the
landing in BLADNA's palette; P26 rebuilds its _composition_ after the
reference — and by construction the clone is skin-deep: every locked
string, every section of substance and every honesty rule stays exactly
where it was.

- [x] Reference study — the site ships as a Vite SPA, so the anatomy
      came from its own CSS/JS bundles (greens `#03120d`/`#062e22`,
      cream `#f6f2ea`, sand-gold `#e9c9a5`, burnt `#b36628`; Noto Kufi
      Arabic display + IBM Plex Sans Arabic body — the body face
      BLADNA already uses; keyframes `drift`, `marquee-ltr/rtl`,
      `pulsering`, `shimmer`, `page-in`) plus live browser captures of
      the hero (framed slider, `04 / 10` counter, gold segments) and
      the dark footer, mapping the landing order: republic strip →
      breaking marquee → photo slider → news → word → activities →
      documents → stats → digital platforms → contact → footer.
- [x] Top strip + ticker — the locked `heroBadge` (**Algeria-first**
      …) moves from a hero pill to an ink `bg-sand-950` strip that
      opens the page the way the reference opens with its mandate; the
      P12 announcement gains `variant="ticker"` — a terracotta marquee
      carrying title • body twice (±50% exact-period track, RTL
      keyframe mirroring the reference), one sr-only sentence for
      assistive tech with the moving copies `aria-hidden`, hover/focus
      pauses it, per-id dismissal unchanged; the dashboard keeps the
      default banner byte-identical.
- [x] Hero slideshow — `hero-slider.tsx` (client): four CC0 frames
      (community, environment-beach, humanitarian, youth — all already
      credited in PHOTO-CREDITS.md) in a rounded frame with a gradient
      scrim, 900ms crossfade + 16s `hero-drift` zoom, an `01 / 04`
      counter, per-segment buttons (`Show slide n`, `aria-current`)
      and a play/pause toggle (`aria-pressed`). Reduced motion never
      autoplays — hydration flips the toggle — and a hidden tab stops
      advancing; copy, search, CTAs and the features trust strip keep
      their exact places.
- [x] Motion system — `globals.css` gains `--font-display` (Noto Kufi
      Arabic over Plex, loaded by `next/font` as `--font-kufi`) and an
      `[dir='rtl'] h1…h4` rule so Arabic headlines take the display
      face while Latin locales keep Plex; keyframes `hero-drift`,
      `pulsering`, `marquee-ltr/rtl` and `reveal-in` are declared only
      inside `prefers-reduced-motion: no-preference`; sections carry
      `data-reveal` scroll-ins gated by view() timelines behind
      `@supports (animation-timeline: view())` — engines without it
      render statically — and `@media print` forces full visibility;
      the hero and final-CTA primary pills glow via `pulsering`.
- [x] Services grid — verify, map, the volunteer directory and
      BLADNA International merge into one four-card band (the
      reference's "digital platforms"), each card keeping its own
      section copy (`verifyTitle/Body/Cta`, `discoverMap` +
      `servicesMapBody`, `directory.title/subtitle`, `intl*`); the two
      stacked bottom cards retire, and journey/rail/featured/pillars/
      how keep their content and gain `data-reveal`.
- [x] Impact counters — `stat-counter.tsx` (client): SSR renders the
      final honest figure (crawlers, no-JS and reduced-motion always
      see it), an IntersectionObserver replays the count-up once when
      the band scrolls in; four `data-stat-counter` figures.
- [x] i18n **+7 ×4** (`landing.sliderLabel`, `slideShow`, `playShow`,
      `pauseShow`, `eyebrows.services`, `servicesTitle`,
      `servicesMapBody`).

**Gates (2026-10-03):** `npm run validate` **exit 0** (442 tests /
43 files, 268 routes, API 269/269) + clean restart (P26 build) + probe
**192/192** (+7 checks: promise strip, features line, slider present,
four frames, play/pause control, four counters, services heading) + P1
**27/27** + P2 gates **ALL PASS**

- `npm run test:e2e` **32/32 (16 files)** (+4 `landing-motion.spec.ts`:
  promise strip + slider with segment jump, ticker + counters +
  services links, reduced-motion stays paused, Arabic RTL slider) +
  full `prettier --check .` exit 0. Locked strings untouched
  (quick-chip hrefs ×1 each, header `href="/en/opportunities"`,
  **Algeria-first** now the top strip, **Append-only verified hours**,
  `#q`/`#opp`/`#filter-tray`, M6 cache, footer
  `href="/en/volunteers"`). Known deferred: scroll reveals are
  progressive (Chromium view-timeline support; other engines render
  statically — content never depends on an animation), and the display
  face applies to RTL headings only, an intentional Latin/Arabic split.

## P25 — Public volunteer profile (2026-10-03)

Context: the user's scope statement — browse the directory, open a
volunteer's profile, see their photo, their information and their
achievements. P23 taught the cards to talk (Message); P25 teaches them
to open. The privacy contract decides everything else: the profile is
public only by consent, and every section a volunteer can withhold says
so out loud rather than rendering a fake zero.

- [x] Route & validation — `GET /volunteers/:id` registered in
      `routes/participants.ts` beside the directory listing (public
      auth + `public` rate limit), `profileParamsSchema` (UUID) added
      to `packages/validation/volunteer.ts`; route table 267→268
      (participants 74→75), `docs/API.md` 268→269.
- [x] Server (`server/modules/volunteers.ts`) — `publicProfile`
      handler: 404 unless `publicProfile:true` on an active user
      (unknown id, malformed uuid and withheld profile are the same
      answer — no existence oracle), `showWilaya` gates the location
      line, `showHours=false` withholds `achievements.verifiedHours`
      **without issuing the aggregate** (spec §30, the `GET
/public/verify` rule) and flips each timeline row's hours to
      `null`, `showCertificates=false` withholds the list, email is
      masked unless `publicPhone`-style flags allow it, and the phone
      number never travels the contract. Certificates are VALID +
      non-expired (top 8) with honest `certificatesTotal`;
      participations are the newest top-8 rows with
      `participationsTotal`; per-row hours sum only `VERIFIED` rows
      when `showHours` is on.
- [x] Page (`app/[locale]/volunteers/[id]/page.tsx`) — guarded SSR
      `invoke` (`withCookies:false`) with `NOT_FOUND`/`VALIDATION_ERROR`
      → `notFound()`; identity header (photo `Avatar` with initials
      fallback, name + StatusBadge, volunteer code · location,
      member-since, availability chips), Message `?to=` deep link,
      masked email line; achievements card with digit tiles + the
      explicit hidden-notes, certificate rows deep-linking
      `/{locale}/verify/certificate?code=…` (credential-keyed
      verification never depends on a privacy flag), the participation
      timeline, About/skillset sections and the privacy footnote.
      `generateMetadata` titles the page with the volunteer's name.
- [x] Directory click-through — cards now render the volunteer's
      `profileImage` in the `Avatar` and wrap the name in a link to
      `/{locale}/volunteers/{id}` (the Message button, filters and
      every locked string untouched).
- [x] Settings — the sixth enforced privacy toggle
      (`showCertificates`, `settings.showCertificates` ×4) lands in
      `settings-forms.tsx`; `PrivacyProfile` carries the flag and the
      comment that had waited for a controlled surface now points at
      the profile page.
- [x] i18n **+8 ×4** (`directory.profileBack`, `profileAbout`,
      `profileMemberSince`, `profilePrivacyNote`, `profileHoursHidden`,
      `profileCertsHidden`, `directory.availabilitySlots` with its six
      slot labels, `settings.showCertificates`).
- [x] Classification — `private-noindex.test.ts` PUBLIC_PAGES gains
      `volunteers/[id]` (indexed on purpose; no `noindex` string);
      the sitemap stays pinned at 57 entries — profiles are discovered
      through the directory, not enumerated.

**Gates (2026-10-03):** `npm run validate` **exit 0** (442 tests /
43 files, 268 routes, API 269/269) + clean restart (P25 build) + probe
**185/185** (+18 checks: card link, profile 200 + indexable + name +
hours tile + certificate + verify link + timeline link + messaging +
phone-number line, not-found for unknown/malformed ids, the real API
404, the live opt-in flip `publicProfile:false` → withheld → restored,
settings 200 + the sixth toggle) + P1 **27/27** + P2 gates **ALL PASS**

- `npm run test:e2e` **28/28 (15 files)** (+3: card→profile
  achievements with the hours tile/certificate/timeline/Message, unknown
- malformed ids land on the not-found page with the API answering 404,
  Arabic locale renders the same profile) + full `prettier --check .`
  exit 0. Locked strings untouched (quick-chip hrefs ×1 each, header
  `href="/en/opportunities"`, **Algeria-first**, **Append-only verified
  hours**, `#q`/`#opp`/`#filter-tray`, M6 cache, footer
  `href="/en/volunteers"`, probe `Phone numbers are never shown`). Known
  deferred: profile URLs are not sitemap entries (the directory is the
  discovery surface), no photo upload on the profile itself (the flag
  already exists and the settings/CV surfaces set it), and page-level
  `notFound()` streams the not-found UI at HTTP 200 on every page in this
  app (platform-wide; the API carries the real 404 status).

## P24 — Comments & ratings (2026-10-03)

Context: the user's scope statement pairs "comments and ratings" with
P23's contact/trust work — before spending a Saturday on an initiative,
a volunteer wants to read what other participants actually experienced.
The trust rule drives the rest: only people who _were there_ (an
ACCEPTED application or VERIFIED hours on this initiative) may write,
and every review shows which path qualified the author.

- [x] Schema & migration — `ReviewSource` enum
      (`PARTICIPANT`/`HOURS`), `OpportunityReview` (rating 1–5 with a
      DB CHECK, optional body ≤2000, compound unique
      `[opportunityId, authorId]`, list index
      `[opportunityId, createdAt]`) plus the `Opportunity`/`User`
      back-relations; hand-numbered `0011_opportunity_review` applied
      with `prisma migrate deploy` (drift diff clean, generated client
      re-run).
- [x] Validation (`packages/validation`) — `reviewParamsSchema`,
      `createReviewSchema` (integer 1–5, trimmed body ≤2000) and
      `updateReviewSchema` (at least one field present, `body: null`
      clears the text).
- [x] Four routes (`server/modules/reviews.ts`, registered in
      `routes/participants.ts`, all four documented in `docs/API.md`):
      public viewer-aware `GET /opportunities/:slug/reviews` (rating
      `stats` + the caller's eligibility and own review through the
      forwarded cookies), authenticated `POST` (403 ineligible, 409
      duplicate, audited `opportunity.review`) and own-only
      `PATCH`/`DELETE` (foreign rows 404, delete idempotent
      `{deleted:false}`, audited `opportunity.review.delete`).
- [x] Detail page section — an SSR `invoke` of the list handler feeds
      the new client `reviews-section.tsx`: stats row hidden at zero,
      review cards with provenance badges and `role="img"` star rows,
      author names only when the profile is public (neutral
      verified-participant label otherwise), an always-visible
      eligibility note, create/edit/delete with `router.refresh()` and
      the kit confirm dialog, and a sign-in CTA for anonymous visitors
      (also shown when a mid-write 401 kills the session).
- [x] i18n **+17 ×4** (`opportunity.reviewsTitle` … `reviewSignin`;
      `Reviews: {count}` is label-first like `Results: {count}` so no
      locale pluralises a raw number).
- [x] Seed — one demo review by the volunteer on
      `algiers-park-cleanup` (idempotent; both stamps written from the
      same instant so the UI never flags it as edited).

**Gates (2026-10-03):** `npm run validate` **exit 0** (437 tests /
42 files, 267 routes, API 268/268) + clean restart (P24 build) + probe
**167/167** (+8 checks: reviews section + eligibility note on the probe
detail, public list 200 with stats/viewer, anonymous POST 401, seeded
demo review + `Reviews: 1` stats, accepted volunteer answers
`eligible:true`) + P1 **27/27** + P2 gates **ALL PASS** +
`npm run test:e2e` **25/25 (14 files)** (+1 full author cycle: publish
→ verify badges/stats → edit → edited marker → confirm-dialog delete →
composer returns) + full `prettier --check .` exit 0. Locked strings
untouched (quick-chip hrefs ×1 each, header
`href="/en/opportunities"`, **Algeria-first**, **Append-only verified
hours**, `#q`/`#opp`/`#filter-tray`, M6 cache, footer
`href="/en/volunteers"`). Known deferred: reviews are first-page only
(`limit 10`; `meta.totalPages` is already computed), no sort toggle
(newest-first is the only order), and an ACCEPTED-but-unattended
applicant may still rate (the organizer's acceptance is the source).

## P23 — Contact & trust before applying (2026-10-03)

Context: the applicant's three questions before applying (user scope
statement): **do volunteers appear, how do I contact them, and how do I
know the organizers** — many things to understand first. Answered on the
three surfaces an applicant actually reads: the directory, the initiative
page and the organization profile.

- [x] Directory **Message** button — `GET /volunteers` items now expose
      the owner's `userId` (the `publicProfile: true` gate already
      selected the row; messaging keeps its `messaging` rate limit and
      block reads server-side; `docs/API.md` documents the handle), and
      each card footer pairs the contact line with a kit `buttonClasses`
      link to `/{locale}/messages?to=<userId>`.
- [x] Contact params survive the sign-in bounce — `messages/page.tsx`
      takes `searchParams`, re-validates `?to=`/`?org=` (exact UUID) and
      `?name=` (≤120 chars, only beside a valid org) through new pure
      helpers `parseContactParams`/`contactQuery`
      (`ui/messages-utils.ts`), and folds the result into the path fed
      to `pageSession` **and** the catch-block `?next=` — anonymous →
      login → addressed compose form, junk never echoed into the
      redirect.
- [x] `?org=` compose mode — `messages-view` opens on mount with a
      static **Organization** target row (id fixed by the link,
      name display-only) instead of the recipient input, posts
      `{ organizationId }`, enables Start without a recipient, and
      clears the target on close and after a successful start.
- [x] Initiative header identity — the organizer name links to
      `/{locale}/organizations/<slug>`, a logo `Avatar` renders beside
      it, and a trust badge shows the organization's ladder (the same
      `workspace.verification.levels` strings the profile page uses; the
      seeded association reads **Level 2 — Organization verified**).
- [x] Contact card always renders — heading plus published details when
      any exist (the fallback note only when organizer details are
      actually shown), and always the **Message the organization**
      button → `?org=<id>&name=`.
- [x] Organization profile header — **Message** button beside Report →
      `?org=<id>&name=`.
- [x] i18n **+2 ×4**: `common.message`, `opportunity.messageOrganization`.

**Gates (2026-10-03):** `npm run validate` **exit 0** (424 tests /
40 files, 263 routes, API 264/264) + restart (P23 build) + probe
**159/159** (+6 checks: detail org link / trust level / message entry,
directory `?to=`, org-profile 200 / message entry) + P1 **27/27** + P2
gates **ALL PASS** + `npm run test:e2e` **24/24 (13 files)** (+1
anonymous bounce test, org-profile href assertion) + full
`prettier --check .` exit 0. Locked strings untouched (quick-chip hrefs
×1 each, header `href="/en/opportunities"`, **Algeria-first**,
**Append-only verified hours**, `#q`/`#opp`/`#filter-tray`, M6 cache,
footer `href="/en/volunteers"`). Known deferred: no bell notification
for a volunteer's first message to an organization (staff find the
thread in their list), and a staff member opening Message on their own
profile hits the server's `participantUserId` requirement — an edge the
workspace, not the public page, is for.

## P22 — A home page that catches the eye (2026-10-03)

Context: the landing read as a well-organised but visually flat
sheet — three consecutive sand sections in the middle, small figures,
and no mid-page anchor for the eye to land on. Requested fix: make it
**ملفتة** (eye-catching) — pure visual, **zero new copy** so no
dictionary file was touched.

- [x] Anchor rhythm — journey section turns **white** (breaking the
      sand run after the discovery launcher, with `pb-10` moved onto
      that launcher so the card keeps its breathing room), and the
      section owns its own `py-16` band.
- [x] Step marks — the five numbered circles gain
      `bg-gradient-to-br from-clay-500 to-clay-700` + `ring-4
ring-clay-100` (clay stays decorative, never semantic); the
      trust cell gains the matching `ring-4 ring-brand-50` +
      `shadow-card`.
- [x] Bento priority — the identity cell **inverts** to
      `from-brand-700 via-brand-800 to-brand-900` with white title,
      `text-brand-100` body and a `bg-white/10` icon tile; `iconFor`
      takes an `onDark` flag flipping the glyph to
      `text-brand-200`. One dominant dark cell, never two.
- [x] Stats anchor — the impact panel crosses to a **dark brand
      band**: same `gap-px` hairline instrument and clay figure
      rules, figures now `text-5xl md:text-6xl` with a
      white→`brand-200` clipped gradient, note on `text-brand-200`,
      cells on `bg-brand-900/80 backdrop-blur-sm` over a masked
      jade/terracotta wash. The `statsNote` provenance label is
      carried over verbatim (honesty rule C1 intact).
- [x] `SectionHeading` gains an optional `tone="dark"` (eyebrow
      `text-brand-300`, title `text-white`); the default `'light'`
      renders byte-identical classes for every existing caller.
- [x] Motion — new `.hero-breathe` keyframe (16s, transform-only so
      each layer keeps its own opacity class) declared **inside**
      the `prefers-reduced-motion: no-preference` block alongside
      `.hero-rise`/`.rise`; applied to the hero glow, the stats wash
      and the final CTA wash. Hero search goes `shadow-xl
ring-white/30`, both hero CTAs gain
      `motion-safe:hover:-translate-y-0.5`.
- [x] Verify card — warm two-tone wash (`from-brand-50 via-brand-50
to-clay-50`) with a masked `size-40` shield watermark
      (`aria-hidden`, clipped by `overflow-hidden`).
- [x] Header auth buttons centered — the signed-out pair passed
      `hidden sm:block` into `buttonClasses`, and `sm:block`
      overrode the kit's `inline-flex` at ≥sm (twMerge keeps the
      last display class), leaving a plain `block` box where
      `items-center justify-center` had nothing to flex. Now
      `hidden sm:inline-flex` (`chrome.tsx` ×2): the kit's centering
      stays live at every width, and `hidden` still parks the pair
      below sm behind the bottom nav. Verified in-browser: computed
      `display: flex`, `justify-content: center`,
      `align-items: center` on both links.

**Gates (2026-10-03):** `npm run validate` **exit 0** (419 tests /
40 files, 263 routes, API 264/264) → restart (P22 build) → probe
**153/153** + P1 **27/27** + P2 gates **ALL PASS** →
`npm run test:e2e` **23/23 (13 files)** → full `prettier --check .`
exit 0. Locked strings untouched (quick-chip hrefs ×1 each, header
`href="/en/opportunities"`, **Algeria-first**,
**Append-only verified hours**, `#q`/`#opp`/`#filter-tray`, M6 cache).

## P21 — Review before publish + the platform's idea on the home page (2026-10-03)

Context: the CSJ letter claims initiatives pass a review before
publication, with acceptance/rejection under the platform's
supervision — and that no unverified or suspended organization can
publish. The code audit behind that letter found three places where
the claim outran the build (a verified org could publish straight
from DRAFT; the admin console was documented as deliberately exempt
from the org-verification wall; the org row rendered a Reject button
that always 403'd), plus a home page that never said any of it.

- [x] State machine — `DRAFT` no longer lists `PUBLISHED`
      (`state-machines.ts`): publication travels through the review
      queue (or restores a previously-published SUSPENDED/EXPIRED
      row), for tenants and platform officers alike.
- [x] Server enforcement — `ACTION_PERMISSION` maps `PUBLISH` →
      `opportunity.moderate` (with `REJECT`: the moderation pair);
      organizations keep `SUBMIT_REVIEW`/`RESTORE_DRAFT`/
      `SUSPEND`/`ARCHIVE`/`EXPIRE`. `platformAction` now wraps
      every move to `PUBLISHED` in the same two walls as the
      tenant path — `SUSPENDED` organization first, then
      non-`VERIFIED` (`ORGANIZATION_NOT_VERIFIED`).
- [x] Workspace UI — `TRANSITION_ACTIONS` drops `PUBLISH`/
      `REJECT`, the reason field leaves with them, and
      `transitionHint` is rewritten ×4 ("submit for review —
      platform moderation publishes (accepts) or rejects it").
- [x] Admin console — the action menu filters per row through
      `canTransition` (DRAFT/REJECTED/ARCHIVED rows show no
      actions; PENDING_REVIEW gets PUBLISH/REJECT/RESTORE;
      SUSPENDED/EXPIRED get RESTORE), so no offered button can
      fail against the machine.
- [x] Home page carries the idea — hero subtitle/badge/trust
      strip rewritten ×4 (badge restores the locked
      **Algeria-first** wording; strip: verified organizations →
      reviewed initiatives → append-only hours → checkable
      certificates) plus a new typographic **"From idea to
      impact"** section (five numbered steps + the closing
      "space of trust" cell) between the discovery launcher and
      the latest rail.
- [x] Contract + tests — `docs/API.md` documents the review rule
      on both endpoints; `state-machines.test.ts` asserts
      `DRAFT → PUBLISHED` **false** and `rbac.test.ts` asserts no
      organization role (even OWNER) holds `opportunity.moderate`
      (**419 tests / 40 files** unchanged, 263 routes, API
      **264/264**).

**Gates (2026-10-03):** `npm run validate` **exit 0** (419 tests /
40 files, 263 routes, API 264/264) → restart → probe **153/153** +
P1 **27/27** + P2 gates **ALL PASS** → `npm run test:e2e`
**23/23 (13 files)** → full `prettier --check .` exit 0.

## P20 — Report from the page, not from a UUID (2026-10-02)

User report: "كيف ابلغ هنا واين اجد المعرف او الرابط او اي شي
اخر" — the safety form asked for a "target identifier" whose hint
promised a UUID "shown in the page or profile URL", while the
public pages are addressed by slug
(`/ar/opportunities/algiers-park-cleanup`).

- [x] Shared parser — `parseReportTargetRef` in `@bladna/types`
      (client and server share one set of rules): an app URL/path
      yields its target type (`opportunities`, `organizations`,
      `workspace`, `campaigns`) or the certificate
      (`verify/certificate?code=`), with locale, query and hash
      stripped; a bare slug or uuid passes through untouched.
- [x] Server — `resolveTargetId` reworked into `resolveTarget`:
      resolves `id OR slug` for organization/opportunity/campaign
      (free text only ever filters the slug column, never a uuid
      column), keeps the uuid-only rules for user/message, returns
      the effective target type for the stored row and audit, and
      rejects `INTERNATIONAL_OPPORTUNITY` with an honest validation
      error — it used to fall through to "Message not found", and
      the moderation pipeline still has no effect branch for it, so
      the type is also hidden from the form menu.
- [x] Report links — the initiative and organization profiles
      carry a **Report** link (`dict.common.report`, new key ×4)
      opening `/safety?target=<own page link>`; the form prefills
      on mount, auto-detects the type from the pasted or deep-linked
      value, and the value rides the anonymous sign-in bounce
      (`?next` keeps `target=`).
- [x] i18n — `common.report` added ×4; `safety.targetIdHint` and
      `safety.targetIdHintCertificate` rewritten ×4 ("paste the
      page link from the address bar…"); locked strings untouched.
- [x] Guards — `report-target.test.ts` (+9 → 419 tests / 40 files) + E2E `safety.spec.ts` (Report link → prefilled form →
      detected `OPPORTUNITY` type → submit → "My reports" carries
      the resolved uuid, never the pasted URL) backed by the
      self-healing `scripts/e2e-ensure-clean-report.ts` fixture,
      which drops the previous run's report so the one-open-report
      guard never bites across runs (+1 → 23/23 / 13 files).

**Gates (2026-10-02):** `npm run validate` **exit 0** (419 tests / 40
files, 263 routes, API 264/264) → restart → probe **153/153** + P1
**27/27** + P2 gates **ALL PASS** → `npm run test:e2e` **23/23 (13
files)** (+`safety.spec.ts`) → full `prettier --check .` exit 0.

## P19 — Shareable conversation link (2026-10-02)

User report: "uuid صعب ايجاه اعمل حل اخر" — the only way to
start a conversation was to dig a raw 36-character UUID out of
Settings, share that string, and have the other person paste it
into the recipient field.

- [x] Settings — the account card leads with a **conversation
      link** row (`/{locale}/messages?to=<id>`, absolute after
      mount, truncated code chip with a full-title hover) and a
      **Copy link** button: clipboard write + 2 s "link copied"
      state, with an insecure-context fallback that selects the
      code so one Ctrl+C still works; the raw ID row stays below,
      its hint now pointing at the link.
- [x] Messages — `?to=<id>` opens the new-conversation form with
      the recipient prefilled on mount, and the field accepts a
      whole pasted link: the UUID is extracted client-side before
      `POST /conversations`, so the server's existing DIRECT
      dedupe lands both parties on the thread they already share.
- [x] i18n — three new keys ×4 dictionaries:
      `settings.conversationLink` / `copyLink` / `linkCopied`;
      `settings.yourUserIdHint` and `messages.recipientHint`
      rewritten ×4; locked strings untouched.
- [x] Guards — E2E `messages.spec.ts` +1: clipboard round-trip
      (read/write permissions granted) → open the link → the
      recipient is prefilled → Start opens an existing thread
      with content (never a fresh empty row) (+1 → 22/22 / 12
      files).

**Gates (2026-10-02):** `npm run validate` **exit 0** (410 tests / 39
files, 263 routes, API 264/264) → restart → probe **153/153** + P1
**27/27** + P2 gates **ALL PASS** → `npm run test:e2e` **22/22 (12
files)** (+`messages.spec.ts` second test) → full `prettier --check .`
exit 0.

## P18 — Support offers decision room (2026-10-02)

User report: accepting an offer changed nothing visible ("لم يتم
تحديث عند قبول العروض") + a request to present the offers idea
"with more detail, distinction and beauty". The DB told the story:
the whole afternoon session's decisions had landed (every offer
ACCEPTED), yet the quantity needs still showed `fulfilled: 0` —
progress only reacted to the owner's manual counter, while
financial needs already summed their accepted amounts; the offers
tab itself was a flat list of thin rows.

- [x] The update itself — both needs APIs (console `listNeeds` +
      the public opportunity payload) now sum **accepted offer
      quantities** next to the existing counts/amounts
      (`acceptedQuantity`), and a shared `NeedProgressBar` paints
      two honest segments: solid `brand-600` = received
      (`fulfilled`), lighter `brand-300` = accepted pledges still
      to be delivered, capped at the target with aria reporting
      the painted total. It renders on the public need card, the
      console needs tab and the offers group headers — so a
      decision moves the bar in place without pretending the goods
      arrived (financial keeps its accepted-amount line).
- [x] Offers tab rebuilt — three-stat summary strip (total /
      pending in amber / accepted in `brand-700`), instant status
      chips with counts (`aria-pressed`, 44 px targets), and
      offers grouped under their need: kind pill, pending /
      accepted counts and the bar (or financial line) in the
      group header.
- [x] Offer cards — status chip + large `tabular-nums` figure
      (amount or ×quantity), offerer `Avatar` initials + masked
      name + masked email, `dir="auto"` description on a
      start-border rule, contact note, submitted/decided dates,
      reject reason, and a primary (brand) Accept button beside
      the ghost Reject that opens the reason field.
- [x] i18n — six new keys ×4 dictionaries:
      `opportunity.receivedLabel` / `acceptedLabel`,
      `initiativeConsole.offersTotal` / `offersAll` /
      `offerSubmittedAt` / `offerDecidedAt`; locked strings
      untouched.
- [x] Fixture — `scripts/e2e-ensure-pending-offer.ts`, run from
      Playwright global setup through a `tsx` child (mirroring the
      TOTP helper): self-heals one PENDING offer on a dedicated
      ladder need each run and drops stale marker offers so the
      bar's before/after stays deterministic; user-created data is
      never touched.
- [x] Guards — `need-progress.test.ts` covers the segment capping
      maths (+3 → 410 tests / 39 files); E2E `offers.spec.ts`
      takes the real decision and asserts the in-place update:
      chip flips to ACCEPTED, the Accept button disappears, the
      decision notice appears and the group bar reports 0 → 1
      (+1 → 21/21 / 12 files).

**Gates (2026-10-02):** `npm run validate` **exit 0** (410 tests / 39
files, 263 routes, API 264/264) → restart → probe **153/153** + P1
**27/27** + P2 gates **ALL PASS** → `npm run test:e2e` **21/21 (12
files)** (+`offers.spec.ts`) → full `prettier --check .` exit 0.

## P17 — Messages workspace (2026-10-02)

The messages page was functionally complete but visually plain (user
request: improve the UI): flat list rows, dark `bg-sand-900` bubbles
carrying sender + full timestamp inside every message, 📎 emoji
standing in for attachments, a raw full-width file input, and none of
the conventions people expect from a chat surface.

- [x] Conversation list — rows gain a kit `Avatar` tile (the peer's
      `profileImage`, initials fallback) and a start-border active
      state (`border-s-2 border-brand-600` + `bg-brand-50`;
      transparent border by default so nothing shifts); title, date
      and unread badge stay as they were.
- [x] Thread — the scroll area tints to `sand-50`; peer bubbles are
      white with a `sand-200` border and the sender's name in
      `brand-700` (once per turn), mine are `brand-600` with white
      text (5.0:1), and `rounded-ee/es-md` tail corners follow the
      writing direction; one `formatDate` separator per local day
      (hairlines both sides), turn grouping drops repeated sender
      names and tightens their gap, and the meta moved outside the
      bubble as `formatTime` (new helper). Message bodies carry
      `dir="auto"` so Latin copy renders LTR inside the RTL page
      instead of bidi-scrambling (the P14 support-card fix applied
      here).
- [x] Composer — 📎 replaced by `PaperclipIcon`; the attachment picker
      is an `sr-only` input behind a label that wears the visible
      affordance and the focus ring (`has-[:focus-visible]`); the send
      button carries `SendIcon` + its dictionary label; Enter sends,
      Shift+Enter keeps the newline (IME composition excluded).
- [x] Thread header — peer names (everyone but me) ride under the
      title; below `lg`, opening a conversation scrolls the thread
      pane into view (`scroll-mt-20` + `window.innerWidth < 1024`).
- [x] Demo data in data — seed + idempotent `prisma db execute` insert
      the org↔volunteer thread "Winter campaign volunteers (demo)"
      (4 messages; subject-guarded in the seed, natural-key guarded
      in SQL), so `/messages` opens on real content instead of an
      empty list. User-created conversations are untouched.
- [x] Guards — `apps/web/src/ui/format.test.ts` covers `formatTime`
      (+1 → 407 tests / 38 files); E2E `messages.spec.ts` signs in,
      opens the seeded thread and asserts bubbles + composer labels
      (+1 → 20/20 / 11 files). Same increment closed P16's residual
      risk: header audit at 1024/1152/1280/1440 px — no horizontal
      overflow, no nav/right-cluster overlap, every link 44 px.

**Gates (2026-10-02):** `npm run validate` **exit 0** (407 tests / 38
files, 263 routes, API 264/264) → restart → probe **153/153** + P1
**27/27** + P2 gates **ALL PASS** → `npm run test:e2e` **20/20 (11
files)** (+`messages.spec.ts`) → full `prettier --check .` exit 0.

## P16 — App bar declutter (2026-10-02)

The signed-in header packed eight text links + the language switch +
account menu + a bordered logout into one row — a user screenshot
showed the dashboard label wrapped onto two lines.

- [x] Nav collapse — desktop nav = the public four + dashboard, five
      text links with `shrink-0 whitespace-nowrap` so labels never
      wrap or squash; messages/notifications became icon buttons
      (`MailIcon`/`BellIcon`) carrying their existing dictionary
      labels as `aria-label` + `title`; applications moved into the
      account menu beside workspace/settings/billing/safety.
- [x] Shared contract kept — `coreNavLinks` is untouched: the P3
      bottom tab bar still gets the core four, and the mobile drawer
      re-adds the icon-only pair so no destination is desktop-only.
- [x] Sign-out — `variant="outline"` → ghost (still labeled, still
      revokes the session server-side).
- [x] Sticky — `sticky top-0 z-40`: nothing else in the app sticks
      (grep-verified); Radix menus/dialogs render at z-50+, the
      account menu content already declares z-50.
- [x] Guard — E2E `appbar.spec.ts`: sticky position, dashboard +
      opportunities visible, applications not, both icon aria-labels.

**Gates (2026-10-02):** validated together with P15 in one run —
`npm run validate` **exit 0** (406 tests / 37 files, 263 routes, API
264/264) → probe **153/153** + P1 **27/27** + P2 gates **ALL PASS** →
`npm run test:e2e` **19/19 (10 files)** (+`org-profile.spec.ts`, +`appbar.spec.ts`).

## P15 — Organization profile trust & presence (2026-10-02)

The live profile listed honest facts but showed no face: no cover,
no logo (the API already published `logo` — the page muted it to a
single initial), no people. User request: images for organizations
and their members, and something that builds trust and brings
volunteers closer.

- [x] Cover band — `ORG_PUBLIC_SELECT` now ships `coverImage` (a
      presentation field; the contact-free rule still holds for
      email/phone/address/website) and the profile renders it as an
      `h-44 sm:h-56` rounded band above the header, decorative
      (`alt=""`, §7 — h1 + location carry the information).
- [x] Logo — kit `Avatar` gains optional `src`/`alt`: the image
      covers the tile, initials stay the fallback everywhere else;
      the profile header and every directory card pass `logo`.
- [x] Team preview — sidebar card listing up to 4 members **who
      opted into the public directory** (`volunteerProfile.publicProfile`,
      ACTIVE membership, no soft-deleted user — the filters live in
      the select's relation args, so an unconsented roster cannot
      leave the query), each with tile + name + role label, and a
      `+N` chip derived from the same `_count.members` the StatGrid
      shows (≤ total — one source of truth).
- [x] i18n — `organizations.teamTitle` + `organizations.memberRoles`
      (5 roles) in all four dictionaries (roles mirror the existing
      `billing.memberRoles` wording).
- [x] Demo data — seed gives atlas-verts a CC0 cover photo and an
      original SVG mark (`public/photos/logo-atlas-verts.svg`) and
      seats the opted-in demo volunteer as an ACTIVE STAFF member;
      the live DB got the same state through an idempotent
      `prisma db execute` (NULL-fill update + conflict-ignore insert).
- [x] Guards — kit unit test for `Avatar src` (+1 → 406 tests) and
      E2E `org-profile.spec.ts` (cover, logo, opted-in team on the
      detail; logo on the directory card).

**Gates (2026-10-02):** validated together with P16 in one run —
`npm run validate` **exit 0** (406 tests / 37 files, 263 routes, API
264/264) → probe **153/153** + P1 **27/27** + P2 gates **ALL PASS** →
`npm run test:e2e` **19/19 (10 files)**.

## P14 — Support cards, tab bar & the kit CSS source fix (2026-10-02)

Two live screenshots (the public support-need cards, then the console
tab bar) became the session's biggest find: the kit's own classes were
never in the shipped CSS.

- [x] Public support cards — `initiative-support.tsx` rebuilt: kit
      `Badge` "need" / "goal reached" chips above the `<h3>`, `dir="auto"`
      on every description (Latin copy was being bidi-scrambled inside
      the RTL page), figure rows as bold `tabular-nums text-sand-900`
      with the accepted-offers meta on its own muted line (financial
      needs now show it too), a hairline `mt-auto border-t pt-3` footer
      pinning the sign-in CTA / closed note to the card bottom, and
      `grid gap-4 sm:grid-cols-2` instead of one tall column. Volunteer
      slot cards harmonized to the same figure typography.
- [x] Console need descriptions — the same `dir="auto"` fix in
      `initiative-console.tsx`.
- [x] Kit tab bar redesign — `packages/ui/src/tabs.tsx`: bordered
      `sand-100` track (`flex gap-1 overflow-x-auto rounded-xl p-1`,
      one scroll row, no wrap), `h-11 shrink-0 rounded-lg px-4`
      triggers, active = `bg-brand-600 text-white shadow-sm` (the same
      green as primary buttons — `brand-700` is banned in app source),
      inactive hover `bg-white` + `hover:text-sand-900`. API and roles
      unchanged; tests keep asserting aria only.
- [x] **Root-cause fix** — Tailwind v4's automatic source detection
      never scanned `packages/ui` (nothing for it to climb to a repo
      root from `apps/web`), so kit-unique utilities were silently
      absent from the built CSS: the login submit rendered
      white-on-white and `data-[state=active]` had zero bytes in the
      bundle. `apps/web/src/app/globals.css` now declares
      `@source '../../../../packages/ui/src';` with a why-comment.
- [x] Regression guard — permanent E2E
      `tests/e2e/console-tabs.spec.ts`: opens the console, clicks a
      tab, asserts **computed** backgrounds (active non-transparent,
      inactive transparent) so an emission miss fails CI, not users.

**Gates (2026-10-02):** `npm run validate` **exit 0** (405 tests / 37
files) → probe **153/153** + P1 **27/27** + P2 gates **ALL PASS** →
`npm run test:e2e` **16/16 (8 files)** (+`console-tabs.spec.ts`). Live
CSS re-verified post-rebuild: `bg-brand-700`, `state=active`,
`translate-y-px` all present — served bundle 66,738 bytes (+2,906 vs
the stale one).

## P13 — Organization pages presentation pass (2026-10-02)

The organization surfaces now present the tenant instead of merely
listing it: the public profile was rebuilt from the header down, and
the directory cards finally lead somewhere. (The `ORG_PUBLIC_SELECT`
projection stays deliberately contact-free — no email/phone/address;
enrichment comes only from data the API already publishes.)

- [x] Profile detail — `/organizations/[slug]`: mirrored back link to
      the directory, kit `Badge` type/verified chips over an
      `Avatar`+h1+location header, a hairline `StatGrid` band
      (members · opportunities · campaigns — the campaign figure is
      the GET /campaigns `organizationId` total), and a facts sidebar
      (type, trust level, verified since, profile since + honest
      "not verified" note when applicable).
- [x] Opportunities grid — the shared `InitiativeCard` in a 2-up grid
      through a new `showOrganization={false}` prop (the byline is
      redundant on the organization's own page; landing/discover keep
      the default), fetch limit 3 → 4, catch → empty like every other
      enrichment.
- [x] Campaigns rail — public rows only (DRAFT never leaves the API):
      `StatusBadge` + start date, title links `/campaigns/[slug]`,
      participants and volunteer-target figures, "See all campaigns"
      → `/campaigns`, honest empty state.
- [x] Directory links — cards link to their profile (`h2 > Link` +
      `transition hover:border-brand-200 hover:shadow-md`); the
      directory had been a dead end before this pass.
- [x] i18n — six new keys in all four dictionaries (types/en/fr/ar):
      `organizations.allOrganizations`, `organizations.campaigns`,
      `organizations.noCampaigns`, `organizations.viewCampaigns`,
      `organizations.profileSince`, `organizations.unverifiedNote`.
- [x] Data hygiene — a stray user-made PUBLISHED opportunity
      (`slug=test`, org `nexvo`, created via the UI on 2026-10-01, no
      wilaya/city → null coordinates) failed the probe's `mode=map`
      coords check; demoted to DRAFT via `prisma db execute` (record
      preserved, public surfaces clean, gate untouched).

**Gates (2026-10-02):** `npm run validate` **exit 0** (405 tests /
37 files — the +2 vs earlier stamps are P12's two help-page entries in
`private-noindex.test.ts`, which post-date the 403 figure those stamps
recorded — 263 routes, API 264/264, Turbopack build) → fresh
`next start` on :3002 → probe **153/153** + P1 **27/27** → P2 gates
**ALL PASS** → `npm run test:e2e` **15/15 (7 files)**.

## P12 — Missing pages & existing pages pass (2026-10-01)

Completed the public surfaces that were still missing — the CMS had
handlers but nothing rendered them publicly — and deepened the auth
and verify flows. (The earlier "missing" list shrank under audit:
achievements, CSR programs and `/public/verify` already existed; the
reads that said otherwise were PowerShell `[locale]` wildcard
artifacts.)

- [x] Help centre — `help/page.tsx` + `help/[slug]/page.tsx`: PUBLISHED
      content pages only (drafts/archived 404 exactly like missing
      ones), trilingual title/body selection, paragraph rendering from
      the admin textarea (blank lines split blocks, a block's first
      line leads), type `Badge` + updated date, kit `EmptyState`,
      `notFound()` on NOT_FOUND/VALIDATION, metadata from
      `seoDescription`. Footer "Help" link in the Account column;
      sitemap `+1` → **19 paths / 57 entries** (`sitemap.test.ts` +
      `private-noindex.test.ts` updated for the two new public pages).
- [x] Seed rows — 3 PUBLISHED articles (faq, getting-started, about —
      full en/fr/ar bodies + `seoDescription`), 1 active announcement
      ("Verification takes seconds"), and 5 featured placements through
      an idempotent `ensurePlacement` helper (unique on
      `@@unique([section,targetType,targetId])`); `npm run db:seed`
      stays re-runnable and prints `demo data ready`.
- [x] Announcement banner — shared `AnnouncementBanner` on the landing
      hero and the dashboard: pinned row via GET /home, fallback
      GET /announcements limit 1, SSR-visible then hidden post-mount
      once `bladna:announcement:<id>` says dismissed; all CMS fetches
      catch → empty/null so an outage degrades to the locked copy,
      never a 500.
- [x] Featured rails — landing `HOME_FEATURED_*`/`HOME_CAMPAIGNS` band
      after the initiatives section, and a discover
      `DISCOVER_FEATURED` pill strip (`featured-strip` testid); items
      link to their public pages, sponsored placements say so, an empty
      placement set renders no band.
- [x] Hero override honored — the landing hero reads an admin
      `HomeContent` row when one exists (title/subtitle/CTA support) and
      falls back to the locked copy byte-identically otherwise (no seed
      row → probes stay green).
- [x] Verify hub — the three kinds become explainer cards (title +
      hint + mirrored chevron), plus a numbered how-it-works strip and a
      link to `/help/faq`, while the `verify-code` testid, the "Check"
      button and the `Verify a record` heading stay untouched for E2E;
      the certificate/volunteer/organization subpages gain the
      PageHeader eyebrow + mirrored back chevron above their existing
      headings.
- [x] Password reveal — kit `Input` gains an optional `trailing` slot
      (relative wrapper, auto `pe-10`, `grid size-10` toggle so G6
      holds); new shared `PasswordInput` wired into login, register
      (password + confirm) and the reset form (new + confirm) with
      `aria-pressed` toggles and `auth.showPassword`/`hidePassword` in
      all four dictionaries.

**Gates (2026-10-01):** `npm run validate` **exit 0** ×2 (403 tests /
37 files, 263 routes, API 264/264, Turbopack build) → fresh
`next start` on :3002 → probe **153/153** + P1 **27/27** → P2 gates
**ALL PASS** → `npm run test:e2e` **15/15 (7 files)**.

## P11 — Imagery & atlas map pass (2026-10-01)

The imagery brief shipped in both directions it allowed — original SVG
art where identity is made, CC0/Public-Domain photographs where
atmosphere adds warmth — plus the queued `/map` page overhaul into a
designed atlas surface.

- [x] Original `hero-art.tsx` SVG — a layered Algerian landscape (sky
      gradient, sun, dunes, mountains, palm grove, kudu) rendered
      `aria-hidden` behind the landing hero and echoed on the final CTA;
      the gradient headline and every probe-locked hero string stayed
      byte-identical (sun placed so EN and AR copy never collide).
- [x] How-works restructure — the three steps read as a path, number
      badges bumped `size-9 → size-10` so G6's `grid size-9` ban holds,
      and the photo band carries the atmosphere.
- [x] Card covers — `InitiativeCard` renders `coverImage` (record photo →
      theme photo → no cover), wired through `LIST_SELECT`, the discover
      DTO and the seed; **13 CC0/PD photos** in `apps/web/public/photos/`
      (Openverse, `license=cc0|pdm` only) with `design-refs/PHOTO-CREDITS.md` + `photo-picks.json` recording source/author/license per file.
      Photos are decorative (`alt=""`), thematic — never presented as
      documentary imagery (§7 honesty).
- [x] Map page header — `PageHeader` pattern with the new `mapEyebrow`
      key (en/fr/ar), live coverage stats (distinct `wilayaId`s counted
      via `formatNumber`) and the mirrored back chevron (`rtl:rotate-180`).
- [x] Atlas canvas finish — jade land tint shared between the SSR poster
      and the Leaflet overlay (`LAND_FILL`/`LAND_STROKE` — they can never
      drift), `bg-gradient-to-b from-sand-50 to-sand-100` ground, and a
      decorative compass rose (clay north point via `--color-clay-500`,
      `aria-hidden`) parked in the frame's letterbox margin.
- [x] Proximity clustering — `groupByProximity` folds pins within 30
      screen-space px into a `size-10 bg-brand-800 ring-2 ring-white`
      badge (sr-only count label); click/Enter/Space zooms until the pins
      split (`fitBounds` with padding, else `zoomIn()`), re-clustering on
      every `zoomend`/`moveend` via a view tick. Cluster markers set
      `autoPanOnFocus: false`: Leaflet's default focus-pan fires a
      delayed `moveend` mid-click that rebuilds the marker layer between
      mousedown and mouseup and swallows the click (root-caused from a
      dead cluster click down to `Marker._panOnFocus`).
- [x] Side list enrichment — `MAP_SELECT` carries `startDate`, `wilaya`
      and `city`; rows render title + type `Badge` + MapPin location +
      Calendar date within `max-h-[26rem] lg:max-h-[34rem]`, and
      hovering/focusing a row lights its pin or cluster
      (`.bladna-pin.is-hot` / `.bladna-cluster.is-hot`) while a pin's
      `mouseover` scrolls the matching row into view.
- [x] Results chip — permanent count at the top-left (total while
      browsing; in-view + `of` after "search this area", `map-in-view`
      testid retained), the search-area button sits directly beneath it,
      and the error alert keeps the bottom-left corner.

**Gates (2026-10-01):** `npm run validate` **exit 0** ×2 (format
convergence; 403 tests / 37 files, 263 routes, API 264/264, Turbopack
build) → fresh `next start` on :3002 → probe **153/153** + P1 **27/27**
→ P2 gates **ALL PASS** (G6 green after the `size-10` badge) →
`npm run test:e2e` **15/15 (7 files)**.

## P10 — Reference-driven Hero & dashboard pass (2026-09-30)

Analyzed 14 curated Dribbble references (`design-refs/dribbble/` — 8
charity/nonprofit landing pages, 6 admin dashboards; every shot read as an
image and compared line-by-line against `page.tsx`, `dashboard/page.tsx` and
`stat-grid.tsx`), then shipped the decisions that survived the system's
constraints — display-only changes with copy and gate-locked strings untouched.

- [x] D1 hero display scale — `text-5xl md:text-7xl` + `max-w-4xl` +
      direction-neutral `leading-[1.12]` (reference headlines run ~1.5–2× ours).
- [x] D2 headline moment — white→`brand-200` gradient text (no copy split, so
      no DOM/copy contract risk) + aria-hidden clay rule under the headline.
- [x] D3 pill geometry on marketing surfaces — hero search bar, both hero CTAs
      and the final-CTA bookend go `rounded-full`; the kit/controls keep the
      P9 8px tier (N2 recorded — the system decides shared geometry).
- [x] D4 hero fold exit — the trust strip gains a hairline close, written as
      `border-t border-white/15 pt-6` on one line, plus a decorative scroll
      cue (rotated arrow, `aria-hidden`).
- [x] D5 impact stats band — the section rides `bg-sand-100/60`, figures scale
      to `text-5xl`, a clay rule sits under each number; values still come
      from GET /impact (display only — the honesty rule is untouched).
- [x] D6 live date under the dashboard greeting — the clock call is written
      as `formatDate(new Date(), locale)` on one line (honest request clock;
      page is `force-dynamic`).
- [x] D7 StatGrid KPI treatment — solid `bg-brand-800 text-white` icon chip
      (G1 keeps `bg-brand-700` kit-only), `text-3xl` figures, and the honest
      `hint` slot activated on the applications cell (`{n} statOpenHint`, new
      i18n key in `types`/`en`/`fr`/`ar`); the workspace inherits it too.
- [x] D8 two-zone dashboard — `max-w-6xl` + `grid gap-8 lg:grid-cols-3`: work
      column (matching, applications, support offers) + rail (orgs, admin,
      quick links at `lg:grid-cols-2`, international strip — its probe-locked
      `border-sand-100 bg-sand-50 px-4 py-3` classes byte-identical).
- [x] Recorded non-goals: N1 charts (no real time-series — RESEARCH C1), N2
      kit-wide pills (P9 control tier holds), N3 photo-masked headlines (no
      photo library), N4 tinted dashboard ground (`sand-50` already is warm).

**Gates (2026-09-30):** `npm run validate` **exit 0** ×1 (403 tests / 37
files, 263 routes, API 264/264, Turbopack build) → fresh `next start` (the
orphaned P9 server holding :3002 was killed first, so probes ran against the
P10 build) → probe **153/153** + P1 **27/27** → P2 gates **ALL PASS** →
`npm run test:e2e` **15/15 (7 files)**.

## P9 — "Oasis Modern" visual retheme (2026-09-30)

Full visual retheme delivered **at the token and kit layers**, so every page in
the product improves through the shared system (kit + chrome) plus deep passes
on the five flagship surfaces (landing, discover, dashboard, initiative detail,
workspace). New palette, new type direction, a card elevation/radius system and
DESIGN.md rewritten — with class names, copy and selectors kept **byte-stable**
so the probe/P1/P2/E2E contracts survived by construction (only values, fonts
and radius changed).

- [x] Tokens (`globals.css`, `@theme static`) — deep jade `brand` ramp (50–900;
      700 `#18664a` = 6.9:1 on white, 600 = 5.0:1, white on 800 = 9.2:1); warmed
      `sand` ramp incl. the new `950` ink (500 `#746c5d` = 4.7:1 **on the page
      bg**, not just on white; 400 `#9b9282` = 3.1:1 for UI); new decorative
      `clay` terracotta ramp (text = clay-700+ ≥6.7:1; never semantic — status
      stays sky/amber/red); semantic aliases `--color-bg/surface/fg/muted/border`
      ship as the recorded dark-mode prerequisite (dark still deferred)
- [x] Typography — IBM Plex Sans Arabic (300–700) via `next/font/google`
      (`--font-plex` → `--font-sans`, arabic+latin subsets, `display: swap`,
      system + Noto Sans Arabic fallbacks): one family for Latin and Arabic, no
      pairing drift; AR base-size/line-height rules untouched
- [x] Kit upgrades (system-wide) — `Card` → `rounded-card` (14px) +
      `shadow-card` elevation token; `Alert`/`EmptyState`/tab container → panel
      tier 12px; dialogs → `rounded-2xl`; kit buttons **keep** the 8px control
      tier (the 100+ raw controls already use it — the kit follows the system)
      and gain `shadow-sm` + `motion-safe:hover:-translate-y-px`; focus ring and
      selection follow the new ramp; the one kit test encoding the old card
      radius re-aligned (`rounded-card` + `shadow-card`)
- [x] Chrome — the footer becomes the one deep-ink surface (`bg-sand-950`,
      headings `text-sand-100`, links `text-sand-300` hover `text-brand-300`,
      bottom bar `text-sand-400`, all pairs ≥6.4:1); header inherits the ramps
- [x] Flagship five deep passes — landing (hero gradient
      `from-brand-900 via-brand-800 to-brand-700`, jade+clay glow hexes,
      `text-5xl md:text-6xl` display h1, guarded pillar lift, clay step marks,
      `text-4xl` stats, shared cards on the new elevation); dashboard (bento
      tiles gain the `shadow-sm` + guarded lift; §58 international bar still
      byte-identical for the probe + G3 four-hit contract); discover (result
      cards on `rounded-card`/`shadow-card` + hover elevation); initiative
      detail and workspace inherit through kit + tokens (their raw controls
      were already at the matching 8px tier)
- [x] Brand outside CSS — email templates (CTA `#18664a`, shell warm neutrals,
      12px CTA radius) and the PDF card header (`#0f4030`)
- [x] DESIGN.md rewritten — §3 one-family typography (Plex; display exception
      now `text-5xl md:text-6xl`), §5 radius hierarchy + card-level cue +
      button motion + ink footer, §10 P9 decision with the dark-mode note
      updated (aliases shipped), new **§11 color system** (ramps, roles,
      contrast proofs, clay rules, email/PDF coupling)
- [x] Gates re-verified **without re-locking** — probe **153/153** · P1
      **27/27** · P2 **ALL PASS** (G3 exact-4 incl. the dashboard intl bar) ·
      E2E **15/15 (7 files)**; `validate` **exit 0** (403 tests / 37 files,
      263 routes, API 264/264)

## P8 — Signed-in surfaces redesign (2026-09-30)

Competition-grade rebuild of all four authenticated surfaces — participant
dashboard, organization workspace console, initiative detail page and a deeper
discover pass — _within_ the existing system: same tokens, same kit, same
honesty rules; no retheme, no new pages, no concept change.

- [x] Participant dashboard — eyebrow greeting header; the four stats moved
      onto the shared hairline `StatGrid` (icon chips, `tabular-nums`, honest
      `—` fallback preserved); `SectionHeading` rhythm + kit `Badge` counts
      and kit `EmptyState` empties with actionable microcopy on applications /
      support offers / organizations; icon-led quick-link bento (all locked
      hrefs unchanged, incl. `href="/en/saved"`); every `→` literal replaced
      by RTL-mirrored lucide arrows; the spec §58 international bar kept
      byte-identical (`border-sand-100 bg-sand-50 px-4 py-3` — probe and G3's
      four-hit count both depend on it)
- [x] Workspace console — header gains the verification kit `Badge` + mirrored
      dashboard arrow; overview analytics render through `StatGrid`;
      certificate counts become state-toned kit `Badge`s (VALID→success,
      REVOKED→danger, EXPIRED→warning) with the honest `rangeAll` note kept;
      the applications results header becomes `SectionHeading` (reusing
      `opportunityColumn` as the eyebrow) + kit `EmptyState`; review rows gain
      a decorative avatar + row hover — `#opp`/`#status` selects, li-row
      structure, Accept/Reject copy, confirm dialog and toast untouched
- [x] Initiative detail — localized section eyebrows (`opportunity.eyebrows.*`)
      drive `SectionHeading`; type/verified/category pills → kit `Badge`;
      facts `dl` rebuilt with per-field icons, hairline dividers and
      `tabular-nums`; mirrored back chevron; `needsEmpty` → kit `EmptyState`;
      sidebar stages in with `.rise`; ApplyForm/SaveButton contracts untouched
- [x] Discover deeper pass — `aria-live="polite"` on the localized results
      count, `SearchIcon` empty state, `.rise` results grid; `#q`,
      `filter-tray`, `filter-chips`, button "Search" and the aria-label
      remove-filter prefix contract untouched
- [x] New shared `stat-grid.tsx` (`<dl>` semantics, optional icon/hint slots) + 10 new lucide wrappers; new i18n keys ×4 files (identical key sets,
      zero literal copy); empathetic empty-state copy rewritten in en/fr/ar;
      `.rise` declared only inside `prefers-reduced-motion: no-preference`
      (minified bundle spelling verified over HTTP)
- [x] `docs/DESIGN.md` intentionally unchanged — upgrade within the system

**Gates (2026-09-30):** `prettier` → `typecheck` → `lint` → 403 tests → one
`npm run validate` **exit 0** (263 routes, API 264/264, Turbopack build) →
restart → probes **153/153** + P1 **27/27** → P2 gates **ALL PASS** →
`npm run test:e2e` **15/15 (7 files)**.

## P7 — Landing & discover redesign (2026-09-30)

Premium upgrade of the two acquisition surfaces (landing + `/opportunities`)
_within_ the existing system: same tokens, same kit, same honesty rules — no
retheme, no new pages, no concept change.

- [x] Hero — verifiability badge, new bilingual headline (AR «اكتشف، ساهم،
      ووثّق أثرك» / EN "Discover, contribute, and prove your impact"), one
      white search bar (`role="search"`, kit outline submit per DESIGN's
      filter-submit rule) with quick chips keeping their locked hrefs
      (`?needs=VOLUNTEERS`, `?needs=ANY`, `?thisWeek=1` — each exactly once)
- [x] Landing sections — `SectionHeading` (eyebrow + h2 + action) drives the
      discover rail (shared `InitiativeCard`, `titleAs="h3"`), the bento
      pillar grid (identity cell `sm:col-span-2`) and the impact block;
      stats render as one `gap-px` hairline panel with the `statsNote`
      demo-data qualifier intact
- [x] New shared components — `section-heading.tsx` +
      `initiative-card.tsx` (server-safe, kit `Badge` meta footer with
      `mt-auto`, `showApplicants`, `titleAs` h2|h3 for heading-hierarchy
      correctness); the discovery page reuses the same card for results
- [x] Discovery page — eyebrow header + localized `resultsCount`
      (`en` "Results: {count}" · `fr` "Résultats : {count}" · `ar`), honest
      `noResultsHint` empty state, mirrored prev/next chevrons
      (`rtl:rotate-180`), filter-tray/chips polish with the E2E selector
      contract untouched (`#q`, `filter-tray`, `filter-chips`, button
      "Search", `aria-label` remove-filter prefix)
- [x] Icons — `Search`, `MapPin`, `CalendarDays`, `Users`, `Handshake`,
      `ArrowRight`, `ChevronLeft/Right`, `SlidersHorizontal` added to the kit
      wrapper `icons.tsx`; `→` literals removed from both pages (RTL mirror
      via `rtl:rotate-180`, directional icons per DESIGN §6)
- [x] i18n — `landing.discoverTitle/discoverBody`, `landing.eyebrows.*`,
      `landing.emptyRail`, `landing.howHints`, `opportunity.listEyebrow`,
      `resultsCount`, `noResultsHint` added to `types.ts` + `en` + `fr` +
      `ar` (identical key sets, zero literal copy in components)
- [x] Motion & RTL — `.hero-rise` exists only inside
      `@media (prefers-reduced-motion: no-preference)` (verified in the
      shipped CSS bundle); logical props only, no letter-spacing on Arabic
      (`rtl:tracking-normal` on headings); the shipped bundle carries
      `html[lang='ar'] body { font-size: 1.0625rem; line-height: 1.75 }`.
- [x] `docs/DESIGN.md` intentionally unchanged — the pattern guide already
      covers every rule this redesign leans on (upgrade within the system)

**Gates (2026-09-30):** `prettier` → `typecheck` → `lint` → 403 tests →
one `npm run validate` **exit 0** (263 routes, API 264/264, Turbopack
build) → restart → probes **153/153** + P1 **27/27** → P2 gates
**ALL PASS** → `npm run test:e2e` **15/15 (7 files)**.

## P6 — Standard libraries (2026-09-30)

Replace hand-rolled custom code with established global libraries — additive
only: no deletions, no concept change, no visual redesign.

- [x] Icons — `lucide-react` installed behind the existing kit wrappers
      (`ui/components/icons.tsx` re-exports keep every call site stable;
      name + size stay pinned so DESIGN's icon rules hold)
- [x] Toasts — `sonner` `<Toaster>` in the root layout; the three ad-hoc
      toast surfaces (initiative share buttons, demo-access card,
      workspace attendance check-in) migrated; live-region semantics come
      from the library
- [x] Confirm — Radix `AlertDialog` behind the kit
      `ConfirmProvider`/`useConfirm` (`alertdialog` role, focus trap,
      Escape = cancel, `aria-describedby` pinned to the message); all 14
      `window.confirm` call sites migrated + the `common.confirm` i18n
      key; new `confirm.test.tsx` 7/7
- [x] Prompt — Radix `Dialog` behind kit `usePrompt` (single field,
      `defaultValue`, cancel/Escape → `null`); all 5 `window.prompt`
      sites migrated; repo grep `window.confirm|window.prompt` = **0**
- [x] Account menu — Radix `DropdownMenu` replaces the hand-rolled
      disclosure (roving focus + typeahead, Escape/outside-click returns
      focus to the trigger, `align` direction-aware for RTL, portal is
      never clipped by the header)
- [x] Tabs — kit `tabs.tsx` rebuilt on Radix Tabs behind the unchanged
      `TabsRoot`/`Tabs`/`TabPanel` call shape (admin deep-link, `?tab=`
      revalidation, back-button and G9 `<Tabs` greps intact);
      `tabs.test.tsx` rewritten for Radix's event model (7/7)
- [x] i18n — `next-intl` wired minimally over the existing dictionaries:
      `src/ui/i18n/request.ts` resolves the `x-locale` header through the
      same `getDictionary` (single resolver, no dictionary duplication),
      `withNextIntl(...)` wraps `next.config.ts`, `NextIntlClientProvider`
      in the root layout passes a payload-conscious **subset**
      (`common` + `errors`) + `timeZone="Africa/Algiers"`; migrated slice
      (root layout meta/common, both `not-found` files, `[locale]/error`)
      uses `getTranslations`/`useTranslations` — the other client files
      keep the typed `getDictionary`
- [x] Map engine — Leaflet replaces the hand-rolled projector/drag/zoom in
      `initiative-map.tsx`: dynamic `import('leaflet')` inside the effect
      (never on the server), the same unit-frame OSM/ODbL paths as an
      `svgOverlay` (evenodd keeps the 69 rings' holes), `divIcon` pins,
      `maxBounds` = the old clamp, `scrollWheelZoom: false`, animations
      off (instant + reduced-motion friendly); **no tile layer** — the
      P3/H5 bundled-base-geography decision, ODbL attribution and CSP stay
      untouched; the server still renders the static poster of outline +
      pins in the exact `fitBounds` frame (`zoomSnap: 0`), so the probe
      contract, no-JS links and hydration are pixel-stable; zoom floor =
      full view, ceiling = floor + 7 octaves (the documented 1–8 range),
      and the full view refits on window resize
- [~] Not adopted (already standard or wrong fit): `cn()` is already
  clsx + tailwind-merge; forms already use react-hook-form + zod; no
  full component kit (Radix primitives only, styled by the kit) and
  no hosted map SDK/tiles (offline ODbL decision stands)

**Gates (2026-09-30):** `prettier` → `typecheck` → `lint` → 403 tests →
one `npm run validate` **exit 0** (263 routes, API 264/264, Turbopack
build) → restart → probes **153/153** + P1 **27/27** → P2 gates
**ALL PASS** → `npm run test:e2e` **15/15 (7 files)**.

## Cross-cutting

- [x] Notifications (in-app + queue + email abstraction, preferences, consent-gated marketing)
- [x] Messaging (conversations, members, messages, unread counts, pagination, block/report)
- [x] Analytics events (privacy-aware)
- [x] Feature flags + demo mode indicator
- [x] Settings / billing (plans, subscriptions, invoices, payments abstraction — bank transfer & manual only, no invented gateway) — **`/settings` UI page shipped** (profile, password, TOTP enrollment, sessions, privacy toggles, notification-preferences matrix, sign-out) and **`/billing` UI page shipped** (org selector honoring `?org=`, subscription + two-step cancel, plans grid priced from data, invoices with status filter + line-item expansion, payments ledger with an honest record-payment step showing bank-transfer instructions and the PENDING state — no checkout is simulated)
- [x] Public verification — `GET /public/verify` (unified lookup) + `/verify` with nav chips **and** the SEO sub-routes `/verify/{certificate,volunteer,organization}` — thin pages sharing one `VerifyClient` (the `kind` prop scopes label/hint/placeholder copy only; lookup stays unified), each with metadata, the kind-specific hint, and an "All code types" back-link
- [x] SEO: metadata/OG/canonical + **root `/robots.txt` and `/sitemap.xml`** (39 URLs = 3 locales × 13 static paths, fs-pinned by `sitemap.test.ts`); `noindex` now on **every authenticated page** (`/dashboard`, `/settings`, `/safety`, `/messages`, `/billing`, `/admin`) **and the transient auth-flow pages** (`/mfa`, `/forgot-password`, `/reset-password`, `/verify-email`) — public acquisition/content pages stay indexable; policy pinned by `src/app/private-noindex.test.ts` (46 source-scan assertions: 28 private + 17 public + 1 exhaustiveness check that every `page.tsx` on disk is classified — the private set now includes `applications`, `notifications`, `profile`, `check-in`, `invitations/accept`, `workspace` + all 10 org tabs, `sponsor`) and live-probed on the DB-free pages and, this increment, over HTTP both anonymous and authenticated
- [x] Endpoint reference kept honest — `npm run check` live: **258 module routes (core 56, platform 137, participants 65) + inline `/meta` = 259 registered, `docs/API.md` documents 259/259, 0 drift** (2026-09-25)
- [x] Formatting enforced — `npm run format:check` passes repo-wide (123 pre-existing files reformatted)
- [x] Lightweight CMS: content pages/FAQ/announcements/featured placements — **admin UI shipped** as the `/admin` **Content** section (`admin-content.tsx`: Pages / Announcements / Featured / Home sub-views over the 14 CMS endpoints — trilingual page+announcement editors with status/type filters, two-step deletes, featured-placement create/filter/delete, home-singleton load→upsert)
- [x] Admin dashboard (users, orgs, **sponsors**, opportunities, **international**, verification, reports, risk, audit, **content**, settings, feature flags, **exports**, **billing**) with filters/pagination — **`/admin` UI page shipped**: **fourteen** role-gated sections computed server-side from real roles (`adminSectionsFor` — canonical order, section granted on `anyOf`: `content`→`content.manage`, `international`→`opportunity.read:platform` with writes display-gated on `content.manage`, `sponsors`→`sponsor.read:platform` with writes on `sponsor.manage`), `?tab=` revalidated against the grant on every load, staff without TOTP get an honest enable-2FA notice, action buttons display-gated via `permissionsForSystemRoles` while every write re-checks its own permission server-side (verification queue/evidence/decide, risk queue/signals/incidents, settings JSON editor with two-step delete, feature-flag toggle, CMS editors, international offer create/edit, sponsor create/edit + status state machine with reason-required SUSPEND)
- [~] Accessibility: labels, focus, semantic landmarks, keyboard nav, RTL applied to the 19 existing pages — not formally audited
- [x] **BLADNA INTERNATIONAL extension (2026-09-24)** — additive migration `0007_international_gapfill`; deterministic eligibility engine (age bounds vs DOB, free-text requirements → UNKNOWN, deadline/duplicate gates, passport informational only); application lifecycle + withdraw with a strict transition machine; passport readiness/preferences/honest stats; countries + providers + category filters; recommendations with transparent machine reasons; admin verification actions with append-only history, applications queue, experience verification; public pages `/international/{countries,countries/[code],providers,safety,apply/[id]}`; private `/international/{applications,passport}` (`noindex`, session-gated) + dashboard section; admin international sub-panels; flags `INTERNATIONAL_{APPLICATIONS,PASSPORT,SAFETY,MATCHING}` on, `INTERNATIONAL_{INGESTION,PARTNERS}` off; sitemap (48 URLs), robots and noindex pins re-cut; i18n keys added across ar/fr/en — **validate exit 0: 303 tests, 244/245 routes-vs-docs, probes 170/170**
- [ ] INTERNATIONAL deferred scope: partner/verified-partner system, provider accounts & workspace, source-ingestion adapters + refresh scheduler, deadline-reminder jobs (BullMQ infra exists in `server/infra/queue.ts` but is not wired to deadlines), traveler stories, CMS-backed guide content, opportunity map, achievements, skills-verified levels, language proficiency levels, mobile app binary
- [ ] Load/performance profiling against a live database

## Known gaps (verified from source, 2026-09-24)

1. **No payment webhooks**; `PAYMENT` risk signals → `NOT_IMPLEMENTED`.
2. **AI beyond the document field-check assist** (`POST /admin/verifications/:id/check`, local rules, audited) — no OCR, and no classification/moderation/risk providers are wired; cloud document reading answers `NOT_IMPLEMENTED`.
3. **No endpoint enumerates a user's sponsor workspaces** — the sponsor console opens via `?id=` or directly after registration; a member who visits `/sponsor` bare sees the register state (a picker would need a memberships endpoint that does not exist).
4. **Admin billing lists carry `organizationId` (UUID) only** — the payments/invoices/subscriptions responses join no organization name, and `INVOICE_SELECT` carries no `currency`, so those columns render the raw id/number rather than invented labels.
5. **No donor-side contribution history** — `POST …/contributions/:cid/cancel` works with the id returned by `create`, but no endpoint lists the caller's own contributions (documented in `docs/API.md`); the org ledger is the only listing surface. There is likewise **no admin contributions UI** (org-only by design) and **no seeded sponsor demo account**, so sponsorship `IN_KIND` is covered by unit tests rather than a live probe.

**Known limitation (not a numbered gap):** notification **email is the only enforced outbound channel** — in-app always reaches the inbox, push/SMS have no provider, and the `/settings` matrix states this honestly (EMAIL column interactive, in-app static ✓, push/SMS marked unavailable).

**Closed to date:** documents pipeline dead end, former gap 6's upload-types clause (now enforced at the upload boundary), AI adapter reachability (`checkDocument` imported by `modules/verification.ts`), **organization + sponsor self-registration** (`POST /organizations` → creator `OWNER` in `PENDING_VERIFICATION`; `POST /sponsors` → registrant `SPONSOR_ADMIN` in `PENDING`; both with verified-email gate, shared §54 consent bar, `PrivacyConsent` ledger, audit rows), and **certificate PDF + volunteer card + CV endpoint** (this increment — former gap 1: `GET /certificates/:certificateId/pdf`, `POST`/`GET /me/card`, `GET /me/card/pdf`, `GET /me/cv`; note the old wording "no `cardNumber` field" was wrong — the `VolunteerCard` model always existed, the endpoints did not), and **site-wide security headers** (latest increment — `src/proxy.ts` applies a nonce CSP, an API lockdown policy, and HSTS/nosniff/frame/referrer/permissions headers to every response, verified live), and **user console pages + `noindex`** (previous increment — `/settings`, `/safety`, `/messages`, shared `pageSession` gate, signed-in nav with sign-out, `noindex` on the private/transient pages; gap 4 narrowed to `/admin` + `/billing`), and **`/admin` + `/billing` UI pages and the notification matrix** (this increment — `/billing` with org selector/subscription/plans/invoices/payments ledger, `/admin` with nine role-gated tabs and server-revalidated `?tab=`, plus the `/settings` matrix for `/me/notification-preferences`; **gap 4 fully closed** — 19 pages, `noindex` on all 10 private pages, 170/170 tests
at that increment), and **CV PDF rendering + per-field privacy flags** (latest increment — `GET /me/cv/pdf` renders the shared CV aggregate as a localized A4 PDF (ar/fr/en full renders + sparse-profile render unit-tested); migration `0006_volunteer_privacy` adds the three visibility columns, `PATCH /me/privacy` now stores all six keys (**501 removed**), `showWilaya` gates directory location and `?wilayaId` filter membership, `showHours` gates the public-verify volunteer hours (`null` → row hidden client-side); `showCertificates` stored with no public listing surface — certificate reads stay credential-keyed by design; **former gaps 1+2 fully closed** — 170 passed + 3 DB-gated skipped at that increment), and **verify sub-routes, the three API-only admin sections, the CSRF origin fix, five new test suites and the ops docs** (this increment — `/verify/{certificate,volunteer,organization}` exist as thin SEO pages sharing one `VerifyClient` (unified `GET /public/verify` lookup) with sitemap now **39 URLs** fs-pinned by `sitemap.test.ts`; `/admin` gains **Content / International / Sponsors** sections over the existing CMS/international/sponsor endpoints (12 sections total in canonical order, `admin-access.test.ts` re-pinned to the real RBAC matrix, SUSPEND reason-required state machine mirrored client-side); **`assertSameOrigin` no longer self-allowlists the caller's own Origin** — a well-formed foreign-origin mutation is rejected with `FORBIDDEN "Cross-origin request rejected."` where the previous check passed it through, pinned by `http.test.ts` regression cases; new suites `router`/`http`/`guards`/`page-session`/`sitemap`; orphaned `adminMetricsQuerySchema` deleted; `docs/OPERATIONS.md` ships backup/restore + deployment; **223 passed + 3 DB-gated skipped (27 files), 228/228 docs**).

## Cannot be validated in this environment

- ~~`npm run db:seed` / local `prisma migrate deploy` / the `tests/db` assertions~~ — **all executed this session**: roles + database created on the local PostgreSQL 16 server, **6/6 migrations applied**, seed produced the demo dataset, the DB suite passes **3/3 (228 total, 0 skipped)**, and a 12-probe live suite passed against the seeded data. Migrations remain generated offline and reviewed statically; CI's service step is the only unexecuted path (no git).
- `docker build` / `docker compose up` — **no Docker**.
- CI workflow execution, commits, PRs — **no `git` binary**.
- HSTS _processing_ (needs an HTTPS origin — the header is emitted on every response and ignored over plain HTTP, by design). ~~Live browser enforcement of the new CSP~~ — **closed 2026-09-26 in P4**: `tests/e2e/security-headers.spec.ts` loads pages in real Chrome and asserts the nonce CSP header, the full static header set, that every executable `<script>` carries the response nonce, and the API lockdown policy (3/3 green).
- Live AI/payment/map provider calls — require credentials; endpoints answer `CONFIG_ERROR`/`NOT_IMPLEMENTED` rather than faking results.
