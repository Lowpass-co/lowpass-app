# CC — Salvage fixpack (P2). Rescue verified-real fixes stranded on dead branches. SINGLE OWNER.

Precondition: consolidation done, `main`, floor green. Gates after every item: `tsc` 0 · `eslint` 0 · `next build --webpack` green. Commit per item (small, revertable).

Six independent items, all verified still-broken on main (2026-07-03). Prefer cherry-pick where the branch is fresh enough; reimplement where stale. If a cherry-pick conflicts non-trivially, reimplement instead of force-resolving.

## 1. Hydration + /touch + rollback race — cherry-pick `bde61aa` from `fix/connection-hydration-touch`
- `src/components/realtime/ConnectionIndicator.tsx` seeds `online` via `navigator.onLine` in a `useState` initializer → SSR/client hydration mismatch (#418). Fix: init `true`/null, set real value in `useEffect`.
- `/touch` route returns 401/500 → must always 204 (it's a liveness ping).
- `RollbackConfirmModal.tsx` does `params.delete('version')` where it must `params.set('version', target.id)` → rollback race.
Verify the cherry-pick's assumptions still hold (branch is ~1 week old; files may have drifted).

## 2. Advance-copy N+1 — reimplement (source branch 877 commits stale)
`src/app/api/tours/[id]/advance/copy/route.ts:155` loops per-target with awaited Supabase calls. Batch: one select for sources, one bulk insert (or RPC). Measure before/after with a 10-show tour.

## 3. Layout-templates duplicate write — reimplement
`src/app/api/advance/layout-templates/route.ts` writes a duplicate `template_label` column (and calls `getWorkspaceTourIds()` wastefully). Determine which column is read (grep readers) → single write; migration only if a column is dead (next free ≥ 234, idempotent, hand-paste SQL for Adam).

## 4. Routing-save advance guard — CHECK CURRENT STATE FIRST
`feat/data-integrity-pass` (now merged) fixed cascade-wiping of income + folders (commits e5c8bdf, b86b0ba). The advance_instances delete path at `api/tours/[id]/routing/route.ts:198` may or may not still fire on date-edit. Trace it: if a routing save can still delete advance instances without user confirmation, add the same id-preserving treatment / explicit confirm listing affected shows. If already covered by the Part 1/2 fix, report NO-OP with the line-level proof.

## 5. Single-artist auto-skip — reimplement idea from `80a4738` (nav-redesign branch, do NOT merge the branch)
Post-auth: root `src/app/page.tsx` always redirects to `/artists` (picker). If the workspace has exactly one artist → redirect to `/artists/[id]` directly. Server-side count, no flash. Respect `?next=`.

## 6. Status-dot tokens — 5-minute fix
`src/components/advance/AdvanceSectionBuilder.tsx` (~lines 2862-2864): `bg-gray-500`/`bg-emerald-500` → `--color-lp-status-*` tokens per `docs/design-tokens.md`.

## Optional (ask Adam before building): Advance "Today" button
`feat/sprint-11-closeout` strands `findTodayShow.ts` + `AdvanceTodayButton.tsx` + `TourRoutingCalendar.tsx` (jump-to-today + mini calendar popover). No main equivalent. Feature, not fix — skip unless Adam opts in.

## Verify before claiming (hard rule)
Per item: files+lines changed, how you verified the bug existed before and is gone after (repro note), floor-green per commit. Item 4 requires explicit proof either way. Add/unblock smoke-test IDs in `docs/smoke-tests/` for items 1, 4, 5 in the same PR.
