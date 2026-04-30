# Product Split — Migration Map

Phase 0 deliverable. Classifies every existing route, component directory, and (where applicable) database table into one of the four products + Foundation, with proposed new URLs and a redirect table.

The four products:
- **Home** — artist-scoped cross-product dashboard. Lands you here after login.
- **Operations** — tour management: riders, routing, channel list, rooming, files, personnel, gear, hire.
- **Budget** — financial: line items, settlement, expense receipts, payroll, commissions.
- **Advance** — per-day execution: per-show advance forms, day view, document canvas surfaces.

**Foundation** is everything shared (shell, primitives, entity registry, storage helpers, auth).

---

## §1. Route inventory + target product

Every page under `src/app/(app)/**` classified. URLs that say "**tbd — Adam's call**" are explicit deferrals, not silent assignments. Adam picks before Phase 1 starts.

### Workspace-level (no tour scope)

| Current route | Current purpose | Target product | Proposed new URL | Notes |
|---|---|---|---|---|
| `/dashboard` | Workspace overview cards | **retire** | (delete; Home replaces it) | Redirect to `/` |
| `/artists` | Artist picker | **Foundation** (entry gate) | `/artists` (unchanged) | Stays as the pre-Home gate |
| `/artists/[id]` | Artist Hub (tours list + library cards) | **Home** | `/artists/[id]` (Home becomes canonical at this URL) | The current Artist Hub becomes Home |
| `/tours` | Workspace tour list | **Operations** | `/operations` | Tour-list landing inside Ops |
| `/tours/create` | New-tour wizard | **Operations** | `/operations/new` | |
| `/calendar` | Workspace calendar | **tbd — Adam's call** | tbd | Could be Home (cross-tour overview) or Operations (tour-internal). Suggest Home so it's accessible from any product. |
| `/personnel` | Workspace personnel roster | **tbd — Adam's call** | tbd | Cross-product; probably Foundation/workspace-level (`/personnel` unchanged) |
| `/equipment` | Workspace equipment + rental jobs | **tbd — Adam's call** | tbd | Rental side is its own thing (separate product?). Inventory side belongs to Operations. Suggest splitting: `/operations/equipment` (gear hire) vs `/equipment` (rental jobs business — possibly its own future product). |
| `/library/deal-memos` | Deal-memos library | **Budget** | `/budget/library/deal-memos` | Or workspace-level `/library/deal-memos` if Adam wants library cross-product |
| `/library/gear` | Gear library | **Operations** | `/operations/library/gear` | |
| `/library/personnel` | Personnel library | Same as `/personnel` decision | tbd | Dedupe with `/personnel` |
| `/rider-packs` | Workspace rider-pack search | **Operations** | `/operations/library/riders` | |
| `/rider-packs/[id]` | Rider-pack detail | **Operations** | `/operations/riders/[id]` | |
| `/templates` | Workspace templates | **Foundation** | `/library/templates` | Or fold under each product's library. |
| `/performance` | Performance metrics dashboard | **tbd — Adam's call** | tbd | What does this even do? Audit before assigning. |
| `/venues` | Venue database | **Operations** | `/operations/library/venues` | |
| `/gear` | Workspace gear (UX12 canonical entity index) | **Operations** | `/operations/library/gear` (consolidate with `/library/gear`) | |
| `/rooming` | Workspace rooming overview | **Operations** | `/operations/rooming` | |
| `/advance` | Workspace advance overview (cross-tour) | **Advance** | `/advance` | Could become an advance dashboard at the artist level. |
| `/budget` | Workspace budget overview | **Budget** | `/budget` | Same shape as advance; cross-tour budget summary. |
| `/settings` | Workspace settings | **Foundation** | `/settings` | Stays workspace-level. |
| `/profile` | User profile | **Foundation** | `/profile` | Stays. |
| `/bugs` | Bug reports (admin) | **Foundation** | `/bugs` | Stays. Account dropdown reaches it. |

### Tour-scoped (under `/tours/[id]/**`)

