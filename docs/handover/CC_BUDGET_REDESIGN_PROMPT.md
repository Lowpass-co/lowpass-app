# Claude Code prompt — Budget redesign (spreadsheet-grade, templated)

> Paste everything between the rules below into Claude Code, running on
> branch `feat/budget-grid-usable` (or a fresh branch off it). It is
> written to be executed in PHASES — do not try to land it in one
> commit. Adam reviews + smoke-tests each phase on the Vercel preview
> before the next.

---

## 0. Read first / hard rules (do not skip)

You are working in the Lowpass repo (Next 16 + React 19 + TS strict +
Supabase + Tailwind v4). Read `CLAUDE.md` and
`database/migrations/README.md` before writing anything.

NON-NEGOTIABLE:
- **Migrations start at `200`.** Per CLAUDE.md clean-break rule, the
  first new migration is `200_*.sql`, then `201`, `202`… Never reuse a
  sub-200 number.
- **Do not regress what already works.** The grid already has:
  optimistic inline edits (`commitLineEdit`, `optimistic` state,
  `allLines` overlay in `BudgetSpreadsheetView.tsx`), custom
  Status/Phase dropdowns, inline title rename + Open button, and a
  slide-over with flush-on-close + exit animation. Preserve all of it.
- **Token-clean:** every colour/size via `var(--lp-…)` or
  `color-mix()`. No hardcoded hex (orange tints may use hex+alpha).
- **No browser storage in app code is fine** (this is the real app, not
  an artifact) — use `localStorage` for view prefs like column widths,
  matching the existing `lp-budget-group-by:` pattern.
- **Build/lint:** `npx eslint <files>` at 0 errors; `tsc --noEmit`
  clean. Build is `next build --webpack` (never Turbopack).
- **No over-claiming.** After each phase, show the diff + exact line
  ranges, name every file touched, and do NOT claim done without
  showing it. Adam has been burned by "reported done, wasn't."
- **Stay in lane.** If a change needs to cross into payroll / flights /
  rooming modules, STOP and flag it — do not silently refactor them.
- **RLS:** every new table workspace-scoped via
  `public.get_my_workspace_id()` / `public.is_workspace_admin()`.

## 1. The vision (what "better" means here)

Adam runs tours off a Google Sheet (Good Neighbours budget). The app
budget must feel like that sheet, not like Notion:

- **Grid-first and dense.** Compact rows, tabular numerics, minimal
  chrome. NO oversized text boxes, no airy Notion spacing. Think Excel /
  Google Sheets density.
- **Resizable.** Columns resize by dragging their header edge; the whole
  grid canvas resizes (drag the right edge / a handle) so it can be
  narrow by default but pulled wide. Both persist per-tour in
  `localStorage`.
- **Sections are the backbone.** A budget is a set of **Sections**
  (headers) — e.g. "Salaries", "Travel", "Production", "Contingency" —
  each holding **line items**. Sections roll up to the Summary.
- **Templated.** New budgets start from a template (never blank). The
  app ships a few system templates for different tour scales; users
  clone/edit them and build their own sections + default line items.

## 2. Interpretation decisions already made (build to these)

1. **Two levels: Section (header) → line item.** Collapse the current
   confusing dual taxonomy (`budget_line_items.section` enum +
   `category` string) into ONE user-defined **Section**. Keep the old
   columns for back-compat during migration; introduce `section_id`.
2. **Single phase per line** (no multi-phase) and a **per-tour phase
   toggle, off by default** (`budget_settings.track_phases`). When off,
   hide the Phase column + the phase strip entirely.
3. **System templates are global presets** (`workspace_id NULL`,
   `is_system = true`) that a user clones into their workspace; user
   templates are workspace-scoped with an optional `artist_id` override.
4. **Summary = per-section rollup** (Proposed / Actual / Variance per
   section + grand total + net vs income later), mirroring the sheet's
   SUMMARY tab, alongside the existing donut/burn charts.

If any of these conflict with Adam's intent, STOP and ask before coding.

## 3. Phase A — schema (migration 200)

Create `database/migrations/200_budget_sections_templates.sql` (header
comment mirrors the number; idempotent; RLS; down-migration block).

Tables:

```
budget_sections                       -- per-tour section headers
  id uuid pk default gen_random_uuid()
  tour_id uuid not null references tours(id) on delete cascade
  workspace_id uuid not null
  name text not null
  sort_order int not null default 0
  created_at timestamptz default now()
  -- RLS workspace-scoped

budget_templates
  id uuid pk
  workspace_id uuid null               -- NULL = global system preset
  artist_id uuid null                  -- set = per-artist override
  name text not null
  description text null
  tier text null                       -- e.g. 'club','headline','festival'
  is_system boolean not null default false
  is_default boolean not null default false
  created_at, updated_at
  -- RLS: system rows (workspace_id null) readable by all; workspace rows scoped

budget_template_sections
  id uuid pk
  template_id uuid not null references budget_templates(id) on delete cascade
  workspace_id uuid null
  name text not null
  sort_order int not null default 0

budget_template_lines
  id uuid pk
  template_id uuid not null references budget_templates(id) on delete cascade
  template_section_id uuid not null references budget_template_sections(id) on delete cascade
  workspace_id uuid null
  label text not null
  default_phase_tag text null
  sort_order int not null default 0
```

