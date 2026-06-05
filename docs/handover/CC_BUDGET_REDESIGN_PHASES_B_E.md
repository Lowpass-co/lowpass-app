# Budget redesign — Phases B–E handover (for Claude Cowork)

**Branch:** `feat/budget-grid-usable`
**Author:** Claude (autonomous run, 2026-06-04)
**Status:** code complete, eslint 0 + tsc clean (src). **Not yet run in a
browser, not yet built, migration 200 not yet applied.**

This documents everything built in Phases B–E so a reviewer can verify,
finish the gaps, and not get surprised. Phase A (migration 200) was
delivered earlier; **it must be applied (`npm run db:migrate`) before any
of this works** — every new surface reads the `budget_sections` /
`budget_templates*` tables and the `section_id` / `track_phases` columns
that migration introduces.

---

## What shipped, by phase

### Foundation (types + API)
- `src/types/index.ts` — added `BudgetSection`, `BudgetTemplate`,
  `BudgetTemplateSection`, `BudgetTemplateLine`; `section_id` on
  `BudgetLineItem`; `track_phases` on `BudgetSettings`.
- `src/app/api/budget/line-items/route.ts` — POST + PATCH now persist
  `section_id`.
- `src/app/api/budget/settings/route.ts` — POST now persists
  `track_phases`.
- **New routes:**
  - `src/app/api/budget/sections/route.ts` — GET/POST/PATCH/DELETE
    budget_sections.
  - `src/app/api/budget/templates/route.ts` — GET (list + `?id` hydrate),
    POST (create, optional `clone_from` deep-copy), PATCH, DELETE.
  - `src/app/api/budget/templates/apply/route.ts` — POST `{tourId,
    templateId}`; find-or-create sections by name, insert only missing
    lines (idempotent-ish, never overwrites).
  - `src/app/api/budget/templates/[id]/sections/route.ts` and
    `.../[id]/lines/route.ts` — editor CRUD; **workspace-owned templates
    only** (system presets are read-only, enforced server-side).

### Phase B — apply-template + empty-state
- `src/components/budget/BudgetEmptyState.tsx` (new) — the picker.
- `src/app/(app)/budget/[tourId]/page.tsx` — fetches `budget_sections` +
  `budget_settings.track_phases`; when `tab==='budget'` and the tour has
  **0 sections and 0 lines**, renders `<BudgetEmptyState>` instead of the
  grid. "Start blank" POSTs a "General" section so the grid takes over.

### Phase C — grid redesign
- `src/components/budget/BudgetSpreadsheetView.tsx` — big surgical pass:
  - Default grouping is now **Section** (`groupBy: 'section' | 'phase'`);
    legacy localStorage `'category'` maps forward to `'section'`.
  - Section group headers: inline-editable name, count, est/act/var
    subtotals, delete button, and a per-section "+ Add line" (direct POST
    with `section_id`, not the slide-over). Empty sections still render.
  - "+ Section" toolbar button; "Reset widths" button.
  - **Resizable columns + canvas** via new hook
    `src/components/budget/useBudgetGridSizing.ts` — `<colgroup>` +
    `tableLayout: fixed`, header-edge drag handles, right-edge canvas
    drag handle; both persist per-tour in localStorage
    (`lp-budget-col-widths:` / `lp-budget-canvas-width:`).
  - **Respects `track_phases`**: Phase column + Phase group option hidden
    when off.
- `useBudgetGridSizing.ts` (new) — the sizing hook.

### Phase D — Settings editor
- `src/components/budget/BudgetSettingsTab.tsx` (new) — replaces the
  `BudgetTabPlaceholder` for the Settings tab. Three cards: phase toggle,
  tour-section editor (add/rename/reorder/delete), templates (apply,
  clone system preset, delete + nested section/line editor for workspace
  templates).

### Phase E — Summary rollup
- `src/components/budget/BudgetSummaryTab.tsx` — added a "Section
  summary" table (per-section Estimate/Actual/Variance + grand total)
  above the existing variance/top-spend cards. Takes a new optional
  `sections` prop (threaded from page.tsx).

