# Cursor Prompt — PR A0.2: Sidebar simplification (remove Advance|Budget toggle)

Paste this whole file into Cursor. Execute in order. Do not skip steps. Do not add scope beyond what is listed. If a step is ambiguous, stop and ask rather than guessing.

---

## Context

PR A0.1 landed the new `AppTopBar` with a pill-slider `[Advance | Budget]` mode toggle. The sidebar (`src/components/layout/Sidebar.tsx`) still has its **own** older `[Advance | Budget]` toggle button block that does the same thing. Having both toggles is confusing — and the two of them share the same `lp-sidebar-mode` localStorage key so they mirror each other, which makes the duplicate even more pointless.

This PR removes the sidebar's version cleanly. The top-bar pill becomes the single source of truth for Advance↔Budget mode.

A second, related cleanup: the sidebar's `tourSecondaryItems` (Tour Summary / Tour personnel / Settlement / Rooming / Payroll) were conditionally shown based on `navMode`. With `navMode` gone from the sidebar, we keep them **always visible** below the `TourRoutingList` when a tour is selected. A fancier collapsible "Workspace" group is deferred — the user said "just keep them for now, can adapt later."

This PR is chrome-only. No route changes, no API changes, no new deps.

---

## Goal

Delete from `Sidebar.tsx`:

1. The `SIDEBAR_MODE_KEY` constant and the `SidebarNavMode` type alias.
2. The `navMode` state + `setNavMode` setter.
3. The `useEffect` that writes `navMode` to localStorage.
4. The `useEffect` that derives `navMode` from `pathname`.
5. The entire `[Advance | Budget]` button block (approximately lines 388–429 in the current file — the two adjacent `<button>` elements wrapped in `<div className={cn('mb-2 flex shrink-0 gap-1', ...)}>`).

Change:

6. The `<TourRoutingList>` invocation's `mode={navMode}` prop to `mode="advance"` (hardcoded).

Preserve everything else: the collapse/expand button, `SIDEBAR_COLLAPSED_KEY`, overview items, tour management items, tour secondary items, base groups (Data / Equipment / Admin), user footer, artist overview heading, "Change tour" control, all the collapsed-mode (72px) behavior.

---

## Files to modify

### `src/components/layout/Sidebar.tsx`

Apply the following 6 edits. After all 6, the file should compile cleanly and have zero references to `navMode`, `SidebarNavMode`, or `SIDEBAR_MODE_KEY`.

#### Edit 1 — Remove the `SIDEBAR_MODE_KEY` constant and `SidebarNavMode` type

```diff
 const SIDEBAR_COLLAPSED_KEY = 'lp-sidebar-collapsed';
-const SIDEBAR_MODE_KEY = 'lp-sidebar-mode';
-
-type SidebarNavMode = 'advance' | 'budget';
```

Leave `SIDEBAR_COLLAPSED_KEY` alone.

#### Edit 2 — Remove the `navMode` state

```diff
   const [collapsed, setCollapsed] = useState<boolean>(() => {
     if (typeof window === 'undefined') return false;
     return localStorage.getItem(SIDEBAR_COLLAPSED_KEY) === 'true';
   });
-  const [navMode, setNavMode] = useState<SidebarNavMode>(() => {
-    if (typeof window === 'undefined') return 'advance';
-    const stored = localStorage.getItem(SIDEBAR_MODE_KEY);
-    return stored === 'budget' ? 'budget' : 'advance';
-  });
```

#### Edit 3 — Remove the localStorage persist effect for nav mode

```diff
-  useEffect(() => {
-    if (typeof window === 'undefined') return;
-    localStorage.setItem(SIDEBAR_MODE_KEY, navMode);
-  }, [navMode]);
-
-  // Sync toggle with actual URL — if you land on /budget the toggle shows Budget,
-  // if you land on an advance page it shows Advance.
-  useEffect(() => {
-    if (!pathname) return;
-    if (pathname.startsWith('/budget')) {
-      setNavMode('budget');
-    } else if (pathname.includes('/advance')) {
-      setNavMode('advance');
-    }
-  }, [pathname]);
-
   useLayoutEffect(() => {
     document.documentElement.style.setProperty('--sidebar-w', collapsed ? '72px' : '260px');
   }, [collapsed]);
```

