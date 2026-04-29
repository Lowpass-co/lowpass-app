# Fix Sprint — Artist Scope + Active-State Glow + Empty Rail

> Three small bugs surfaced during runtime smoke after the A/B/C nav + avatar + ⌘K fix sprint. Run this AFTER A/B/C lands cleanly. Single short session, three commits.

---

## 0. Required reading

1. `CLAUDE.md`
2. `src/contexts/ArtistTourContext.tsx` — the existing artist-scope state container (predates the UX overhaul; still wired)
3. `src/components/shell/TopBar.tsx` — the new TopBar from the A/B/C sprint
4. `src/components/shell/LeftRail.tsx` — the list-archetype variant rendering

---

## 1. Hard rules

1. No new dependencies.
2. All visual values via `var(--lp-…)` tokens.
3. No `any`, no `// @ts-ignore`.
4. Lint + typecheck clean (75/121 baseline).
5. Three commits, in order: A → B → C.

---

## A. Restore artist→tour scope in TopBar (~30 min)

The legacy Sidebar had an artist picker that filtered the Tours dropdown to one artist's tours at a time. When the Sidebar was retired, the TopBar's flat "Select tour" dropdown lost that filter — operators now see every tour from every artist mixed together. `ArtistTourContext.setSelectedArtistId` still exists; just needs UI.

### A.1 Target

Two paths — pick (i) for minimum diff, (ii) for richer UX. Recommend (i):

**(i) Tours dropdown becomes hierarchical:**
- Group tours under their artist
- Group headers are the artist names (subdued caps treatment)
- Selecting a tour ALSO sets `selectedArtistId` to that tour's artist
- Add a top-level "All artists" affordance that clears `selectedArtistId`

**(ii) Add a separate Artist dropdown** between the logo and the Tours dropdown.
- Top-level "All artists" + each artist below
- Active artist highlighted
- Selecting an artist filters the Tours dropdown to that artist's tours
- Clearing artist re-shows all tours

### A.2 Implementation (option i — hierarchical)

In `src/components/shell/TopBar.tsx` (or `ShellTopBarClient.tsx` upstream):

1. Extend the `tours` prop type from `Array<{ id, name, status }>` to include `artistId` and (denormalised) `artistName`. Source from `getShellData()` — extend the query to `JOIN artists` and project `artist_id, artists.name AS artist_name`.

2. In the existing `TourMenuList`, group by `artistName`:
   ```tsx
   const grouped = groupBy(active, (t) => t.artistName ?? 'Unassigned');
   const groupKeys = Object.keys(grouped).sort();
   ```

3. Render each group:
   ```tsx
   {groupKeys.map((artistName) => (
     <div key={artistName}>
       <div className="px-3 py-1 text-xs font-semibold uppercase"
            style={{ color: 'var(--lp-text-tertiary)', letterSpacing: 'var(--lp-tracking-caps)' }}>
         {artistName}
       </div>
       {grouped[artistName].map(renderTourButton)}
     </div>
   ))}
   ```

4. On tour selection, also set `selectedArtistId` via `useArtistTourContext()`:
   ```tsx
   const { setSelectedArtistId, setSelectedTourId } = useArtistTourContext();
   const onTourSelect = (id: string) => {
     const tour = tours.find(t => t.id === id);
     if (tour?.artistId) setSelectedArtistId(tour.artistId);
     setSelectedTourId(id);
     router.push(`/tours/${id}`);
   };
   ```

5. Add a top-level "All artists" item above the groups: `selectedArtistId` clears, no tour change. (Defer if the existing `DashboardArtistGate` already provides the workspace-wide path.)

### A.3 Acceptance

- [ ] Tours dropdown shows tours grouped under artist names
- [ ] Selecting a tour also sets `selectedArtistId` to that tour's artist
- [ ] Active tour shows a check mark; group it's in renders normally
- [ ] Archived tours grouped at the bottom (existing pattern preserved)
- [ ] Navigating to `/dashboard` no longer "undoes" the artist scope (because it was never silently set differently — same context flows through)
- [ ] If the workspace has only 1 artist, group headers are hidden (degenerate case)
- [ ] Lint + typecheck clean

### A.4 Commit

```
fix(topbar): restore artist→tour scope via grouped Tours dropdown

The legacy Sidebar had an artist picker that filtered the Tours dropdown
to one artist's tours at a time. When the Sidebar was retired (b9317e3),
the new TopBar lost this; the flat "Select tour" dropdown now shows every
tour from every artist mixed together.

Restored via a hierarchical Tours dropdown: tours grouped by artist with
muted caps headers, group ordering alphabetical. Selecting a tour also
sets ArtistTourContext.selectedArtistId so downstream pages (which
already consume the context) re-scope correctly. Single-artist workspaces
hide the headers (degenerate case).

getShellData extended to project artist_id + artist_name on each tour row.

Made-with: Claude Code (artist scope / glow / rail fix sprint)
```

---

## B. Active-state glow z-index fix (~10 min)

Adam reported the orange active-state highlight on TopBar nav items rendering "behind" the icons / text. Visually wrong — should be either a bottom-border underline OR a background tint that sits beneath the text content (not over it).

### B.1 Investigate

```bash
grep -B 2 -A 10 "WORKSPACE_NAV.*map\|navItems.*map" src/components/shell/TopBar.tsx | head -40
```

