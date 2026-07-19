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
- **Day-type brush (Adam's pin, new capability). RULING A (2026-07-17): THE OVERRIDE DRIVES PAY — it is NOT display-only.** A brush selector in the matrix toolbar (Tour default · Show · Rehearsal · Travel · Off · Promo/Radio). Painting drops the selected type as a PERSON-DAY OVERRIDE — Dillon plays a radio session on a tour travel day and is PAID HIS SHOW RATE for that day, not the travel rate. Data: `type_override` per person-day (nullable = inherit tour day type). **The pay engine (`fees.ts`, `day_statuses` → totals) MUST read the person's EFFECTIVE day type = `type_override ?? tour_day_type`.** There must be ONE pay path — do NOT create a display-only `type_overrides` table sitting beside the real day-status/pay path (that is the exact dual-system anti-pattern this whole project killed; if the earlier `fc244a7`/`de082d2` slices introduced a display-only override table, unify it into the pay path now). **HARNESS-FIRST, hard gate:** extend `reconcile.harness.ts` with override fixtures (a day-rate person whose effective type differs from the tour day type, proving the show-vs-travel rate difference flows through) and get them green BEFORE wiring the engine. Report the new fixtures + the pre/post totals for the override case verbatim. `231.HOLD` still untouched.
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

## G2-1b — POST-GRADE FIXES (Adam walked production 2026-07-17; these come BEFORE the rate-type wiring slice)

1. **Drag paints a RECTANGLE, not a diagonal (bug).** Observed: dragging top-left → bottom-right painted a single diagonal line of cells. The diagonal rule belongs to the PATCH matrix only (channel N → socket N). In the DAYS matrix, press-drag-release must fill the full rectangle between anchor cell and cursor cell — every person-row × every day-column inside the box — with the active brush. Live preview highlights the rectangle while dragging; release commits. Shift+click still extends a run from the last cell. Add smoke PAY-10.
2. **Page is too busy / grid too small (structural).** The matrix is the work surface and must dominate. Rebuild the page's vertical economy:
   - Days matrix gets the primary real estate: taller rows (min 34px), wider day columns, and it fills available height.
   - RATES collapses to a compact summary strip by default (person · type · effective rate · total) with a "Rates" disclosure to expand the full editable table — it is reference while painting, not a co-equal table.
   - SUMMARY collapses by default (it is read-only derived data — a disclosure, not a permanently-open third table).
   - One header row, not three: the page already carries the identity band + title; drop the redundant per-section chrome where it repeats.
   - Result to aim for: opening Payroll, the matrix is what you see and can work immediately; rates/summary are one click away. Adam's words: "page is VERY busy and the grid is VERY small."
3. **Personnel page is broken.** `/operations/[tourId]/personnel` hangs on "Loading personnel…" (Cowork saw the same). Diagnose and fix; the read-only rate mirror + click-a-rate → redirect-to-Payroll (PAY-09) cannot be graded until the page loads. Root-cause in one sentence.
4. Re-verify on production after deploy (see the push/deploy rule below) — Cowork walks, Adam re-grades PAY-01..10.

## G2-2b — GRID QUALITY PASS (Adam graded 2026-07-18: "looks like a shitty old Excel sheet small on a big webpage"). Applies to BOTH the payroll days-matrix AND the patch matrix. Do this BEFORE G2-3.

Adam's words: *"text size, grid size, number size are all contributing to this feeling pretty old school HTML and not beautiful and flowing… why doesn't it scale with the page, why is it all cramped and basic… ugly and formatted badly in places (columns diff sizes)."* This is a concrete metrics + polish problem, not a vibe. Build to these numbers.

**A. Columns must be uniform — this is the top complaint.** Today day-columns size to content, so "Culture and Congress Center Jahrhunderthalle GmbH" renders ~4× wider than "Manchester". Fix: `table-layout: fixed` + `<colgroup>`; ALL day columns equal width, dividing the available space (`1fr` each) with `min-width: 64px`; horizontal scroll only when days × 64px exceeds the viewport. Venue/city text in headers TRUNCATES with ellipsis and shows the full string via `title`/tooltip — text never dictates column width. Same rule for the patch matrix's socket columns.

**B. Fill the page.** The matrix is the work surface: container goes full-bleed on this surface (no narrow `max-w-*` wrapper; if a global max-width exists, opt this surface out), and the grid fills available height (`height: calc(100vh - chrome)`), scrolling INTERNALLY with a **sticky header row** and **sticky left block**. No large empty page below the grid (Adam's screenshot shows ~40% dead space).

**C. Type scale — step everything up** (current values are ~11–13px on a 1900px screen):
person name 15px/500 · role+rate-type meta 12px · row total 18px mono · days-count 12px mono · day header date 13px mono/500 · venue 11.5px · city 11px · day-type label 10px caps · cell letter 13px mono · totals bar 17px mono.

**D. Cell + row metrics:** row height 52px (from ~45) · header block 64px (three lines with breathing room) · left block fixed 320px · day cell min-width 64px · consistent 8px internal padding. Uniform everywhere — no row taller than another.

**E. Stop it looking like a table (the "old school HTML" fix).** Modern data-grid treatment:
- Painted cells render as **tiles**: 3px inset radius, subtle fill, NOT edge-to-edge flat blocks butting against hard gridlines.
- Gridlines become **hairlines** (`rgba(255,255,255,.04)`) — remove heavy 1px solid borders between every cell.
- **Hover states**: cell hover brightens + 120ms ease-out transition; row hover tints the whole row including the left block.
- **Sticky shadow**: when the grid scrolls horizontally, the sticky left block casts a subtle right-edge shadow (depth cue that the column is pinned).
- Cursor/selection: 2px orange **inset ring**, not an outline that shifts layout.
- Empty (unassigned) cells get a barely-there surface (`#141416`), not pure black — the grid reads as a continuous field.
- Week markers (WC dates) become a subtle vertical rule + small caps label, not an orange line that dominates.

**F. Same pass on the patch matrix** (`PatchMatrix.tsx`): equal-width socket columns, larger sockets (34px min already landed — take to 40px), same hairlines/tiles/hover/sticky treatment, truncating box headers.

Acceptance: screenshots at 1440 AND 1920 widths showing the grid filling the page with uniform columns; PAY-14 + PM-07 smokes. This is presentational only — no money path, no data-write changes; harnesses must be untouched (re-run to prove: reconcile 64/64 · fees 15).

## HARD PROCESS RULE (added 2026-07-17 after 19 unpushed commits sat undeployed for a day)
"Banked" means PUSHED. Every report ends with the RAW OUTPUT of:
`git rev-list --count origin/main..main` (must be `0`) and `git log --oneline -1 origin/main`.
Prose claims of "banked to origin/main (0 ahead/0 behind)" are not acceptable evidence — that exact phrasing was reported while 19 commits sat unpushed. "Done" = pushed + Vercel build green + Cowork walked.

## Report
Per stage: files+lines, harness output where money-adjacent (G2-1 extended fixtures), screenshots, smoke IDs, plus the two git commands' raw output. Cowork re-walks; Adam re-grades payroll + patch live on production with the same IDs.
