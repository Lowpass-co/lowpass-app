# Fix Sprint — Artist Scope + Glow + Rail + Theme + Rider RLS + Advance Template Delete

> Six small bugs surfaced during runtime smoke after the A/B/C nav + avatar + ⌘K fix sprint and UX22 ship. Run this AFTER A/B/C lands cleanly. Single short session, six commits.

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
5. Six commits, in order: A → B → C → D → E → F.

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

## D. Restore theme toggle + audit hardcoded light/dark colours (~30 min)

The legacy Sidebar had a `DarkModeToggle` mounted in it. When the Sidebar was retired, the toggle went with it. Adam now sees inconsistent theme rendering across pages — some surfaces respect the global `.dark` class, others appear stuck in light mode regardless.

The component already exists at `src/components/layout/DarkModeToggle.tsx`, paired with `src/hooks/useDarkMode.ts`. We just need to remount it (in the TopBar account dropdown) AND find the surfaces that hardcode light-only colours.

### D.1 Mount the toggle in the TopBar account menu

In `src/components/shell/TopBar.tsx`, the `AccountMenuContent` component currently renders Settings / Workspace / Sign out. Add a "Theme" row above Sign out:

```tsx
import { DarkModeToggle } from '@/components/layout/DarkModeToggle';

// inside AccountMenuContent — between Workspace and Sign out:
<div
  className="flex items-center justify-between px-3 py-2 text-sm"
  style={{ color: 'var(--lp-text)' }}
>
  <span className="inline-flex items-center gap-2">
    <Sun className="h-4 w-4" style={{ color: 'var(--lp-text-tertiary)' }} />
    Theme
  </span>
  <DarkModeToggle />
</div>
<div className="my-1" style={{ borderTop: '1px solid var(--lp-border)' }} />
```

Use whatever icon the existing `DarkModeToggle` exposes if it's already self-iconned. If `DarkModeToggle` renders its own button with sun/moon icon, drop the `<Sun />` and just put the toggle on the right.

### D.2 Audit hardcoded light-only colours

Run the grep pattern in the working tree:

```bash
grep -rn "\bbg-white\b\|\btext-black\b\|\btext-gray-9\|\bbg-gray-1\b\|\bbg-slate-\|\btext-slate-9" \
  src/app src/components 2>/dev/null \
  | grep -v "/_legacy/" \
  | grep -v "/m/" \
  | head -30
```

For each hit:
- Replace `bg-white` with `bg-lp-surface` or `style={{ background: 'var(--lp-surface)' }}`
- Replace `text-black` with `text-lp-text` or `style={{ color: 'var(--lp-text)' }}`
- Replace `text-gray-900` / `text-slate-900` with `text-lp-text`
- Replace `bg-gray-100` / `bg-slate-100` with `bg-lp-bg-secondary`

Stay strictly within Tailwind's `lp-*` colour utilities (defined via `@theme inline` in `globals.css`) or inline `style={{ ... }}` with `var(--lp-…)` tokens. Don't introduce new Tailwind plugin colours.

Skip files under:
- `src/components/_legacy/**` — quarantined
- `src/app/(app)/m/**` — mobile flows have their own light-only treatment for paper-style document reading; that's intentional
- `src/components/equipment/exportJobPdf.ts` — print template, hardcoded brand colours are correct there

### D.3 Acceptance

- [ ] Theme toggle visible in TopBar account dropdown
- [ ] Click toggle → `<html>` class flips between presence/absence of `.dark` immediately
- [ ] Page contents (background, text, borders, surfaces) all flip consistently — no surface stays light when the rest is dark or vice versa
- [ ] Toggle preference persists across reloads (the existing `useDarkMode` hook handles this via localStorage)
- [ ] No `bg-white` / `text-black` / `text-gray-900` / `text-slate-900` hits in the audit grep outside the skip-list
- [ ] Lint + typecheck clean

### D.4 Commit

