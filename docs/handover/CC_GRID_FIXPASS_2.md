# CC — Grid + Slide fix pass (post Phase 1 + 2 smoke)

Adam click-smoked `/grid-demo` (Phase 1 core) and the `<GridSlideOver>`
(Phase 2). Most of it works. This pass fixes the **specific** fails he found.
The diagnoses below name files + lines — confirm each in the code before you
change it, and confirm the fix in the running DOM before you claim it.

## ⚠ Stale-deploy warning (read first)
The smoke that generated this list was run against a Vercel preview **older than
the current branch HEAD** (the Add-column button is already orange + full-width
in the code but rendered faint/narrow in the smoke). Before fixing anything,
ensure the preview being smoked is built from the commit you push. Some "fails"
below (esp. A5) may already be fixed in HEAD — verify on a fresh build, don't
re-fix what's already done.

## Hard rules (non-negotiable — we have been burned by over-claiming)

1. **Verify before claiming.** For every item, name the exact file + line(s)
   you changed in your report. Do NOT report an item "done" you haven't
   actually exercised. Where the fix is visual, say how you confirmed it
   (DOM inspection / computed style / a screenshot description).
2. **Root cause, not a plaster.** The Phase-1 GRIDFIX pass papered over these
   with inline styles and they still fail. Find why, fix the cause.
3. **Tokens only.** All visual values via `var(--lp-…)`. Transparent orange =
   hex+alpha (`#FF45001a`) or `color-mix(...)`, never string concat. No
   hardcoded hex/size/z-index in component code.
4. **Build via `next build --webpack`** (Turbopack hangs on the Drive FS).
   Run `tsc --noEmit` (0) and `eslint` (0) before reporting.
5. **Land the smoke results.** Update `docs/smoke-tests/grid.md`: mark each
   GRID-NN / SLIDE-NN touched with the fix + "retest", and move resolved ones
   out of "Known broken".
6. Files in play: `src/components/grid/Grid.tsx`, `grid.css`,
   `GridSlideOver.tsx`, `GridModals.tsx`, `GridMenu.tsx`,
   `src/app/(app)/grid-demo/page.tsx`, `gridModel.ts`.

---

## A — Phase 1 core regressions (the GRIDFIX pass only half-landed)

### A1 — Active-cell ring missing (GRID-03/04/05)
**Symptom:** the range/selection **tint shows**, but the active cell has **no
orange ring**.
**Diagnosis:** `selStyle(active, selected)` (Grid.tsx:836) returns a proper
inset box-shadow + outline ring for the `active` branch — so the ring code is
fine. The bug is upstream: the focused cell isn't being passed `active = true`
at the call sites (Grid.tsx:1160 `selStyle(active2, …)`, 1179
`selStyle(isActive, selected)`). Only the `selected` (tint) branch is firing.
**Fix:** ensure the focused cell (`sel.fr/sel.fc`, i.e. the cell the arrows
move) always evaluates `active === true` and therefore gets the ring, distinct
from the range tint. Confirm in the DOM that exactly one cell carries the
inset+outline ring after a click and after each arrow press.

### A2 — Row reorder snaps, no FLIP (GRID-19)
**Symptom:** dragging a row's `#` handle reorders, but the rows **snap** into
place — no animation. (Columns DO animate — GRID-13 passed.)
**Diagnosis (high confidence):** `.row` carries a mount animation
`animation: gr-rise 0.18s var(--ease)` (grid.css:274, the search/filter
fade-in for #10). On reorder, `endReorder → doIt() → render()` (Grid.tsx:531-550)
re-renders the rows; `gr-rise` **re-fires** and overrides the inline
`transform` the FLIP runner applies (Grid.tsx:590-611). A running CSS
`animation` beats inline style on the animated property, so the FLIP transform
is stomped → snap. Columns have no mount animation, so they animate.
**Fix:** stop `gr-rise` from running on a reorder re-render. Options: scope the
rise animation to genuine appearance only (not every render), or clear/disable
the row's `animation` for the frame the FLIP transform is applied (the runner
already sets `transition`/`transform` per node — also null out `animation`
there, then restore). Confirm a moved row visibly tweens.

### A3 — Section reorder snaps, no FLIP (GRID-20)
**Symptom:** sections snap to the new order.
**Diagnosis:** the FLIP capture/replay selector is `#gr-sections [data-uid]`
with `keyAttr = 'uid'` (Grid.tsx:542-543), used by both the capture (545-549)
and the runner (590-611). **Verify the `.section` DOM nodes actually carry
`data-uid`.** The reorder `items` are selected by `.section` (Grid.tsx:565),
which may key off `data-si` rather than `data-uid` — in which case the section
elements are never in the FLIP set and never get a transform. Fix the
selector/keyAttr so the moved `.section` nodes are captured + animated.
`.section` already has `transform` in its transition (grid.css:171), so once
it's in the set it should tween. (Watch the gr-rise interaction from A2 if
sections inherit any mount animation.)

### A4 — No insertion line on row + section drag (GRID-13/19/20)
**Symptom:** dragging a row or section shows **no insertion line** at the drop
boundary.
**Diagnosis:** `moveReorder` does call `overlayRef.current.setIns({axis:'y',…})`
for the y-axis (Grid.tsx:506) and `{axis:'x',…}` for columns (510). Columns may
show; rows/sections don't. Likely the `<DragOverlay>` (Grid.tsx:1506, 1613) line
is being **clipped or sitting below the section cards** — `.section` has
`overflow: hidden` (grid.css:170). The overlay must render as a portal ABOVE all
cards with a z-index above the grid, not inside a clipped card.
**Fix:** confirm the y-axis insertion line renders as a 3px orange bar at the
boundary, above the cards, for both row and section drags.

