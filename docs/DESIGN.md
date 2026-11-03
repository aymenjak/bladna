# BLADNA Design Foundation

> The single source of truth for how the BLADNA interface is structured, spaced,
> typed and composed. Every page and component must conform to this document;
> code review treats deviations as defects (the same way an API deviation from
> `docs/API.md` is a defect).

Grounded in established UX practice (Nielsen Norman Group form/scan guidance,
Gestalt proximity and alignment, Material and 8pt-grid spacing systems, WCAG 2.2)
and the design-system patterns of benchmark products (Stripe, Linear, Notion).

---

## 1. Principles (in priority order)

1. **Hierarchy before decoration.** Every screen answers, in order: _What is this
   page? What matters most? What do I do next?_ Size, weight, contrast and
   spacing — not color or borders — carry the hierarchy.
2. **Consistency is the feature.** The same situation always looks and behaves
   the same (visual, functional and internal consistency). One way to do
   anything; no page-local re-inventions.
3. **Alignment and proximity do the grouping.** Related items sit close and share
   a common edge; unrelated items are separated by whitespace — never by extra
   borders/shadows "just in case".
4. **Whitespace is content.** Rhythm comes from a spacing scale, not from
   ad-hoc values. Empty space is deliberate, not leftover.
5. **Feedback is mandatory.** Every action has a loading, success and error
   state; every empty list explains _why_ it is empty and _what fills it_.
6. **Accessible by default.** Semantic landmarks, one `h1` per page, persistent
   labels, 4.5:1 text contrast, visible focus, ≥44px touch targets, full RTL
   correctness. Accessibility failures are bugs, not enhancements.
7. **Conventions over cleverness.** Users arrive with expectations from other
   global platforms; we follow them (F-pattern scanning, standard nav, standard
   form behavior) instead of inventing novel interactions.

## 2. Spacing and layout system

- **Base unit: 4px.** Every margin, padding and gap is a multiple of 4px
  (`gap-2`, `py-6`, `mt-8`…). Arbitrary values (`p-[13px]`) are forbidden.
- **Scale in daily use:** 4 / 8 / 12 / 16 / 24 / 32 / 48 / 64px
  (`1 / 2 / 3 / 4 / 6 / 8 / 12 / 16` in Tailwind units). Pick the step by
  relationship, not by eye: same-group = 8–16, between-group = 24–32,
  between-sections = 48–64.
- **Page shell (every page):**

  ```tsx
  <div className="mx-auto w-full max-w-6xl px-4 py-10 sm:px-6 lg:px-8">
    <PageHeader /> // one per page, top of the shell
    <section className="mt-8 space-y-6"> … </section>
  </div>
  ```

  - The layout owns the single `<main id="main">` landmark — pages render a
    `<div>` shell (nested `<main>` elements are invalid and forbidden).

  - `max-w-6xl` is the default content column; narrower forms/pages may use
    `max-w-2xl` (auth) or `max-w-3xl` (reading pages), never wider than 6xl.
  - Horizontal gutter: `px-4 sm:px-6 lg:px-8` — identical on all pages.
  - Page top padding `py-10`; sections separated by `mt-8` + `space-y-6`.
    (Exception: centered empty/error states may use `py-20`; landing sections
    keep their marketing rhythm.)

- **Grids:** card grids use `grid gap-6 sm:grid-cols-2 lg:grid-cols-3`
  (2-up/3-up), `gap-4` for compact lists. Equal-height cards via
  `h-full`/flex, equal-width via grid — never fixed pixel widths.
- **Wide elements** (tables, maps, consoles) may bleed to `max-w-7xl`, but their
  _header_ stays on the shared `max-w-6xl` left edge so pages keep one alignment
  line.

## 3. Typography

**One family, two scripts (P9).** `IBM Plex Sans Arabic` (weights 300–700,
loaded through `next/font` in `app/layout.tsx` as `--font-plex`, mapped to
`--font-sans`) renders Latin and Arabic in a single engineered voice — there is
no Latin/Arabic pairing drift, and Arabic inherits the same weights as Latin.
System UI + `Noto Sans Arabic` are the fallbacks (`display: swap`, content is
never invisible while the webfont arrives).

One scale, used everywhere (rem-based, inherited line-height except display):

| Role       | Classes (mobile → desktop)                                      | Use                         |
| ---------- | --------------------------------------------------------------- | --------------------------- |
| Page title | `text-3xl font-bold text-sand-900`                              | Exactly one `h1` per page   |
| Section    | `text-lg font-semibold text-sand-900`                           | `h2`, page sections         |
| Subsection | `text-base font-semibold text-sand-900`                         | `h3`, card titles           |
| Body       | `text-sm sm:text-base leading-relaxed`                          | Default text                |
| Small/meta | `text-xs sm:text-sm text-sand-500`                              | Timestamps, hints, captions |
| Eyebrow    | `text-xs font-semibold uppercase tracking-wider text-brand-700` | Pre-title label only        |

- Weights used: **400 (body), 500–600 (labels/emphasis), 700 (titles)** only;
  **300** exists for a future large display cut and is never body text.
- **Exceptions (documented):** the landing hero uses `text-5xl md:text-6xl`
  (P9 display scale); marketing sections may use `text-2xl font-bold` and the
  landing impact numbers `text-4xl` — the ladder still descends
  (hero > section > card title).
- Line length for prose: `max-w-prose` (~65–75 chars) or `max-w-2xl`.
- Arabic renders at a slightly larger base (`html[lang='ar']`) — never
  compensate per-component.
- Numbers in metrics use `tabular-nums` when columns must align.

## 4. Page anatomy (order of elements)

1. **PageHeader** — eyebrow (optional) → `h1` → one-sentence description →
   primary action (right/start edge, aligned with `h1` baseline block).
2. **Filters/chips row** (if any) — `flex flex-wrap items-center gap-2`.
3. **Content sections** — each `h2` + optional supporting line + the content
   (grid/list). Section rhythm is identical everywhere (`mt-8 space-y-6`).
4. **Empty/loading/error** states live inside the section container at the same
   position the content would occupy (no layout jump).
5. **Footer-adjacent CTA** only on marketing-style pages (home), never mixed
   into app screens.

Nav follows convention: 4–8 top-level items in the primary row (below `lg`
the hamburger takes over), low-frequency signed-in destinations live in the
Account menu (workspace, settings, billing, safety), the active item is
visibly indicated (`aria-current` + brand tint), the locale switch always
shows all three locales with the current one marked, and auth actions sit at
the end.

## 5. Components

- **Buttons — one primary per view.**
  - Primary: solid brand (`bg-brand-700`), high contrast — the page's single
    next step.
  - Secondary: outline/neutral surface.
  - Tertiary: text/link with underline on hover.
  - Destructive: red variant, always confirmed, never styled as primary.
  - Sizes are shared (`sm | md` → `h-11` (44px), `lg` → `h-12` (48px)); kit
    fields stay `h-10` (40px, the §8 floor) — rows always align.
  - Kit buttons carry `shadow-sm` (solid/outline variants) and a
    `motion-safe:hover:-translate-y-px` lift on one shared transition list —
    users who opt out of motion get color changes only.
  - **Search/filter submits are `outline`, never primary** — a filter button
    must never compete with the page's real CTA.
- **Cards:** one card-level cue per layer — a hairline `border border-sand-200`
  plus the soft `shadow-card` lift travel together (the shadow is the border's
  tint, not a second depth plane); blocks inset _inside_ a card stay flat.
  **Radius hierarchy (P9):** `rounded-lg` (8px) controls and insets (buttons,
  inputs, chips, tiles), `rounded-xl` (12px) panels (form/list shells, `Alert`,
  `EmptyState`, tab container), `rounded-card` (14px) cards (kit `Card`,
  result cards, stat panels), `rounded-2xl` (16px) dialogs. Padding ≥ `p-5`.
  Cards align to the grid; no manual widths.
- **Badges/status:** one badge component, fixed color semantics (positive =
  brand, pending = amber, failed = red, neutral = sand). Text + color, never
  color alone.
- **Forms:** persistent `<label>` above input (`text-sm font-medium`, auto-`id`
  association via `useId` when the caller passes none), input `h-10` (matches
  Button `md`), hint `text-xs text-sand-500`, error `text-xs` in red directly
  under the input with `aria-invalid` + `aria-describedby`. Validate on blur /
  submit — never before first touch. Submit button shows busy state and stays
  the single primary action. Server field errors map to fields; form-level
  errors render in an alert box above the fields (`role="alert"`).
- **States:** every async region implements
  **loading** (kit `Skeleton` matching the final layout — never a blank
  `fallback={null}`) → **empty** (icon + why + primary
  action + optional sample) → **error** (plain language + retry) → **content**.
  Spinners only for in-button progress.
- **Tables/lists:** header row `text-xs uppercase text-sand-500`, rows
  `divide-y`, numeric columns right-aligned (`text-end tabular-nums`), row
  actions at the end edge. Pagination identical everywhere.
- **Navigation chrome:** site header (primary links + account menu) on
  desktop; below `lg` a hamburger panel carries the complete list, and when
  signed in a **fixed bottom tab bar** shows the core four destinations
  (dashboard, applications, messages, notifications) — ≥44px targets,
  labels wrap (never truncate), safe-area padding, `aria-current="page"`,
  landmark `nav.tabBar`. The bar never covers the footer (layout reserves
  matching bottom padding) and disappears at `lg`. The **footer is the one
  deep-ink surface** (`bg-sand-950`, P9): links `text-sand-300` hover
  `text-brand-300`, all pairs ≥6.4:1 — it closes the light page with weight
  and never gains a second dark region on the same surface.