Both effects disappear — the URL/localStorage responsibilities now live entirely in `AppTopBarModePill.tsx`. The `useLayoutEffect` for `--sidebar-w` stays untouched.

#### Edit 4 — Remove the in-sidebar `[Advance | Budget]` button block

Find the `<div className={cn('mb-2 flex shrink-0 gap-1', collapsed && 'flex-col items-stretch px-0')}>` wrapper that contains the two `<button>` elements titled "Advance" and "Budget". Delete the entire block (opening `<div>` through closing `</div>` inclusive).

Before:

```tsx
                <div className={cn('mb-2 flex shrink-0 gap-1', collapsed && 'flex-col items-stretch px-0')}>
                  <button
                    type="button"
                    title="Advance"
                    onClick={() => {
                      setNavMode('advance');
                      // Navigate to the tour advance overview (show list) so the user
                      // can pick a specific show. If already on an advance page, this
                      // is a no-op in practice but keeps the intent clear.
                      router.push(`/tours/${selectedTourId}/advance`);
                    }}
                    className={cn(
                      'lp-label-caps flex flex-1 items-center justify-center gap-1 rounded-md py-2 transition-colors',
                      collapsed && 'px-0'
                    )}
                    style={{
                      backgroundColor: navMode === 'advance' ? '#FF4500' : 'var(--lp-sidebar-hover-bg)',
                      color: navMode === 'advance' ? '#fff' : 'var(--lp-sidebar-text-muted)',
                    }}
                  >
                    {collapsed ? <ClipboardList size={18} strokeWidth={2} /> : 'Advance'}
                  </button>
                  <button
                    type="button"
                    title="Budget"
                    onClick={() => {
                      setNavMode('budget');
                      // Budget is tour-level — navigate directly, no show selection needed.
                      router.push(`/budget?tour_id=${selectedTourId}`);
                    }}
                    className={cn(
                      'lp-label-caps flex flex-1 items-center justify-center gap-1 rounded-md py-2 transition-colors',
                      collapsed && 'px-0'
                    )}
                    style={{
                      backgroundColor: navMode === 'budget' ? '#FF4500' : 'var(--lp-sidebar-hover-bg)',
                      color: navMode === 'budget' ? '#fff' : 'var(--lp-sidebar-text-muted)',
                    }}
                  >
                    {collapsed ? <Wallet size={18} strokeWidth={2} /> : 'Budget'}
                  </button>
                </div>
```

After: nothing. The preceding block (the "Change tour" control / breadcrumb) and the following block (the `sidebar-scroll` wrapper around `TourRoutingList`) become direct siblings.

#### Edit 5 — Hardcode `mode="advance"` on `<TourRoutingList>`

```diff
                 <div className="sidebar-scroll flex min-h-0 flex-1 flex-col overflow-y-auto">
                   {selectedTourId && (
                     <TourRoutingList
                       tourId={selectedTourId}
                       routing={tourRouting}
-                      mode={navMode}
+                      mode="advance"
                       collapsed={collapsed}
                       isRoutingLoading={isRoutingLoading}
                     />
                   )}
                 </div>
```

#### Edit 6 — Prune now-unused imports

After edits 1–5, `Wallet` from `lucide-react` is used **only** inside `tourManagementItems` for the `Budget` entry (still referenced) — **keep it**. But double-check by grepping the file: if any of `Wallet`, `ClipboardList`, `Music`, `Users`, etc. have become unused **as a direct result of removing the toggle block**, remove them from the import list. Run:

```bash
npx tsc --noEmit --skipLibCheck
```

to surface any "declared but never used" warnings and prune accordingly. **Do not** remove imports speculatively — only ones that `tsc` flags.

---

## Hard rules — do not break