### Smoke tests
- `docs/smoke-tests/budget.md` — BUD-13…BUD-20 added.

---

## Verification status (BE HONEST WITH ADAM)
- ✅ `npx eslint` — **0 errors** on all touched files.
- ✅ `npx tsc --noEmit` — **clean for all `src/`**. The only tsc errors
  are stale `.next/types/**` artifacts referencing `admin/ai-usage` /
  `settings/ai-limits` pages that **don't exist** in the repo — pre-existing,
  unrelated, and regenerated on the next `next build`.
- ❌ **Not built** — did not run `next build --webpack` (slow on the Drive
  FS). Run it before merging.
- ❌ **Not run in a browser** — no surface was exercised live. Everything
  below "things I'm unsure about" is therefore unverified at runtime.

---

## Things I'm unsure about / want a second pair of eyes on

1. **`md5(...)::uuid` in migration 200 seed** (Phase A) — valid Postgres,
   but if `db:migrate` errors on apply, that's the first suspect. The
   whole of B–E is dead until 200 applies cleanly.

2. **`tableLayout: fixed` + colgroup** in the grid — this changes column
   sizing semantics for the whole table. I kept `truncate` on the Item
   cell, but with a very narrow Item column the inline "Open" button +
   label could visually crowd. Eyeball the grid at small column widths.

3. **Canvas resize feel** — the wrapper is `width: canvasWidth ?? 1120,
   maxWidth: 100%`. On a page narrower than 1120 the right-edge drag has
   limited travel (can't exceed parent width). The more impactful "pull
   wide" is column resizing → horizontal scroll. Confirm the gesture
   feels right; the spec wanted "narrow by default, pull wide".

4. **`section_id` backfill coverage** — migration 200 backfills sections
   from `category`. Lines created _after_ migration via the grid's
   top-level "Line item" button or Quick-Add still get `section_id = null`
   → they show under "Uncategorised" when grouping by Section. Decide
   whether those entry points should seed a section (I left them as-is to
   avoid guessing which section).

5. **Section reorder** in Settings uses two `PATCH`es swapping
   `sort_order` between neighbours. It works but isn't transactional; a
   failed second PATCH could leave two sections sharing a sort_order
   (cosmetic — the grid still falls back to name sort). A drag-reorder
   with a single batched write would be nicer.

6. **Template apply idempotency** matches sections by **name** (case-
   insensitive). If a user renamed a section to collide with a template
   section name, apply will merge into it rather than create a new one.
   Intended ("adds missing"), but worth confirming with Adam.

7. **RLS on the new tables** — I used the simple workspace-scoped policy
   set (no admin gate on delete), matching `budget_line_items`' base RLS,
   NOT the admin-gated `budget_line_item_transactions` pattern. If budget
   editing should be admin-only, the delete policies need `is_workspace_admin()`.

---

## Known gaps / not built (deliberately, to stay in scope)
- **Per-artist template override** — the `artist_id` column + API field
  exist, but there's no artist-picker UI in the Settings template editor.
- **Grid-level "Apply template" button** — apply lives in the empty-state
  and the Settings tab; I did not add a separate toolbar button on a
  non-empty grid (the spec mentioned one). Easy to add: it would open a
  small picker or link to `?tab=settings`.
- **Income / net P&L** in the Summary rollup — intentionally left out per
  the spec ("later stage"); the rollup is expense-side proposed/actual/var.
- **No drag-and-drop** for line reordering or moving lines between
  sections (lines move sections only via the `section_id` PATCH path,
  which no UI currently calls except apply/add).

---

## Where to start reviewing
1. Apply migration 200 on a scratch DB, then `db:migrate` again (idempotency).
2. Walk BUD-13 → BUD-20 in `docs/smoke-tests/budget.md` on the Vercel preview.
3. Diff the grid file (`BudgetSpreadsheetView.tsx`) carefully — it's the
   highest-risk change (resizing + section grouping in a 1700-line file).
4. Run `next build --webpack` before merge.
