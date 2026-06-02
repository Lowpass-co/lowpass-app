# CC Sprint — IA Cleanup (Two-Tier Hierarchy)

The app is mid-migration between two chrome systems. This sprint unifies on shell-v2 (ProductShell) AND introduces a clean two-tier hierarchy so workspace-level surfaces (Artists / Personnel / Equipment) live on a workspace dashboard, and tour-level surfaces (Operations / Budget / Advance) stay scoped to tour context.

**The mental model after this sprint:**

```
Tier 1 — Workspace level (no tour context)
  /artists      ← workspace dashboard, Artists tab (default)
  /personnel    ← workspace dashboard, Personnel tab
  /equipment    ← workspace dashboard, Equipment tab
  /settings     ← separate, reachable via gear icon + avatar dropdown

Tier 2 — Artist context (one artist, multiple tours)
  /artists/[id]                      ← artist home
  /artists/[id]/(library)/riders     ← artist library surfaces
  /artists/[id]/(library)/channel-lists
  /artists/[id]/(library)/files
  /artists/[id]/(library)/financials

Tier 3 — Tour context (one tour, multiple shows)
  /operations/[tourId]/*    ← Operations product
  /budget/[tourId]/*        ← Budget product
  /advance/[tourId]/[routingId]    ← Advance product
```

**Chrome rules:**

- **Workspace tier:** workspace dashboard header (workspace name + avatar dropdown + gear icon). Tabs for Artists / Personnel / Equipment. NO ProductRail.
- **Artist tier:** ProductHeader (artist name + breadcrumb + avatar). ProductRail visible but Operations / Budget / Advance dimmed (no tour selected yet). Home active.
- **Tour tier:** Full ProductRail active. ProductHeader shows tour name. Sub-nav per product.

---

**Sprint goal:** ship the two-tier IA. Kill the shell-v1 ↔ shell-v2 chrome mismatches. Make daily navigation predictable.

**Branch:** `feat/ia-cleanup` off `main` (AFTER Phase B §B4 is merged to main).

**Sequencing:** §B5 (density propagation) is DEFERRED until after this sprint so density tokens land on the migrated chrome cleanly. This is intentional.

---

## Hard rules

1. **One feature commit per sub-phase.** Halt-and-report at ~400 LOC.
2. **Lint baseline does not regress.** `tsc --noEmit` zero. `next build --webpack` green.
3. **No data model changes.** Pure chrome / route / component work. No migrations.
4. **No silent file deletions.** Items in §I1's deletion list are explicitly approved. Everything else gets `@deprecated` comments first.
5. **Verify before claiming.** File:line precision in every report.
6. **Out of scope:** Phase B work (budget polish), Phase C work (data frontloading), feature additions, entitlements wiring. This is purely IA / chrome consolidation.
7. **Entitlements are NOT wired this sprint.** Equipment is always visible for now. Future entitlement gates hide tabs per-user — that's a separate sprint.

---

# §I1 — Foundation: deletions, dead links, cross-chrome parity

Bundle of low-risk cleanup + chrome parity fixes that don't need their own halt. Sets a clean baseline before the workspace dashboard restructure.

## I1.1 — Route deletions + redirects

Approved for deletion. Orphaned or duplicate routes with working equivalents.

| Route | Reason | Redirect |
|---|---|---|
| `/calendar` | Duplicate of `/operations/[tourId]/day` | Server redirect → `/artists` |
| `/rooming/page.tsx` (workspace) | Duplicate of `/operations/[tourId]/rooming` | Redirect → `/artists` |
| `/rider-packs/page.tsx` (workspace) | Duplicate of `/operations/[tourId]/riders` | Redirect → `/artists` |
| `/advance/page.tsx` (workspace) | shell-v1 placeholder, unreachable in nav | Redirect → `/artists` |
| `/library/gear/page.tsx` | Orphaned, duplicate of `/equipment` | Delete; no redirect |
| `/library/personnel/page.tsx` | Orphaned legacy view | Delete; no redirect |
| `/library/deal-memos/page.tsx` | Orphaned legacy view | Delete; no redirect |
| `/library/page.tsx` (if exists) | Orphaned index | Delete |

## I1.2 — Dead link removal