1. Do **not** modify `AppTopBarModePill.tsx`. It already handles localStorage + URL sync as the single source of truth.
2. Do **not** change the `lp-sidebar-mode` localStorage key name. It's shared with the top-bar pill and the rename is scheduled for PR A0.4.
3. Do **not** remove `SIDEBAR_COLLAPSED_KEY` or any collapse/expand behavior — that's a separate feature.
4. Do **not** touch `TourRoutingList.tsx`. The component's `mode` prop stays in its type signature for future flexibility.
5. Do **not** touch route handlers, API endpoints, or page files.
6. Do **not** add dependencies.
7. Do **not** refactor unrelated code you notice along the way.

---

## Acceptance criteria (run through each before finishing)

- [ ] `npx tsc --noEmit --skipLibCheck` is clean.
- [ ] `npm run lint` does not add new errors compared to before this PR (existing repo errors unaffected). Lint on `Sidebar.tsx` specifically is clean.
- [ ] `npm run dev` boots with no console errors.
- [ ] Open `/dashboard` with a tour selected: sidebar renders Artist Overview → (breadcrumb + Change tour) → TourRoutingList → tour secondary items (Tour Summary / Tour personnel / Settlement / Rooming / Payroll) → Data / Equipment / Admin groups → user footer. **No Advance|Budget toggle row anywhere.**
- [ ] Clicking a show in the routing list navigates to `/tours/<tourId>/advance/<routingId>` — same as before.
- [ ] Clicking Budget in the top-bar pill navigates to `/budget?tour_id=<tourId>` — same as before. Sidebar does not visually flicker or re-render the toggle row (there isn't one).
- [ ] Clicking Advance in the top-bar pill navigates to `/tours/<tourId>/advance` — same as before.
- [ ] Tour Summary / Rooming / Payroll / Tour personnel / Settlement links in the sidebar all resolve to existing routes (no 404s).
- [ ] Collapse the sidebar (arrow icon) → sidebar shrinks to 72px. Routing list + tour secondary items still render as icon-only rows. No leftover empty div / spacing from the removed toggle row.
- [ ] Expand again — full layout returns, no regression.
- [ ] `git grep 'SIDEBAR_MODE_KEY'` → no hits in `src/components/layout/Sidebar.tsx`. (May still exist in `AppTopBarModePill.tsx` under the local constant `MODE_KEY` — that's fine, different constant.)
- [ ] `git grep 'SidebarNavMode'` → no hits anywhere in `src/`.
- [ ] `git grep 'navMode'` → no hits in `src/components/layout/Sidebar.tsx` (may still exist in `TourRoutingList.tsx` and elsewhere — fine).

---

## Verification commands (run after implementation)

```bash
npx tsc --noEmit --skipLibCheck
npm run lint
git grep -n 'SIDEBAR_MODE_KEY' src/
git grep -n 'SidebarNavMode' src/
git grep -n 'navMode' src/components/layout/Sidebar.tsx
WATCHPACK_POLLING=true npm run dev   # smoke-test in browser
```

Paste the output tails into the PR description. The three `git grep` commands should return empty (or in the first one's case, zero hits inside `Sidebar.tsx` specifically).

---

## Out of scope for this PR (explicitly defer)

- Collapsible "Workspace" group wrapping the tour secondary items → deferred (decision: keep flat for now).
- Mobile focus-order fix (pill → actions order on narrow viewports) → **PR A0.3** touches the top bar responsively.
- Deleting `HeaderArtistTourPicker.tsx` / `Header.tsx` → **PR A0.4**.
- Renaming `lp-sidebar-mode` localStorage key → **PR A0.4** (with migration).

---

## Output format expected from Cursor

1. File tree diff (should only list `src/components/layout/Sidebar.tsx` as modified — plus any trivial import pruning).
2. The output of `npx tsc --noEmit --skipLibCheck` (must be empty = success).
3. The output of the three `git grep` verification commands.
4. A short note on any deviations from the prompt with justification.

Then stop. Do not auto-continue into A0.3.
