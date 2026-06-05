# Claude Code prompt — Budget ← Operations linking (rooming, payroll)

> Make the budget's Hotels and Salary sections POPULATE from the source
> modules in Operations (rooming + payroll) instead of being typed twice.
> This is the native version of Adam's GN sheet linking out to separate
> rooming/payroll sheets. Run after Fix-pack A (section model solid),
> alongside/just before Stage 3 (the P&L sums these). Branch off latest.

## Principle
Derived lines are the BULK; manual lines are still allowed in the same
section. Derived lines are read-only in the budget and edited at source
in Operations (click a derived line → jump to its Operations page).

## Reuse the existing derived-line pattern (don't reinvent)
The budget already creates read-only derived lines for flights, hotels,
and gear: `budget_line_items.source_entity_type` / `source_entity_id` /
`flight_id` / `hotel_id` / `gear_id`, `isUx14DerivedBudgetLine()` marks
them, the PATCH route 409s on editing them, and GET `/api/budget/line-items`
auto-reconciles gear-hire lines. Extend that same reconcile to rooming +
payroll. Keep `category`/manual lines untouched.

## Sources → sections
- **Hotels / Accommodation section ← rooming.** Sum
  `hotel_room_assignments` (rate_per_night × nights) grouped per
  `hotel_bookings` row. One derived budget line per hotel booking (label =
  hotel name, est/actual = summed room cost). `source_entity_type =
  'hotel_booking'`, `hotel_id` set.
- **Salary section ← payroll.** Sum `payroll_entries.total_fee` per
  `personnel_rates` person for the tour → one derived line per person
  (label = person + role). `source_entity_type = 'payroll'`.
- **Per Diem section ← payroll.** Sum `payroll_entries.total_per_diem`
  per person → derived per-diem lines. (Keep separate from Salary, per
  the GN sheet; if Adam prefers them merged, fold into Salary.)
- Auto-create the target sections (Accommodation / Salary / Per Diem) if
  they don't exist on the tour, so derived lines have a home.

## Sync mechanism
Extend the GET `/api/budget/line-items` reconcile (the gear pattern):
on load, for the tour, compute desired derived lines from the sources,
then create/update/delete budget_line_items to match (only rows with the
matching `source_entity_type`; never touch manual lines). Idempotent.
Derived est/actual recompute from source each load.

## Grid behaviour
- Derived lines render with a small "from rooming" / "from payroll" badge
  and are read-only (estimate/actual/qty not editable) — same as flights
  today. Clicking the line (or a link icon) navigates to the source
  Operations page (rooming / payroll) for that entity.
- Users can still add MANUAL lines to Hotels/Salary/Per Diem (e.g. an
  extra hotel not in the rooming list) — those remain fully editable.
- Section subtotals + the Summary rollup include both derived + manual.

## Design fork — FLAG for Adam, default as below
- Granularity: **one derived line per source entity** (per hotel booking;
  per payroll person) with drill-to-source — chosen as default because it
  matches the GN per-person salary rows and per-hotel breakdown. The
  alternative (one rolled "Crew salaries" total with a drawer) is leaner
  but hides detail. Build per-entity; confirm with Adam.

## Hard rules
- No new schema if avoidable (the source_entity_* columns + source tables
  exist). If you think a column is missing, STOP and ask (migrations start
  at 200/201). Reuse the optimistic, no-per-edit-refresh pattern for the
  manual lines. Stay out of the Operations modules except to READ their
  data and to link to their pages. Token-clean; eslint 0; tsc clean;
  `next build --webpack`. Show diffs + line ranges; verify derived totals
  against the source (e.g. rooming room-nights × rate). Commit nothing.
