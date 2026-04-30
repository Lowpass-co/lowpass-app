# Product Split Phase 0 — Audit + Visual Sketch + Home Reference

> Lowpass is being re-architected into four products: **Home** (artist-scoped cross-product dashboard), **Operations** (tour management — riders, routing, channel list, rooming, files, personnel, gear), **Budget** (financial), **Advance** (per-day execution). Eventually tier-priced; for now, all users get all four. Adam likes the visual direction in the three "Homepage Design Idea" HTML files he provided (especially Idea 3) — dense Bloomberg-terminal aesthetic with left icon rail, JetBrains Mono numbers, brand orange accents — but wants it blended with Lowpass's existing warmth (don't go full Bloomberg).
>
> **This prompt is Phase 0: planning + visual sketch + ONE reference page only.** Subsequent phases (1–6) migrate the actual app. **No production code changes outside the single reference Home page** — existing routes, components, and behaviour stay untouched until a future phase explicitly retires them. Adam reviews Phase 0's outputs and signs off the migration plan before Phase 1 starts.
>
> **New branch off main.** PR #6 (budget redesign) and any other in-flight work are unaffected.

---

## 0. Required reading

1. `CLAUDE.md`
2. `docs/handover/HANDOVER_FOR_BEN_2026_04_29.md` — current codebase state (mostly accurate, some drift since)
3. The three uploaded HTML files Adam provided as visual reference — search his uploads or paste-attached files. They're dense terminal-style mockups with left icon rail (Idea 3), top horizontal nav (Idea 1, 2), JetBrains Mono for numbers, brand orange `#ff4400` accent on `#0a0a0a` background. **Treat as visual reference for the AESTHETIC, not literal mockup for the structure.** The Lowpass brand orange `#FF4500` is identical to their `#ff4400` — already aligned.
4. `src/app/(app)/**` — every page under here needs to be classified into one of the four product silos in §A
5. `src/app/globals.css` — current design tokens, will need extension
6. `src/components/shell/**` — current TopBar, LeftRail, PageShell. New shell components will sit alongside (don't modify these in Phase 0).
7. `src/components/tours/TourBreadcrumb.tsx` and the per-page mount convention from CLAUDE.md — relevant context for the new shell

---

## 1. Hard rules

1. **No production code changes outside §C's reference Home page.** Phase 0 is planning + sketch + one preview route. Existing pages, routes, and components stay untouched.
2. New branch off main: `feat/product-split-phase0` (or similar). Don't piggyback onto existing PRs.
3. Single commit (or two if §C's reference page wants its own commit separate from §A/§B's docs).
4. No new dependencies. Recharts, Phosphor Icons (per the design HTML files), JetBrains Mono — confirm what's already imported and only add if absent. If absent, defer the addition to Phase 1.
5. Lint + typecheck clean (75/120 baseline). Build via `next build --webpack`.
6. **Visual blend, not full clone.** The HTML mockups are 12px-base Bloomberg-dense. Lowpass keeps Inter for body, picks up JetBrains Mono for numerics (currency, dates, IDs, counts), targets ~13px base for body text (between Lowpass's current ~14px and the mockup's 12px), keeps `#FF4500` as the accent, retains existing breathing room on detail pages. **Tables and lists** can go fully dense per the mockup; **detail pages and forms** keep their current breathing room. Document the rule in the token proposal so CC and future agents know what to apply where.

---

## A. Audit + migration map (~1.5 hr)

Produce `docs/handover/PRODUCT_SPLIT_MIGRATION_MAP.md` listing every existing route + component with its target product silo and proposed new URL.

### A.1 Enumerate current routes

Walk `src/app/(app)/**/page.tsx` and produce a table:

| Current route | Current purpose | Target product | Proposed new URL | Notes |
|---|---|---|---|---|
| `/dashboard` | Workspace overview | Home (or retire) | `/` (home redirects here) | Probably retire; Home replaces it |
| `/artists` | Artist picker | (kept as-is, gates entry) | `/artists` | Same |
| `/artists/[id]` | Artist Hub | Home | `/artists/[id]` (becomes Home) | Cross-product stats added |
| `/tours/[id]` | Tour Hub (Setup chips + CTAs) | Operations | `/operations/[id]` | Setup chip strip stays; the two big CTA cards (Advance + Budget) become product-switcher links |
| `/tours/[id]/advance` | Advance overview | Advance | `/advance/[id]` | |
| `/tours/[id]/advance/[routingId]` | Per-show advance | Advance | `/advance/[id]/[routingId]` | |
| `/tours/[id]/budget` | Budget | Budget | `/budget/[id]` | |
| `/tours/[id]/budget/settlement` | Settlement | Budget (with link to Ops) | `/budget/[id]/settlement` | |
| `/tours/[id]/routing` | Routing | Operations | `/operations/[id]/routing` | |
| `/tours/[id]/channel-list` | Channel List | Operations | `/operations/[id]/channel-list` | Lives with riders per Adam |
| `/tours/[id]/rider-packs` | Rider Packs | Operations | `/operations/[id]/riders` | |
| `/tours/[id]/rooming` | Rooming | Operations (linked to Tours + Budgets) | `/operations/[id]/rooming` | |
| `/tours/[id]/files` | Files | Operations | `/operations/[id]/files` | |
| `/tours/[id]/payroll` | Payroll | Budget? Operations? | tbd | **Confirm with Adam in audit report** |
| `/tours/[id]/hire` | Equipment hire | Operations | `/operations/[id]/hire` | |
| `/tours/[id]/edit` | Tour metadata edit | Operations | `/operations/[id]/edit` | |
| `/tours/[id]/tour-wide` | Tour-wide content | Operations | `/operations/[id]/tour-wide` (or fold into ops landing) | |
| `/tours/[id]/day` | Day view | Advance? Operations? | tbd | **Confirm with Adam** |
| `/tours/[id]/sheet` | ? | tbd | tbd | **Confirm with Adam** |
| `/tours/[id]/overview` | ? | Operations landing | `/operations/[id]` | |
| `/personnel/...` | Workspace personnel | Operations? Or workspace-level? | tbd | **Adam's call** |
| `/equipment/...` | Workspace equipment | Operations? Or workspace-level? | tbd | **Adam's call** |
| `/calendar/...` | Workspace calendar | Home? Workspace-level? | tbd | **Adam's call** |
| `/library/...` | Library subpages | Mostly Operations or workspace-level | tbd | **Adam's call per subpage** |
| `/settings/...` | Settings | Workspace-level (outside product nav) | `/settings/...` | Same |
| `/bugs` | Bug reports (admin) | Workspace-level (account dropdown) | `/bugs` | Same |
| `/m/...` | Mobile PWA | tbd | tbd | **Adam's call — probably Advance-only?** |
| `/admin/shell-playground` | Internal | Stays | Same | |

**Where the table says "tbd" or "Adam's call", surface explicitly in the audit report — do not silently assign a product.** Adam picks per-row before Phase 1 starts.

### A.2 Component disposition

Walk `src/components/**` and identify which components live with which product. Most will be obvious:
- `src/components/budget/**` → Budget
- `src/components/advance/**` → Advance
- `src/components/rider-packs/**` → Operations
- `src/components/tours/**` → Operations (Tour Hub becomes Operations landing)
- `src/components/shell/**` → Foundation (used by all products)
- `src/components/data-table/**`, `spreadsheet-grid/**`, `document/**` etc. → Foundation primitives (used by all products)
- `src/components/entity/**` → Foundation
- `src/components/_legacy/**` → Stays in legacy (untouched by Phase 0)

For each "Foundation" piece, note that it stays under `src/components/<primitive>/` and is shared.

For each product-specific piece, propose its new home in the rearranged source tree:

```
src/
  app/
    (app)/
      page.tsx                    → Home (artist-scoped)
      artists/[id]/page.tsx       → Same (Home alias for now? or canonical Home?)
      operations/[tour-id]/...
      budget/[tour-id]/...
      advance/[tour-id]/...
      settings/...
  components/
    home/
    operations/
    budget/
    advance/
    shell/                        ← unchanged
    data-table/                   ← unchanged
    ...primitives unchanged...
  server/
    home/
    operations/
    budget/
    advance/
```

(Or whatever tree shape CC proposes — surface in the audit report. The above is illustrative.)

### A.3 URL migration mapping rules

Every old route gets a redirect to the new equivalent. Rules:
- `/tours/[id]` → 301 → `/operations/[id]`
- `/tours/[id]/budget` → 301 → `/budget/[id]`
- `/tours/[id]/budget/settlement` → 301 → `/budget/[id]/settlement`
- `/tours/[id]/advance` → 301 → `/advance/[id]`
- `/tours/[id]/advance/[routingId]` → 301 → `/advance/[id]/[routingId]`
- `/tours/[id]/<other>` → 301 → `/operations/[id]/<other>` (default)
- `/dashboard` → 301 → `/` (or `/artists` if no artist context)

The audit report includes the full redirect table.

### A.4 Acceptance for §A

- [ ] `docs/handover/PRODUCT_SPLIT_MIGRATION_MAP.md` exists with all four sections (route table, component disposition, source-tree rearrangement, redirect table)
- [ ] Every page under `src/app/(app)/**` is either assigned to a product silo OR explicitly flagged "tbd — Adam's call"
- [ ] Every component under `src/components/**` is either assigned to a product silo OR identified as Foundation
- [ ] Adam reviews and signs off before Phase 1 starts

---

## B. Visual token proposal (~1 hr)

Produce `docs/handover/PRODUCT_SPLIT_TOKEN_PROPOSAL.md` documenting the blended visual system.

### B.1 Typography

- Body font: **Inter** (existing, keeps Lowpass character)
- Numerics font: **JetBrains Mono** (new, picks up Idea 3's nicest detail) — applied to currency, dates, time, counts, IDs, tabular columns
- Base size: **13px** for app body text (Lowpass is currently ~14px; Idea 3 is 12px; 13px is the blend)
- Heading scale: H1 24px / H2 18px / H3 15px (slightly tighter than current; Inter looks great at these sizes)
- Density rule (document it!):
  - **Tables, lists, status strips, dense data views** → can go to 12px with tighter line-heights, terminal-style. Apply `font-mono` to numeric columns.
  - **Detail pages, forms, slide-overs, prose** → stay at 13–14px with current breathing room. Form labels, body copy, tooltips.
  - **Headings, buttons, primary chrome** → 13–18px range per the heading scale.

### B.2 Colour tokens

The Idea 3 palette is already 95% aligned with current Lowpass — same dark base, same brand orange. Extension proposal:

```css
/* Existing Lowpass tokens (keep as-is) */
--lp-bg: #0e0e0e;
--lp-surface: ...;
--lp-orange: #FF4500;
--lp-text: ...;

/* New tokens picked up from Idea 3 / dense aesthetic */
--lp-bg-deep: #0a0a0a;          /* deeper than --lp-bg, used for table backgrounds */
--lp-panel: #111111;             /* table headers, strip backgrounds */
--lp-border-subtle: #222222;     /* dense table cell borders */
--lp-border-strong: #333333;     /* card borders, modal edges */
--lp-text-mono: #d1d5db;         /* monospace numeric content */
--lp-mono-font: 'JetBrains Mono', ui-monospace, monospace;
```

**No purple, no blue, no gradients introduced.** The HTML mockups have a few accent colours (success green, warning amber, danger red) that already exist as `--lp-status-*` tokens — no new additions needed.

### B.3 Shell components — sketch only

Don't build these in Phase 0. Sketch the contract:

- `<ProductRail>` — left icon rail, ~56px wide. Five icons: Home / Operations / Budget / Advance / (gap) / Settings + Avatar at bottom. Icons via Lucide-react (existing) or Phosphor (per Idea 3 — adds dependency, defer to Phase 1).
- `<ProductHeader>` — top header, ~44–48px tall. Left: artist switcher + tour switcher (when in a tour-scoped product). Right: search, notifications, account. Replaces existing TopBar.
- `<ProductShell>` — wraps the page body, owns scroll context for both rail and header. Replaces existing PageShell.

Document each shell's API + what existing components they replace. Don't write the code yet.

### B.4 Acceptance for §B

- [ ] `docs/handover/PRODUCT_SPLIT_TOKEN_PROPOSAL.md` exists with §B.1–§B.3
- [ ] Density rule is explicit (which surfaces go dense, which stay loose)
- [ ] No new dependencies proposed in this phase
- [ ] Adam reviews and signs off

---

## C. Home reference implementation (~2 hr)

Build ONE working preview of the new Home page. This is the only production-code piece in Phase 0 — everything else is docs.

### C.1 Route

Mount at `/playground/new-home/[artist-id]` (or behind a query flag like `/?preview=new-home`) so it doesn't conflict with existing routes. Adam navigates to it manually to eyeball.

### C.2 Shape (artist-scoped)

```
[ProductRail (placeholder — show four icons, no functional nav yet)]
  [ProductHeader (artist switcher + tour switcher placeholder)]
    [Hero: artist logo + name + "X tours · Y active shows · Z upcoming" stats]
    [4 stat tiles: Active Tours / Shows This Month / Personnel Active / Budget Committed — pulled from real data, JetBrains Mono numerics]
    [3 product cards (Operations / Budget / Advance) — each card lists THIS ARTIST'S TOURS as clickable rows; clicking a tour-row enters that product+tour]
    [Recent Activity table — last 10 events across the artist's tours, with a category badge per row (BUDGET / ADVANCE / OPERATIONS), JetBrains Mono timestamps]
```

### C.3 Data fetching

Server Component, fetches:
- The artist (existing query)
- Stats: active tours count, shows this month, personnel count, total budget committed for this artist
- Per-product: the artist's tours with last-touched timestamps
- Recent activity: union of recent budget edits + advance saves + operations updates, sorted desc, top 10

Use existing `getEntityDescriptor()` patterns where possible. New helpers if needed go in `src/server/home/`.

### C.4 Visual treatment

Apply the Phase B token proposal:
- 13px body text
- JetBrains Mono on every number (counts, currency, timestamps)
- Dense table for recent activity (sticky header, hover state, narrow padding)
- Wider breathing room around the 4 stat tiles + 3 product cards (don't make them cramped)
- Brand orange `#FF4500` for the four icons in the rail and accent borders on hover/active states
- No purple/blue/gradient — clean dark + orange accent

### C.5 Visual reference

The three Idea HTML files Adam provided show variations of this shape. The blend Adam wants:
- **Idea 3's left icon rail** (the simplest expression — rail is an always-visible product switcher)
- **Idea 2's stat tile shape with trend indicators** (stat tiles get a small `+1 from last month` line below the big number when comparison data exists)
- **Idea 1's recent activity table style** (compact, with category-coloured chip badges)

You're not cloning any one — pick the best from each, applied to Lowpass's existing chrome.

### C.6 Acceptance for §C

- [ ] `/playground/new-home/[artist-id]` route exists and renders
- [ ] Loads with real data for any artist with tours/budget/etc.
- [ ] Visual treatment matches the token proposal (13px body, JetBrains Mono numerics, dense recent activity, breathing room around tiles/cards)
- [ ] Click a tour-row inside a product card → navigates to a placeholder route (e.g. `/playground/new-home/[artist-id]/budget/[tour-id]` rendering "Budget for Tour X — to be migrated in Phase 3"). The placeholder is fine; the navigation pattern is what matters.
- [ ] No production routes touched
- [ ] Lint + typecheck clean
- [ ] No new npm deps added (defer JetBrains Mono via Google Fonts CDN per Idea 3's `@import url('https://fonts.googleapis.com/css2?family=JetBrains+Mono...')` pattern; that's not a dep)

---

## V. Verify (Adam)

When CC reports back, Adam reviews:

1. Open `/playground/new-home/[artist-id]` for one of your real artists. Eyeball the visual treatment.
2. Read `PRODUCT_SPLIT_MIGRATION_MAP.md` and resolve every "tbd" entry.
3. Read `PRODUCT_SPLIT_TOKEN_PROPOSAL.md` and confirm the density rule (which surfaces go dense vs loose).
4. Tell me what to change before Phase 1 starts. Or: "good, ship Phase 1."

---

## When done

```
Product Split Phase 0 done.
Commits: <sha>.
- docs/handover/PRODUCT_SPLIT_MIGRATION_MAP.md — every existing
  route → product silo + new URL + redirect table. Components
  classified. Source-tree rearrangement proposal.
- docs/handover/PRODUCT_SPLIT_TOKEN_PROPOSAL.md — typography,
  colour tokens, density rule, shell component sketches (no code).
- /playground/new-home/[artist-id] reference page rendering real
  data with the proposed visual treatment.
- No production routes touched. No new dependencies.
- Lint + typecheck clean. Built via next build --webpack.
- Adam reviews migration map (especially the "tbd" entries) and
  the visual reference before Phase 1 ships.
```

If CC encounters any structural issue that suggests the four-product split won't work cleanly (e.g. a current schema constraint that crosses product boundaries unavoidably), surface in the report rather than guessing — Adam will adjust the plan.
