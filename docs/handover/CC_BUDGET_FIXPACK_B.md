# Claude Code prompt — Budget Fix-pack B (smoke-run polish)

> Run on `feat/budget-grid-usable` after the latest commit. These are the
> polish/bug items from Adam's 2026-06-05 smoke run. (Two functional bugs
> from that run — Summary tab routing + slide-over dropdowns not opening —
> are already fixed in the tree; don't redo them.) Visual/UX only; no
> schema. Token-clean; eslint 0; tsc clean; `next build --webpack`. Show
> diffs + line ranges. Commit nothing.

## Tasks

1. **New section/line appends at the BOTTOM, not the top.** Creating a
   section or a line currently jumps it to the top of its group, which
   feels unpredictable. Append new items at the end (highest sort_order +
   1) so they appear where the user clicked "+".

2. **Auto-focus + select on create.** When the user clicks "+ Section" or
   "+ Add line", immediately put the new item's name into edit mode with
   the text selected, so they can type the name straight away (no second
   click). Applies to both.

3. **Shift-select off-by-one.** Range selection currently selects up to
   the row ABOVE the cursor. Fix the range so a shift-click includes the
   clicked row itself (inclusive of both anchor and target).

4. **Template editor (Settings):** (a) show the template name inside a
   subtle bordered box so it reads as editable (click to rename — the
   rename itself already works); (b) add a "+" / "New blank template"
   action next to the template list so the user can start a template from
   scratch, not only by cloning a system preset.

5. **Delete affordance + branded confirms.** (a) The delete-section trash
   icon highlights yellow on hover — make it RED
   (`var(--color-lp-status-needs-review)` or the danger token). (b)
   Replace the native `window.confirm()` delete warnings with a
   Lowpass-branded confirm dialog. Build one reusable branded confirm
   component (or reuse an existing app modal primitive) and use it for the
   budget delete actions; note in the PR that the same component should
   replace `window.confirm` app-wide in a follow-up.

6. **Phase strip animation (#18).** When the phase toggle flips, the top
   phase strip currently flashes in/out. Give it a smooth height/opacity
   slide transition (appear + disappear) so it feels premium, not jumpy.

## Verify
eslint 0 + tsc clean + build. Re-walk: create section/line (appends at
bottom, name focused), shift-select (inclusive), template rename box +
new-blank, red trash + branded confirm, phase-toggle animation. Report
diffs + line ranges; flag anything needing Adam's eye.