Look at the active rendering. Likely cases:
- `<span style={{ background: '#FF45001a', position: 'absolute', inset: 0 }} />` rendering with z-index 1 above the parent's content
- A `::before` pseudo-element on the link with wrong stack order
- `boxShadow: 'inset 0 -2px var(--lp-orange)'` rendering where the icon happens to live

### B.2 Target

Active nav item should look like:
- Text + icon at full opacity, normal stacking (no z-index needed)
- A 2px `--lp-orange` bottom border (NOT a glow behind the text)
- OR a subtle background tint at `color-mix(in srgb, var(--lp-orange) 5%, transparent)` that sits at z-index 0 (i.e. text/icons render above)

Match the Bug Reports active-tab pattern (it's the documented baseline). Pick the simpler of the two if uncertain.

### B.3 Implementation

In the nav-item render:

```tsx
const active = item.activeMatch(pathname);
return (
  <Link
    href={item.href}
    className="relative inline-flex items-center px-3 py-2 text-sm"
    style={{
      color: active ? 'var(--lp-text)' : 'var(--lp-text-secondary)',
      borderBottom: active ? '2px solid var(--color-lp-orange)' : '2px solid transparent',
    }}
  >
    {item.label}
  </Link>
);
```

Don't use absolute-positioned overlays. Don't use `boxShadow` that could clip behind. The border-bottom approach is the cleanest and renders predictably across browsers + dark mode.

Apply the same pattern to the Library dropdown button when any of its menu items match the current path.

### B.4 Acceptance

- [ ] Active nav items show a 2px brand-orange bottom border, full text/icon opacity, no glow behind
- [ ] Library button lights up when on `/library/*`, `/rider-packs`, `/gear`, `/templates`, `/performance`, `/venues`
- [ ] Hover state different from active (background tint on hover only)
- [ ] Dark mode parity (orange visible against `--lp-bg`)
- [ ] No z-index hacks remain in the rendering

### B.5 Commit

```
fix(topbar): active-state border-bottom instead of behind-text glow

A/B/C sprint introduced an active-state visual that rendered as a glow
behind the nav text/icons (z-index ordering bug). Replaced with a clean
2px brand-orange bottom border on active items — no overlays, no
absolute-positioned chrome, no z-index needed. Library dropdown button
lights up when any of its menu items match the current path.

Made-with: Claude Code (artist scope / glow / rail fix sprint)
```

---

## C. Hide LeftRail when no filters AND no saved views (~15 min)

The `list` archetype's LeftRail variant currently always shows a "Filters" header even when `filters: []` and no saved views are configured. On workspace-level pages where filter wiring isn't done yet (most of them), this renders as visual dead space with "No filters" text — confusing.

### C.1 Target

When the list-variant has no filters AND no saved views configured, the LeftRail should render nothing (or render `kind: 'none'`). PageShell's grid then collapses the rail column and the main content takes the full viewport width.

### C.2 Implementation

In `src/components/shell/LeftRail.tsx`, find the `list` variant render path. Add an early return:

```tsx
case 'list': {
  const hasFilters = (variant.filters?.length ?? 0) > 0;
  const hasSavedViews = (variant.savedViews?.length ?? 0) > 0;
  if (!hasFilters && !hasSavedViews) return null;
  // ... existing render
}
```

`PageShell` already handles `leftRail: null` correctly (it collapses to `1fr` columns) per the original UX02 spec. Verify by checking `PageShell.tsx`'s grid logic — should already work.

### C.3 Acceptance

- [ ] On list pages without filters configured (e.g. `/rider-packs`, `/gear`, `/library/deal-memos` if not wired), the LeftRail doesn't render — content uses full viewport width
- [ ] List pages WITH filters configured (e.g. once UX13's per-page DataTable migration lands and pages use the column-filter API) — LeftRail still renders normally
- [ ] No "Filters / No filters" empty state visible anywhere
- [ ] Dark mode parity

### C.4 Commit

```
fix(left-rail): hide list variant when no filters and no saved views

The list archetype's LeftRail variant always rendered a "Filters" header
even when no filters or saved views were configured, producing confusing
visual dead space with "No filters" text on most workspace pages.

Now: list-variant returns null when both filters and saved views are
empty. PageShell's grid collapses the rail column; content takes the
full viewport width. List pages WITH filters configured (post-UX13
per-page migration) continue to render the rail normally.

Made-with: Claude Code (artist scope / glow / rail fix sprint)
```

---

## Final verification

After all three commits:

1. Hard-refresh `/rider-packs` — no LeftRail visible, full-width content
2. Hard-refresh `/gear` — same, no rail
3. Tours dropdown — opens grouped by artist
4. Click a tour from artist X → URL navigates, active artist context = X
5. Click `/dashboard` → still scoped to X (no rescope)
6. Click another tour from artist Y → context flips to Y
7. Active TopBar item — clean orange bottom border, no glow behind text
8. Lint + typecheck clean

If any check fails, fix before declaring done. Then report SHAs to Adam.

---

## When done

```
A/B/C scope-glow-rail sprint done.
Commits: <A-sha>, <B-sha>, <C-sha>.
- Tours dropdown grouped by artist; selecting tour also sets selectedArtistId
- TopBar active state = 2px bottom border, no behind-text glow
- LeftRail list-variant hidden when no filters/views configured
- Lint + typecheck clean
```
