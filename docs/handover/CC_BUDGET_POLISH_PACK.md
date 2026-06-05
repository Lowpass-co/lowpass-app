# Claude Code prompt — Budget Polish-pack (UX/visual)

> Run AFTER Fix-pack A (correctness) lands and is committed, on branch
> `feat/budget-grid-usable`. This pack is **visual/UX only** — no schema,
> no data-model changes, no navigation/shell changes (the top-nav IA is a
> separate app-wide initiative — do NOT touch the ProductRail/shell here).
> Use the UI/UX skill + 21st for craft.

## Hard rules
- Edit only budget components under `src/components/budget/*` and, if
  needed, the budget page. Do NOT touch `commitLineEdit`, the `optimistic`
  state, `allLines`, API routes, migrations, or the app shell / ProductRail.
- Token-clean (`var(--lp-…)` / `color-mix`); no hardcoded hex (orange
  tints hex+alpha only). `npx eslint` 0 errors; `tsc --noEmit` clean.
- Show the diff + line ranges per file; don't claim done without showing
  it; commit nothing.

## Tasks

1. **Empty-state as a modal, not an inline menu (BUD-13).** Re-present
   `BudgetEmptyState` as a centered modal/popup over the budget surface
   (reuse the app's existing modal/overlay primitive if one exists;
   otherwise a clean overlay). Make it genuinely polished: each template
   as a card with tier badge + a few section chips, a clear primary
   "Create budget from this template", and a quiet "Start blank". This is
   the first impression of the budget — make it excellent.

2. **Visible resize affordances (BUD-17).** The resizable columns +
   canvas work but are invisible. Add a discoverable handle: a thin
   grab-cursor strip on each column's right edge that highlights on
   hover, and a clear handle on the grid's right edge for the canvas.
   Subtle at rest, obvious on hover.

3. **Template rename + consistent picker (BUD-19).** In the Settings
   template editor, let the user click a template name to rename it
   inline (same pattern as the section/line inline rename). Restyle the
   "what goes in the template" control to match the Advance section's
   selection UI for cross-product consistency (look at how Advance does
   its section pickers and mirror it).

4. **Slide-over matches the grid design language (BUD-04).** The
   line-item slide-over should use the SAME custom dropdown component as
   the grid (`InlineSelectCell`-style, not native `<select>`) for
   Category/Section, Phase, Status, Currency, and adopt the grid's
   spacing/typography/control styling so it reads as one product, not a
   separate form.

5. **Clearer add/delete affordances (BUD-15).** The "+ Add line",
   "+ Section", and delete-section controls are hard to find. Give them
   clear, labelled, consistent buttons (icon + word), with the delete
   guarded by a confirm. Keep them compact (this is a dense grid).

## Verify
eslint 0 + tsc clean. Re-walk BUD-13, BUD-17, BUD-19, BUD-04 and the
add/delete affordance from `docs/smoke-tests/budget.md`; report results +
diff + line ranges. Flag anything needing Adam's eye for the visual feel.