```
fix(theme): restore dark-mode toggle + audit hardcoded light-only colours

The legacy Sidebar had a DarkModeToggle mount; retiring the Sidebar
removed it. DarkModeToggle component (src/components/layout/) and
useDarkMode hook (src/hooks/) still exist — remounted in the TopBar's
account dropdown menu between Workspace and Sign out.

Audited src/app + src/components for hardcoded light-only colours
(bg-white / text-black / text-gray-900 / text-slate-900 / bg-gray-100 /
bg-slate-100) and replaced with lp-* tokens. Skipped _legacy/, /m/*
(mobile paper-style read), and the rental PDF export template.

Toggle persists via existing useDarkMode hook (localStorage). Surfaces
flip consistently when toggled.

Made-with: Claude Code (artist scope / glow / rail / theme / rider sprint)
```

---

## E. Rider folders RLS — drop the admin gate (~10 min)

Adam can't create artist-scope rider folders because `rider_folders_insert` policy requires `is_workspace_admin()` for `scope = 'artist'`, and his profile's role doesn't have `is_god = true`. Manually granting `is_god` doesn't help in this app because `profiles.role_id` is NULL for most users — the role linkage was never wired up properly.

The admin gate was a defensive choice to prevent random tour managers from creating workspace-wide riders. In practice, that defensiveness is locking out the workspace owner from a primary feature. **Drop the gate. Workspace membership is sufficient.** If specific abuse cases emerge, gate then.

### E.1 Migration

Migration number: next sequential. As of last commit on main, the highest is 057. Use `058_rider_folders_relax_admin_gate.sql`.

Verify before writing:
```bash
ls database/migrations/[0-9][0-9][0-9]_*.sql | sort | tail -3
```
Take the next number above the highest.

### E.2 SQL

```sql
-- ============================================
-- LOWPASS — Relax rider_folders RLS: drop admin gate on artist-scope
-- Migration 058
--
-- The original 039_rider_folders.sql gated artist-scope writes behind
-- public.is_workspace_admin() (which checks profiles.role_id → roles.is_god).
-- In practice profiles.role_id is NULL for most users, so even the workspace
-- owner can't create artist-scope rider folders. Workspace membership is a
-- sufficient gate; tighten later if abuse cases emerge.
-- ============================================

DROP POLICY IF EXISTS "rider_folders_insert" ON public.rider_folders;
CREATE POLICY "rider_folders_insert"
  ON public.rider_folders FOR INSERT
  WITH CHECK (workspace_id = public.get_my_workspace_id());

DROP POLICY IF EXISTS "rider_folders_update" ON public.rider_folders;
CREATE POLICY "rider_folders_update"
  ON public.rider_folders FOR UPDATE
  USING (workspace_id = public.get_my_workspace_id())
  WITH CHECK (workspace_id = public.get_my_workspace_id());

-- DELETE policy keeps the admin gate for now — destructive ops should
-- still be protected. Workspace owners who can't delete a folder can
-- ask Cowork Claude to grant them is_god via the UPDATE roles SQL
-- pattern (when the role linkage works).
-- (No change to rider_folders_delete — keep as-is.)
```

Save as `database/migrations/058_rider_folders_relax_admin_gate.sql`. Adam will paste into Supabase SQL editor after merge.

### E.3 Acceptance

- [ ] Migration `058_rider_folders_relax_admin_gate.sql` exists with the SQL above
- [ ] Migration is next-sequential (verified against `ls database/migrations/[0-9][0-9][0-9]_*.sql | sort | tail`)
- [ ] After running 058 in Supabase, Adam can create artist-scope, tour-scope, and show-scope rider folders without the RLS error
- [ ] DELETE policy is unchanged (still admin-gated for safety)
- [ ] Lint + typecheck clean

### E.4 Commit

```
fix(rider-folders): relax RLS — drop admin gate on artist/tour/show writes

Migration 039 originally gated artist-scope rider_folders writes behind
public.is_workspace_admin(), which checks profiles.role_id → roles.is_god.
In practice profiles.role_id is NULL for most users, so even the workspace
owner can't create artist-scope rider folders ('new row violates row-level
security policy for table rider_folders').

Migration 058 drops the admin gate from INSERT and UPDATE; keeps DELETE
admin-gated for safety. Workspace membership is the gate. If specific
abuse cases emerge, tighten then.

Adam: apply 058 in Supabase SQL editor after this merges.

Made-with: Claude Code (artist scope / glow / rail / theme / rider sprint)
```

---