- **Filter tray:** filter-heavy list pages wrap their plain GET form in a
  native `<details>` tray — open in SSR (works without JS), collapsed below
  `lg` after hydration to a "Filters (n)" trigger directly above the
  results. Active filters always render as removable chips **beside the
  results** (state visible while the tray is closed), each chip being a
  link that drops exactly its own filter.

## 6. RTL and i18n

- Only **logical** utilities: `ps/pe/ms/me`, `start/end`, `text-start/text-end`,
  `rounded-s/e`, `border-s/e`. Hardcoded `left/right/pl/pr/ml/mr/text-left/
text-right` are forbidden in components (exceptions: `left-1/2 -translate-x-1/2`
  centering tricks and map/popup positioning, commented).
- Icons that encode direction (arrows, chevrons) mirror in RTL.
- All user-visible strings come from the dictionary (`types.ts` + `en/fr/ar`)
  — identical key sets; no literal copy in components.

## 7. Content rules

- Headlines are nouns/verbs, ≤ 60 chars; descriptions say what the user gets,
  not what the feature is called.
- Buttons are verbs ("Create initiative", not "Submit"); no vague "OK/More".
- Empty state = context + next action (+ preview where possible).
- Honest copy only: demo/metric claims must reflect real state (see project
  honesty rules); never fabricate badges, counts or guarantees.
- The login **demo-access panel** (demo accounts + password + live 2FA codes)
  renders only when `DEMO_MODE=true`, is labeled as a demo dataset, and must
  stay DEMO-gated — it exposes seed credentials by design.

## 8. Accessibility floor (every change)

- Landmarks: `header/nav/main/footer`; skip-to-content; heading levels nest
  without skips.
- Keyboard: all actions reachable, focus visible (`:focus-visible` global ring),
  focus moves to first error on failed submit, dialogs trap focus and restore it.
- Contrast: body ≥ 4.5:1, large text/UI borders ≥ 3:1.
- Targets ≥ 40×40px (44 preferred on touch-first screens); spacing between
  adjacent controls ≥ 8px.
- Dynamic regions announce (`aria-live` for toasts, `role="alert"` for errors).

## 9. Review checklist (run before merging any UI change)

- [ ] One `h1`; heading ladder descending without skips.
- [ ] All spacing on the 4px scale; section rhythm matches Page shell rules.
- [ ] Page uses the shared container/gutter; no page-local widths.
- [ ] Exactly one primary button in the viewed area.
- [ ] Loading / empty / error states present for the touched region.
- [ ] Labels + inline errors + busy state on touched forms.
- [ ] Logical properties only; RTL spot-check (`dir="rtl"` view).
- [ ] Dictionary keys added in all four i18n files (no literals).
- [ ] Keyboard-only pass + focus ring visible.
- [ ] Status/role chips, message boxes and empty states come from the kit
      (`StatusBadge` / `Alert` / `EmptyState`) — no page-local tone maps.
- [ ] `npm run validate` green.
- [ ] UI touched a covered flow? `npm run test:e2e` green (15 tests / 7 spec
      files — admin deep-links, mobile discovery/RTL/zoom, sign-in errors,
      org-review confirms, security headers, public verify, volunteer apply;
      runs on real Chrome via `channel: 'chrome'`).

## 10. Decisions (recorded, so they are not re-litigated)

- **Dark mode: deliberately deferred (2026-09-25, RESEARCH M9; P9 note).**
  The token layer is light-only (the `brand`/`sand`/`clay` ramps resolve on
  white and warm surfaces); shipping a dark theme means auditing every
  surface, border, chart and PDF/email preview. The recorded prerequisite —
  the `--color-bg/surface/fg/muted/border` semantic aliases — **shipped in
  P9** and carries the base layer, so a future dark pass starts from tokens,
  not from a sweep. Until that dedicated audit: do **not** add ad-hoc
  `dark:` classes — one-off dark styles are worse than none.
- **Metric provenance is a design rule, not a copy detail (RESEARCH C1).** Any
  surface that renders aggregate numbers must carry its provenance label next to
  the heading — seeded data says "demo dataset" (`landing.statsNote`), Opportunity
  `impactMetrics` say `opportunity.impactSelfReported`. A number without its
  provenance is a defect in review.
- **Kit-first interactive primitives (P2, 2026-09-25).** Every button and
  link-CTA uses kit `Button` / `buttonClasses` — raw `bg-brand-700` outside
  `packages/ui` is 0 (grep gate). Button sizes are **sm `h-11` / md `h-11` /
  lg `h-12`** (all ≥44px, the literal H3 target; kit fields stay `h-10` = the
  §8 40px floor). `buttonClasses` lives in non-client
  `packages/ui/src/button-classes.ts` because server components import it —
  a plain function exported from a `'use client'` module fails in RSC. The
  layout skip link uses `buttonClasses({ variant: 'primary' })` only while
  focused. Non-control identity marks (org logo/initials tiles) use kit
  `Avatar`, not hand-rolled `bg-brand-700` grids.
- **One status → one badge (P2, RESEARCH §5.3).**
  `apps/web/src/ui/status.tsx` is the single status→tone map (lead-owned;
  page-local `*_TONE` maps were deleted). Semantics: success = completed/good,
  warning = waiting (incl. `PENDING`, `UNDER_REVIEW`, `EXPIRED`),
  danger = blocked (`SUSPENDED`, `REVOKED`, `VOID`), info = in-progress
  (`IN_PROGRESS`, `PROCESSING`, `SHORTLISTED`, `PROPOSED`), neutral = inert
  ends (`DRAFT`, `ARCHIVED`, `WITHDRAWN`, `CANCELLED`, `DELETED`, `REFUNDED`);
  risk LOW=success / MEDIUM=info / HIGH=warning / CRITICAL=danger; unknown
  strings fall back to neutral. The localized label always renders inside the
  badge (color is never the only encoding), and `StatusBadge` forwards extra
  props (e.g. `data-testid` hooks — exercised by the Playwright suite that
  shipped in P4).
- **Messages and chrome tones.** The user's own chat bubble is
  `bg-sand-900` — brand-700 is reserved for kit primaries/identity so the
  primary action always reads first. Notifications filter pills stay plain
  GET links (URL-deep-linkable, server-rendered) styled via
  `buttonClasses` variants rather than being converted to Tabs; the admin
  section tab bars are kit `Tabs`/`TabPanel` (proper `tablist` roles), with
  the caller owning the `/admin/{section}` sub-route sync (M7: each section
  has one deep-linkable URL; a legacy `?tab=` on `/admin` 307s to the granted
  sub-route, and an unknown/ungranted section canonicalises to the first
  granted one — never a permanent redirect, grants are live). The current
  locale in the
  locale switch is a non-focusable sized `<span>` (it performs no action, so
  it must not be a button) with `aria-current="true"`.
- **Forms: one marker convention + focus (P2, RESEARCH §5.7).** Required =
  a red ` *` appended to the label — the kit `required` prop renders exactly
  that markup, and hand-rolled labels must match it. Optional =
  `({dict.common.optional})` as a **label suffix** — the `hint` slot is
  reserved for requirements/help text (the password-requirements hint lives
  there, and it is present in all three password-setting flows: register,
  reset, settings change). Every form with a top-level field-error map calls
  `useFocusFirstError`, so a failed submit focuses the first invalid control
  (§8 line), with `aria-describedby` wiring from the kit fields. The four
  raw-input workspace forms (invite member, issue certificate, upload
  document, attendance) set `aria-invalid` directly from their error maps
  so the hook can find those controls too.
- **Raw message boxes and placeholders → kit (P2).** Error/notice `<div>`s
  become kit `<Alert tone="danger|success|warning|info">` (danger announces
  `role="alert"`, others `role="status"`; an explicit `role` on the original
  is passed through so announcement priority never silently weakens), and
  dashed placeholder paragraphs become kit `<EmptyState>` (kept out of
  `ul`/`ol` contexts where a `div` child would be invalid).
- **Card shells → kit `Card` (P2).** Card-styled `div`/`section`/`li` shells
  use kit `<Card>` (surface + `p-5` + `shadow-sm`); layout padding passes
  through (`p-6` kept, table wrappers get `p-0`). Semantics are preserved:
  list items keep their tag via `Card as="li"`, named sections keep
  `as="section"` with their `aria-label` (still landmarks), `article` keeps
  its tag, and `aside`/`ul`/`form`/`p`/`<Link>`/`p-1` menu shells stay on
  their original elements (a `div` inside a `ul`/`form` would be invalid
  markup; `aside` is a landmark). Unnamed `<section>` shells render as Card
  divs — unnamed sections are not landmarks and heading structure is
  untouched. Documented skips: 23 shells (7 `ul`, 9 `form`, 4 `<Link>`,
  1 `aside`, 1 `p`, 1 menu).