Alterations:
- `ALTER TABLE budget_line_items ADD COLUMN IF NOT EXISTS section_id uuid REFERENCES budget_sections(id) ON DELETE SET NULL;`
- `ALTER TABLE budget_settings ADD COLUMN IF NOT EXISTS track_phases boolean NOT NULL DEFAULT false;`
- Keep the existing `section` (enum) and `category` columns untouched
  for back-compat; `section_id` supersedes them in the UI.

Backfill (idempotent): for each tour with line items but no
`budget_sections`, create sections from the DISTINCT existing
`category` values (Title-cased) and point each line's `section_id` at
the matching new section. This keeps current budgets working post-migration.

Seed the **system templates** (is_system, workspace_id NULL) — see §4 —
via `ON CONFLICT DO NOTHING` on a stable natural key (e.g. unique index
on `(is_system, name)` where is_system).

## 4. System templates to seed (3 tiers)

Seed these as global presets (sections → default line labels):

**1. "Club / Support run" (lean)**
- Travel: Flights, Ground transport, Baggage
- Accommodation: Hotels
- Per Diems: Per diems
- Production: Backline hire, Misc
- Contingency: Contingency

**2. "Headline tour" (mid)**
- Salaries: Band salaries, Crew salaries
- Per Diems: Per diems
- Travel: Flights, Bus / truck, Taxis, Fuel, Parking, Travel agent
- Accommodation: Hotels
- Production: Audio & backline hire, Lighting hire, Freight / cartage, Programming, Misc
- Marketing: Marketing
- Commissions: Agency, Management
- Insurance: Insurance
- Contingency: Contingency

**3. "Festival run" (Good Neighbours model)**
- Salaries: Production Manager, PM/Mons, Tour Manager, Guitar Tech, Content, Band (Drums/Guitar/Keys)
- Per Diem: Per diems
- Hotel: Accommodation
- Transport: Flights, Bus, Taxis, Fuel, Parking, Misc, Travel agent
- Production + Misc: Audio & backline hire, Lighting hire, Freight / cartage / baggage, Equipment purchase, Programming, Set & wardrobe, Misc
- Commissions: Agency, Management
- Insurance: Insurance
- Contingency: Contingency

(Reference: the user's GN sheet + the Charlotte Sands manager PDF.)

## 5. Phase B — apply-template + empty-state

- API: `POST /api/budget/templates/apply` — body `{ tourId, templateId }`.
  Clones the template's sections → `budget_sections` and lines →
  `budget_line_items` (proposed=0, actual=0, section_id set,
  phase_tag from default). Idempotent-ish: adds missing, never
  overwrites existing lines.
- API: templates CRUD — `GET/POST/PATCH/DELETE /api/budget/templates`
  and `/api/budget/templates/[id]/sections` + `/lines` for the editor.
- Empty-state: when a tour has zero `budget_line_items`, the Budget tab
  renders a **template picker** (system presets + the workspace's own
  templates, grouped, with a short description/tier) → "Create budget
  from this template" + "Start blank". Replace today's blank grid.
- Toolbar "Apply template" for non-empty budgets (adds missing lines).

## 6. Phase C — grid redesign (the spreadsheet feel)

In `BudgetSpreadsheetView.tsx` (+ small new cell/util files as needed):

- **Group by Section** (the new `section_id`/`budget_sections`) as the
  default grouping, replacing the hardcoded `CATEGORY_ORDER`. Keep the
  Phase grouping option. Section group headers show name + Proposed /
  Actual / Variance subtotals (already present pattern — repoint at
  sections). Inline "+ Add line" per section and "+ Add section".
- **Resizable columns:** draggable header-edge handles; widths persist
  to `localStorage` keyed per tour (mirror `lp-budget-group-by:`).
  Provide a sensible default width per column and a reset.
- **Resizable canvas:** the grid container has a max-width by default
  with a drag handle on the right edge to widen (also persisted). Keep
  horizontal scroll as fallback.
- **Density:** keep it tight. No input grows beyond its cell. The title
  cell already caps at 360 — keep cells bounded; long text truncates
  with title tooltip, expands only in edit mode.
- Respect `track_phases`: when false, do not render the Phase column or
  the phase strip.

## 7. Phase D — Settings tab = template & section editor

The Budget **Settings** tab is a placeholder today
(`BudgetTabPlaceholder`). Build it into the editor:
- Manage the active template; clone a system preset into the workspace.
- Create / rename / reorder / delete **sections** and their **default
  line items** (this is how the user "builds new sections and line item
  defaults to fit their workflow").
- Per-artist template override (optional).
- The **phase toggle** (`track_phases`) lives here.

## 8. Phase E — Summary rollup

On the Summary tab, add a **per-section table**: each section's
Proposed / Actual / Variance, a grand total row, matching the GN
SUMMARY tab. Keep the existing donut + burn + top-spend. (Income / net
P&L is a later stage — leave a clean seam, do not build it now.)

## 9. Delivery order + verification

Land in this order, each as its own commit, each smoke-tested by Adam on
preview before the next:
1. Phase A migration (Adam applies via `npm run db:migrate`).
2. Phase B apply-template API + empty-state picker.
3. Phase C grid redesign (sections + resizable columns/canvas).
4. Phase D Settings editor.
5. Phase E Summary rollup.

Add/extend smoke tests in `docs/smoke-tests/budget.md` (BUD-xx) for each
phase. After each phase: eslint 0, tsc clean, show the diff, list files
+ line ranges, and state what Adam should click-test. Do not proceed to
the next phase yourself unless told to.
