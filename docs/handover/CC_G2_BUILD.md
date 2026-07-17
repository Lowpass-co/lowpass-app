# CC — G2 BUILD. Adam-graded designs → production. Bank-per-stage, SINGLE OWNER.

Source: G2 design rounds (2026-07-17, live demos graded). Reference implementation for interactions: `outputs/G2_DESIGN_TOOL_2026-07.html` (Cowork's working demo — match its behavior where specced, not its demo bugs). Runs AFTER G1 (`CC_GRADE_RESPONSE_PASS.md`) is banked. Floor + money invariants per bank; payroll work re-runs the reconcile harness (52/52) — rate math must not move except where this spec changes WHAT is computed (day-type overrides), in which case extend the harness FIRST with fixtures for the new cases.

## Stage G2-1 — Payroll page rebuild (the graded design)

**One page, no view toggle** (Adam: rates + days matrix together). Identity band = identity only (avatar · artist · condensed tour · status); section tabs (Tour Personnel · Payroll · Rooming) directly above the page title. This band+tabs arrangement is the APP-WIDE standard — land it as the shared component here, roll to other groups in G2-4.

**Rates grid** (graded pass):
- Rate type per row (Day rate / Flat tour / Weekly / Per diem only) — the type drives which rate fields render. No $0 noise; absent = explanatory microcopy ("no per-day fields for flat").
- Editable = boxed mono inputs; derived (days S·O·R, weeks, totals) = plain mono text. Grouped CREW/BAND; totals row (fees · per diem · total, tour currency).
- Totals recompute live on any rate/day change.
- Rate writes go through the existing `writeRates` SSOT path.

**Days matrix** (graded pass with changes):
- Columns = all routing days: header shows date on line 1, **VENUE and CITY abbrevs on TWO lines** (Adam: one line too compact), colored by tour day type.
- Cell = person-day. Click toggles working; **Shift+drag paints a run; arrows move a cursor; Enter toggles** (the keyboard contract).
- **Day-type brush (Adam's pin, new capability):** a small brush selector in the matrix toolbar (Tour default · Show · Rehearsal · Travel · Off · Promo/Radio). Painting drops the selected type as a PERSON-DAY OVERRIDE — Dillon can play a radio session on a tour travel day; someone can work a day off. Data: extend the person-day model with `type_override` (nullable = inherit tour day type). Pay math uses the person's EFFECTIVE day type. Extend the reconcile harness with override fixtures BEFORE wiring the math.
- **Flat-rate rows still take day assignments** but the UI must show days don't move their fee: worked cells render in a neutral/dimmed treatment for flat people + row note "days don't change flat fee — per diem still counts"; their DAYS count marked (e.g. `18*`).
- **"Fill all" button**: sets everyone working on every day (work-backwards flow). MUST warn before overwriting: modal lists how many hand-edited cells would change, with two options — "Fill only untouched cells" (default) and "Overwrite everything". Track touched-ness so untouched-only is real, not a guess.

**Personnel read-only mirror (Adam's ruling):** the Tour Personnel page renders rates/type/per-diem as a clean READ-ONLY grid (same visual grammar, no inputs). Any attempt to edit (click on a rate value) routes to Payroll with the person focused. One write surface, ever. Kill any remaining rate-edit affordances on Personnel/slide-overs (grep the writeRates callers — UI paths outside Payroll get the redirect treatment, not a form).

Smokes PAY-01..06 (from the tool) + PAY-07 (brush + override math) + PAY-08 (fill-all warning) + PAY-09 (Personnel read-only redirect).

## Stage G2-2 — Patch matrix (graded pass, one fix)

Build per the demo: sockets across the top grouped by stage box/sub-snake (box header colors), channels down the left, crosshair row/col highlight, **click assigns / CLICK AGAIN UNASSIGNS** (PM-02 failed in the demo — a demo bug; the spec behavior is toggle), drag-a-diagonal patches a sequential run, conflict red when two channels share a socket, toolbar: Patch in order · Clear patch (confirm) · Boxes filter. Writes `channel_list_rows.stage_box/row_index` only. Keyboard: arrows + Enter. Replaces the current socket-strip patch UI. Smokes PM-01..06.

## Stage G2-3 — Days-matrix retirement + stage-plot remainder

- The old Days-matrix view is replaced by G2-1's matrix (single payroll page). Delete the old view + its emoji search.
- Stage plot: inspector restyle to system (title/labels/mono per design system — no new capability, keep every control), channel-number inline editing + discoverable link-channels control (G1 item 11 if not already banked), PDF export through the shared shell so it stops looking "like a different app" (SP-06). Smokes SP-05/06 re-run.

## Stage G2-4 — Identity band rollout

The band + section-tabs standard from G2-1 rolls to every grouped surface: Production (Channel list · Stage plot · Riders), Budget tabs, Advance (modes stay the segmented control in-page). Kill remaining per-page variants of the artist/tour lockup — ONE component, one size, one position (Adam: "changes on every single menu; 0 consistency" — this closes it). Smoke HDR-01: lockup identical on 8 sampled pages.

## Report
Per stage: files+lines, harness output where money-adjacent (G2-1 extended fixtures), screenshots, smoke IDs. Cowork re-walks; Adam re-grades payroll + patch live on production with the same IDs.