- **Bundled base geography, not tiles (P3, RESEARCH H5).** The map draws
  simplified OSM wilaya outlines (`ODbL-1.0`, vendored under `scripts/geo/`,
  generated into `apps/web/src/ui/map/algeria-geo.ts` by
  `npm run build:map-geo`) as an SVG layer under the pins — no tile
  requests, no hosted map SDK or API key, CSP untouched. The outlines are an **unlabeled
  backdrop** (69-wilaya 2026 vintage vs the app's 58-wilaya table); no
  wilaya names/counts are ever rendered from them, and the UI keeps the
  `© OpenStreetMap contributors` attribution (linked to the ODbL page)
  visible bottom-right. Projection = fixed Algeria-bbox frame with a
  shape-preserving fit; zoom (1–8), drag/keyboard pan, and
  "search this area" (discover `bounds` filter) all reuse that frame.
  **Engine = Leaflet (P6):** projection, dragging, keyboard pan and pin
  positioning come from the library (dynamic client-side import, kit-styled
  controls unchanged), while the server still renders the static
  outline+pin poster in the fitted frame (no-JS + probe contract), the
  full view remains the zoom floor (refit on resize), and there is still
  no tile layer.
- **One landing discovery rail (P3, RESEARCH M2).** The home page renders
  a single "latest" rail; needs-filtered views live behind the quick chips
  and discover's own links. Never re-add parallel rails that fetch
  overlapping seed rows — duplication reads as emptiness.
- **Mobile: bottom tab bar + disclosure filter tray (P3, M3 + NN/g).**
  Signed in, small screens get a fixed bottom tab bar with the core four
  destinations (defined once in `chrome.tsx#coreNavLinks`, ≥44px targets,
  `env(safe-area-inset-bottom)`, `aria-current`, layout reserves
  `pb-24 lg:pb-0`); the hamburger keeps the long tail. `/opportunities`
  filters sit in a native `<details>` tray — open in SSR (no-JS intact),
  collapsed below `lg` after hydration to a "Filters (n)" trigger above the
  results — with active-filter chips beside the results, each chip
  removing exactly its own filter.
- **P10 reference-driven Hero/dashboard pass (2026-09-30).** Design calls are
  validated against curated references (`design-refs/dribbble/`), not guessed:
  display scale and a gradient headline + clay rule on the landing hero, pill
  geometry **on marketing surfaces only** (shared controls keep the 8px tier —
  the system, not the reference, decides kit geometry), a hairline trust strip
  as the hero's fold exit, the impact band on `sand-100/60` with clay rules,
  and a two-zone dashboard (`lg:grid-cols-3`) whose §58 international bar stays
  byte-identical. Charts and photo-masked headlines stay **out** until the
  data/asset exists — no fabricated series, no stock photography (§7 honesty).
- **P11 imagery & atlas map pass (2026-10-01).** Two directions, per the
  brief: **original SVG art where identity is made** (a layered `HeroArt`
  landscape behind the hero and final CTA — decorative, `aria-hidden`,
  gradient headline byte-stable) and **CC0/Public-Domain photography where
  atmosphere helps** (13 Openverse photos as card covers and the how-works
  band, every file credited in `design-refs/PHOTO-CREDITS.md`; decorative
  `alt=""`, thematic only — never presented as documentary imagery, §7).
  The `/map` page becomes a designed atlas surface: a `PageHeader` with
  live coverage stats, a jade land tint shared by the SSR poster and the
  live overlay, a compass rose in the letterbox margin, proximity clusters
  instead of stacked pins, an enriched side list synced with the canvas in
  both directions, and a permanent results chip — while every probe-locked
  map string (`grid gap-6 lg:grid-cols-3`, the poster pins, the OSM
  attribution) stayed byte-identical. Rules live in §12.
- **P12 missing pages & existing pages pass (2026-10-01).** The surfaces the
  CMS already powered but nothing rendered publicly: a trilingual help
  centre (`/help` + `/help/[slug]` — PUBLISHED only, plain-text bodies split
  into paragraphs, type badge + freshness, footer link, sitemap entry), a
  dismissible clay announcement banner on the landing hero and dashboard
  (SSR-visible, per-row `localStorage` dismissal, every CMS fetch fail-open),
  and featured rails on the landing (`HOME_*`) and discover
  (`DISCOVER_FEATURED`) surfaces. The landing hero honors an admin
  `HomeContent` override when a row exists (locked copy otherwise). The
  verify hub gains explainer cards, a how-it-works strip and the FAQ link
  (E2E testids untouched), its subpages a mirrored back chevron, and the
  auth forms a shared `PasswordInput` reveal toggle behind a new kit `Input`
  `trailing` slot. Rules live in §13.
- **P13 organization pages presentation pass (2026-10-02).** The tenant's
  own surfaces now sell the tenant: the profile detail gains a mirrored
  back link, kit `Badge` chips over an `Avatar`/h1/location header, one
  hairline `StatGrid` of honest counts (members · opportunities ·
  campaigns — from the public GET /campaigns `organizationId` total), the
  shared `InitiativeCard` grid with a context-aware `showOrganization`
  prop (the byline is redundant on the org's own page), a public
  campaigns rail, and a facts sidebar with an honest unverified note; the
  directory cards link to their profiles instead of dead-ending. The
  public projection stays contact-free (no email/phone/address). Rules
  live in §14.
- **P14 support cards, tab bar & kit CSS source fix (2026-10-02).**
  The public support-need cards rebuilt (kind/goal `Badge` chips above
  the title, `dir="auto"` descriptions — the RTL page was
  bidi-scrambling Latin copy —, bold `tabular-nums` figure rows, a
  hairline footer pinning the sign-in CTA, `sm:grid-cols-2`), the kit
  tab bar redesigned as a bordered sand track with a `brand-600`
  active pill in one nowrap scroll row (API/roles unchanged). The
  pass exposed the systemic miss behind both bugs: **Tailwind v4 never
  scanned `packages/ui`**, so kit-unique utilities (tab active states,
  the login submit's `bg-brand-700`) were absent from the built CSS —
  `globals.css` now pins the tree with `@source`, and an E2E spec
  asserts the tab's computed background. Rules live in §15.
- **P15 organization profile trust & presence (2026-10-02).** The
  tenant gets a face: `coverImage` joined the public projection (a
  presentation field — the contact-free rule still holds for
  email/phone/address/website) as a rounded cover band, the kit
  `Avatar` gained an optional `src` so the tenant's logo covers the
  identity tile (initials remain the fallback everywhere else), and a
  sidebar Team card shows up to four **opted-in** members with role
  and a `+N` chip — consent travels inside the query, not through
  page-side filtering. Rules live in §16.
- **P16 app bar declutter (2026-10-02).** Eight text links collapsed
  to five (public four + dashboard) plus two labeled icon buttons;
  applications moved into the account menu, sign-out went ghost, and
  the bar became `sticky top-0 z-40`. The bottom tab bar's shared
  `coreNavLinks` contract is untouched. Rules live in §17.
- **P17 messages workspace (2026-10-02).** The thread reads like a
  chat: tinted canvas, white peer bubbles vs `brand-600` mine, one
  date separator per day, turn grouping, `formatTime` meta outside
  the bubble, `dir="auto"` bodies, `PaperclipIcon`/`SendIcon`
  instead of emoji, Enter-to-send, peer avatar tiles and a
  start-border active row. Rules live in §18.
- **P18 support offers decision room (2026-10-02).** Accepting an
  offer now shows for itself: both needs APIs sum accepted offer
  quantities into a two-tone progress bar (received solid,
  accepted pledges lighter, capped at the target), and the console
  offers tab grew a summary strip, status chips and per-need
  groups with rich offer cards (figure, avatar, masked email,
  dates, primary Accept). Rules live in §19.
- **P19 shareable conversation link (2026-10-02).** Nobody hunts
  for a raw UUID: the account card leads with a copyable
  conversation link (`/{locale}/messages?to=<id>` + Copy button —
  clipboard with an insecure-context fallback) above the ID row,
  `/messages?to=` prefills the recipient on the messages page,
  and a pasted whole link is unwrapped before the POST — the
  server's DIRECT dedupe opens the existing thread. Rules live in
  §20.
- **P20 report from the page (2026-10-02).** No target-id hunting:
  a shared `parseReportTargetRef` reads a page link pasted from
  the address bar (path → target type) or a bare slug, the server
  resolves `id OR slug` and stores the effective type, every
  initiative/organization profile carries a Report link that
  opens `/safety?target=<own page link>` prefilled, and
  `INTERNATIONAL_OPPORTUNITY` is honestly refused (hidden from the
  menu — the moderation pipeline has no effect branch for it yet).
  Rules live in §21.
- **P21 review before publish (2026-10-03).** The claim "the
  initiatives pass a review before publication" is now structural:
  a DRAFT can only enter the review queue, and the move into
  PUBLISHED always requires the platform moderation grant — on the
  tenant endpoint and inside the admin console alike, which now
  also shares the verified-organization wall its own comment used
  to call deliberately exempt. Buttons follow the truth: the
  workspace row offers only what an organization may do (the
  always-403 Reject button left with its reason field), the hint
  names who publishes, and the admin action menu filters per row
  through `canTransition`. The home page says it out loud — hero
  subtitle, the **Algeria-first** badge and a trust strip ×4
  (verified organizations → reviewed initiatives → append-only
  hours → checkable certificates), then a six-cell "From idea to
  impact" path (five numbered steps + the trust record) between
  discovery and the latest rail. Rules live in §22.

## 11. Color system (P9 retheme — "Oasis Modern")

Tokens live in `apps/web/src/app/globals.css` under `@theme static` (every
token ships as a CSS variable, including raw-CSS references). The retheme
changed **values, not names** — `brand`/`sand` classes and all copy are
byte-stable, which is why the probe/P1/P2/E2E contracts survived without
re-locking.

| Ramp                      | Character / roles                                                                                  | Verified contrast (AA)                                                                     |
| ------------------------- | -------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| `brand` (jade, hue ≈157)  | Deep emerald: primary actions, links, identity, success tints, focus ring (`brand-600`)            | 700 on white 6.9:1 · white on 700 6.9:1 · 600 5.0:1 · 500 (UI) 3.4:1 · 800 on 100 = 7.9:1  |
| `sand` (caramel neutrals) | Page bg (50), hairlines (200), meta text (500), ink footer/dark surfaces (950)                     | 500 on page bg 4.7:1 · 400 (UI) 3.1:1 · 900 on 50 = 15.1:1 · footer 300/400 on 950 ≥ 6.4:1 |
| `clay` (terracotta, NEW)  | **Decorative warmth only**: landing hero glow, editorial step marks. Never semantic, never status. | Text on light = clay-700+ (6.7:1); fills/icons below that                                  |
| `sky` / `amber` / `red`   | Semantics untouched (stock): info / warning / danger — the status map + gates depend on them       | Unchanged                                                                                  |

Rules that keep the system honest:

- **Status semantics are immutable** (§5 badges, §10 status map): positive =
  brand, pending = amber, failed = red, info = sky, inert = sand. `clay` never
  encodes a status; a clay element must still be readable without color.
- **Text minimums are computed, not eyeballed:** every text pair shipped in
  P9 was measured (body ≥4.5:1, UI/large ≥3:1). Changing a ramp step requires
  re-running the same checks — including `X-500 on page bg` (not just on
  white) and pairs that sit on the dark footer.
- **The brand extends past CSS:** email CTA/shell inline hexes
  (`#18664a`, `#f7f4ed`, `#746c5d`…) and the PDF card header (`#0f4030`)
  mirror the ramps — update them with the tokens.
- **Semantic aliases** (`--color-bg/surface/fg/muted/border`) carry the base
  layer and resolve to the light theme; they are the dark-mode prerequisite
  recorded in §10.
- **P9 "Oasis Modern" retheme (2026-09-30).** Palette, typography and
  elevation were replaced **at the token and kit layers**: jade `brand`,
  warmed `sand` (now with `950` ink), new decorative `clay` ramp, IBM Plex
  Sans Arabic via `next/font`, `--shadow-card` elevation, the
  `rounded-card`/`rounded-2xl` radius tiers, the `sand-950` footer, and a
  deeper landing hero (gradient + `text-5xl md:text-6xl` display type).
  Class names and copy were deliberately kept byte-stable, so the probe/P1/
  P2/E2E locks survived by construction — the retheme changed values, not
  contracts; email (CTA/shell hexes) and the PDF card header moved with the
  brand. Kit controls stayed at the 8px control tier to match the 100+ raw
  controls that already use it (the kit follows the system, not vice versa).
  The ramps and their WCAG proofs are recorded in §11.

## 12. Imagery and the atlas map (P11)

- **Two asset directions, chosen per surface.** Identity moments (hero,
  decoration) use **original SVG art** — `ui/components/hero-art.tsx` is
  layered, direction-neutral and `aria-hidden`, and must never fight the
  headline's contrast. Atmosphere (card covers, how-works) uses
  **CC0/Public-Domain photographs only** (`license=cc0|pdm`, sourced via
  Openverse), stored in `apps/web/public/photos/`.
- **Every photo carries provenance.** `design-refs/PHOTO-CREDITS.md`
  (human-readable) and `design-refs/photo-picks.json` (machine) record
  file → source URL → author → license. A photo without provenance does
  not ship; swapping a photo means updating both files.
- **Photos are decorative and thematic.** They render with `alt=""`, are
  never captioned as evidence of a place or event (§7 honesty), and sit
  in crop-safe slots (`InitiativeCard` cover top, how-works band) — they
  are not data, and no claim depends on them.
- **The map is a designed canvas, not a widget.** The land tint comes
  from shared `LAND_FILL`/`LAND_STROKE` constants read by both the SSR
  poster and the live Leaflet overlay (so they cannot drift); the ground
  is `sand-50 → sand-100` with a decorative compass rose (clay north via
  `--color-clay-500`, `aria-hidden`) parked in the frame's letterbox
  margin — geography never mirrors, so the rose stays physical-left in
  RTL too.
- **Pins fold, never stack.** Results within 30 screen-space px cluster
  into one badge that zooms until they split; the side list is the
  keyboard-accessible parallel and stays synced both ways (row
  hover/focus ↔ `.is-hot` on the pin/cluster). Focus must never move the
  map under an active pointer — cluster markers set
  `autoPanOnFocus: false` (Leaflet's default focus-pan fires a delayed
  `moveend` mid-click and swallows it).

## 13. Public content surfaces (P12)

- **The CMS renders publicly, or it does not exist.** Content pages live at
  `/help` and `/help/[slug]` and only when `PUBLISHED`; drafts and archived
  rows 404 exactly like missing ones — no teaser, no "coming soon" (§7
  honesty). Article bodies stay the plain text the admin textarea wrote:
  blank lines split paragraphs and a paragraph's first line leads; no HTML
  rendering surface is introduced.
- **Public pages never gate on a session.** `pageSession()` belongs to
  authenticated surfaces only — on public content it bounced every
  anonymous visitor to `/login` (caught by live smoke before ship, not by
  any unit test). The same fail-open rule covers everything the
  landing/dashboard consume from the CMS: announcement, featured and hero
  fetches catch → empty/null, so a CMS outage degrades to the locked copy
  instead of a 500.
- **Announcements dismiss per device, per row.** The banner is SSR-visible
  (no flash), hides post-mount once `bladna:announcement:<id>` is set in
  `localStorage`, and keys on the row id so a new announcement reappears —
  the dismissal belongs to the reader, on their device, with no account
  (§7 privacy).
- **Featured is curated data, never decoration.** Rails render admin
  placements (`FeaturedPlacement`, idempotent on
  `@@unique([section,targetType,targetId])`), each item labelled with its
  kind and "sponsored" where applicable, linking to the same public pages
  as everywhere else. An empty placement set renders no band — no
  fabricated picks.
- **Auth affordances stay kit-honest.** The password reveal is one kit
  addition (`Input` `trailing` slot; the toggle is `grid size-10` so G6's
  `grid size-9` ban holds) behind a shared `PasswordInput` with
  `aria-pressed` and localized show/hide labels in all four dictionaries —
  no raw buttons, no bespoke field wrappers.

## 14. Organization profile surfaces (P13)

- **The profile presents the tenant, the directory sells the click.**
  The detail page reads top-down as identity (back link → badge stack →
  avatar + h1 + location), proof (one hairline `StatGrid` — members,
  opportunities, campaigns), then substance (about → initiatives →
  campaigns), with the facts sidebar (type, trust level, verified since,
  profile since) as the persistent aside. The directory card's job is
  one thing: lead to that profile (`h2 > Link` + hover affordance).
- **Public projection stays contact-free.** `ORG_PUBLIC_SELECT` predates
  this pass and its rule stands — no email, no phone, no address on
  anonymous reads; enrichment comes only from fields the API already
  publishes (counts, verification, places). `website`/`coverImage` were
  deliberately not widened into the public DTO.
- **One card component, context-aware redundancy.** `InitiativeCard`
  renders the organization byline everywhere except the organization's
  own page (`showOrganization={false}`) — reuse without an org naming
  itself on every card it owns.
- **Enrichments fail open, figures stay honest.** Campaigns come from the
  public list (DRAFT rows never leave the API) with catch → empty; the
  campaign stat is `meta.total`, not a rendered count; "profile since"
  says platform join date, never founding year, and an unverified
  profile says so.
- **Data problems are fixed in data, never in gates.** The stray
  manual-test opportunity (`slug=test`, no location → null coordinates)
  that broke the map-coords probe was demoted to DRAFT — the record
  survives, the public surface stays clean, and no gate or page code was
  bent to accommodate it.

## 15. Support cards, tab bar & kit CSS sourcing (P14)

- **Presentation data gets honest, bidi-safe typography.** Figures are
  bold `tabular-nums` on their own line, the accepted-offers meta sits
  muted beneath them (financial needs included), and every description
  that may hold Latin copy carries `dir="auto"` so an RTL page never
  scrambles it. Goal/need chips come from kit `Badge` tones — never raw
  spans — and the card footer is a hairline that pins the call to action
  to the bottom (`mt-auto`), so a 2-up grid keeps a straight baseline.
- **One source of truth for the tab look.** The active state is the same
  `brand-600` fill as primary buttons (never `brand-700`, which is banned
  in app source); the track is a hairline `sand-100` band that scrolls as
  a single row — no wrap, `h-11 shrink-0` triggers — and the redesign is
  visual only: roles, aria and the component API are untouched, so tests
  keep asserting semantics.
- **The build must prove it emitted the kit.** Class-name grep gates can
  pass while Tailwind drops an entire `@source` tree: that is exactly how
  the tab states and the login submit's background went missing. The
  permanent guards are the one-line `@source` pin in `globals.css` and a
  computed-style E2E (`console-tabs.spec.ts`: active background
  non-transparent, inactive transparent). A kit-unique utility only
  exists once it appears in the served bundle.

## 16. Organization profile trust & presence (P15)

- **Presentation fields are public; contact fields are not.**
  `coverImage` and `logo` are the tenant's own published images and
  joined `ORG_PUBLIC_SELECT`; email/phone/address/website stay out, and
  the members preview carries its consent _inside_ the query — relation
  args on the select accept only `publicProfile` volunteers with an
  ACTIVE membership and no soft-deleted user, so an unconsented roster
  cannot leave the API no matter what the page asks for.
- **Photos are decorative, identity is textual.** The cover band is
  `alt=""` (§7: the h1 + location already carry the information); the
  `Avatar` `src` only covers a tile whose name sits beside it, and the
  initials fallback means a missing/broken image degrades to exactly the
  pre-P15 rendering.
- **Figures stay one source.** The `+N` chip subtracts from the same
  `_count.members` the StatGrid displays — the page never invents a
  second count, and demo data is fixed in data (seed + idempotent SQL),
  never in gates.

## 17. App bar (P16)

- **One row, five text links, two icons.** The signed-in nav keeps the
  four public destinations + dashboard as text; messages and
  notifications keep their dictionary labels as `aria-label`/`title` on
  icon buttons — narrower, same destination, same accessible name.
  Links carry `shrink-0 whitespace-nowrap`, so labels never wrap or
  squash at intermediate widths.
- **Depth by frequency, not by habit.** Applications joined the account
  menu (low frequency, already the home of workspace/settings/billing/
  safety); sign-out became ghost — present, labeled, but no longer a
  bordered block competing with the account trigger.
- **Sticky sits below menus.** The bar is `sticky top-0 z-40`: nothing
  else in the app sticks (verified by grep), Radix menus/dialogs render
  at z-50+, and the P3 mobile bottom bar is a separate fixed surface.
  `coreNavLinks` stays the single source for the bottom tab bar and the
  hamburger drawer, which re-adds the icon-only pair so no destination
  becomes desktop-exclusive.

## 18. Messages workspace (P17)

- **Bubbles carry meaning, not decoration.** The thread scrolls on a
  `sand-50` canvas: peer messages are white with a `sand-200` border
  (sender name in `brand-700`, shown once per turn), mine are
  `brand-600` with white text (5.0:1 body contrast); tail corners use
  logical `rounded-es/ee` so they follow the writing direction.
- **Time is meta, not message.** One `formatDate` separator per local
  day with hairlines, `formatTime` under each bubble aligned to its
  side — a full `formatDateTime` inside every message was noise.
- **`dir="auto"` on message bodies** — user copy decides its own
  direction (the same rule as §15 support cards); Latin text stops
  bidi-scrambling inside the RTL page.
- **Attachments are buttons, not emoji.** `PaperclipIcon` marks the
  pending-file chip, the download link and the picker; the file input
  stays `sr-only` and keyboard-reachable behind a label that carries
  the visible affordance and the `has-[:focus-visible]` ring.
- **The composer speaks chat** — Enter sends, Shift+Enter breaks the
  line (IME composition excluded) — while every control keeps its
  dictionary label (`send`, `attachments`) as the accessible name, and
  opening a conversation below `lg` scrolls the thread pane into view.

## 19. Support offers decision room (P18)

- **Progress shows both halves of a pledge.** Quantity needs paint
  `NeedProgressBar`: solid `brand-600` = received (`fulfilled`,
  owner-maintained) and lighter `brand-300` = accepted offers still
  to be delivered — capped at the target, with aria reporting the
  painted total. Accepting an offer extends the bar in place (the
  reported gap) without pretending the goods arrived; financial
  needs keep their accepted-amount line, which already summed
  pledges on the server.
- **Decisions read against their target.** The offers tab groups
  offers under their need — kind pill, pending/accepted counts and
  the bar (or the financial line) in the group header — instead of
  a flat list, so an accept is judged where it lands; a three-stat
  summary strip and instant status chips sit on top.
- **The offer card carries the trace.** Status chip, the offer's
  weight as a large `tabular-nums` figure (amount or ×quantity),
  offerer identity (initials `Avatar`, masked name and masked
  email), `dir="auto"` description on a start-border rule, contact
  note, submitted/decided dates and the reject reason — Accept is
  the primary button, Reject opens the reason field inline.
- **Honest caps, honest counts.** Segments never exceed the
  target, and every figure comes from the server's ACCEPTED-only
  aggregates (`acceptedQuantity` joins `acceptedOffers` /
  `acceptedAmount`), so the console, the public page and the
  directory all agree after one decision.

## 20. Shareable conversation link (P19)

- **Share a link, not a UUID.** The account card leads with the
  conversation link (`/{locale}/messages?to=<user id>`, built
  absolute after mount so SSR and hydration agree) and a Copy
  link button: `navigator.clipboard` write + a 2 s "copied"
  confirmation, falling back to selecting the visible code (then
  `execCommand`) in insecure contexts — the raw ID row stays
  underneath, its hint pointing at the link.
- **The deep link carries the intent.** `/messages?to=` reads the
  parameter on mount and opens the new-conversation form with the
  recipient prefilled; the field also accepts a whole pasted link
  (the UUID is extracted client-side), so no one ever transcribes
  the 36-character string by hand.
- **Dedupe, not duplication.** Nothing changed server-side:
  `POST /conversations` still returns the pair's existing DIRECT
  thread, so following someone's link lands both parties on the
  conversation they already share instead of forking a new row.

## 21. Report from the page, not from a UUID (P20)

- **Where do I find the ID? In the address bar.** The safety
  form's target accepts a pasted page link: `parseReportTargetRef`
  (shared by the client form and `POST /reports`) maps
  `/[locale]/opportunities|organizations|workspace|campaigns/<x>`
  to its target type and strips the locale segment, query and
  hash; `verify/certificate?code=` yields the certificate number.
  A bare slug or uuid passes through, so existing habits keep
  working.
- **Resolve, don't demand.** The server's `resolveTarget` looks
  up `id OR slug` for organization/opportunity/campaign — free
  text only ever filters the slug column (filtering a uuid column
  with it would 500) — keeps the uuid-only rules for
  user/message, and returns the effective target type so the
  stored row and audit never disagree with what the link meant.
- **Report from where you stand.** The initiative and
  organization profiles carry a Report link that opens
  `/safety?target=<own page link>`: the form prefills on mount,
  auto-detects the type on paste, and the value rides the
  anonymous sign-in bounce (`?next` keeps `target=`). The hints
  say exactly that — "paste the page link from the address bar…
  or paste the ID itself" — in all four dictionaries.
- **Honest about what moderation cannot do yet.**
  `INTERNATIONAL_OPPORTUNITY` is hidden from the menu and refused
  server-side with a validation error: it used to fall through to
  "Message not found", and the review pipeline still has no
  effect branch for it. An honest refusal beats a decision path
  that would roll back on itself.

## 22. Review before publish — and a home page that says so (P21)

- **The queue is the only door.** `OPPORTUNITY_TRANSITIONS.DRAFT`
  lists `PENDING_REVIEW` and `ARCHIVED` — never `PUBLISHED`.
  Organizations submit, withdraw and steer their own lifecycle;
  the move into `PUBLISHED` always requires `opportunity.moderate`,
  checked on the tenant endpoint through `requireOrgMembership`
  (no organization role holds it, even OWNER) and through
  `requireSystemPermission` in the admin console. Publishing a
  never-submitted draft is not a path anyone can take, by design.
- **The verification wall stands everywhere.** `platformAction`
  used to document itself as deliberately exempt from the
  tenants' org-verification gate ("a platform officer publishing
  is the platform vouching for the listing"). The claim is
  absolute — an unverified or suspended organization publishes
  nothing — so the same two rules (suspended organization first,
  then non-`VERIFIED`) now wrap every move to `PUBLISHED`, whoever
  presses the button, and `docs/API.md` says so on both endpoints.
- **Buttons follow the truth.** The workspace row renders only
  what the organization may actually do: `SUBMIT_REVIEW`,
  `SUSPEND`, `ARCHIVE`, `RESTORE_DRAFT`, `EXPIRE` — the Reject
  button that always 403'd left with its reason field, and the
  hint now names who publishes ("submit for review — platform
  moderation publishes (accepts) or rejects it", ×4). The admin
  action menu filters its four options per row through
  `canTransition`, so a DRAFT row simply shows no actions instead
  of offering a PUBLISH the machine would refuse.
- **The home page states the idea, in order.** Hero subtitle
  (register → verify → review → document → trust), the
  **Algeria-first** badge, and a trust strip that reads verified
  organizations → reviewed initiatives → append-only hours →
  checkable certificates — then the new "From idea to impact"
  section: five numbered steps (register the organization,
  describe the initiative, review before publication, run it with
  volunteers, document the impact) in a 3×2 grid whose sixth cell
  is the outcome — "a space of trust" where citizen, volunteer,
  initiative, association, company and authority work from one
  verified record. Typographic only: the three CC0 photos stay in
  "How it works", so AR/FR/EN all carry the same shape with no
  new assets, and the RTL grid simply flows right to left.

## 23. A home page that catches the eye (P22)

- **Anchor rhythm over a flat run.** The page's middle was three
  consecutive sand sections. The lifecycle band now turns white
  (the discovery launcher carries its own `pb-10` so its card
  keeps breathing room), the impact panel crosses to a **dark
  brand band**, and the pillars bento holds one inverted cell —
  top (hero) → middle (stats) → bottom (CTA) each have an anchor
  for the eye without ever showing two dark cells side by side.
- **Priority encoded where the grid lives.** The identity cell of
  the bento inverts to `from-brand-700 via-brand-800 to-brand-900`
  with a `bg-white/10` icon tile; `iconFor(key, onDark)` flips the
  glyph to `text-brand-200`. §3's "one dominant cell" is now a
  surface, not just a column span.
- **The instrument panel keeps every promise.** The stats band
  moved surfaces but not semantics: same `gap-px` hairline
  instrument, same clay figure rules (decorative, never status),
  same `statsNote` provenance label verbatim (honesty rule C1).
  Figures grew to `text-5xl md:text-6xl` with a white→`brand-200`
  clipped gradient — bigger, still honest about being a seeded
  demo.
- **Motion is opt-in, still.** The new `.hero-breathe` keyframe
  (16s, `alternate`, transform-only so each layer keeps its own
  opacity class) is declared **inside** the
  `prefers-reduced-motion: no-preference` block next to
  `.hero-rise`/`.rise` — opted-out users get a fully static page,
  and the washes simply stop moving. Hover lifts ride
  `motion-safe:` utilities.
- **Zero new copy.** No dictionary key was added or changed; the
  whole increment is markup, classes and one guarded keyframe.
  `SectionHeading`'s optional `tone="dark"` defaults to `'light'`
  and renders byte-identical classes for every existing caller.

## 24. Contact & trust before applying (P23)

- **One chain, three surfaces.** "Contact before applying" is a
  path, not a button: directory card → `?to=<owner id>`, initiative
  header/contact card → `?org=<id>&name=`, organization profile
  header → the same `?org=` link — all landing in one compose form.
  The directory exposes `userId` only for rows that already passed
  the `publicProfile` gate, and the handle never implies contact
  details: no email, phone or location is revealed by messaging
  (the privacy footnote still says so out loud).
- **The bounce keeps the target.** The messages page validates its
  own contact params (`parseContactParams`/`contactQuery` — exact
  UUID ids, display name capped at 120 and only emitted beside a
  valid org) and folds them into the path `pageSession` and `?next=`
  share, so an anonymous visitor who clicked Message signs in and
  lands on an addressed form. Validation lives in one pure helper
  (unit-tested) rather than in two call sites — what the compose
  form accepts is exactly what the redirect may echo.
- **`?org=` mode replaces the input, not the form.** The target id
  is fixed by the link, so the recipient field becomes a static
  **Organization** row (label + name, `sand-50` note box) instead of
  an editable UUID field; Start enables without a recipient, the
  POST carries `{ organizationId }`, and closing the form or a
  successful start clears the target so reopening starts fresh.
- **Identity before the fine print.** The initiative header now
  carries the organizer's face and standing in one line: logo
  `Avatar` tile, the name as a link to the public profile, and a
  trust badge rendering the same `workspace.verification.levels`
  strings the profile page uses (neutral tone for
  `LEVEL_0_UNVERIFIED`, sky otherwise) — one ladder, two surfaces,
  never a second private copy of the labels.
- **The contact card never dead-ends.** It renders unconditionally:
  published initiative/organizer details when they exist (the
  fallback note only when organizer details are actually shown),
  and always the **Message the organization** button — an
  initiative with no phone/email now has a channel instead of a
  missing card. Buttons use kit `buttonClasses` (outline sm/md),
  anonymous-visible by the P20 Report rule: navigation with a
  preserved value may bounce to sign-in; a state toggle may not.

## 25. Comments & ratings (P24)

- **Only "there" gets a say.** Eligibility is data, not moderation:
  an ACCEPTED application or VERIFIED hours _on that initiative_
  (resolved live from the application/hour/attendance rows), with
  `source` recording which path qualified the author so every row
  carries its provenance (**Accepted participant** / **Verified
  hours** badge) forever after — a rating you can trace beats a rating
  you have to trust. One review per volunteer per initiative
  (compound unique) makes the section a set of voices, not a feed.
- **The payload is the page.** The whole section — list, rating stats
  (count, average, 5-slot distribution) and the caller's
  `viewer{authenticated, eligible, eligibility, own review}` — arrives
  with the detail page through one SSR `invoke` of the public list
  handler (cookies forwarded), so first paint is complete for
  anonymous and eligible visitors alike; only the writes are
  client-side. No skeletons, no layout shift, one round trip.
- **Provenance over personalities.** Author names render only when
  the volunteer opted into `publicProfile` (initials `Avatar` +
  name); everyone else gets the neutral verified-participant label —
  the review still counts, the person stays private. The eligibility
  note sits under the list for everyone (signed in or not): who may
  review, and why that is the trust rule.
- **State reconciles at the server.** Every mutation ends with
  `router.refresh()`, so the server re-invokes the list handler and
  the client never patches counts, averages or "edited" markers by
  hand — creation writes both timestamps from one clock reading and
  PATCH diverges them, which is the entire "edited" signal. Delete is
  gated by the kit confirm dialog (danger tone, per-call label) and
  idempotent server-side; a mid-write 401 swaps the composer for the
  sign-in CTA instead of leaving a form that can never succeed.
- **The form mirrors the server's gates.** A raw `role="radiogroup"`
  of `min-h-11` star buttons (kit p2 patterns untouched), the shared
  `Textarea` capped at 2000 with its field-error slot fed by
  `fieldErrors`/`useFocusFirstError`, submit disabled until a star is
  picked, and `Reviews: {count}` label-first like `Results: {count}`
  so no locale pluralises a raw number. At zero reviews the stats row
  hides entirely and the empty state speaks — absence is not a 0.0.

## 26. Public volunteer profile (P25)

- **A directory of links, not of names.** The card already carried
  the promise (photo frame, volunteer code, skills, a Message
  button) — but the name was dead text and the owner's
  `profileImage` sat stored and unrendered. P25 completes the loop:
  the photo renders (initials stay the fallback), the name opens
  `/{locale}/volunteers/{id}`, and the page exists only by consent —
  `publicProfile` decides whether the URL resolves, so unknown id,
  malformed uuid and an opted-out profile are the _same_ answer and
  the URL never becomes an existence oracle. The API answers a real
  404; the page streams the not-found UI like every other page in
  this app.
- **Withholding is honest, not empty.** Spec §30 in one page:
  `showHours=false` means the verified-hours aggregate is never
  issued (the rule `GET /public/verify` already documents) and every
  timeline row's hours turns `null`; `showCertificates=false`
  withholds the list; the tile prints an explicit note ("The
  volunteer chose not to display verified hours.") instead of a fake
  0 — because a zero is a claim, while a sentence is the truth.
  `certificatesTotal`/`participationsTotal` come from real counts,
  so a capped top-8 list can never pose as the whole story.
- **Certificates are a credential, not a courtesy.** Every row links
  `/{locale}/verify/certificate?code=BLD-CERT-…` — verification keyed
  on the credential itself, which works whether or not the owner
  publishes anything, so the profile never becomes a dependency of
  the trust chain (the badge says **Valid** because only VALID,
  non-expired rows are listed at all).
- **Settings finally enforces what it stores.** `showCertificates`
  existed in the schema with nothing to control; this page is its
  first controlled surface, so the settings form gains its sixth
  toggle and the comment that had waited for a surface now points at
  one — same story for `showWilaya` on the location line. The flags a
  volunteer flips are exactly the fields a visitor sees; nothing
  else moves.
- **Discovery stays at the directory.** Profile URLs are deliberately
  absent from the sitemap (still 57 pinned entries), the page is
  classified public in `private-noindex.test.ts`, and the directory
  keeps its filters — profiles are reached by browsing, one click
  from a card, with the privacy footnote repeating the phone-number
  line the directory already promises.

## 27. A landing that moves (P26)

- **Clone the composition, keep the contract.** The user pointed at
  `mjeunesse.gov.dz` and asked for that landing "exactly, but with our
  information" — so P26 copies the reference's _structure and motion
  vocabulary_ (ink top strip → breaking marquee → framed photo slider
  with a `01 / 04` counter → section rhythm → stats → digital
  platforms → CTA) while every locked string stays byte-identical:
  the quick-chip hrefs, the header link, `Algeria-first` (now the
  top strip's line instead of a hero pill), `Append-only verified
hours` in the trust strip, `#q`/`#opp`/`#filter-tray`, the M6
  cache line and the footer's `href="/en/volunteers"`. The clone is
  skin-deep _by design_: content and honesty rules never move, only
  the surface does.
- **The slider is decoration; the copy is the content.** The hero
  splits into copy (h1, search, CTAs — all static, all server
  rendered) and a framed four-photo slideshow whose frames are
  `alt=""` + `aria-hidden` when inactive — no live region, no
  surprise announcements. Controls are real buttons: segment jumps
  (`aria-current`), a play/pause toggle (`aria-pressed`), a dimmed
  `01 / 04` counter, and reduced motion never autoplays (hydration
  flips the toggle) while a hidden tab stops advancing. The photos
  are the existing CC0 set (community, environment-beach,
  humanitarian, youth), so credits and payload stay honest.
- **Motion is opt-in; content is never gated on it.** Every new
  keyframe (`hero-drift`, `pulsering`, `marquee-ltr/rtl`,
  `reveal-in`) is declared inside `prefers-reduced-motion:
no-preference`, mirroring the file's original `hero-rise` rule.
  Scroll reveals are progressive (`@supports (animation-timeline:
view())`) — engines without view-timelines render statically — and
  `@media print` forces full visibility. The ticker's moving track
  is `aria-hidden` behind one sr-only sentence; hover/focus pauses
  it; dismissal per id is the untouched P12 behavior, and the
  dashboard banner still renders the default variant byte-identical.
- **One display face for Arabic, Plex for everything else.**
  Noto Kufi Arabic (the reference's headline family) joins via
  `next/font` as `--font-kufi`, resolved only by an `[dir='rtl']
h1…h4` rule through the `--font-display` token: Arabic pages take
  the Kufi voice the reference is known for, Latin locales and all
  body copy keep IBM Plex Sans Arabic — no second webfont ever
  touches the LTR experience.
- **The instruments moved where the reference put them.** Impact
  figures count up on entry (`stat-counter.tsx`) but SSR the final
  honest number first — crawlers, no-JS and reduced-motion readers
  always see the truth, animation only replays it. Verify, map,
  volunteer directory and BLADNA International condense into the
  reference's "digital platforms" four-card grid, each keeping its
  own section copy, so the bottom of the page reads as services
  rather than two stacked asides.

## 28. The reference chrome rides every page (P27)

- **Lift the instruments, don't repaint the rooms.** P26 taught
  the landing the reference's silhouette; P27 moves its _chrome_
  into the locale layout so every route — hubs, dashboard, auth,
  admin — opens with the same two bars the reference site wears:
  the ink promise strip (the locked `Algeria-first` line) and the
  terracotta marquee ticker, both above the sticky header so they
  scroll away exactly like the original. One server component
  (`site-masthead.tsx`) fetches the pinned announcement under the
  P12 contract (home singleton first, latest active second, a
  failing CMS read degrades to "no ticker"), the landing drops its
  private copies, and the dashboard's standalone banner retires in
  favor of the ticker — same per-id dismissal, one announcement
  surface instead of two.
- **A page-title band, one component, eleven doors.** Each public
  hub trades its inline `h1`-on-white header for
  `page-masthead.tsx`: a full-bleed deep-green band on the hero's
  gradient, gold eyebrow, white title, jade lead, and an optional
  end-edge slot — the map keeps its coverage figures there,
  recolored for ink; the directory keeps its privacy footnote as
  the band's note line; legal pages (terms and privacy share
  `LegalDoc`) keep their intro and "updated" line. Every string is
  the page's existing dictionary entry — the band re-skins, it
  never re-writes — and `[dir='rtl']` hands Arabic the Kufi
  display face for free. The entrance is the gated `rise`
  animation, so each page arrives the way the dashboard does.
- **Why hubs get an entrance, not scroll reveals.** The landing's
  `view()` reveals suit a long marketing page whose sections start
  below the fold; a hub's single tall container is already in view
  at scroll 0, where an `entry`-ranged timeline would park it at
  partial opacity until the first flick. Content containers stay
  static and honest; motion on these pages is the strip, the
  ticker, the band's rise, and the hover language that was already
  there.
- **Zero new words, zero moved contracts.** No dictionary key
  joined the four locales — the band borrows each page's own
  eyebrow/title/subtitle/note — the probe grew six checks (strip,
  ticker and band ride `/en/opportunities` and the directory), and
  E2E gained a two-test spec that pins the chrome on a hub plus
  the AR band in RTL. Locked strings, `#q`/`#opp`/`#filter-tray`
  and every P3 chip assertion are untouched.

## 29. The band carries detail pages & auth (P28)

- **One component, two shapes.** The band learned a `children`
  mode: hubs keep passing `title`/`eyebrow`/`subtitle`/`note`/
  `action` and get the string composition unchanged, while a
  detail page passes its own header markup inside the same
  gradient, wash and gated `rise`. A TS union requires exactly one
  of the two shapes, so the single-h1 contract holds structurally —
  no page can render a title block and a children block together.
- **Move the header, don't rebuild it.** Each detail page keeps
  its DOM order and its existing elements inside the band: the
  initiative keeps back link → badges → title → organizer
  identity → opened-on → save/report; the organization keeps its
  `<header>` wrapper with badges and the Message/Report entries,
  and the cover photo drops directly below the band with
  `org-cover` intact; the volunteer's identity card dissolves into
  the band — its white pieces (light chips, the outline button,
  the StatusBadge pill) already read correctly on ink. Only the
  classes that assumed a white ground changed: sand grays became
  `brand-100/200`, the organizer link became white with a clay
  hover, report links became `clay-300`.
- **Auth wears the silhouette too.** `AuthShell` titles every flow
  through a `max-w-md` band, so login, register, forgot/reset, MFA
  and verify-email open like the rest of the site while the card
  keeps its exact geometry below — the form is simply the first
  thing on white now. The `Welcome back` h1 moved with the title
  (the probe pins exactly one), and focus/validation contracts are
  untouched because nothing inside the form changed.
- **Contracts held.** No dictionary key joined the four locales;
  the probe grew five checks (band on detail/login/profile, a
  login 200, the single-h1 count) and widened its organizer-type
  span to accept the recolored `text-brand-200`; the site-chrome
  spec grew two tests. Locked strings, quick-chip hrefs and the
  P2 gates all stayed put.

## 30. Impact metrics, zoned (P29)

- **One card, both surfaces.** The metric used to be a single
  `label: value · source · verified` run-on line in the console
  and a shorter cousin on the public page. `impact-metric-card.tsx`
  splits the same facts into zones: a title row (type chip, name,
  verified badge, the console's timestamp), then a labelled
  Actual/Target pair — `text-2xl` tabular numerals, the actual in
  `brand-800`, the target in `sand-700`, `—` when nothing is
  declared — then the source on its own muted line. Callers keep
  their wrapper (`<li>` in the console, `Card as="li"` on the
  page), so both surfaces ship identical internals.
- **Honest progress.** When a real denominator exists the card
  paints a `role="progressbar"` with aria min/max/now: the bar
  caps visually at 100% but the printed figures never round or
  clip (an over-target actual still reads true), and a null or
  zero target skips the bar entirely rather than inventing a
  ratio. Decimal columns that arrive as JSON strings from the
  console's raw select normalise through one `figure()` helper.
- **The map only returns pinnable rows.** The probe's §16
  contract — every map item carries coordinates — failed once an
  ONLINE initiative (no place by design) was published:
  `buildDiscoverWhere` now requires own coordinates or a
  coordinate-carrying city in `mode=map`, the same fallback the
  renderer already used. The row remains in the regular list;
  the map payload, its `meta.total` and the pins agree again.
- **Contracts held.** No dictionary key joined the four locales
  (the console's metric labels ride the public page too), the
  probe grew two checks — the `data-impact-metric` hook and the
  `>Actual<` figure label — for 205 total, and
  `impact-metrics.spec.ts` pins both surfaces: 38 tests in 18
  files. Locked strings and the P2 gates stayed put.

## 31. The platform mark (P30)

- **Assets before code.** The user's official art (1254²
  transparent PNG — map, crescent, calligraphy, globe, wordmark)
  was resampled, never recolored: `public/logo.png` at 384²
  keeps the every-page load at ~167 KB, while `src/app/icon.png`
  (512²) and `src/app/apple-icon.png` (180²) give the document
  its first real icons — Next picks both up from the app
  directory with no metadata change.
- **Mark, then wordmark.** The header and footer slots render
  the image where the initial-letter `Avatar` sat: a square
  `h-11`/`h-10`, `decoding="async"`, `alt=""` — the adjacent
  siteName text stays the link's accessible name (`BLADNA` in
  EN/FR, `بلدنا` in AR, typed crisp beside the emblem). Auth
  flows center the same mark above the back-home link, so the
  brand is the first thing on the white card side of every
  login, register, reset, MFA and verify screen.
- **Contracts held.** No dictionary key joined the four locales;
  the probe grew two checks — the header ships
  `src="/logo.png"` and `rel="icon"` resolves to `icon.png` —
  for 207 total, and `site-chrome.spec.ts` grew two tests
  (pixels decode, links home, auth/footer marks present): 40
  tests in 18 files. Locked strings and the P2 gates stayed
  put.

## 32. Honest access & true link origins (P31)

**What broke live.** The user reported both against
production: workspace tabs answering "الصفحة غير موجودة" to
members whose role lacks the page's permission, and an
attendance check-in link that read
`http://localhost:3000/check-in?token=…`.

- **One state per cause.** `requireOrgMembership` throws
  `FORBIDDEN` for every access miss (no membership, suspended
  membership, missing organization, insufficient permission)
  and `NOT_FOUND` only for a vanished row — the workspace
  catches used to merge both into `notFound()`, claiming a
  page did not exist while the shell linked to it. They now
  split: `workspace-no-access.tsx` owns `FORBIDDEN` —
  standalone page (title as the h1, no org name leaked) at
  the layout gate, in-shell card with a back-to-overview link
  in the eleven tab pages — `NOT_FOUND` keeps `notFound()`,
  and the UNAUTHORIZED/MFA redirects are untouched. Two keys
  (`workspace.noAccessTitle/Body`) joined all four i18n
  files; returning the panel (instead of throwing) also ends
  the stuck streaming skeleton.
- **Links follow the caller.** `originFor(request)` in
  `http.ts` resolves X-Forwarded-Host, then Host, then the
  request URL: a host matching a configured app URL takes
  that URL's scheme (X-Forwarded-Proto wins),
  localhost/127.0.0.1 takes the request scheme on any port,
  and anything else — a forged Host included — falls back to
  `PUBLIC_APP_URL`, so a crafted header can never rewrite a
  generated link. `checkInUrlFor(ctx, token)` uses it at both
  call sites. The root `.env` `APP_URL`/`PUBLIC_APP_URL`
  moved to `https://bladna.aymen-digital-studio.site`, which
  fixes every environment-built link as well (email
  verify/reset, invitations, certificate verify).
- **Proof on both surfaces.** A session created through the
  production domain returns
  `https://bladna.aymen-digital-studio.site/check-in?token=…`;
  through localhost it returns
  `http://localhost:3002/check-in?token=…` (probe-checked).
  +4 `originFor` unit tests pin the allowlist and the
  forged-host fallback, and `workspace-access.spec.ts` adds
  the volunteer-denied and owner-control tests: E2E 42/42 in
  19 files, probe 211/211, P1 27/27, P2 ALL PASS.

## 33. One name, one message (P32)

**Trigger.** Two brand directives in one sitting: fix the
Arabic name ("أريد صحح بلدنا (بلادنا)") and rebuild the
marketing message the visitor meets first ("عاطفية وإيقاع
لغوي احترافي … كلمات ماشي متداولة … عبارة تشدّ الانتباه
وكي تعاود تسمعها تربطها بالمنصة").

- **The name is the art's name.** The official mark (P30)
  carries its own tagline — «مبادرة من بلادنا إلى فرصة في
  العالم» — and sixteen server-side strings already read
  `بلادنا`, yet the AR `siteName` sat beside the emblem
  reading `بلدنا` with eight more UI strings to match. All
  nine now read بلادنا: the wordmark beside the mark and
  the mark itself agree.
- **The message earns the first glance.** The old hero ran
  the trio every volunteer platform ships
  (اكتشف / Discover / Découvrez …) over a list of
  mechanics. The rewrite inverts the familiar proverb —
  EN: `No good deed goes unrecorded.`
  FR: `Le bien ne passe jamais inaperçu.` — while AR
  adopts the couplet «نصل الخير بأهله، ونمنح العطاء أثره»:
  two balanced verbs (نصل/نمنح) rhyming on أهله/أثره —
  the platform's whole job in eight words: connect good
  to its people, give giving its record. The subtitle
  opens with «من جهودٍ متفرّقة إلى أثرٍ يجمع الجزائر»
  (the مبتغى: scattered effort → one impact that unites
  Algeria), lands the precise content (vetting, review
  before publication, attendance, hours, certificates)
  and closes on «سجلٌ واحدٌ لا يُمحى يحفظه بلادنا» — the
  append-only promise wearing the brand's own name.
- **Plumbing facts.** Same two keys (`landing.heroTitle`,
  `landing.heroSubtitle`), zero new i18n keys; the live
  page renders the dictionary defaults (the CMS `home`
  override is empty in all three locales), and no test or
  probe assertion referenced the old copy. Final gates:
  validate exit 0 (446/43, 268 routes, API 269/269),
  E2E 42/42 / 19 files, probe 211/211, P1 27/27,
  P2 ALL PASS, `prettier --check .` exit 0.

## 34. The partnership substrate (P33)

**Trigger.** The approved Partnerships & CSR brief
(`docs/PARTNERSHIPS-CSR-DESIGN.md`): youth organizations
and economic institutions need one place to find each
other, agree, deliver funding or goods, and prove the
impact — without rebuilding anything that exists. The
five decision points were resolved toward the long-term
shape: Organization is the single identity anchor,
`userId` stays required, stages ship one gated increment
at a time, one profile model, UI last.

- **The bridge is the runway, not a detour.** Nothing
  existing is merged or replaced: `Sponsor` gains exactly
  one column — `organizationId @unique` — so the sponsor
  world becomes a 1:1-compatible projection of a tenant,
  while every new model anchors to `Organization`
  directly; legacy `/sponsors/*` rows keep NULL there and
  new partnerships never touch `Sponsor`. `SupportOffer`
  mirrors the pattern (`organizationId` optional,
  `userId` still the required author — the authenticated
  actor is always the author; the org-membership hint is
  re-resolved server-side, never trusted from input).
- **Explainable by construction.** `PartnerMatch` stores
  the score _and_ its `breakdown` — a JSON array of
  `{code, weight, points, detail}` reasons under
  `engineVersion rules-v1`, the convention
  `RiskAssessment` already established — so a
  recommendation can always be explained to the
  organization receiving it; no AI black box anywhere in
  the loop.
- **A chain, all additive.** Request → proposal →
  partnership → agreement → obligations; funding
  commitment → installments → disbursement + receipts;
  in-kind contributions with quantity, value and
  evidence; `ImpactEvidence` (claim → officer → terminal
  status) and `ImpactReport` frozen over verified data
  only; CRM (contacts, interactions, follow-ups, notes)
  alongside — 21 models, 21 enums, `CSRProgram`
  untouched, `NotificationType` +11.
- **Migration without a shadow database — and the drift
  it found.** The app role cannot `CREATE DATABASE`, so
  `migrate dev` is unavailable: `0012_partnerships_csr`
  came from `migrate diff --from-url` against the live,
  migration-consistent database and applied with
  `migrate deploy` — 730 lines, 21 `CREATE TABLE`,
  11 `ALTER TYPE … ADD VALUE`, zero `DROP TABLE/COLUMN`.
  The strict diff did surface latent drift: three
  indexes `0002_constraints` created in raw SQL
  (`AuditLog`/`Message` `createdAt DESC`, `availability`
  GIN) were never declared in the datamodel, so it
  dropped them. `0013_declared_indexes` declares all
  three (`@@index([availability], type: Gin)` included)
  and recreates them — net zero objects lost, and future
  diffs cannot take them again. DB: 13/13.
- **The boring parts that keep it honest.** The client
  regenerates only with `next start` stopped (the
  query-engine DLL is locked while the server runs); the
  seed gains 16 trilingual `CSRFocusArea` rows upserted
  by code — the shared vocabulary the engine compares —
  with the demo dataset untouched; `.prettierignore`
  covers `packages/database/src/generated/` so a future
  `db:generate` can never break `format:check`.
- **Nothing observable changed.** 268 routes, 269/269
  API docs, 446 tests — identical before and after; the
  substrate is in place for M2 (service modules, API,
  RBAC). Final gates: validate exit 0 (446/43, 268
  routes, API 269/269), E2E 42/42 / 19 files,
  probe 211/211, P1 27/27, P2 ALL PASS,
  `prettier --check .` exit 0.

## 35. The partnership API, two sides at a time (P34)

**Trigger.** M2 of `docs/PARTNERSHIPS-CSR-DESIGN.md` —
the approved design's §5/§6/§7: expose the M1 substrate
through service modules, routes, RBAC and state machines.
Schema untouched (M1 had already covered the contract),
UI deferred to M5; matching recompute, dashboards and
notifications remain M3/M4.

- **The state machines are the contract.** All eleven
  chains (request, proposal, partnership, agreement,
  obligation, funding commitment, installment,
  disbursement, in-kind, evidence, impact report) live as
  `TransitionMap`s in `@bladna/domain`; every route parses
  `{ action: <target status>, reason? }` and defers to
  `assertTransition`, so an illegal edge is rejected by
  the same table the tests exhaust — every declared edge
  passes, every other edge throws
  `BUSINESS_RULE_ERROR`, and every key mirrors its Prisma
  enum. Reason is mandatory for the five closing
  decisions (`REJECTED`/`WAIVED`/`BREACHED`/`CANCELLED`/
  `TERMINATED`) once, in a shared `reasonRequired`
  superRefine, not per route.
- **Every record has two sides, and the guard knows
  them.** `partnership-access.ts` resolves which tenant
  the caller may act on: a member of the other side
  without the permission gets 403 naming the exact
  permission, an outsider gets 404 (existence is not
  leaked). Obligations pin `party` to the caller's side
  server-side (platform actors must name it), funding
  writes are economic-only — a youth-side member is a
  visible 403, not a mysterious 404 — and disbursement,
  in-kind and impact verification are reachable only
  through the officer permission no org OWNER can hold.
- **Acceptance provisions, never rewrites.** A proposal
  `ACCEPTED` deterministically resolves the partnership
  sides (opportunity anchor first, else the side holding
  an economic profile is the economic one, else the asker
  is the initiative side), closes the request `APPROVED`
  and audits both events; a one-open-partnership-per-
  initiative guard keeps duplicates out. New proposal
  versions increment `version` and supersede the live
  rows — history is never mutated, matching M1's
  append-only instinct.
- **Numbers and stamps come from the system, not the
  caller.** Agreements draw `AGR-YYYY-######` from the
  existing `Counter`; `ACTIVE` stamps `signedAt`,
  `COMMITTED` stamps `committedAt`, `PAID` stamps
  `paidAt`, `VERIFIED` stamps the officer's id and time —
  and every write lands the design contract's uppercase
  audit event (`PARTNERSHIP_*`, `PROPOSAL_*`, `AGREEMENT_*`,
  `FUNDING_*`, `IN_KIND_*`, `ECONOMIC_*`), so the audit
  trail reads like the spec.
- **One offer entry, one validator.** `POST /support-offers`
  is the body-addressed alternative to the slug path:
  same kind rules via one shared `assertOfferMatchesNeed`,
  optional `organizationId` membership-checked, and the
  acting member stays `userId` and the audit actor —
  the M1 promise (`userId` required) survives the new
  convenience.
- **43 endpoints, documented as they land.** Platform
  137→179, total 268→311 (0 duplicates); `docs/API.md`
  documents all 43 (312/312) in the same breath, a route
  test pins the counts and lifecycle-critical keys, and
  the latent `NotificationType` Prisma↔types drift ships
  its +11 labels in all three locales. Final gates:
  validate exit 0 (489/45, 311 routes, API 312/312),
  E2E 42/42 / 19 files, probe 211/211, P1 27/27,
  P2 ALL PASS, `prettier --check .` exit 0.
