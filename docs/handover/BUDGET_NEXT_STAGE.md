# Budget — Next Stage Plan

> Branch context: `feat/budget-grid-usable`. This doc is the roadmap
> after the Phase 0/1 grid work (inline editing, optimistic updates,
> decluttered columns, custom dropdowns). Written for Adam + whoever
> (CC or otherwise) picks up the build.

## 1. Where we are

Shipped on `feat/budget-grid-usable` (uncommitted/preview):

- Row-click no longer opens the slide-over; cells edit inline.
- Optimistic updates — no flash-back to stale/zero on commit.
- Inline edit: Estimate, Actual, Qty(removed), Status, Phase, Title.
- Custom (non-native) Status/Phase dropdowns.
- Dropped Qty / Est unit / Rcpts columns; "Estimate" label.
- Item title inline-rename + a labelled **Open** button.
- Vendor now decoded from the `notes` "Vendor:" prefix and shown.

## 2. Fixes still in flight (close these before Stage 2)

| Item | Owner | Notes |
|------|-------|-------|
| Slide-over: dropdowns don't persist (no flush-on-close + reset effect keyed on whole `line`) | CC | Flush pending PATCH on close; change reset-effect deps to `[line.id, fallbackCurrency]`. |
| Slide-over: animate OUT on close | CC | `SlideOver` primitive supports `onExitComplete`; grid currently unmounts instantly. Thread `open`/`onExitComplete`, defer `setOpenLine(null)` to exit. |
| Slide-over: restyle (looks "thrown together") | CC | Pure presentation — grouping, spacing, typography. UI/UX + 21st. |
| Receipt upload spins / never saves | **Adam (DB)** | `budget-receipts` bucket + RLS come from **migration 063, never applied**. Run `npm run db:migrate:dry-run` then `npm run db:migrate` (or hand-apply 063). After bucket exists, re-test. |
| Receipts contribute £0 to actuals | later | `expense_receipts.cost_*` defaults 0; the in_budget→actual_cost wiring needs a cost on upload. |
| Resizable / draggable column widths + max table width | later | Adam wants a confined table that can be dragged wider, and per-column resize. Net-new feature (see Stage 2.5). |

## 3. Stage 2 — Templates + empty-state (the main build)

**Goal:** a new budget never opens blank. It scaffolds from a reusable
template of categories + standard line items (seeded from the GN
structure), which the user can trim per tour. Decision locked earlier:
**workspace default + per-artist override.**

### 3.1 Schema (new migration, ~116 — verify next free number vs main + branches)

```
budget_templates
  id uuid pk
  workspace_id uuid not null
  artist_id uuid null        -- null = workspace default; set = per-artist override
  name text not null
  is_default boolean not null default false
  created_at, updated_at
  -- RLS: workspace-scoped via get_my_workspace_id()
  -- partial unique index: one default per (workspace_id, coalesce(artist_id))

budget_template_lines
  id uuid pk
  template_id uuid not null fk -> budget_templates
  workspace_id uuid not null
  category text not null      -- mirrors budget_line_items.category vocab
  label text not null         -- e.g. "Flights", "Per diems"
  section text null           -- income/expenses/hotels/travel/hire/payroll/per_diems/other
  phase_tag text null         -- optional default phase
  sort_order int not null default 0
  created_at
  -- RLS: workspace-scoped
```

Idempotent SQL, down-migration block, mirror number in header — per
`database/migrations/README.md`.

### 3.2 Default seed (GN structure)

Seed one workspace-default template per workspace on first use (or via a
"Reset to default" action), categories + lines from the GN budget:

- **Salaries** — (band + crew rows are payroll-driven; as template lines: "Band salaries", "Crew salaries")
- **Per Diem** — "Per diems"
- **Hotel** — "Accommodation"
- **Transport** — "Flights", "Bus / truck", "Taxis", "Fuel", "Parking", "Travel agent"
- **Production + Misc** — "Audio & backline hire", "Lighting hire", "Freight / cartage / baggage", "Programming", "Misc"
- **Commissions** — "Agency", "Management" (% rows — see Stage 3)
- **Insurance**, **Contingency** (% rows — see Stage 3)

### 3.3 Apply flow

1. Resolve template: artist override if present, else workspace default.
2. On an empty budget, show an **empty-state panel** (replaces the
   current blank grid): preview of the resolved template's
   categories/lines + **"Create budget from template"** + **"Start
   blank"** + link to **"Edit template"**.
3. Apply = bulk-insert `budget_line_items` (proposed=0, actual=0,
   category/label/section/phase from template lines).
4. Also surface "Apply template" from the toolbar for non-empty budgets
   (adds missing lines, never overwrites).

### 3.4 Template editor — lives in the Settings tab (currently a placeholder)

The Budget **Settings** tab is an empty placeholder today. Make it the
home for: managing template lines (add / rename / remove / reorder),
**managing categories** (add/remove/rename — answers Adam's "how do I
add/remove categories"), choosing the active template, and the
phase on/off toggle (see §4).

### 3.5 Stage 2.5 — table width + column resize

Wrap the grid in a confined max-width container with a drag handle to
widen, and per-column resize handles persisted to localStorage (like
the existing group-by preference). Net-new; do after templates.

## 4. Phase model — DECIDED (2026-06-04)

1. **Single phase per line.** Each line is one `phase_tag` or
   "unscoped". No multi-phase. (No schema change from today.)
2. **Per-tour phase toggle, OFF by default.** Add `track_phases boolean`
   (on `budget_settings`, default false). When off, hide the Phase
   column in the grid AND the phase strip on the page. Toggle lives in
   the Budget Settings tab. Folds into the Stage 2 migration.

## 5. Stage 3 — Income + net P&L (the integrated view)

Both the GN sheet (SUMMARY) and the business-manager PDF end in a **net
profit/(loss)**: income (guarantees − withholding + overage + merch +
VIP) minus expenses minus commissions/insurance/contingency. The DB
already has `budget_income`, `budget_commissions`, `budget_settings`
(insurance/contingency/accountancy %). Stage 3 surfaces these as a
rollup on the Summary tab so the budget shows a real bottom line — the
thing that makes the GN sheet worth using. The % rows (commission,
insurance, contingency) become live formula rows here.

## 6. Suggested order

1. Close Stage-2-blocking fixes (slide-over CC pass; apply migration 063).
2. Stage 2 templates + empty-state + Settings-tab template/category editor.
3. Resolve §4 phase decisions (fold into the Settings editor).
4. Stage 2.5 column resize.
5. Stage 3 income / net P&L rollup.