| Current route | Current purpose | Target product | Proposed new URL | Notes |
|---|---|---|---|---|
| `/tours/[id]` | Tour Hub (Setup chips + Advance/Budget CTAs) | **Operations** (landing) | `/operations/[id]` | The two big CTAs become Product-switcher links into Budget + Advance |
| `/tours/[id]/overview` | Tour summary dashboard | **Operations** | `/operations/[id]` (consolidate) | Likely same surface as the hub; merge |
| `/tours/[id]/edit` | Tour metadata edit | **Operations** | `/operations/[id]/settings` | |
| `/tours/[id]/tour-wide` | Tour-wide content blocks | **Operations** | `/operations/[id]/tour-wide` | Or fold into Operations landing. |
| `/tours/[id]/routing` | Routing editor | **Operations** | `/operations/[id]/routing` | |
| `/tours/[id]/channel-list` | Channel list | **Operations** | `/operations/[id]/channel-list` | Lives with riders per Adam |
| `/tours/[id]/rider-packs` | Tour rider packs list | **Operations** | `/operations/[id]/riders` | |
| `/tours/[id]/rider-packs/[packId]` | Pack editor | **Operations** | `/operations/[id]/riders/[packId]` | |
| `/tours/[id]/rooming` | Tour rooming grid | **Operations** | `/operations/[id]/rooming` | Cross-references Budget for cost roll-ups |
| `/tours/[id]/files` | Tour file index | **Operations** | `/operations/[id]/files` | |
| `/tours/[id]/personnel` | Tour personnel assignments | **Operations** | `/operations/[id]/personnel` | |
| `/tours/[id]/hire` | Equipment hire for tour | **Operations** | `/operations/[id]/hire` | |
| `/tours/[id]/budget` | Tour budget hub | **Budget** | `/budget/[id]` | The PR #6 redesign |
| `/tours/[id]/budget/settlement` | Per-show settlement | **Budget** | `/budget/[id]/settlement` | |
| `/tours/[id]/payroll` | Tour payroll | **tbd — Adam's call** | tbd | Belongs in Budget or Operations? Payroll = financial → Budget. But day-to-day operators (Ops) need it too. **Recommendation: Budget canonical, with a deep-link tile from Operations.** |
| `/tours/[id]/advance` | Advance overview | **Advance** | `/advance/[id]` | |
| `/tours/[id]/advance/[routingId]` | Per-show advance form | **Advance** | `/advance/[id]/[routingId]` | |
| `/tours/[id]/day` | Day view timeline | **tbd — Adam's call** | tbd | Day view spans budget + advance + ops. Probably Advance (it's per-day execution) but could be Home (cross-product day overview). |
| `/tours/[id]/sheet` | Unknown (legacy?) | **tbd — Adam's call** | tbd | Audit what this actually renders before assigning. Likely deprecated. |
| `/tours/[id]/summary` | Tour summary dashboard | **Home** or **Operations** landing | tbd | Possibly redundant with `/tours/[id]` and `/tours/[id]/overview`. Recommendation: pick ONE of the three (Tour Hub, Overview, Summary) as canonical Operations landing and delete the others. |

### Mobile PWA (`/m/**`)

| Current route | Current purpose | Target product | Proposed new URL | Notes |
|---|---|---|---|---|
| `/m/today` | Today's day-view (mobile) | **Advance** | `/m/advance/today` (or stays `/m/today` if Adam wants the mobile shell to be product-agnostic) | |
| `/m/show/[id]` | Per-show mobile view | **Advance** | `/m/advance/[id]` | |
| `/m/show/[id]/file/[fileId]` | Mobile file viewer | **Advance** (or Operations) | tbd | |
| `/m/files` | Mobile file index | **Operations** | `/m/operations/files` | |
| `/m/receipt` | Mobile receipt capture | **Budget** | `/m/budget/receipt` | |
| `/m/deal-memos` | Mobile deal-memo list | **Budget** | `/m/budget/deal-memos` | |
| `/m/deal-memo/[id]` | Mobile deal-memo detail | **Budget** | `/m/budget/deal-memos/[id]` | |

