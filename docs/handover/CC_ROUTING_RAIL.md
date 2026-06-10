# CC — Shared `<RoutingRail>`: one days-on-left rail, used everywhere

Adam's hard rule: the **routing rail (date · city · day-type pill, days down the
left)** must look + behave **identically** on every surface that indexes by day —
Advance, Payroll, Rooming (all 3 views), and later the export/daysheet builder.
Today the rail exists in ≥2 bespoke forms (Advance routing sidebar, Payroll week
rail). This unifies them into one component so rooming (and everything after)
inherits it instead of reinventing it.

This is the first foundational build **after** the Budget finalise pass — it does
not block it. Runs in parallel/next.

## ⛔ Gated: Stage A (map, no code) → review → Stage B (build)

### Stage A — map the existing rails (NO code)
Write `docs/handover/ROUTING_RAIL_MAP.md`:
1. **Every existing rail/day-list implementation** — Advance routing sidebar,
   Payroll week rail, the Budget context band's day list if any, the
   `/tours/[id]` routing surfaces. For each: file path, the data it reads
   (routing/shows table + columns; day-type source), props, and how it renders
   (night list vs week-grouped).
2. **The differences** that a shared component must absorb: night-list vs
   week-grouping, selected-state model, click behaviour, what each shows
   (city/venue/date/day-type/weather?).
3. **The canonical data shape** for a rail entry, derived from the real routing
   table (don't invent columns — cite them).
4. A short **unify plan**: the `<RoutingRail>` API + which surfaces retrofit in
   Stage B vs later. Surface any decision you need from Adam. Then stop.

### Stage B — build (after the map is approved)
- `src/components/routing/RoutingRail.tsx` (or the established components dir):
  props `{ entries: RailEntry[]; selected; onSelect; grouping?: 'night'|'week' }`.
  Token-clean (`var(--lp-…)`). Day-type pill colours from the existing day-type
  tokens. Renders date · city/venue · day-type, selected highlight, optional
  week grouping.
- **Retrofit Payroll** to use it (the OPS-notes week rail). Leave Advance as-is
  unless trivial — but note the shared API so Advance can adopt it next.
- It must be ready for Rooming to consume directly (all 3 rooming views pin it
  on the left).

## Hard rules
- Map both sides before writing; cite real routing columns; don't guess.
- Tokens only; `var(--lp-orange)` resolves now. Build `next build --webpack`;
  tsc 0; eslint 0; don't regress Advance/Payroll/the branch.
- **Verify before claiming** — name files/lines, mark build/code-verified vs
  needs-live. I live-verify the rail on the preview via Chrome (looks identical
  on Payroll; ready for Rooming).
- Land smoke IDs (new `docs/smoke-tests/routing-rail.md` or fold into the
  relevant surface file).

## Why this before Rooming
Rooming's three views (matrix, nights, cards) all hang off this rail. Building it
once, shared, means rooming is "rail + a right panel" three times — and Payroll,
Advance, and the export builder all stay visually identical. Build the floor
(the rail) before the rooming ceiling.
