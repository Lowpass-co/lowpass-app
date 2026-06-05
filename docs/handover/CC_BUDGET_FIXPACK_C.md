# Claude Code prompt — Budget Fix-pack C (post-Stage-3 smoke fixes)

> From Adam's smoke of the Fix-pack B push. RUN AFTER Stage 3 is committed
> — these touch the same files Stage 3 edits (slide-over, settings, grid),
> so don't run concurrently. Visual/UX + one real bug (#3). Token-clean;
> reuse existing patterns (optimistic, BudgetConfirmDialog, portaled
> InlineSelectCell); eslint 0; tsc clean; `next build --webpack`; show
> diffs + line ranges; commit nothing.

## Tasks

1. **Retire Category from the UI — Section is the only grouping concept.**
   Users are confused by seeing both Section and Category. Remove the
   `CategoryChipDropdown` (and any other user-facing category control)
   from the line-item slide-over; the **Section** dropdown is the single
   grouping field. KEEP the `category` column in the DB and on writes
   (back-compat + derived-line bookkeeping) — just stop surfacing/editing
   it. Where duplicate detection or grouping still keys on `category`,
   switch it to `section_id`. No schema change.

2. **Bulk-delete button → red.** The delete button in the selection bar
   (bottom) is still amber; make it red to match the trash icon and the
   danger convention.

3. **Phase toggle must NOT reload the page (FAIL #8).** Toggling phase
   tracking in Settings currently triggers a full `router.refresh()`, so
   the phase strip reloads instead of animating. Make it optimistic: the
   toggle updates client state that drives `BudgetPhaseStripReveal`'s
   `visible` (smooth height/opacity slide) WITHOUT a full refresh; persist
   `track_phases` via PATCH in the background. Lift `trackPhases` to a
   shared client context (Settings toggle + the page-level strip both read
   it) if needed. This is the recurring no-per-edit-refresh rule.

4. **Template editor polish (Settings → Templates).** (a) Make the
   "Yours" rows visually uniform with the "System" rows — the editable
   name box currently looks cheap/inconsistent; keep the same row
   rhythm/typography, just make the name click-to-edit. (b) Move the
   expand chevron so it does NOT shove the "Apply to tour" button sideways
   (fixed-position action cluster on the right; chevron elsewhere). (c)
   Add a **Copy** button to custom ("Yours") templates too (currently only
   System templates have clone/copy).

5. **Move section subtotal to the LEFT.** Each section header shows
   `est/act/var` far right, where it drifts as numbers change. Move it to
   sit just after the section name + trash on the LEFT so it stays put and
   reads with the title.

6. **Selection/delete feels slow.** Bulk select→delete has a lag. Make
   the bulk delete optimistic (remove rows from the view immediately, then
   reconcile) and batch the requests, so it feels instant.

7. **Transactions in the slide-over refresh + close the panel.** Adding a
   transaction (and editing its numbers) in `TransactionsSection`
   currently triggers a `router.refresh()` that closes the slide-over to
   save. Give it the SAME optimistic pattern as the grid: the new/edited
   transaction shows immediately, the panel stays open, persist in the
   background, no full refresh. (Recurring pitfall #1.)

## Verify
eslint 0 + tsc clean + build. Re-walk: no Category control in the slide
(Section only); red bulk-delete; phase toggle animates with NO reload;
template rows uniform + chevron not shoving Apply + copy on custom;
section subtotal on the left; snappy bulk delete. Report diffs + ranges.