**tbd — Adam's call:** Should the mobile PWA be product-aware (each mobile route lives under its product), or should it stay flat (mobile is its own surface, not split by product)? Recommendation: **stay flat**. Mobile users are doing one thing at a time (today's show, this receipt, this file); product split adds nav burden without operator value.

### Admin / playground (no migration needed)

| Current route | Action |
|---|---|
| `/admin/data-table-playground` | Stays (internal QA). |
| `/admin/design-tokens` | Stays. Phase B's token additions surface here. |
| `/admin/shell-playground` | Stays. Phase 1's new shell components ship here first. |
| `/admin/spreadsheet-playground` | Stays. |
| `/playground/new-home/[artistId]` | **NEW in Phase 0 §C** — reference Home page preview. Behind `/playground` so it doesn't conflict with `/artists/[id]` (the canonical Home target). |

---

## §2. Component disposition

Walks `src/components/**` and assigns each top-level dir.

### Foundation (shared across all products — stay where they are)

- `src/components/shell/**` — TopBar, LeftRail, PageShell, SlideOver. Phase 1 introduces `<ProductRail>`, `<ProductHeader>`, `<ProductShell>` alongside these (don't replace; they ship to `/admin/shell-playground` first).
- `src/components/data-table/**` — `<DataTable>` primitive
- `src/components/spreadsheet-grid/**` — `<SpreadsheetGrid>` primitive
- `src/components/document/**` — `<DocumentCanvas>` primitive
- `src/components/timeline/**` — `<TimelineDashboard>` primitive
- `src/components/entity/**` — `<EntityChip>`, `EntityRoutingProvider`, slide-over hosts
- `src/components/command-palette/**` — ⌘K palette
- `src/components/ui/**` — generic UI atoms (StyledSelect, ContextMenu, DeleteConfirmationModal, Toast, etc.)
- `src/components/common/**` — shared atoms (LowpassLogo, ErrorBoundary, etc.)
- `src/components/layout/**` — AppShell + minor layout chrome
- `src/components/detail-panel/**` — Slide-over hosts for canonical entities (UX13 sweep target)
- `src/components/pwa/**` — PWA install + service-worker chrome
- `src/components/bug-report/**` — Floating bug reporter (workspace-level)
- `src/components/admin/**` — Internal admin pages

### Home (artist-scoped cross-product)

Phase 1 creates this dir. Currently empty.

- `src/components/home/**` — NEW. Artist hero, stat tiles, product cards, recent activity table.
- `src/components/dashboard/**` — Migrate the existing `DashboardArtistGate` and friends here, OR retire if the new Home replaces them.
- `src/components/artists/**` — Move artist-facing components here. Keep `NewArtistSlideOver` as Foundation since it's used from picker too.
- `src/components/calendar/**` — Cross-tour calendar; probably belongs to Home.

### Operations

- `src/components/tours/**` — TourBreadcrumb, TourSwitchDropdown, SetupStatusStrip, TourPrimaryCTACard, TourSecondaryCard, etc. → `src/components/operations/**`
- `src/components/tour-overview/**` → fold into operations
- `src/components/tour-wide/**` → fold into operations
- `src/components/routing/**` → `src/components/operations/routing/**`
- `src/components/channel-list/**` → `src/components/operations/channel-list/**`
- `src/components/rider-pack/**` → `src/components/operations/riders/**`
- `src/components/rooming/**` → `src/components/operations/rooming/**`
- `src/components/personnel/**` → `src/components/operations/personnel/**`
- `src/components/gear/**` → `src/components/operations/gear/**`
- `src/components/equipment/**` — **tbd** (rental business = its own product? or Operations?) Adam's call. If staying rental-as-its-own, leave under `equipment/`. If folding into Ops, move.

### Budget

- `src/components/budget/**` → `src/components/budget/**` (already named)
- `src/components/payroll/**` → `src/components/budget/payroll/**` (pending Adam's call on payroll product placement)
- `src/components/spreadsheet-view/**` — `BudgetDetailShell`'s grid renderers; folds under Budget
- `src/components/deal-memos/**` → `src/components/budget/deal-memos/**`
- `src/components/summary/**` — Tour-summary dashboard; check if budget-specific or cross-product

### Advance

- `src/components/advance/**` → unchanged (already named)
- `src/components/day-view/**` → `src/components/advance/day-view/**` (pending Adam's call on day-view product placement)
- `src/components/mobile/**` → if mobile stays flat, leave under `mobile/`. If mobile splits by product, move per route.

### Templates / library

- `src/components/templates/**` — Workspace templates. Foundation? Or per-product? **tbd — Adam's call.**

### Legacy (stays untouched)

- `src/components/_legacy/**` — Quarantined pre-overhaul code. No migration in Phase 0; Phase 5+ may delete.

---

## §3. Source-tree rearrangement (proposed)

Two-phase cutover so Phase 1 can land minimal scope.

### Phase 1 (minimal) — new top-level routes added, old URLs redirect

```
src/
  app/
    (app)/
      page.tsx                     ← NEW. Home redirect (/ → /artists or /artists/[lastSelected])
      artists/[id]/                ← Home canonical surface
      operations/[id]/             ← NEW. Tour Hub + tour-internal subpages
      budget/[id]/                 ← NEW. Budget hub + settlement subpage
      advance/[id]/                ← NEW. Advance overview + per-show subpages
      tours/[id]/                  ← REDIRECT-ONLY shells. 301 → new URL.
      ...workspace-level routes unchanged (settings, bugs, etc.)
```

### Phase 5 (after Phase 1 settles) — component dirs reorganised

```
src/
  components/
    home/
    operations/
      tours/, routing/, channel-list/, riders/, rooming/, personnel/, gear/, hire/
    budget/
      line-items/, payroll/, deal-memos/, settlement/
    advance/
      day-view/, mobile/
    shell/                         ← unchanged
    data-table/, spreadsheet-grid/, document/, timeline/, entity/, ui/, common/
    _legacy/                       ← unchanged
  server/
    home/, operations/, budget/, advance/   ← per-product server data fetchers
    shell/                                  ← getShellData + rails (Foundation)
```

**Why deferred to Phase 5:** moving component dirs in bulk is mostly mechanical but generates massive diffs that obscure logic-change PRs. Doing it after the routes settle means the code-mod can be a single rename PR with predictable surface area.

---

## §4. URL redirect table

Every old URL gets a 301 to its new equivalent. Implement in `src/middleware.ts` (or a `next.config.js` redirects block) — TBD Phase 1.

| Old URL | New URL | Rule |
|---|---|---|
| `/` | `/artists/[lastSelectedArtistId]` (or `/artists` if none) | Post-auth landing already handles this; Phase 1 makes `/` an explicit redirect rule. |
| `/dashboard` | `/` (which then resolves per the rule above) | |
| `/tours` | `/operations` | Workspace-level tour list → Ops landing |
| `/tours/[id]` | `/operations/[id]` | |
| `/tours/[id]/overview` | `/operations/[id]` | Consolidate |
| `/tours/[id]/summary` | `/operations/[id]` | Consolidate |
| `/tours/[id]/edit` | `/operations/[id]/settings` | |
| `/tours/[id]/tour-wide` | `/operations/[id]/tour-wide` | |
| `/tours/[id]/routing` | `/operations/[id]/routing` | |
| `/tours/[id]/channel-list` | `/operations/[id]/channel-list` | |
| `/tours/[id]/rider-packs` | `/operations/[id]/riders` | Renamed |
| `/tours/[id]/rider-packs/[packId]` | `/operations/[id]/riders/[packId]` | |
| `/tours/[id]/rooming` | `/operations/[id]/rooming` | |
| `/tours/[id]/files` | `/operations/[id]/files` | |
| `/tours/[id]/personnel` | `/operations/[id]/personnel` | |
| `/tours/[id]/hire` | `/operations/[id]/hire` | |
| `/tours/[id]/budget` | `/budget/[id]` | |
| `/tours/[id]/budget/settlement` | `/budget/[id]/settlement` | |
| `/tours/[id]/payroll` | `/budget/[id]/payroll` *(pending Adam's call)* | |
| `/tours/[id]/advance` | `/advance/[id]` | |
| `/tours/[id]/advance/[routingId]` | `/advance/[id]/[routingId]` | |
| `/tours/[id]/day` | *(pending Adam's call)* | |
| `/tours/[id]/sheet` | *(pending Adam's call — likely retire)* | |
| `/tours/create` | `/operations/new` | |
| `/library/deal-memos` | `/budget/library/deal-memos` *(pending Adam's call on library top-level vs. per-product)* | |
| `/library/gear` | `/operations/library/gear` | |
| `/library/personnel` | `/personnel` | Dedupe |
| `/rider-packs` | `/operations/library/riders` | |
| `/rider-packs/[id]` | `/operations/riders/[id]` | |
| `/calendar` | *(pending Adam's call — Home or Foundation workspace-level)* | |
| `/personnel`, `/equipment`, `/venues`, `/gear`, `/templates`, `/performance`, `/rooming`, `/advance`, `/budget` | *(workspace-level cross-tour pages — pending Adam's call on whether each is Home / per-product / Foundation)* | |

Workspace-level pages (`/settings`, `/profile`, `/bugs`, `/admin/**`) keep their existing URLs.

---

## §5. Database considerations

**No schema changes in the product split.** Tables stay where they are. Code-level packaging (component dirs, server fetchers) reorganises around the products, but the data layer is product-agnostic.

That said, two existing schema gaps surface:

1. **`rental_inventory` / `rental_jobs` / `rental_job_items` are user-scoped, not workspace-scoped** (PR #5 §3.1). Already documented. The Equipment page surface is on the bubble between Operations and "rental business as its own product" — Adam's call clarifies the data model decision too.

2. **`_lp_migrations` tracking table** — Independent of the product split, but the SQL Drift Audit (`SQL_DRIFT_AUDIT_2026_04_30.md`) recommends adding one. Doesn't block Phase 0 or Phase 1; surfaced here so it's on the radar.

---

## §6. Decisions Adam needs to make before Phase 1

Compiled from every "tbd" in §1 + §2:

1. **`/calendar`** — Home cross-tour, or workspace-level Foundation?
2. **`/personnel`** — Foundation workspace-level, or fold into Operations?
3. **`/equipment`** — Operations gear hire? Or "rental business" is its own future product? (Splits the page.)
4. **`/library/**`** subpaths — fold each into its respective product, or keep `/library/*` as a Foundation cross-product surface?
5. **`/performance`** — what does it actually do today? Audit before assigning.
6. **`/rooming`** workspace-level — Operations? Or Home overview?
7. **`/advance`** + **`/budget`** workspace-level (cross-tour) — keep as product-level dashboards inside Advance / Budget? Or fold into Home?
8. **`/tours/[id]/payroll`** — Budget canonical with a tile from Operations, or Operations canonical?
9. **`/tours/[id]/day`** — Advance, Operations, or Home?
10. **`/tours/[id]/sheet`** — what is it? Likely deprecated; verify before assigning.
11. **`/tours/[id]/summary` vs `/tours/[id]/overview` vs `/tours/[id]`** — pick ONE canonical Operations landing; delete or redirect the others.
12. **`/m/**`** mobile PWA — flat (mobile = its own surface), or product-aware (each mobile route under its product silo)?
13. **`src/components/equipment/**`** — depends on #3 above.
14. **`src/components/templates/**`** — Foundation cross-product, or split per product?

These get resolved in Adam's review of this doc; Phase 1 doesn't start until each row above has a verdict.