## F. Advance template delete — add missing UPDATE/DELETE RLS policies (~15 min)

The X next to a workspace custom advance section ("Support / Act / Who is…") opens the confirm modal, the user confirms, the modal closes, and the section reappears in the Custom block. This has resisted three previous attempted fixes because the symptom looks like a client/UI bug but the bug is in the database.

### F.1 Root cause

`public.advance_templates` has had RLS enabled since `001_initial_schema.sql`, but only ever received SELECT and INSERT policies (added in `011_advance_system_enhancements.sql` as `at_select` / `at_insert`). **No UPDATE policy. No DELETE policy. Anywhere. In any migration.**

Postgres default-deny RLS means: when the API at `src/app/api/advance/templates/[id]/route.ts` calls `.delete().eq('id', x).eq('workspace_id', y)` against `advance_templates` using the user-session client, the absent DELETE policy filters out every row → 0 rows match → DELETE affects 0 rows → **Supabase returns success, no error**. The route returns 204. The client's `if (res.ok)` branch runs, optimistically removes from local state, then calls `fetchTemplates()` which re-fetches and the "deleted" template is back. The PATCH path has the same hidden problem (saves silently no-op).

The DELETE route uses `createServerSupabaseClient` (anon key + cookies, RLS-respected), not the service role — so RLS is in force and the missing policy is decisive. Verified: the route file looks fine, the client modal flow looks fine, the schema looks fine. The bug is purely in the policy gap.

### F.2 Migration

Migration number: next sequential after `058_rider_folders_relax_admin_gate.sql`. Use `059_advance_templates_update_delete_policies.sql`. Verify before writing:

```bash
ls database/migrations/[0-9][0-9][0-9]_*.sql | sort | tail -3
```

### F.3 SQL

```sql
-- ============================================
-- LOWPASS — advance_templates UPDATE/DELETE RLS policies
-- Migration 059
--
-- 011_advance_system_enhancements.sql added at_select / at_insert
-- but never UPDATE or DELETE. With default-deny RLS, the existing
-- DELETE API (and any future PATCH that goes through the user
-- session client) silently affects 0 rows. The user sees: confirm
-- modal closes, custom section reappears (because fetchTemplates
-- repopulates a row that was never actually deleted).
--
-- Add UPDATE and DELETE policies, scoped to workspace ownership.
-- Platform templates (workspace_id IS NULL) remain immutable to
-- end users — no workspace owns them, so the gate fails.
-- ============================================

DROP POLICY IF EXISTS "at_update" ON public.advance_templates;
CREATE POLICY "at_update"
  ON public.advance_templates FOR UPDATE
  USING (workspace_id IS NOT NULL AND workspace_id = public.get_my_workspace_id())
  WITH CHECK (workspace_id IS NOT NULL AND workspace_id = public.get_my_workspace_id());

DROP POLICY IF EXISTS "at_delete" ON public.advance_templates;
CREATE POLICY "at_delete"
  ON public.advance_templates FOR DELETE
  USING (workspace_id IS NOT NULL AND workspace_id = public.get_my_workspace_id());

-- Down (commented for safety; uncomment to roll back manually):
-- DROP POLICY IF EXISTS "at_update" ON public.advance_templates;
-- DROP POLICY IF EXISTS "at_delete" ON public.advance_templates;
```

Save as `database/migrations/059_advance_templates_update_delete_policies.sql`. Adam will paste into Supabase SQL editor after merge.

### F.4 Client safety net (small)

`src/app/(app)/tours/[id]/advance/[routingId]/AdvanceSectionBuilder.tsx` `handleDeleteCustomSection` currently swallows non-ok responses silently (`if (res.ok)` with no else branch). Add a minimal error surface so a future RLS regression is visible instead of silent. Small diff inside `handleDeleteCustomSection`:

```ts
const handleDeleteCustomSection = async () => {
  if (!templateToDelete) return;
  setDeletingTemplate(true);
  try {
    const res = await fetch(`/api/advance/templates/${templateToDelete.id}`, { method: 'DELETE' });
    if (res.ok) {
      setSections((prev) => prev.filter((s) => s.template_id !== templateToDelete.id));
      fetchTemplates();
      setTemplateToDelete(null);
    } else {
      const body = await res.json().catch(() => ({}));
      console.error('[advance] template delete failed', { status: res.status, body });
      alert(`Couldn't delete this section. ${body?.error ?? `HTTP ${res.status}`}`);
    }
  } finally {
    setDeletingTemplate(false);
  }
};
```

(Yes, `alert()` is crude — replace with the workspace's toast primitive if one is wired in `AdvanceSectionBuilder`'s scope. The point is to fail loudly, not silently.)

Optional but recommended: the same pattern in this file's PATCH paths that hit `/api/advance/templates/${id}` would prevent another silent class of bug, but only mandatory for DELETE here.

### F.5 Acceptance

- [ ] Migration `059_advance_templates_update_delete_policies.sql` exists with the SQL above
- [ ] Migration is next-sequential after 058 (verified against `ls database/migrations/[0-9][0-9][0-9]_*.sql | sort | tail`)
- [ ] `handleDeleteCustomSection` has an `else` branch that surfaces non-ok responses
- [ ] After running 058 + 059 in Supabase, Adam can create a custom advance section, then delete it, and on next refresh it stays gone
- [ ] Platform-seeded templates (`workspace_id IS NULL`) cannot be deleted from the UI (the X button only renders for `t.workspace_id`-owned templates anyway, but verify)
- [ ] Lint + typecheck clean

### F.6 Commit

```
fix(advance-templates): add missing UPDATE/DELETE RLS + surface delete errors

advance_templates has had RLS enabled since 001 but only at_select +
at_insert policies (added in 011). Default-deny meant every DELETE and
UPDATE silently affected 0 rows — Supabase returns success, the API
returns 204, the client optimistically removes from local state, then
fetchTemplates() repopulates the still-present row. User-visible
symptom: confirm modal closes, custom section reappears.

Migration 059 adds at_update and at_delete policies, gated on
workspace ownership. Platform templates (workspace_id IS NULL) stay
immutable to end users.

Also adds an else-branch in handleDeleteCustomSection so a future
RLS regression surfaces instead of silently no-op'ing.

Adam: apply 058 + 059 in Supabase SQL editor after this merges.

Made-with: Claude Code (artist scope / glow / rail / theme / rider /
advance-template sprint)
```

---

## Final verification

After all six commits:

1. Hard-refresh `/rider-packs` — no LeftRail visible, full-width content
2. Hard-refresh `/gear` — same, no rail
3. Tours dropdown — opens grouped by artist
4. Click a tour from artist X → URL navigates, active artist context = X
5. Click `/dashboard` → still scoped to X (no rescope)
6. Click another tour from artist Y → context flips to Y
7. Active TopBar item — clean orange bottom border, no glow behind text
8. TopBar account dropdown → Theme row visible; toggle flips theme; persists across reload
9. Visit a few different pages (Dashboard, Personnel, /tours/[id], /library/deal-memos) — all flip consistently when theme toggles; no light-stuck surfaces
10. After Adam runs migration 058 in Supabase: create a new rider folder at artist scope → succeeds
11. After Adam runs migration 059 in Supabase: in `/tours/[id]/advance/[routingId]` edit mode, create a custom section, click X, confirm — section disappears and stays gone after page reload
12. Lint + typecheck clean

If any check fails, fix before declaring done. Then report SHAs to Adam.

---

## When done

```
Scope-glow-rail-theme-rider-advance sprint done.
Commits: <A-sha>, <B-sha>, <C-sha>, <D-sha>, <E-sha>, <F-sha>.
- Tours dropdown grouped by artist; tour-select also sets selectedArtistId
- TopBar active state = 2px bottom border, no behind-text glow
- LeftRail list-variant hidden when no filters/views configured
- DarkModeToggle remounted in TopBar account menu; theme audit
  replaced hardcoded light-only colours with lp-* tokens
- Migration 058 relaxes rider_folders RLS (drops admin gate on
  INSERT/UPDATE; DELETE still admin-only).
- Migration 059 adds missing UPDATE/DELETE RLS policies on
  advance_templates (default-deny was silently no-op'ing the custom
  section delete). Client now surfaces non-ok DELETE responses.
- Adam: apply 058 + 059 in Supabase SQL editor.
- Lint + typecheck clean
```