- `src/components/shell-v2/ProductHeaderAvatarMenu.tsx`: remove the "Templates" menu item (page doesn't exist).
- `src/components/shell-v1/TopBar.tsx`: remove nav entries for `/calendar`, `/rooming` (would be 404 / redirect-only after deletes).

## I1.3 — Avatar photo in ProductHeader

`src/components/shell-v2/ProductHeader.tsx` (or wherever the avatar lives) currently renders initials. Use `<AccountAvatar>` with the user's photo URL — falls back to initials when photo is null.

32px circle, right edge of header, clickable to open dropdown. Match shell-v1's avatar treatment exactly.

## I1.4 — Cmd+K palette mounted app-wide

The Cmd+K palette currently mounts only on shell-v1 TopBar via `ShellTopBarClient`. Move its mount UP to `src/app/(app)/layout.tsx` (the app-wide layout) so it's available on every authenticated page regardless of chrome.

Global keybinding stays. No new search work — same providers, same UX.

## §I1 reporting

```
Phase I1 done. Commit: <hash>
Files deleted: [list]
Files modified: [list]
Redirects added: [list]
Verify: tsc=0, lint baseline, build green
Smoke:
  1. Visit /calendar, /rooming, /rider-packs, /advance (workspace) — all redirect to /artists.
  2. Avatar dropdown — Templates entry gone.
  3. ProductShell pages show avatar PHOTO (not initials) at top right.
  4. Cmd+K opens palette on any page.
Blockers: [empty if clean]
```

Estimated LOC: ~250-350.

---

# §I2 — Workspace dashboard structure

The structural change. `/artists` URL becomes the workspace dashboard with tabs. Sets up the route group + layout + ProductRail visibility rules. Equipment + Personnel migrate INTO the dashboard in §I3.

## I2.1 — `(workspace)` route group + dashboard layout

Use Next.js route groups to give Artists / Personnel / Equipment a shared layout without changing URLs.

```
src/app/(app)/
  (workspace)/              ← new route group
    layout.tsx              ← NEW: workspace dashboard layout
    artists/
      page.tsx              ← MOVED from src/app/(app)/artists/page.tsx
    personnel/
      page.tsx              ← MOVED in §I3 from src/app/(app)/personnel/page.tsx
    equipment/
      page.tsx              ← MOVED in §I3 from src/app/(app)/equipment/page.tsx
  artists/
    [id]/                   ← UNCHANGED (artist context, different layout)
      page.tsx
      (library)/...
```

The (workspace) parens are transparent — URLs stay /artists, /personnel, /equipment.

## I2.2 — WorkspaceHeader + WorkspaceTabs

Create `src/app/(app)/(workspace)/layout.tsx`:

```tsx
export default function WorkspaceLayout({ children }) {
  return (
    <div className="workspace-shell">
      <WorkspaceHeader />            {/* workspace name + avatar + gear */}
      <WorkspaceTabs />              {/* Artists · Personnel · Equipment */}
      <main className="workspace-content">{children}</main>
    </div>
  );
}
```

- **WorkspaceHeader:** workspace name on left, avatar dropdown + gear icon on right. NO ProductRail. NO ProductHeader. Its own chrome.
- **WorkspaceTabs:** horizontal tab bar with three entries (Artists / Personnel / Equipment). Active tab styled per design tokens. Tabs link to `/artists`, `/personnel`, `/equipment` (Next.js Links — routing handles active state via pathname).

Reuse tab styling from BudgetTabNav for visual consistency.

## I2.3 — Move /artists into (workspace)

`mv src/app/(app)/artists/page.tsx → src/app/(app)/(workspace)/artists/page.tsx`

Content stays the same (the artist card grid). URL `/artists` resolves to the new location.

The artist detail pages at `src/app/(app)/artists/[id]/*` STAY where they are — they have their own layout (artist context, ProductRail).

## I2.4 — ProductRail visibility rules

`src/components/shell-v2/ProductRail.tsx` (or equivalent) needs to respect tier:

- **Workspace tier:** rail does NOT render. The (workspace) layout doesn't include it.
- **Artist tier** (`/artists/[id]/*`): rail renders. Operations / Budget / Advance dimmed (no tour selected). Click on dimmed item → tooltip "Pick a tour first" OR navigate to artist's tour list.
- **Tour tier** (`/operations/[tourId]/*` etc.): rail fully active.

Implementation: ProductShell continues rendering the rail on tour/artist pages. The workspace dashboard layout doesn't use ProductShell — it has its own chrome.

## I2.5 — Gear icon placement

- **Workspace tier:** gear icon in WorkspaceHeader top-right (next to avatar). Links to /settings.
- **Artist + tour tiers:** gear icon at bottom of ProductRail. Same destination.
- **Both tiers:** gear ALSO in avatar dropdown.

## §I2 reporting

```
Phase I2 done. Commit: <hash>
Files added:
  - src/app/(app)/(workspace)/layout.tsx
  - src/components/shell-v2/WorkspaceHeader.tsx
  - src/components/shell-v2/WorkspaceTabs.tsx
Files moved: src/app/(app)/artists/page.tsx → (workspace)/artists/page.tsx
Files modified: src/components/shell-v2/ProductRail.tsx (workspace tier hide rule)
Verify: tsc=0, lint baseline, build green
Smoke:
  1. Visit /artists — workspace dashboard renders with tabs (Artists / Personnel / Equipment). Artists tab active. Card grid shows.
  2. Personnel and Equipment tabs visible but click target doesn't exist yet (404 acceptable — §I3 fills them).
  3. Click an artist → artist context loads with ProductRail (Home active, Operations/Budget/Advance dimmed).
  4. Click a tour from there → tour context with full ProductRail.
  5. No ProductRail on /artists itself.
  6. Gear icon in WorkspaceHeader top-right.
Blockers: [empty if clean]
```

Estimated LOC: ~300-400.

---

# §I3 — Equipment + Personnel migrate into workspace dashboard tabs

Two file moves + chrome removals + nav updates. Bundles cleanly because both follow the same pattern.

## I3.1 — Equipment

1. `mv src/app/(app)/equipment/page.tsx → src/app/(app)/(workspace)/equipment/page.tsx`
2. Remove the shell-v1 PageShell wrapper. Page content renders inside the (workspace) layout.
3. Verify InventoryTab + JobsTab sub-tabs (the existing nested tabs inside the equipment page) still work.
4. Remove `/equipment` from shell-v1 nav configs (`src/components/shell-v1/TopBar.tsx` WORKSPACE_NAV).
5. Grep `href="/equipment"` and `Link to="/equipment"` — all should still work (URL unchanged).

## I3.2 — Personnel

1. `mv src/app/(app)/personnel/page.tsx → src/app/(app)/(workspace)/personnel/page.tsx`
2. Remove the shell-v1 PageShell wrapper.
3. Verify personnel grid + detail slide-over still work.
4. Remove `/personnel` from shell-v1 nav configs.
5. Remove `/personnel` from the avatar dropdown (it's now reachable via workspace dashboard tab).
6. Grep internal links — URL unchanged.

## §I3 reporting

```
Phase I3 done. Commit: <hash>
Files moved:
  - src/app/(app)/equipment/page.tsx → (workspace)/equipment/page.tsx
  - src/app/(app)/personnel/page.tsx → (workspace)/personnel/page.tsx
Files modified: [list — TopBar, AvatarMenu, etc.]
Verify: tsc=0, lint baseline, build green
Smoke:
  1. Visit /equipment — workspace dashboard with Equipment tab active. InventoryTab + JobsTab work.
  2. Visit /personnel — workspace dashboard with Personnel tab active. Grid + slide-over work.
  3. Tab switching between Artists / Personnel / Equipment works.
  4. Old shell-v1 TopBar nav no longer shows Equipment or Personnel.
  5. Avatar dropdown no longer lists Personnel.
Blockers: [empty if clean]
```

Estimated LOC: ~150-250.

---

# §I4 — Settings + remaining shell-v1 migrations + dropdown cleanup + docs

Final cleanup bundle. Migrates the last shell-v1 surfaces, unifies the avatar dropdown, updates documentation.

## I4.1 — Settings migration

1. Update `src/app/(app)/settings/page.tsx` and `src/app/(app)/settings/members/page.tsx` to use ProductShell with `active=null` (clean — no fake "product" selected, ProductRail still visible for navigation back).

2. Verify the gear icon (per §I2.5) is wired in all three locations:
   - WorkspaceHeader top-right
   - ProductRail bottom (on artist + tour tiers)
   - Avatar dropdown

## I4.2 — Venues / Account-Rental / Bugs migrations

Three lower-traffic surfaces still on shell-v1. Migrate chrome only — content stays.

- **`/venues`:** placeholder page. Migrate to ProductShell with `active=null`. Stays reachable via avatar dropdown.
- **`/account/rental`:** dead per-user rental page. DELETE the page entirely; redirect to `/equipment`. Done. (Supersedes Sprint 12's unfinished cleanup.)
- **`/bugs`:** site-admin bug reports. Migrate to ProductShell with `active=null`. Admin gate (per `getUserAndAdminStatus()`) stays.

## I4.3 — Avatar dropdown cleanup

Open `src/components/shell-v2/ProductHeaderAvatarMenu.tsx`:

**Remove these items** (reachable elsewhere now):
- Personnel (was reachable via dropdown; now a workspace tab)

**Keep / verify:**
- Settings → /settings
- Venues → /venues (low-traffic, OK in dropdown)
- Bug Reports (admin only) → /bugs
- Theme toggle
- Sign out

Visually align item heights, hover states, icon sizes consistent with shell-v2 design tokens.

## I4.4 — Documentation

Update `CLAUDE.md`:
- Document the two-tier hierarchy as canonical.
- Note that `/artists`, `/personnel`, `/equipment` are workspace dashboard tabs in (workspace) route group.
- Note ProductRail hides on workspace tier, dims on artist tier (no tour).
- Update shell-v1 / shell-v2 section: shell-v1 now scoped to admin / mobile / auth / legacy only.
- Add "New workspace-level surface → mount under (workspace) route group" guidance.

Create `docs/handover/IA_HIERARCHY.md` — short reference for future agents summarising the two-tier model + chrome rules.

## §I4 reporting

```
Phase I4 done. Commit: <hash>
Files modified: [list including CLAUDE.md]
Files deleted: src/app/(app)/account/rental/page.tsx (redirected to /equipment)
Files added: docs/handover/IA_HIERARCHY.md
Verify: tsc=0, lint baseline, build green
Final shell-v1 page count: <N>
Final shell-v2 + workspace dashboard page count: <N>
Smoke:
  1. Visit /settings — new chrome. Gear icon visible in WorkspaceHeader and (when on artist/tour) at bottom of ProductRail.
  2. Visit /venues, /bugs — new chrome.
  3. Visit /account/rental — redirects to /equipment.
  4. Avatar dropdown shows only: Settings, Venues, Bug Reports (admin), Theme, Sign out. No Personnel, no Templates.
Blockers: [empty if clean]
```

Estimated LOC: ~250-400.

---

## Sprint summary

After all 4 sub-phases ship:

- **§I1:** 8 routes deleted/redirected, dead Templates link gone, avatar photo app-wide, Cmd+K palette app-wide
- **§I2:** workspace dashboard with tabs (Artists / Personnel / Equipment), ProductRail visibility rules per tier, gear icon placement
- **§I3:** Equipment + Personnel now workspace dashboard tabs
- **§I4:** Settings + Venues + Bugs migrated, Account/Rental redirects to Equipment, avatar dropdown cleaned, docs updated

Total estimated LOC: ~1000-1400 across 4 commits. ~1 week of CC time.

After this sprint, the app has a coherent two-tier hierarchy with a single chrome system for daily use.

---

## Resume prompt for CC (after Phase B §B4 ships + merges to main)

```
New sprint. Full spec in docs/handover/CC_IA_CLEANUP.md.

Branch: feat/ia-cleanup off main (after Phase B §B4 merges).

Four sub-phases §I1 → §I4 in order. Halt-and-report at 400 LOC per sub-phase. Each sub-phase bundles related work — don't split further unless LOC overshoots.

Two-tier hierarchy is the structural change — read §I2 carefully before recon. Workspace dashboard with tabs (Artists / Personnel / Equipment) replaces the current /artists page chrome via a (workspace) Next.js route group. ProductRail hides on workspace tier, dims on artist tier (no tour selected), full active on tour tier.

Adam already confirmed:
  - Equipment is a workspace dashboard tab (NOT a ProductRail entry)
  - Personnel is a workspace dashboard tab
  - Settings reachable via gear icon (WorkspaceHeader top-right AND ProductRail bottom) plus avatar dropdown
  - Entitlements NOT in scope — Equipment always visible for Adam

Start with §I1 (foundation: deletions + dead links + chrome parity). Sets clean baseline.

Standard report format per sub-phase: hash, files (path:line), verify (tsc/lint/build), smoke instructions for Adam, blockers.

Phase B §B5 (density propagation) is parked until this sprint ships. Don't try to coordinate them.
Phase C (data frontloading) is explicitly out of scope.
```