### A5 — Modal / Add-column primary button (GRID-16/18/31) — VERIFY FIRST, likely already fixed
**Symptom reported on a STALE preview:** "Add column" button invisible; delete
confirm shows only Cancel.
**BUT the current code already styles all three orange:** the Add-column button
(`Grid.tsx:1816`, inline `var(--lp-orange)` + width:100%, backed by
`.lp-grid-pop .go` grid.css:703) and the confirm/prompt primaries
(`GridModals.tsx:59/106`, backed by `.lp-grid-modal button.pri` grid.css:765).
The faint/narrow button in the smoke screenshot does NOT match this code → that
preview predates these styles.
**Action:** do **NOT** re-add orange. First confirm on a FRESH build of HEAD
whether GRID-16/18 actually still fail. If they render orange + aligned, mark
them PASS in `grid.md` and move on. Only investigate if a current-HEAD build
still shows them broken.

### A6 — Dropdown option colours not applied (GRID-23)
**Symptom:** the Category pill menu items don't show their option colours, and
picking one doesn't recolour the pill.
**Diagnosis:** `GridMenu.tsx` isn't reading/applying `optColors` to the menu
item dot/text and/or the resulting pill.
**Fix:** menu items carry their option colour (dot + text), and selecting one
applies that colour to the pill. Confirm against a column with `optColors`.

---

## B — `/grid-demo` cleanup + settlement reachability

### B1 — Split the demo into Expenses + Income views
**Symptom:** the single demo grid mashes Expenses and Income columns together
(both **Quantity** and **Day Type** present), and **settlement (SLIDE-10/11/12)
can't be reached** because there's no income/Show row (S13/S14 untestable).
**Fix:** add a small **Expenses / Income** toggle to
`src/app/(app)/grid-demo/page.tsx`, each using its proper column set from the
playbox `VIEWCOLS` (`docs/prototypes/grid-playbox.html` /
`GRID_SPEC.md §4, §7`):
- **Expenses**: the budget column set — **no** Day-type column.
- **Income**: guarantees read like routing — Show · Date · Capacity · Deal ·
  Guarantee · Settled · Docs — with the **Day** pill present so a row can be set
  to **Show** and opened into the settlement variant.
This both removes the mashed columns and unblocks the settlement smokes.

---

## C — Slide-over (Phase 2)

### C1 — Currency display is confusing (SLIDE-03)
**Symptom:** typing `£100` instantly shows the `$` value with **no note**; grid
and slide show **different numbers**; unclear which figure is source vs
converted.
**Rule:** the user edits in the **row's own currency**. The input keeps the
typed **source** figure (prefixed with the row's currency symbol). The
display-currency conversion shows as a **red `≈ $X`** annotation beneath, and
**never replaces** the typed value. The grid cell and the slide input must show
the **same source number**. (GridSlideOver.tsx ~158-263 uses `disp/fmt/sym/FX`
from `gridModel` — make the editable inputs bind to the source value in
`row.cur`, not the converted value.)

### C2 — Currency + headers everywhere (SLIDE-07, settlement, projections)
**Rule (Adam, hard):** **every monetary value shows a currency symbol** — no
bare numbers anywhere in the slide (settlement tiers, deductions, expenses,
projections, walkout, balance due). Percentages show `%`. The ticket-tier,
expense, and projection input groups need **column headers**. (grid.css
`.st-tier` / `.docrow` groups ~935-1003 — add header rows + symbol prefixes.)

### C3 — Status set wrong in slide (SLIDE-02)
**Symptom:** the slide status pill lists the wrong statuses.
**Fix:** it must list exactly the canonical four — **budgeted · paid ·
reconciled · refunded**. It imports `STATUSES` (GridSlideOver.tsx:31, used at
139) — verify `STATUSES` in `gridModel.ts` is exactly those four and nothing
extra is appended.

### C4 — Doc rename doesn't propagate to a linked transaction (SLIDE-06)
**Symptom:** rename a document that's linked to a transaction → the
transaction's receipt label keeps the old name.
**Diagnosis:** the transaction stores a **copy** of the doc name instead of
referencing the document by id.
**Fix:** the transaction references the linked document by **id** and renders
the document's **live** name, so a rename reflects immediately.

### C5 — Deal-memo scan animation doesn't run (SLIDE-12)
**Symptom:** the memo pill appears but the **animated scan steps don't play**.
**Fix:** the scan modal runs its animated steps before it fills
deal/guarantee/cap and attaches the memo (no reload). Confirm the steps
actually animate.

### C6 — Open affordance too faint (SLIDE-01)
**Symptom:** the **"Open"** affordance on the Item cell is grey / hard to see.
**Fix:** make it clearly visible — token-based, orange-tinted on hover.
(grid.css `.openbtn` ~322.)

### C7 — Defer, capture only (do NOT build this pass)
- **Auto-link person by role** (S11) and a **Day field that pulls routing**
  (S6) — record in `GRID_SPEC.md §6/§7` as Phase-4 work. Manual link stays for
  now.

---

## Done = 
tsc 0 · eslint 0 · `next build --webpack` green · `grid.md` updated with each
touched ID + retest note · your report names the exact files+lines changed per
item and how each visual fix was confirmed. Open the diff before you claim it.
