# Budget smoke tests

> **Last run**: 2026-06-05 on `feat/budget-grid-usable` preview — full
> Phases B–E. ID prefix `BUD`; IDs never recycled.

Reference tour: "Warning Support". Templates picker needs a NEW empty tour.

## Status snapshot (2026-06-05)

| ID | Result | Note |
|----|--------|------|
| BUD-01/02/06/07/09 | PASS | inline edit, persistence, title-only open, totals |
| BUD-10/11 | PASS | migration 200 applies; existing budgets load |
| BUD-13 | PASS | picker works; **make modal + prettier**; default to Budget tab (DONE) |
| BUD-14 | PASS | fixed: no longer flags template lines as duplicates (DONE) |
| BUD-15 | FIXED | optimistic section/line CRUD + `.maybeSingle()`; multi-select + delete work (Fix-pack A) |
| BUD-16 | FIXED | grouping now keyed on `section_id`; Category retired from UI (Fix-pack A/C) |
| BUD-17 | PASS→see BUD-26 | column resize now has visible handles |
| BUD-18 | PASS | phase strip hides with toggle (no reload) |
| BUD-19 | FIXED | click-to-rename templates + consistent picker (Fix-pack C) |
| BUD-20 | FIXED | summary reads live from `section_id`; no phantom sections (Fix-pack A) |

## P&L brick dashboard — Phase 1 (#29 — feat/sprint-dashboard)

> Sprint Part 4. The Summary tab becomes discrete, typed BRICKS (show/hide +
> drag-reorder, mirroring the export template-builder section model). Phase 1 keeps
> the layout IN-MEMORY (no DB — persistence is Phase 2) and the DEFAULT reproduces
> today's Summary unchanged. Bricks: `overview` (allocation + burn-rate charts) ·
> `pnl` (computeBudgetPnl net / gross income / total expenses headline + report) ·
> `sections` (expense-by-section rollup) · `variance` · `top-spend` · `activity`.
> (Deferred to a later phase: splitting pnl into separate net/gross/expenses bricks,
> and a per-show-pnl brick — income rows aren't show-keyed in computeBudgetPnl yet.)
> Floor: tsc 0, eslint 0, build green.

- **DASH-01 — default = today's Summary unchanged.** `DEFAULT_DASHBOARD_CONFIG` lists
  the 6 bricks in canonical order (overview · pnl · sections · variance · top-spend ·
  activity), all shown. `BrickFrame` renders each via flex `order = index`, so the
  default DOM order === the visual order — no layout change on load. (Proven: order
  string + all-shown + count = 6.)
- **DASH-02 — config normalize fills to default.** `normalizeDashboardConfig(undefined
  | garbage)` deep-equals DEFAULT — the renderer can always rely on a complete, valid
  brick set (the Phase-2 persistence seam).
- **DASH-03 — normalize preserves + repairs.** A saved layout keeps its order +
  hidden flags; unknown ids are dropped, duplicates collapse to first occurrence, and
  any brick missing from the saved set is appended in canonical order (so a brick
  added in code shows up for users on an older saved layout). (Proven: activity-hidden
  kept first, dup pnl ignored, bogus dropped, the other 4 appended canonical, 6 total.)
- **DASH-04 — show/hide + drag-reorder.** The customizer's pure ops: hiding a brick
  sets `show=false` (others unaffected); dragging `pnl` above `overview` reorders the
  config array so `pnl` lands at index 0 (flex `order` 0). The customizer mirrors the
  export Sections accordion (GripVertical drag + Eye toggle) + a Reset-to-default.
  computeBudgetPnl is the single source for every figure (presentation only).

## Two-bar nav + budget chrome polish (#27 — feat/sprint-nav)

> Sprint Part 3. Three polish targets. Floor: tsc 0, eslint 0, build green.
> Verification is build + endpoint-existence + structural (these are client-UI
> chrome — no pure node harness; the metric math is untouched so the
> presentation-only invariant holds by construction).

- **NAV-POL-01 — forgiving hover-intent dropdown close.** `TopProductNav`'s product
  dropdowns no longer dismiss the instant the cursor leaves the chip: `onMouseLeave`
  now calls `scheduleClose` (a 180 ms grace timer, cancelled on re-enter / re-open),
  so a diagonal mouse path from the chip down to its menu survives. Escape /
  focus-out still close immediately (`close`). (Verified: `onMouseLeave={scheduleClose}`
  wired; timer cleared in `open`/`close`.)
- **NAV-POL-02 — animated open/close + wider target.** The menu is kept mounted and
  animated both ways (opacity + `translateY`, `visibility`/`pointer-events` gated on
  `isOpen`) instead of hard mount/unmount. The caret toggle spans the full chip
  height with a wider hit area (`self-stretch pl-1.5 pr-2.5`) so a tap anywhere on the
  chip's right edge opens the menu. (Verified: `visibility: isOpen` style present.)
- **NAV-POL-03 — version chip → approve / unlock / amend inline.** The `VersionSelector`
  dropdown gains an approver-gated actions block on the VIEWED version (was
  Settings-only): draft → **Approve & lock** (`approveVersion`); approved → **Unlock &
  re-approve** (`unlockVersion`) + **New version from approved** (`amendVersion` →
  navigates to `?version=<new>`). Mirrors `VersionApprovalCard.act` (toast on error,
  `router.refresh`). `canApprove` threads page → `BudgetContextBand` → selector; the
  server re-checks `is_budget_approver`. (Verified: the 3 POST endpoints
  `/api/budget/versions/[id]/{approve,unlock,amend}` exist; actions gated by `canAct`.)
- **NAV-POL-04 — burn bar collapsed to one status line.** `BudgetBurnBar`'s three
  stacked column-blocks (26 px Runway number · meter · Variance block) are now a single
  inline row (`py-2`, half-height): `Remaining $X of $Y` · meter (8 px, committed
  marker kept) · `$X spent · N% · committed $Z` · `vs Committed ↕$X`. "Remaining … of …"
  renders exactly once. The metric `useMemo` (total/committed/spent/remaining/variance
  via `convertToCurrency` + `getEffectiveActual`) is UNCHANGED — presentation only.
  (Verified: exactly 1 "Remaining" label + 1 "of {m.total}" in the file.)

## Document Export — Stage Plot surface (6th) (#8 — feat/sprint-stage-plot)

> The 6th export surface. **Plot-id keyed** (a stage plot lives in the artist
> library / a rider pack, not a tour) — routes are `/api/stage-plots/[id]/export/
> {pdf,preview}`. The proven server-safe `buildStagePlotSvg` was **extracted** from
> the retired `pdf-render.ts` into `src/lib/stage-plot/stageplot-svg.ts` (per-request
> custom-icon map, race-free), reused by the unified shell; the old `pdf-render.ts` +
> the `dev-pdf` route + the editor's client print-export were **deleted** (reuse +
> retire, no parallel copy). Two coarse sections: `stage-diagram` (default on) +
> `input-list` (default OFF → diagram-only). Excel is hidden for stage-plot (the
> shared xlsx route is tour-id keyed). tsc 0, eslint 0, build green. Functional smoke
> via `buildStagePlotBodyHtml` (node strip-types harness).

- **EXP-PLOT-01 — diagram renders to the document.** Diagram-only (default config)
  → the body contains the reconstructed `<svg class="lp-plot-svg">` with stage
  orientation labels (US/DS/SR/SL/AUDIENCE) and per-item labels; NO input-list
  section, NO channel rows. (Proven: kick + amp icons resolved from the built-in
  registry — the "Kick" label only renders when `getIcon` resolves — and the
  AUDIENCE marker present; "Input list"/"Snare Top" absent.)
- **EXP-PLOT-02 — "include input list" toggle adds the table.** Turning the
  `input-list` section on → the diagram is rendered AND the paired channel/input list
  is rendered beneath it (the classic combined doc): Input list table + Outputs
  (IEM / mix). Order: diagram ABOVE the list. (Proven: `<svg>` index < "Input list"
  index; "Snare Top" + "IEM 1" rows present.)
- **EXP-PLOT-03 — graceful no-paired-list.** Input-list ON but no channel_list pack
  resolves (linked → tour → artist precedence, mirrors `loadPlotChannels`) → the
  diagram still renders + a friendly "No channel list is paired" note (no crash).
- **EXP-PLOT-04 — config drives order + DEFAULT byte-for-byte.** Section reorder is
  honoured (input-list above diagram when reordered). `normalizeConfig('stage-plot',
  undefined)` === `DEFAULT_STAGE_PLOT_CONFIG` (and `defaultConfig('stage-plot')`
  matches); a garbage/foreign config normalizes to a valid stage-plot config (surface
  forced, stage-plot section ids restored). The combined `<ExportButton
  surface="stage-plot" tourId={plotId}>` mounts on both the artist-library plot
  editor and the operations stage-plot (both via `StagePlotEditorClient`'s `actions`
  slot). READ-ONLY; RLS via `loadStagePlot` (a foreign plot 404s).

## Document Export — Channel List surface (5th) (#8 — feat/export-channel-list)

> The 5th export surface, same per-surface pattern as rooming/routing. No migration
> (jsonb config). `loadChannelListExportData` mirrors the channel-list page (resolve
> the first rider pack with a `channel_list` section → rows / sub-snakes / stage
> boxes); the table matches the on-screen columns. tsc 0, eslint 0, build green.

- **EXP-CHAN-01 — input list matches the page.** `buildChannelListBodyHtml` renders
  the input table: # · Source · Mic/DI · Sub-snake · Stage I/O · Insert · Ph · Notes
  — the same computed columns + formatting (sub-snake/stage-IO as `label-pos`, phantom
  On/Off/—, mic·di joined) as `ChannelListTourSheet`. (Proven: Kick/Bass rows, phantom
  On/Off, sub-snake SL-1 + stage-IO 16A-1.)
- **EXP-CHAN-02 — outputs (IEM / mix) section.** A second section renders output rows
  (# · Item · Destination · Qty · Format · Notes; stereo + position). Two coarse
  sections (`inputs` / `outputs`) → show/hide + reorder via the section model.
  (Proven: PSM1000 / Singer IEM / Stereo 1+2; hiding outputs leaves just the inputs.)
- **EXP-CHAN-03 — routes + RLS + clean Excel.** `POST /api/channel-list/[tourId]/
  export/{pdf,preview}` + `/api/export/xlsx` (surface `channel-list`). Excel = two
  clean sheets (Input list + Outputs) with the v2.1 ExcelJS treatment (widths,
  styled/frozen/filtered header). READ-ONLY; RLS scopes via `rider_packs.workspace_id`
  (a foreign tour 404s). The shared orange **Export…** button mounts on the
  channel-list page when a section exists; no channel list → a friendly message.

## Document Export v2.1 — rooming polish (#8 — feat/export-v21-rooming)

> jsonb/calc only (no migration). tsc 0, eslint 0, build green.

- **EXP-V21E-01 — city + country, name fallback.** The hotel band shows city +
  country; when a hotel is unnamed / "Unassigned Hotel" the heading falls back to
  city/country. (Proven: an "Unassigned Hotel" in Paris/France renders "Paris,
  France" as the heading, not "Unassigned Hotel".) `rooming-data` loads hotel country
  (best-effort) + Excel gains a Country column.
- **EXP-V21E-02 — nights off-by-one fix (real bug).** A single-day block
  (stored ends_on on/before starts_on) is now ONE night with check-out = the day
  after check-in; multi-day stays are unchanged (ends_on is the checkout date).
  Presentation/calc only — the source room data is never mutated. (Proven:
  2 Oct→2 Oct = 1 night, checkout 3 Oct; 2 Oct→4 Oct = 2 nights, checkout 4 Oct.)
- **EXP-V21E-03 — group shared-room guests.** Guests sharing a room are grouped
  together (rows sorted by room key; the room-type cell rowspans the sharers + shows
  "shared · N"), keeping Adam's preferred formatting. (Proven: two guests in room 201
  share one rowspan=2 room cell; a single-occupancy guest is ungrouped.)

## Document Export v2.1 — routing polish (#8 — feat/export-v21-routing)

> jsonb config (no migration). tsc 0, eslint 0, build green.

- **EXP-V21D-01 — Lowpass checkbox.** The editor's `Toggle` is now a Lowpass-styled
  checkbox (orange box + check icon), not the raw browser one — used by every toggle.
- **EXP-V21D-02 — column picker.** The routing list has a column picker: **Country
  ON by default, Capacity OFF** (matches the cleaned Excel from Part B). Toggling
  Country/Capacity adds/removes the column. (Proven: default list has Country + no
  Capacity; the picker flips them; `routing-data` now loads canonical-venue country.)
- **EXP-V21D-03 — transport icon.** The travel/leg cell shows a mode-of-transport
  glyph from `transport_to_next` — ✈ for fly, 🚐 for drive. (Proven.)
- **EXP-V21D-04 — List / Calendar / Map / Both.** The view picker gains **Map**
  (a wired placeholder — the static-map image service is a flagged follow-up;
  cost-hardening = no live Google calls; lat/lng already loaded) and **Both**
  (list + map). Calendar's light/dark toggle is clearly shown when Calendar is
  selected. (Proven: map placeholder; both = list + map.)
- **EXP-V21D-05 — reduced header present.** Routing already carries the Part-B reduced
  running header band (`runningHeader` set for all four surfaces; the routing route
  passes it) — verified; what reads as "footer at top" IS that slim band.

## Document Export v2.1 — payroll polish (#8 — feat/export-v21-payroll)

> Payroll goes out to crew. jszip dep (no migration). Numbers from the same fees.ts
> (run-sheet totals unchanged). tsc 0, eslint 0, build green.

- **EXP-V21C-01 — "Routing" grid, bigger breakdown.** The per-day list is relabelled
  **Routing** (export + the editor toggle) and rendered as a clean bordered grid; the
  fee breakdown is larger (12px body, 14px "Amount due") + headed "Fee breakdown".
  (Proven: `>Routing<` present, "Where we were" gone; the larger font sizes render.)
- **EXP-V21C-02 — folder export (zip).** `POST /api/payroll/[tourId]/export/zip` →
  a .zip with the COMBINED run-sheet+statements PDF AND one statement PDF per person
  (JSZip; the shared `renderPdfBuffer` renders each via the same puppeteer pipeline;
  capped at 40 people for the function budget). Editor: a "Download all (zip)" button.
  internal_rate never loaded (D5); workspace-RLS scoped.
- **EXP-V21C-03 — people picker.** `config.payroll.selectedPersonIds` (null = All)
  narrows who's in the export; the editor fetches the roster
  (`GET /api/payroll/[tourId]/roster`) and shows "All crew" + per-person checkboxes.
  The loader filters persons to the selection (+ the existing individual-mode single
  filter). Default null → everyone (proven). The picker applies to PDF + Excel + zip.

## Document Export v2.1 — Excel rework (#8 — feat/export-v21-xlsx)

> Adam: "the Excel option is SO bad." Rebuilt `src/lib/export/xlsx.ts` on **ExcelJS**
> (the community `xlsx` can't write cell styles) into a proper data file. tsc 0,
> eslint 0, build green. (Verified: ExcelJS round-trips freeze/autofilter/bold-header/
> numeric-cells/numFmt/totals.)

- **EXP-V21B-01 — auto-sized columns.** Every column auto-sizes to its content
  (header + cells, capped) — no more "Manches"/"Düsseldo" truncation.
- **EXP-V21B-02 — real numeric cells.** Money/quantity cells are real numbers with a
  currency/number format (`"£"#,##0`, `#,##0`) so totals + filters work in Excel.
- **EXP-V21B-03 — styled header.** The header row is bold, brand-orange fill, white
  text, with the **top row frozen** + **autofilter** on the header.
- **EXP-V21B-04 — clean per-surface columns + totals.** Budget = Section/Item/Qty/
  Currency/Projected+Actual (native) + Projected/Actual/Variance in tour currency +
  a TOTAL row (the tour-ccy columns sum; same conversion as the P&L). Payroll =
  crew/role/day-counts/rates/Fee/Per-diem/Total + a GRAND TOTAL (no internal rate).
  Routing = Date/Day-type/City/**Country**/Venue/Address/**Travel to next** (capacity
  + raw advance junk removed; `not_started` etc. gone). Rooming = Hotel/City/Guest/
  Room type/Room #/Check-in/Check-out/Nights + a nights TOTAL.

## Document Export v2.1 — editor & preview polish (#8 — feat/export-v21-editor)

> Polish from Adam's v2 smoke. Editor-only, no schema. tsc 0, eslint 0, build green.

- **EXP-V21A-01 — printable page preview.** The preview renders as a real sheet: a
  white page with the PDF's print margins (16/14/20 mm @ 96dpi) as padding, and the
  iframe content sized to the CONTENT width (page − side margins) so the on-screen
  wrap matches the PDF exactly (true WYSIWYG) and nothing is flush to the edge. The
  header/logo are no longer hard against the page border.
- **EXP-V21A-02 — hide-header toggle.** The Header group's "Show header" toggle
  removes the entire letterhead (and the running header) when off; content starts at
  the top margin. (Present + verified — `config.header.show` → shell omits the
  letterhead + build sets `runningHeader: null`.)
- **EXP-V21A-03 — one Default pill.** The "Default" pill now shows on exactly ONE
  template per surface (the first workspace default) even if the data has a stale
  duplicate; the PATCH route still clears the previous default before setting the new
  one (the partial-unique index allows only one).
- **EXP-V21A-04 — click-to-apply + re-preview.** The WHOLE template row is clickable
  (not just the name) — clicking applies that template's config, which re-renders the
  live preview; inner Default/Delete buttons stop propagation. Hover + selected states
  remain.
- **EXP-V21A-05 — control order.** Format + the surface-mode controls (Figures /
  Payroll / Routing / Date range) now sit ABOVE the Sections group in the panel.

## Document Export v2 — rooming polish (#8 — feat/export-v2-rooming)

> The third external doc gets the E/F external-quality standard: the shared date
> range + a cleaner branded hotel-grouped layout. (Format toggle + header
> customisation already apply from Parts C/D.) jsonb config, no migration. tsc 0,
> eslint 0, build green.

- **EXP-V2G-01 — branded hotel layout.** Each hotel is a header band (orange left
  accent + name + contact + a "N guests · M nights · stay span" summary), then the
  guest table with **room-type chips**, zebra rows, and the nights subtotal. (Proven:
  the orange accent band, the summary line, the Double/Single chips, zebra + subtotal
  all render.)
- **EXP-V2G-02 — shared date range.** The Part-E date-range control applies to
  rooming — assignments whose stay OVERLAPS [from,to] are kept (default = whole tour).
  Wired through the PDF + Excel paths; editor shows the Date range group for rooming.
- **EXP-V2G-03 — matches payroll/routing quality + RLS.** Rooming reuses the shared
  header/format controls (Parts C/D) + the running header (Part B); workspace-RLS
  scoped (rooming is PII — a foreign tour 404s; the roster filter is unchanged).

## Document Export v2 — routing upgrade (#8 — feat/export-v2-routing)

> Routing is external + was "almost ASCII." Two views, travel times, the shared
> date range. jsonb config, no migration. tsc 0, eslint 0, build green.

- **EXP-V2F-01 — restyled list view.** The itinerary table gains coloured day-type
  chips (Show/Travel/Off/Rehearsal/Festival/Press…), zebra rows, and an optional
  **travel-time** column. Default view = list, no travel column (proven).
- **EXP-V2F-02 — travel times (cache + approx).** When toggled, each day shows the
  drive time to the next day, read from the existing `drive_time_cache`
  (origin/dest "lat,lng", mode 'driving') — the export NEVER calls Google (cost-
  hardening). Uncached legs fall back to a straight-line (haversine) estimate
  prefixed `~`. (Proven: a cached leg shows "2h 10m"; an uncached leg shows
  "~1h 30m".)
- **EXP-V2F-03 — calendar view.** `routing.view = 'calendar'` renders a print-
  friendly month grid (Mon-start, one block per month) with each day's day-type chip
  + city + venue; a **light / dark** theme toggle. (Proven: "March 2026" grid with
  weekday heads + the venue; dark theme uses the dark palette.)
- **EXP-V2F-04 — shared date range + all days.** The Part-E date-range control now
  applies to routing (filters days within [from,to]; default = whole tour). All days
  (show + non-show) still listed. Workspace-RLS scoped. The range applies to the
  Excel export too. **Map view is a flagged follow-up** (needs a static-map image
  service; the routing lat/lng is already loaded) — not shipped in this batch.

## Document Export v2 — payroll upgrade (#8 — feat/export-v2-payroll)

> Payroll goes out to crew to invoice against — clearer + flexible. Mode toggle,
> a shared date-range, invoice-clarity options. All in jsonb config (no migration).
> Numbers from the SAME fees.ts (run-sheet totals unchanged → EXP-PAY-01 holds).
> tsc 0, eslint 0, build green.

- **EXP-V2E-01 — Combined vs Individual mode.** Combined = the master run sheet +
  every per-person statement (today). Individual = statements only (the run sheet is
  hidden), one page per person to send each crew member their own. (Proven: combined
  has the run sheet + all statements; individual drops the run sheet, keeps the
  statements.)
- **EXP-V2E-02 — shared date-range picker.** `config.dateRange.{from,to}` (default
  null = whole tour). The payroll loader counts only day_statuses within the range
  (the one-time advance is dropped only if its week is fully out of range); editor
  from/to date inputs + "Whole tour" reset. Default (no range) → counts + advance
  identical to today (proven). The range is shared (Routing + Rooming adopt it in
  Parts F/G).
- **EXP-V2E-03 — invoice clarity.** Each statement shows a "N days worked" line; the
  Payroll panel toggles the **Days grid** (weekly Show/Off/Reh), **Where we were** (a
  per-day list date · type · city · venue, joined from routing), and the **Advance
  fee** line. (Proven: venuePerDay adds the "Where we were" table with the city/venue;
  daysGrid off removes the weekly grid; advance off hides the advance line.)
- **EXP-V2E-04 — internal rate still excluded + RLS.** internal_rate is still never
  loaded (D5); individual mode's per-person filter (`payroll.personId`, by rate-card
  id) is applied in the loader. Workspace-RLS scoped; the date range + mode apply to
  the Excel export too.

## Document Export v2 — header customisation (#8 — feat/export-v2-header)

> The letterhead gets custom text + sizes + a notes block. All in the header jsonb
> config (no migration); every field defaults to null → today's letterhead
> byte-for-byte (proven: `renderDocument` with the default header === main's output;
> overrides change output). Presentation-only — overriding a displayed label never
> changes a number. tsc 0, eslint 0, build green.

- **EXP-V2D-01 — custom header text.** `header.text.{artist,tour,title,subtitle}`
  override the displayed label (blank = the real artist/tour name, surface title,
  version/scope subtitle). Editor: text inputs in the Header group. (Proven: an
  artist override replaces the real name; a title override replaces "Budget".)
- **EXP-V2D-02 — custom font sizes.** `header.size.{artist,tour,dates,title,subtitle}`
  set a px font-size per element (null = the shell's default); editor sliders with an
  "auto" reset. Inline `font-size` is emitted only when set → default unchanged.
- **EXP-V2D-03 — notes block.** `header.notes` renders a free-text, pre-wrapped note
  block under the letterhead (inline-styled; null = nothing). Editor: a textarea
  (600-char cap). (Proven: the note text appears in the rendered doc.)
- **EXP-V2D-04 — default unchanged.** With no overrides the letterhead is byte-for-
  byte today's output (EXP-BUD-01 / EXP-ROOM-01 hold); `normalizeConfig` clamps sizes
  (6–60px) + caps text/notes length so a hostile config can't break the render.

## Document Export v2 — PDF ↔ Excel (#8 — feat/export-v2-format)

> A format toggle in the editor + a server xlsx path. `format: 'pdf' | 'excel'` is a
> new jsonb config field (no migration); default 'pdf' (byte-for-byte unaffected).
> The old client-side XLSX button is retired. tsc 0, eslint 0, build green.

- **EXP-V2C-01 — format toggle changes output + presentation.** The editor's
  **Format** group toggles PDF / Excel. PDF = the styled print doc (unchanged). Excel
  = a flat, machine-readable .xlsx (one row per line, plain headers) from
  `/api/export/xlsx`, built by `src/lib/export/xlsx.ts` reusing the SAME loaders as
  the PDF path (numbers agree). The Download button label updates to **Download PDF** /
  **Download Excel**. (Verified: SheetJS writes a valid xlsx buffer server-side.)
- **EXP-V2C-02 — Excel layouts per surface.** Budget → Section/Item/Qty/Currency/
  Projected/Actual/Variance (expense lines). Rooming → Hotel/Address/City/Guest/Room
  type/Room #/Check-in/Check-out/Nights. Payroll → Crew/Role/day counts/rates/Fee/
  Per-diem/Total + grand total (NO internal rate — D5). Routing → Date/Day type/City/
  Venue/Address/Capacity/Advance.
- **EXP-V2C-03 — old XLSX button removed.** `BudgetExportControls` no longer has the
  client-side XLSX menu item / jspdf; it uses the shared `<ExportButton>` (Excel now
  lives inside the editor's format toggle). The display-currency switcher stays.
- **EXP-V2C-04 — Excel-aware editor + RLS.** With Excel selected, the print-only
  styling groups (General / Page size / Header / Footer) are hidden and the preview
  shows an "Excel data grid" panel (no HTML preview). The xlsx route is workspace-RLS
  scoped — a foreign tour 404s; payroll/rooming PII never leaks.

## Document Export v2 — multi-page layout (#8 — feat/export-v2-pagination)

> Shared shell, all four surfaces. Fixes the "page 1 = banner then empty; content on
> page 2 with no header" bug + adds a reduced running header. Presentation-only; the
> default budget body still starts with the P&L summary (no leading break) so
> byte-for-byte holds. tsc 0, eslint 0, build green.

- **EXP-V2B-01 — content flows on page 1 (no empty first page).** `renderDocument`
  strips any LEADING `lp-page-break` from the body, so when the first visible section
  is one that prefixes a page-break (budget income-detail when the P&L summary is
  hidden/reordered; payroll statements when the run-sheet is hidden; routing advance-
  summary), content no longer jumps to page 2 leaving page 1 with just the letterhead.
  (Proven: a body starting with a page-break renders with it removed and the content
  intact; an INTERNAL break between sections is preserved.)
- **EXP-V2B-02 — reduced running header on overflow pages.** `pdfRunningHeaderTemplate`
  prints a slim one-line band — "Artist — Tour · Surface" left, "Page x / y" right —
  via the puppeteer `headerTemplate` (threaded `ExportDoc.runningHeader` →
  `build.ts`, set to the footer note when `header.show`). Page 1's FULL letterhead
  banner sits in the content below this slim margin band; pages 2+ carry the band as
  their header. Hidden when `header.show` is false.
- **EXP-V2B-03 — footer page x/y stays correct.** The footer (Lowpass mark + note +
  Page x/y) is unchanged; the new running header is additive. Applies to all four
  surfaces (budget/rooming/payroll/routing) via the shared render.
- **EXP-V2B-04 — default unchanged.** The default budget/rooming/payroll/routing body
  does not start with a page-break, so the strip is a no-op there; reconciliation +
  byte-for-byte (EXP-BUD-01 / EXP-ROOM-01) hold. (Chromium can't natively suppress a
  `headerTemplate` on page 1 only, so the slim band also sits in page 1's top margin
  above the full banner — unobtrusive; flagged.)

## Document Export v2 — editor & layout polish (#8 — feat/export-v2-editor)

> Editor UX from Adam's live smoke. All in `ExportTemplateEditor.tsx` + a shared
> `<ExportButton>`. Presentation-only; no schema. tsc 0, eslint 0, build green.

- **EXP-V2A-01 — modal above all chrome.** The editor renders via `createPortal`
  to `document.body`, so the ProductHeader (a positioned app-chrome ancestor) no
  longer bleeds through the top of the modal; the backdrop covers the full viewport.
- **EXP-V2A-02 — collapsible settings.** Each settings group (Templates / Sections /
  Figures / General / Page size / Header / Footer) is a collapsible `AccordionGroup`;
  open/closed persists per group in `localStorage` (`lp-export-accordion:<id>`).
  Templates + Sections (+ budget Figures) open by default.
- **EXP-V2A-03 — preview zoom + page boundary.** The preview renders the page at its
  true CSS-px width (A4 794 / Letter 816) inside a white sheet with a drop-shadow
  boundary, **fit-to-width by default**; zoom out/in/fit buttons + ⌘/Ctrl-scroll +
  double-click toggle. Switching A4 ↔ Letter visibly changes the sheet width (reflow
  is now visible). The sheet height tracks the rendered doc (same-origin srcDoc
  measure), so all content shows.
- **EXP-V2A-04 — default pill + row states.** The hollow star is gone; each workspace
  template row has a **Default pill** that turns orange when active (click to set
  default). Rows animate on hover (slide + tint) and show a clear selected state
  (orange border + fill + bold) — clicking a row applies it.
- **EXP-V2A-05 — open behaviour + save prompt.** Opening Export… for a surface
  applies the **last-used template** for that surface (localStorage
  `lp-export-last-template:<surface>`), else the workspace default. Closing or
  downloading with unsaved changes prompts "Save these settings as a template?"
  (Save / Don't save / Cancel) before proceeding; the header shows a "• unsaved" hint.
- **EXP-V2A-06 — universal orange Export button.** All four surfaces use the shared
  `<ExportButton>` (identical orange styling) — Routing is no longer grey.

## Document Export — Budget slice (#8 — feat/export-budget)

> No migration (read-only). Server-rendered HTML → A4 PDF via the existing
> puppeteer pipeline (`getBrowser()`); the shared shell (`src/lib/export/shell.ts`)
> is the reusable letterhead/footer for all four surfaces. Retires the old
> client-side jspdf "PDF summary". tsc 0, eslint 0, build green.

- **EXP-BUD-01 — P&L matches the Summary tab to the cent.** Budget → **Export →
  Branded PDF…** → Download. The PDF's Gross income / Total expenses / **Net**
  equal the Summary tab's figures exactly (same `computeBudgetPnl` inputs: lines
  with the viewed-version proposed overlay + raw `budget_income` + commissions +
  settings + fx). Section subtotals sum to Base expenses.
- **EXP-BUD-02 — scope toggle selects columns.** The dialog's **Both + Variance**
  (default) renders Projected · Actual · Variance (= actual − projected) per row +
  total; **Projected** / **Actual** render a single column. Income variance is
  green when actual ≥ projected; expense variance green when actual ≤ projected.
- **EXP-BUD-03 — branded A4 + logo.** A4 letterhead with the artist logo
  (`resolveArtistLogoUrl` → **base64 data-URI inlined**, not a network URL),
  artist · tour · tour dates · generated-on; footer = Lowpass mark + page x/y.
  No logo → artist-initials block.
- **EXP-BUD-04 — native + converted on foreign rows.** A foreign-currency line or
  show prints native AND tour-currency (e.g. `€1,000 (£850)`); same-currency rows
  print one amount. Totals are in the tour currency.
- **EXP-BUD-05 — RLS gated + read-only.** A foreign-workspace tourId 404s (no
  cross-workspace leak); export writes nothing. A locked/approved version exports
  fine (read-only).
- **EXP-BUD-06 — old quick-PDF gone.** The Export menu shows **XLSX** +
  **PDF…** only; the client-side jspdf "PDF summary" is removed. (P1: **PDF…** now
  opens the `ExportTemplateEditor`, not the old one-shot dialog.)

## Document Export — Rooming slice (#8 — feat/export-rooming)

> No migration (read-only). Second surface on the SHARED shell (`shell.ts`
> unchanged). Standard hotel rooming-list grouped by hotel. tsc 0, eslint 0,
> build green. (Render proof = the downloaded PDF; the puppeteer pipeline is
> shared with Budget.)

- **EXP-ROOM-01 — branded rooming list, grouped by hotel.** Operations → Rooming →
  **Export…** → Download PDF (P1: opens the `ExportTemplateEditor`). A4 with the SAME
  letterhead as Budget (artist · tour ·
  logo · dates) + Lowpass footer. Body: one block per hotel (name · address · phone ·
  stay span), then guest rows — **guest · room type · check-in · check-out · nights** —
  sorted by check-in, with a per-hotel `N guests / total nights` subtotal.
- **EXP-ROOM-02 — matches the Rooming surface.** The guests/rooms in the PDF equal
  what the Rooming grid shows for that tour (same `hotels`/`rooms`/`room_assignments`
  query + the same roster filter — only tour-roster members; a null-person_id
  assignment is kept, not dropped). Nights = check-out − check-in.
- **EXP-ROOM-03 — RLS gated + read-only.** A foreign-workspace tourId 404s (rooming
  is PII — no cross-workspace leak); export writes nothing. A tour with no hotels →
  "No hotels booked for this tour."
- **EXP-ROOM-04 — shell unchanged.** `src/lib/export/shell.ts` is byte-identical to
  the Budget slice (the shell stays generic for Payroll/Routing).

## Document Export — Template Builder Phase 1 (#8 — feat/export-template-p1)

> The tiny Export dialog is replaced by a wide **editor** (`ExportTemplateEditor`):
> left = a LIVE preview (an `<iframe srcDoc>` of the SAME server HTML the PDF route
> prints — WYSIWYG by construction), right = settings. A pure presentation-only
> `TemplateConfig` (`src/lib/export/template-config.ts`) drives the body builders +
> shell; the numbers ALWAYS come from `computeBudgetPnl` (reconciliation holds). One
> shared build path (`src/lib/export/build.ts`) feeds BOTH the `…/export/pdf` and the
> new `…/export/preview` routes (budget + rooming). No persistence yet (P1). tsc 0,
> eslint 0, build green.

- **EXP-TPL-01 — default config = unchanged PDF.** Budget → **Export → PDF…** opens
  the editor; **Download PDF** with no changes produces the byte-for-byte same body
  as before (EXP-BUD-01 / EXP-ROOM-01 stay green). `DEFAULT_BUDGET_CONFIG` join =
  the original `summary + detail` concatenation (verified: `renderPnlSummary` returns
  the identical summary literal; the income/expense section strings reconstruct the
  original `detail` exactly under canonical order).
- **EXP-TPL-02 — hide a section → gone from preview AND PDF.** Toggle the eye on
  **Income detail** (budget) or a section's visibility → it disappears from the live
  preview immediately AND from the downloaded PDF. Same builder server-side, so they
  agree. Budget sections: P&L summary / Income detail / Expense detail. Rooming: Hotel
  rooming list.
- **EXP-TPL-03 — reorder → reflected in both.** Drag **Expense detail** above
  **Income detail** → the preview reorders AND the PDF reorders. `config.sections`
  array position = render order.
- **EXP-TPL-04 — page size + logo + scope.** A4↔Letter changes the `@page size`
  (preview + PDF); the logo checkbox shows/hides the letterhead logo/initials block;
  the budget scope (Projected / Actual / Both + Variance) picks the columns. All
  presentation-only — the figures never change.
- **EXP-TPL-05 — preview matches the PDF (WYSIWYG).** The `…/export/preview` route
  returns `{ html }` from `buildBudgetExport`/`buildRoomingExport`; the `…/export/pdf`
  route prints the SAME build output. The only difference is the PDF's page-number
  footer (print-only). RLS-gated + read-only like the PDF routes (foreign tour 404s).
- **EXP-TPL-06 — config is coerced server-side.** A malformed/hostile `config` body
  is run through `normalizeConfig` — unknown section ids dropped, missing sections
  restored, page size / scope clamped — so a bad config can never crash the builder
  or smuggle a non-section. Back-compat: `?scope=` / `?version=` query still work.

## Document Export — Template persistence (#8 — feat/export-template-persist)

> Phase 3: save / apply / set-default templates, shared across a workspace's tours.
> `export_templates` (migration 224): id · workspace_id (NULL = the read-only GLOBAL
> tier) · surface · name · config jsonb · is_default · timestamps. RLS workspace-
> scoped via `get_my_workspace_id()` (+ global read); a partial unique index =
> ONE default per (workspace, surface); a CHECK forbids a global template being a
> default. CRUD: `/api/export/templates` (GET list, POST save, PATCH rename/set-
> default, DELETE) — all workspace-scoped; the global tier is read-only (no client
> writes a NULL workspace_id). Editor: a Templates panel (save / apply / set-default /
> delete + the global list). tsc 0, eslint 0, build green.

- **EXP-TPL3-01 — save → lists for that surface in that workspace only.** Saving the
  current settings as a named template (POST, `config` coerced by `normalizeConfig`)
  makes it appear in the editor's Templates list for that surface. RLS: a second
  workspace can't see it (`export_templates_select` = own workspace OR global).
- **EXP-TPL3-02 — set default → a new export opens with it.** Star a workspace
  template → `is_default` (the route clears the prior default first, so the partial
  unique index never rejects). Re-opening the editor for that surface auto-applies the
  workspace default (`refreshTemplates(applyDefault)` on mount).
- **EXP-TPL3-03 — apply a global template → copy-on-apply.** A Global (workspace_id
  NULL) template lists with a globe badge; applying it loads its config into the live
  editor (editor STATE only — no DB write); editing + Save creates a workspace-owned
  copy. A PATCH/DELETE against a global row is rejected (403 "Read-only template").
- **EXP-TPL3-04 — one default enforced.** The partial unique index
  `export_templates_one_default (workspace_id, surface) WHERE is_default` allows at
  most one default per (workspace, surface); the CHECK
  `export_templates_global_not_default` forbids a global row being a default.
- **EXP-TPL3-05 — presentation-only persists.** A saved template stores only a
  `TemplateConfig` (presentation) — never data; applying it can reorder/hide/restyle
  but never changes a number. The tour stores no `template_id` (render-time selection,
  D-APPLY).

## Document Export — Routing surface (#8 — feat/export-routing)

> The fourth export surface, config-aware. `loadRoutingExportData` reads the
> `routing` table (one row per tour day — migration 001 + the canonical-venue join,
> migration 214) ordered by date; `buildRoutingBodyHtml` emits one row per day
> (date · day-type · city · venue + address sub-line · capacity), ALL days (show +
> travel/off/etc. — D7), plus an OPTIONAL per-day **advance summary** (a best-effort
> read of `advance_instances` status + filled-field counts; the data is free-form so
> we summarise rather than guess labels). The advance summary is a section toggle
> **OFF by default** (D7). NOT a daysheet (Adam uses Master Tour for those). Routes:
> `POST /api/routing/[tourId]/export/{pdf,preview}`. UI: "Export…" on the Routing
> surface. tsc 0, eslint 0, build green.

- **EXP-ROUTE-01 — all routing days listed.** Every day of the tour appears (not just
  shows): date · day-type · city · venue (+ address sub-line) · capacity, ordered by
  date. Non-show days (Travel/Off/Press/etc.) are included (proven: a travel + off +
  show day all render; the day-type column labels each).
- **EXP-ROUTE-02 — advance summary appears only when toggled.** The default routing
  PDF is the itinerary table only; the per-day advance summary section is OFF by
  default (D7). Toggling it on (editor / config) adds a best-effort per-day block
  (status + filled-field count) for the days that have an advance instance (proven:
  default has no "Advance summary"; toggled-on lists only days with an advance; a
  partial config that omits the section keeps it OFF via `normalizeConfig`).
- **EXP-ROUTE-03 — config-aware + RLS gated.** The days / advance-summary sections
  show/hide + reorder (preview + PDF); the Part-A styling panel applies. READ-ONLY,
  workspace-RLS scoped — a foreign-workspace tour 404s. Venue/city prefer the
  canonical-venue join, falling back to the denormalised routing columns.

## Document Export — Payroll surface (#8 — feat/export-payroll)

> The third export surface, config-aware from birth (inherits the P1+P2 template
> system: section show/hide/reorder + the full styling panel). `loadPayrollExportData`
> mirrors the Payroll page's loaders (tour_personnel roster + personnel_rates +
> payroll_entries) and computes every total via the SHARED pure `src/lib/payroll/
> fees.ts` (`countDayStatuses` / `computeTotalFee` / `computeTotalPerDiem`) — NOT
> re-derived. `buildPayrollBodyHtml` emits a run sheet + per-person statements (one
> page each) in ONE multi-page PDF. Routes: `POST /api/payroll/[tourId]/export/{pdf,
> preview}`. UI: "Export…" on the Payroll surface opens the shared editor
> (surface="payroll"). tsc 0, eslint 0, build green.

- **EXP-PAY-01 — run sheet totals match the Payroll tab.** Every crew member in one
  table: role, day-type rates (Show/Off/Reh), day counts (S/O/R), fee, per-diem,
  total + a grand-total row. The per-person fee = `computeTotalFee(rate, counts,
  advance)` summed over the person's weekly entries, per-diem = `computeTotalPerDiem`
  — the exact fees.ts math the Payroll surface uses, so the run-sheet totals
  reconcile with the Payroll tab to the penny (proven: `grandTotal === Σ person
  totals`; each `person.total === fee + perDiemTotal`).
- **EXP-PAY-02 — statements paginate one-per-person.** After the run sheet, each
  crew member gets their own page (`lp-page-break`): weekly schedule (Show/Off/Reh +
  fee/per-diem per week), rate breakdown (days × rate, advance if any, per-diem), and
  the **Amount due**. (Proven: N persons → N page-breaks; advance line appears only
  when the person has an advance.)
- **EXP-PAY-03 — internal rate NEVER appears.** `personnel_rates.internal_rate` (the
  company's cost — D5) is never SELECTed by the loader and never reaches the builder;
  it appears in neither the run sheet nor any statement. (Proven: the string
  `internal` is absent from the rendered HTML; the loader's select list omits it.)
- **EXP-PAY-04 — config-aware + RLS gated.** The run sheet / statements sections
  show/hide + reorder (preview + PDF); the Part-A styling panel applies. READ-ONLY,
  workspace-RLS scoped — a foreign-workspace tour 404s (payroll is financial PII, no
  cross-workspace leak). Currency from `tour.currency`.

## Document Export — Template Builder Phase 2: styling (#8 — feat/export-template-p2)

> The editor gains the daysheets-style styling layer: a **General** panel (font
> family / size / B&W / dashed dividers / borderless), a **Header** panel (show,
> logo position + height + radius, element show/hide/reorder, title/subtitle/
> generated toggles, + a background image in Part A4) and a **Footer** panel
> (show / page numbers / summary line). All PRESENTATION-ONLY — the config drives
> `shell.ts` (CSS overrides + a config-driven letterhead) via the `general`/`header`
> groups; the body builders + `computeBudgetPnl` are untouched. Every style group's
> DEFAULT emits NO extra CSS / today's exact letterhead, so the default doc is
> byte-for-byte today's output. **Proven:** `renderDocument` with the default
> `general`/`header` === the committed P1 output across every letterhead variant
> (logo / initials / absent artist / dates / subtitle / Letter / no-logo); the
> footer default === the P1 footer. tsc 0, eslint 0, build green.

- **EXP-TPL2-01 — General styling → preview AND PDF.** Font (Sans/Serif/Mono),
  font-size scale (85–120%, via `body { zoom }`), B&W (greyscales the whole doc incl.
  images), dashed dividers above each section head, and borderless (no table boxes)
  each change the live `<iframe>` preview immediately AND the downloaded PDF (same
  server builder). B&W injects `html { filter: grayscale(100%) }`.
- **EXP-TPL2-02 — Header controls.** Show-header off → no letterhead; logo position
  Left/Right; logo height + corner-radius sliders; the Artist / Tour / Dates elements
  show/hide + drag-reorder in the meta block; title / subtitle / generated-date
  toggles. All reflected in preview + PDF.
- **EXP-TPL2-03 — Footer controls (print-only).** Show-footer, page-numbers, and the
  summary-line + Lowpass-mark toggles change the downloaded PDF's repeating footer
  (the editor notes the footer is print-only — it isn't in the live preview, which is
  a single self-contained page, not paginated).
- **EXP-TPL2-04 — image upload (Part A4).** The Header panel uploads a header
  **logo** (overrides the artist logo) and a **background image** (a faded layer
  behind the letterhead at the opacity slider's value) to the PRIVATE `export-assets`
  bucket (migration 223, workspace-scoped RLS) via `POST /api/export/assets` →
  `{ path }`. The render resolves the path → base64 data-URI server-side
  (`fetchExportAssetDataUri`, workspace-prefix guarded), so the browser never holds a
  URL (private-bucket-safe). Both appear in preview + PDF; a foreign-workspace path is
  rejected (no cross-workspace asset read). 5MB cap, image MIME allowlist.
- **EXP-TPL2-05 — DEFAULT still = P1 output (no regression).** With no styling
  changes the document is byte-for-byte the Phase-1 output: each style group's default
  emits no override and the letterhead is the committed P1 letterhead (proven by the
  `renderDocument`-equivalence check above). EXP-BUD-01 / EXP-ROOM-01 stay green.
- **EXP-TPL2-06 — presentation-only invariant.** No styling control can change a
  number: the body builders read the same `data` / `computeBudgetPnl` output; styling
  is CSS + letterhead HTML only. Reconciliation holds under every style combination.

## Document Export — render hardening (#8 — fix/export-pdf-render)

> "PDF cannot be generated" was a SILENT route failure (any throw → the client's
> generic message). The render path itself is proven good (a local Chrome renders
> the EXACT `page.pdf` options + the real `shell.ts` output — both the
> logo-letterhead/img-footer path and the prod null-mark/initials path). So the fix
> is robustness + visibility in the SHARED path (`src/lib/export/render.ts`), not a
> content change. tsc 0, eslint 0, build green.

- **EXP-FIX-01 — failures are surfaced, never silent.** A budget/rooming export
  that errors now returns **500 JSON `{ error, detail }`** and logs the real
  exception (`[export:<surface>] PDF generation failed: <stack>`) server-side —
  no PII (it's a budget/rooming doc). The client can show the detail instead of the
  blanket "PDF cannot be generated."
- **EXP-FIX-02 — footer fallback.** `page.pdf()` runs with the header/footer
  templates first (the one thing the export does beyond the proven-good rider
  route); if Chromium ever rejects them it retries once **without** header/footer
  (the rider's known-good options) → a PDF always comes back.
- **EXP-FIX-03 — logo fetch can't hang the function.** `fetchLogoDataUri` now has
  an 8s `AbortController` timeout — a slow/blocked artist-logo host degrades to the
  initials fallback instead of pushing the render toward `maxDuration`.
- **EXP-FIX-04 — shared path.** Both routes render through `exportPdfResponse(...)`,
  so Budget, Rooming, and the future Payroll/Routing inherit the surfacing +
  fallback + timeout. `shell.ts` (the HTML) stays render-logic-free.

## Document Export — pre-render 500 + TOTAL guard (#8 — fix/export-500-loader)

> The export still 500'd with an **empty body** in prod (the guard wasn't wrapping
> the throwing line). Reproduced `loadBudgetExportData` + `buildBudgetBodyHtml`
> against the **real DB** (incl. Warning Support + Simple Plan) — neither throws;
> both produce HTML. Two fixes: a real loader bug + a TOTAL guard. Rendered a real
> 3-page PDF end-to-end. tsc 0, eslint 0, build green.

- **EXP-FIX-05 — income was silently dropped (real bug).** `loadBudgetExportData`
  filtered `routing` by `.eq('workspace_id', …)`, but **`routing` has no
  `workspace_id` column** (it's tour-scoped; the page at `page.tsx:151` filters by
  `tour_id` only). The query errored → `routingIds` empty → **every export's P&L
  showed £0 income**. Fixed to match the page. Verified live: Warning Support income
  rows 0→1, Simple Plan 0→3.
- **EXP-FIX-06 — TOTAL guard, never a bare 500.** Both export routes wrap their
  **entire** handler (params, auth, workspace-RLS, loaders, build, render) in one
  try/catch → `exportErrorResponse(surface, err)` → **always** `500 JSON
  { error, detail, stack }` + a server log `[export:<surface>] PDF generation
  failed: …`. Verified: a thrown error returns `status 500` with the message + stack,
  not 0 bytes. (Diagnosis: the loader/body don't throw → the prod 500 is in the
  render/`getBrowser` env path, which this guard now surfaces verbatim.)
- **EXP-FIX-07 — end-to-end render proof.** `loadBudgetExportData` → `buildBudgetBodyHtml`
  → `renderDocument` → Chrome `page.pdf` (the exact shell options + footer) produces a
  valid **3-page `%PDF-1.4`** for Warning Support, with income present.
- **EXP-FIX-08 — THE root cause: em-dash in the filename header.** The download
  filename `<Artist> — <Tour> — Budget.pdf` uses an em dash (—, U+2014); HTTP header
  values must be Latin-1, so `new Response` threw `Cannot convert argument to a
  ByteString` building `Content-Disposition` — AFTER a full 5.5s render (the PDF was
  fine). Fixed with one shared RFC-5987 helper in `render.ts`: `filename="…"` ASCII
  fallback (non-ASCII → `-`, quotes/backslashes stripped) + `filename*=UTF-8''…` for
  the real Unicode name. Verified: the raw header throws the exact `TypeError`; the
  RFC-5987 header builds the `Response` cleanly for an em dash AND accents
  (José/Beyoncé). Budget/Rooming/future surfaces inherit it (built in the shared
  Response path). Export now returns **200 · application/pdf**.

## Income redesign — Phase 1: Settlement (feat/income-settlement-phase1)

> Migration **215** (`budget_income.actual_deductions`, additive nullable). Run
> `npm run db:migrate`. tsc 0, eslint 0, build green. Actuals are unversioned —
> no `budget_version_income`/lock change.

- **INC-DED-01 — settlement upserts income (data-loss fix).** Settle a show that
  has **no** income row → a `budget_income` row is **created** for that
  `routing_id` with `actual_guarantee/overage/merch/deductions` (settlement POST
  upserts, was update-if-exists). The Income → **Actual** view shows it.
- **INC-DED-02 — deductions reach income + reduce NET.** Settle a show **with**
  deductions → `budget_income.actual_deductions` populated; the Summary P&L's
  **actual** income (and NET) drops by exactly that amount (no longer overstated).
  `computeBudgetPnl` subtracts it from both actual sums.
- **INC-DED-03 — VIP stays manual.** Settling does **not** touch `actual_vip`
  (settlement has no VIP source); an existing manual VIP survives a re-settle.
- **INC-DED-04 — Actual view shows Deductions (read-only).** The income Actual
  view has a read-only **Deductions** column; the row Total = guarantee + overage
  + merch + vip − deductions. Projected view + the versioning lock unchanged.

## Income redesign — Phase 2: Per-show currency (feat/income-currency-phase2)

> Migration **216** (`budget_income.currency` + `budget_version_income.currency`
> mirror, additive nullable; new `budget_fx_rates` table — per-tour, **unversioned**,
> RLS via `get_my_workspace_id()`). Run `npm run db:migrate`. tsc 0, eslint 0,
> build green. Currency is **proposed structure** → it follows the versioning lock.

- **INC-CUR-01 — per-show currency picker.** Income grid has a **Ccy** dropdown per
  show; options = the tour currency + every currency with an FX rate (Settings).
  Picking the tour currency stores `null`; any other stores the upper-cased code on
  `budget_income.currency`. Both Projected + Actual views show the same picker.
- **INC-CUR-02 — native-currency amounts.** A show set to a non-tour currency renders
  its money cells in that currency (e.g. €1000 with a red ≈ tour-currency note), via
  the row's `cur`. Tour-currency shows are unchanged.
- **INC-CUR-03 — FX-rate editor (Settings).** Budget → **Settings** → **FX rates**:
  add `EUR 1.17`, see `1 EUR = 1.17 <tour ccy>`; remove it (confirm dialog) →
  GET/POST/DELETE `/api/budget/fx-rates`. Adding the tour currency or a non-positive
  rate is rejected with a toast. Unversioned — editable on an approved budget.
- **INC-CUR-04 — P&L converts to tour currency.** A foreign-currency show **with** an
  FX rate → its gross/merch/pre-tax convert to the tour currency in the Summary P&L
  (`computeBudgetPnl` × `toTourCurrency`); a foreign show with **no** rate converts
  1:1. Totals stay in the single tour currency.
- **INC-CUR-05 — currency follows the version lock.** Approve a version → the **Ccy**
  cell goes read-only (projected view) and editing income 423s; the projected
  `currency` is snapshotted into `budget_version_income` and re-overlaid on the
  approved view. Unlock → editable again. Actuals + Phase-1 deductions unaffected.

## Income redesign — Phase 3: Deal-aware projection engine (feat/income-projection-p3-stageb)

> Migration **217** (per-show projection inputs on `budget_income` + the
> `budget_version_income` mirror; tour config on `budget_settings` — all additive
> nullable). Run `npm run db:migrate`. Engine `src/lib/budget/incomeProjection.ts`
> (pure, unit-tested: `node --experimental-strip-types src/lib/budget/incomeProjection.test.ts`,
> 20 checks). tsc 0, eslint 0, build green. Decisions LOCKED 2026-06-25.

- **INC-PROJ-01 — VS tiered overage (marginal).** Projected view: set a show
  `Deal=VS`, `Cap`, `Sell %`, `Face`, `Deal %` 55, `@ Tix` 275, `↑ %` 65,
  `Guarantee`. The **Overage** cell fills from the engine: marginal share =
  `perTicketNBOR × (55%×275 + 65%×(tickets−275))`, overage = `max(0, share −
  guarantee) × haircut`. Hand-calc matches (worked example in the engine test:
  Cap 500 × 80% = 400 tix, Face 30, tax 8% → overage pre-WH **2871.05**).
- **INC-PROJ-02 — non-tiered VS.** Clear `@ Tix` → flat `Deal %` on all tickets
  (`Deal % × tickets × perTicketNBOR`), overage recomputes.
- **INC-PROJ-03 — overage floored at 0.** A guarantee that beats the % → Overage
  fills **0** (never negative).
- **INC-PROJ-04 — PLUS / FLAT no auto-overage.** `Deal=PLUS` or `FLAT` → the
  engine writes **no** overage; the cell stays user-entered (PLUS is manual).
- **INC-PROJ-05 — merch + VIP project.** `$/Head` × `Fee %` × `Cap` × `Sell %` →
  **Merch** fills; `VIP Tix` × `VIP £` → **VIP** fills. Independent of deal type.
- **INC-PROJ-06 — tour-default fallback.** Leave a show's `Sell %` / `$/Head` /
  `Fee %` blank, set them in **Settings → Projection defaults** → the engine uses
  the tour default. A per-show value overrides it.
- **INC-PROJ-07 — overage config.** Settings → Projection defaults → `Overage
  haircut` (0.65) + `Box-office tax` (0.08) change the projected overage for every
  VS show on the next input edit.
- **INC-PROJ-08 — user override.** Type directly into Overage / Merch / VIP → the
  manual value is kept (a direct edit wins); it stays until a relevant input is
  re-edited (which re-runs the engine).
- **INC-PROJ-09 — P&L parity.** `computeBudgetPnl` total is unchanged from the
  materialised values — the engine writes a **pre-withholding** overage into
  `pre_tax_overage`; the P&L applies WH once (`postTaxOver`), no double-count.
- **INC-PROJ-10 — versioning lock.** Approve a version → every projection input
  cell (Cap/Sell/Face/Deal/Deal%/@Tix/↑%/$Head/Fee/VIP Tix/VIP£) goes read-only;
  a write 423s; the inputs snapshot into `budget_version_income` and re-overlay on
  the approved view. Unlock → editable. (Tour config in Settings stays editable —
  unversioned.)

## Income redesign — Phase 4: P&L / Summary refresh (feat/income-pnl-p4-summary)

> Presentation only — **no money math, no schema, no migration**. `computeBudgetPnl`
> gains a read-only `incomeBreakdown` (post-tax Guarantee/Overage/Merch/VIP +
> actual-only Deductions) that **reconciles to gross** (no new math); the Summary
> renders headline cards + a grouped income/expense report. tsc 0, eslint 0, build
> green. The P&L stays a read-only report (NOT a Grid — D-PNL).

- **INC-PNL-01 — headline cards.** Budget → **Summary**: three cards — Gross Income ·
  Total Expenses · **Net (P&L)** — each Projected, Actual, and a Δ coloured by
  direction (income/net green when up, expenses green when under). Tokens only.
- **INC-PNL-02 — income breakdown.** The P&L report's **Income** group shows
  **Guarantee / Overage / Merch / VIP** rows (post-tax), Projected · Actual · Δ,
  then a **Gross income** subtotal — mirroring the reference sheet's income block.
  For a tour with Phase-3 VS projections the Overage row is non-zero.
- **INC-PNL-03 — breakdown reconciles.** Guarantee + Overage + Merch + VIP
  (projected) **= Gross income** (projected); the same, minus **Deductions**, for
  actual. (Deductions row appears only when an actual deduction exists.)
- **INC-PNL-04 — expenses block.** Line-item expenses, the **commission** rows
  (% · basis), and the **overheads** (Insurance / Contingency / Accountancy / Merch
  COGS, each with its %·base) → **Total expenses** subtotal, Projected · Actual · Δ.
- **INC-PNL-05 — net parity.** **Net = Gross − Total expenses** for both columns and
  equals `computeBudgetPnl`'s `net` to the cent (unchanged from before Phase 4).
- **INC-PNL-06 — version-aware variance.** Viewing an **approved** version: the
  Projected column header reads **"Approved vN"**, a **Baseline vN** badge shows,
  and the copy says variance reads Actual vs the approved baseline. A draft reads
  "Projected" / "working projection". (Reuses the page's resolved version — no new
  data path.)
- **INC-PNL-07 — read-only.** No edit affordances on Summary; the % inputs stay in
  Settings, line totals on the Budget tab. The existing chart + section summary +
  variance + top-spend + recent-activity surfaces are unchanged.

## Income grid UX polish (feat/income-grid-ux-polish)

> Chrome only — no data-model / engine-math change. Additive, opt-in `<Grid>`
> hooks: `referenceCols` (recessed reference block) + a `GridHandle` imperative
> `updateRowCells` (forwardRef). Other Grid consumers (Expenses/Payroll/Rooming)
> are unchanged. tsc 0, eslint 0, build green.

- **INC-UX-01 — routing reads as a frozen reference.** The `#·Date·Type·Venue·City`
  strip renders **recessed** (panel background, italic, muted) with a firm divider
  before the first editable column (Currency). It reads as "drawn from elsewhere,
  look-don't-touch" — visibly distinct from the editable income cells. *(Sticky-
  freeze deferred — see note; this is the recessed-reference treatment.)*
- **INC-UX-02 — view is unmistakable.** The Projected/Actual toggle is loud (filled
  accent, shadow) and a one-line context cue + coloured dot states what you're
  looking at ("Projected — forecast from the deal inputs" / "Actual — settled
  figures"). A per-view accent rail tints the grid (orange = forecast, green =
  settled). Engine-computed output headers (Overage/Merch/VIP, projected view)
  carry a small **ƒ** + "computed (editable)" tooltip.
- **INC-UX-03 — no cursor jump on a projection edit.** Edit Deal/Cap/Sell-thru/etc.
  → the projected Overage/Merch/VIP cells update **in place** with no cursor jump
  and no full-grid flash (imperative `gridRef.updateRowCells`, replacing the old
  remount/re-seed).
- **INC-UX-04 — currency is never stuck on GBP.** The Currency picker offers a
  standard ISO list (GBP/USD/EUR/CAD/AUD/JPY/CHF/SEK/…) even when the tour has **no**
  FX rates. Picking a currency with no rate converts **1:1** + toasts a nudge to add
  one in Settings → FX rates. (Phase-2 FX map + conversion unchanged underneath.)
- **INC-UX-05 — human headers + tooltips.** `Currency`, `Tier @ (tix)`, `Tier rate %`,
  `Withhold %`, `Deal type` (was Ccy/@ Tix/↑ %/WH/Deal); each projection input has a
  plain-English header tooltip describing what it feeds.
- **INC-UX-06 — density.** Venue/City widths widened; deal/tier/withhold columns
  sized for the new labels; consistent number alignment. Token-clean.
- **Regression floor:** versioning lock still freezes proposed cells (read-only +
  423); P1 deductions, P2 currency conversion, P3 projection materialisation all
  intact; Expenses/Payroll/Rooming grids visually unchanged (opt-in props).
- **INC-UX-07 — Backspace respects read-only (GRID-36, grid-core).** Select a
  routing reference cell (Date/Type/Venue/City) and press **Backspace/Delete** →
  **nothing clears** (was: it wiped the cell — `doDelete` had no ro guard). Editable
  income cells still clear. Also holds for version-locked proposed cells + the
  derived Payroll/Rooming est/act lock — verify on income, payroll, rooming,
  expenses (`Grid.doDelete` now mirrors the startEdit/paste guard).
- **INC-UX-08 — Actuals total reads "Net".** The Actuals view's last column is
  labelled **Net** (= guarantee + overage + merch + vip − deductions, matching
  settlement's `reconciled_net`). The Projected view's column stays **Total** (no
  deductions). Label-only; no math change.

## Receipts overhaul — B1: desktop Add-Receipt + signed URLs (feat/receipts-overhaul-b1)

> **No migration** (uses existing `expense_receipts` cols; currency/raw_ocr_json
> land in B2). Reuses the existing upload/OCR/CRUD routes via a shared
> `useReceiptScan` seam. Receipts bucket is **private** (063) — files served via
> **signed** URLs. tsc 0, eslint 0, build green. Needs the `budget-receipts`
> bucket (063 applied) + `ANTHROPIC_API_KEY` for OCR.

- **RCPT-B1-01 — no more blank pill.** Budget Expenses → open a line → a
  transaction → **＋ attach receipt** now opens the **Add-Receipt panel** (not a
  blank numbered pill). Cancel → no orphan row (the draft is deleted).
- **RCPT-B1-02 — drop + scan + prefill.** Drop (or pick) a receipt **image** in the
  panel → it uploads, runs Claude Vision OCR, and **pre-fills** vendor / date /
  amount / category / description in an **editable confirm form**. A PDF uploads +
  stores but is **not** scanned ("PDF stored — enter details"). Manual edits stand.
- **RCPT-B1-03 — viewable thumbnail + lightbox (no 403).** The panel shows a
  thumbnail of the image (a **signed** URL — no 403); click → full-size lightbox.
  PDF → an "open" affordance (new tab). The txn chip shows the thumbnail after save.
- **RCPT-B1-04 — amount → transaction, never actual_cost.** On **Save** the amount
  is written as a **transaction** on the line (line-level: a new txn; from a txn
  chip: that txn's amount), `receipt_id` linked. The line's **actual reconciles**
  from the transactions sum — `actual_cost` is **never** written directly (P1 +
  versioning lock intact).
- **RCPT-B1-05 — line-level scan (Documents).** Line slide-over → **Documents** →
  **📷 Scan receipt** opens the panel with no transaction; on save it adds a
  receipt-backed transaction and the txn list refreshes.
- **RCPT-B1-06 — signed-URL fix.** `upload/route.ts` now returns a **signed** URL +
  the storage **path** (stored in `receipt_file_url`); `GET /api/budget/receipts/sign?receipt_id=`
  re-signs on read (workspace-scoped). The old `getPublicUrl` 403 is gone.
- **RCPT-B1-07 — no regressions.** Documents upload (attachments), transactions,
  the actuals reconcile, the versioning lock, and the income grids are unchanged;
  the demo slide-over (no `lineApi`) keeps its in-memory receipt behaviour
  (`onAddReceipt`/`signReceiptUrl` are opt-in).

## Versioning STATE/NAV fix — B1 (feat/versioning-state-fix-b1)

> Client state-resolution fix (no schema). One `viewed` version threaded to all
> four tabs incl. Settings; default landing = the approved Current; income lock
> corrected (actuals never lock; modal not toaster). tsc 0, eslint 0, build green.

- **VER-STATE-01 — single source / Settings agrees.** Approve V2; open the budget →
  lands on **Current V2 (locked)**. **Settings** now shows "Viewing v2 · approved"
  with **Unlock & re-approve / New version** (was: keyed off the head → showed Draft
  + Approve). Expenses/Income/Summary/Settings all show **locked** consistently.
- **VER-STATE-02 — default = approved Current.** With an approved Current + a draft
  head, opening with no `?version=` lands on the **Current** (signed-off baseline,
  proposed locked), not the editable draft. (`page.tsx` `defaultViewed = approvedVersion ?? activeVersion`.)
- **VER-STATE-03 — persistent indicator.** The selector always shows **"Viewing
  v{n} · {status} — Current v{approved}"** so the version + lock state are never
  ambiguous.
- **VER-STATE-04 — read-only history, all selectable.** Every version is selectable
  in the picker. Selecting a **superseded** V1 → proposed read-only; editing a
  proposed cell → the modal says **"You're viewing a historical version… Switch to
  the draft"** (button jumps to the draft head). Selecting the **draft** head →
  editable (the selector now `set`s `?version=` for the draft when a Current exists).
- **VER-STATE-05 — income actuals NEVER lock.** On a locked (approved/superseded)
  version, the Income **Actual** view is fully editable — guarantee/overage/merch/vip
  actuals, **and currency** (the live settlement ccy). The shared `currency` column
  no longer bleeds its lock into the Actual view (`versionLockedCols` is projected-only).
- **VER-STATE-06 — income modal, not toaster.** Editing a **locked proposed** income
  cell (Projected view) raises the **VersionLockModal** on the edit attempt — same as
  Expenses — not a bottom toast. (Grid `versionLockedCols` → `onLockedEdit`; the 423
  stays as the server backstop, also → modal.)
- **VER-STATE-07 — Expenses unchanged.** The Grid version-lock default is `['est']`,
  so Expenses + Payroll/Rooming/demo behave exactly as before (the generalisation is
  opt-in).

## Income projection FIX — outputs compute reliably (fix/income-projection-outputs)

> No engine-math change (`incomeProjection.ts` verified, +O2 Apollo case → 23/23).
> Grid contract + output-cell lock + persistent-0 fix. No schema. tsc 0, eslint 0,
> build green.

- **INC-PFX-01 — O2 Apollo computes (the repro).** Projected view, one show: Cap
  3500, Sell-thru 90, Face £40, Deal **VS**, Deal % 80, Withhold 10, Guarantee
  £1000 (defaults haircut 0.65 / tax 0.08). The **Overage** cell shows **≈£59,628**
  (pre-WH; engine `max(0, 0.8×3150×36.8 − 1000)×0.65`) — **not 0, not ~100**.
- **INC-PFX-02 — outputs are computed-locked (read-only).** Overage / Merch / VIP
  in the Projected view are **read-only** (ƒ header). You can't type into them; a
  stray value can never suppress the formula. (Deliberate hand-override is #28.)
- **INC-PFX-03 — no persistent 0; blank "—".** A not-yet-computable output shows
  **"—"**, not £0: Overage is blank until `Deal=VS` + Cap/Sell/Face/Deal% are set;
  Merch until Cap/Sell + $/head + Fee% (per-show or tour default); VIP until both
  VIP tix + price. A genuine computed 0 (guarantee beats the %) still shows £0.
- **INC-PFX-04 — recompute on any input, no override-freeze.** Editing ANY input
  (Cap/Sell/Face/Deal/Deal%/@Tix/↑%/Withhold/Guarantee/$Head/Fee/VIP tix/price)
  refreshes the materialised cell. The route recomputes **by default** (dropped the
  `body.pre_tax_overage === undefined` gate) — a stored 0 no longer reads as a
  manual override. Switching VS→PLUS/FLAT **clears** the overage (no stale leak
  into the P&L).
- **INC-PFX-05 — $/head + fee% live in one place.** The grid `$/Head` and `Fee %`
  columns are **per-show overrides**; blank **inherits the tour default** (Settings
  → Projection defaults) — the header tooltip says so. Not two independent copies
  of the same number.
- **INC-PFX-06 — haircut/tax clarity.** Settings → Projection defaults: hovering
  **Overage haircut** / **Box-office tax** shows the explainer tooltip (default 65%
  discount / 8% off the top).
- **INC-PFX-07 — P&L parity.** `computeBudgetPnl` still reads the materialised
  `pre_tax_overage`/`merch_income`/`vip_income`; the income breakdown + Net are
  unchanged from the computed values. P1/P2 + the versioning lock unaffected.

## Income ACTUALS enrichment (#24 — feat/income-actuals)

> Migration 221 — `actual_tickets_sold` / `actual_gross` / `actual_capacity` on
> `budget_income`; `day_of_`/`reconciled_` tickets + gross on `settlement` (cascade
> mirrors `actual_deductions`). Model (b): settlement-authoritative — the new
> fields are INFORMATIONAL, they NEVER enter `income_gross` / `computeBudgetPnl`.
> Actual-only → not versioned, never lock. Engine (`incomeProjection.ts`) untouched.
> tsc 0, eslint 0, build green.

- **INC-ACT-01 — real attendance + Sell%.** Budget → Income → **Actual**. New
  editable columns **Cap · Tickets · Gross**. Enter Cap 3000 + Tickets 2580 on an
  un-settled show → **Sell%** shows **86%** (= tickets ÷ settled cap, NOT the
  projected cap). Blank Cap → Sell% shows "—".
- **INC-ACT-02 — ƒ Overage reference (read-only).** Beside the settled **Overage**,
  the **ƒ Overage** column shows the overage the engine implies from the REAL
  tickets/gross + the row's PROJECTED deal terms (VS only; "—" for PLUS/FLAT or
  missing inputs). It's read-only (ƒ header), never writes, and does NOT change the
  settled Overage or the P&L. Editing Tickets/Gross updates it in place.
- **INC-ACT-03 — variance strip.** With ≥1 real actual entered, a read-only
  **Variance** strip shows projected→actual for Sell-through, Gross, Overage, Merch,
  VIP (green when actual ≥ projected, red otherwise). Presentation only.
- **INC-ACT-04 — settlement cascade.** Saving a settlement with reconciled (or
  day-of) tickets/gross **overwrites** `actual_tickets_sold` / `actual_gross` on the
  income row (prefers reconciled), exactly like `actual_deductions`. `actual_capacity`
  is grid-entry only — a settlement run leaves it untouched.
- **INC-ACT-05 — P&L + invariants unchanged.** The Summary P&L **Net** is identical
  before/after entering tickets/gross/cap (they never feed `income_gross`). The new
  Actual columns are editable and **never lock** (Actual view passes `[]` to
  `versionLockedCols`); they're absent from `budget_version_income`. Per-show
  currency (216) applies to **Gross**; the projected view + #28 override are unchanged.

## Income output override (#28 — feat/income-output-override)

> Migration 220 (3 boolean flags on `budget_income` + `budget_version_income`;
> also patches `amend_budget_version` to carry the full income column set — fixes
> a latent 217 gap). Per-output manual override of a computed projected output.
> Storage = Option A (flag gates the route recompute; value stays in the existing
> column → computeBudgetPnl unchanged). WH unchanged (override is pre-WH). The
> grid seam is opt-in (`cellOverride`) so Payroll / Rooming / Channel-List /
> Expenses are untouched. tsc 0, eslint 0, build green.

- **INC-OVR-01 — override a computed output.** Projected view, a VS show whose
  **Overage** computes (e.g. ≈£59,628). Right-click the Overage cell → **Override
  formula** → warning modal → **Override**. The cell becomes editable (input
  tooltipped *Pre-withholding value*); type a number → Enter. It shows a distinct
  **✎** marker + faint violet wash (NOT the orange ƒ). The same works on **Merch**
  / **VIP**, and on a **PLUS/FLAT** show whose output was blank "—".
- **INC-OVR-02 — override survives an input edit.** With Overage overridden, edit
  an unrelated input on that row (Cap / Face / Deal %). The overridden Overage
  value does **not** change; the *other*, non-overridden outputs (Merch/VIP) still
  recompute. (Route gate: `recomputeOverage = has(OVERAGE_INPUTS) && !overage_is_override`.)
- **INC-OVR-03 — revert to formula.** Right-click an overridden cell → **Revert to
  formula** → the ✎ marker clears, the cell goes read-only ƒ again, and it
  recomputes from the current inputs (or "—" if they're incomplete).
- **INC-OVR-04 — overrides lock + snapshot with the version.** An overridden
  output persists into the draft snapshot, is **read-only** when viewing an
  approved/Current version (the non-draft lock — right-click → override fires the
  Unlock modal, not an edit), and the P&L (`computeBudgetPnl`) uses the override
  value. Amending an approved version carries the override (and the projection
  inputs) into the new draft.

## Income grid polish R2 (feat/income-grid-r2)

> No schema. Three grid-core polish items, all additive/opt-in so Payroll /
> Rooming / Channel-List / Expenses are unchanged. tsc 0, eslint 0, build green.

- **ING-R2-01 — dropdown type-to-select.** Income Projected view: **select** (don't
  open) a **Deal type** cell, press **V** → it jumps to **VS**; **P** → **PLUS**;
  **F** → **FLAT**. Same on the **Ccy** column (**D** → a $-currency). Click-open,
  Tab-auto-open, and Esc still work; a version-locked proposed dropdown fires the
  lock modal instead of changing. `daytype` (bespoke) and read-only output dropdowns
  don't respond. Verify Payroll **rate-type** / **status** dropdowns behave the same.
- **ING-R2-02 — number-entry boxes.** Editing a money/number cell (e.g. Cap, Face,
  Guarantee): the input is **right-aligned**, has no native spinner arrows, gets the
  decimal soft-keyboard on touch (`inputMode`), and is **select-all-on-focus** so the
  first keystroke replaces. Money formatting (currency symbol, "—" blank for null)
  and commit/parse are unchanged from INC-PFX-03. Text cells (Venue/City) still
  left-aligned.
- **ING-R2-03 — per-tour column hide/show, persisted.** Income toolbar → **Columns**:
  the checklist omits the structural columns (**#** + the reference block
  date/type/venue/city — always shown). Uncheck a column (e.g. **Withhold**) → it
  leaves the render **and** Tab order but its data/compute are untouched (Overage
  still computes). Reload → the hidden set persists (localStorage `income-cols:<tourId>`),
  and a **different tour** is unaffected (per-tour key). Default = all shown. Payroll /
  Rooming Columns popovers are unchanged (no `columnPrefsKey` → no persistence).

## Receipts B1.5 — drag a receipt onto a budget row (feat/receipts-b15-drag)

> No schema. Reuses the B1 AddReceiptPanel + useReceiptScan seam (no second OCR
> path). Opt-in `onFileDropToRow` on `<Grid>` (default off → Payroll/Rooming/
> Income/Channel-List unchanged). tsc 0, eslint 0, build green.

- **RCP-DRAG-01 — drag an image onto a line → scrape → backs that line.** Budget →
  **Expenses**: drag a receipt image from the desktop over a line-item row → the row
  **highlights** (orange ring). Drop → the **AddReceiptPanel** opens pre-targeted to
  that line with the file **already scanning** (image → Claude Vision OCR prefill;
  PDF → stored, no scan). Confirm → the amount lands as a **transaction on that
  line** (reconciled into the actual — never a direct `actual_cost` write, same
  invariant as B1) + the receipt links with a thumbnail.
- **RCP-DRAG-02 — guard + no regressions.** Non-image/PDF or >10MB → toast, panel
  doesn't open. A text / row-reorder drag is unaffected (file-drop only fires for
  `dataTransfer.types` containing `Files`; row reorder is pointer-based). Other
  product grids don't accept drops (the prop is opt-in, Expenses-only).

## Receipts B2 — bulk scrape inbox + searchable (feat/receipts-b2)

> Migration **222** (`expense_receipts.raw_ocr_json` jsonb + `extracted_text` text +
> trigram index; idempotent, down-block). Per-receipt OCR is ON in the bulk inbox,
> routed entirely through the `useReceiptScan` seam (same metering / signed URLs /
> transaction-backing invariant as B1; no second OCR path). tsc 0, eslint 0, build
> green. Run `npm run db:migrate`.

- **RCP-BULK-01 — drop N files → each scrapes + confirms.** Budget → **Receipts** →
  drop several images. Each row: create → signed upload → **OCR** → a **Needs review**
  status with an editable vendor / amount / date prefilled from the scrape. PDFs show
  "PDF stored — scan is image-only". Click **Link & confirm** → pick a budget line →
  the row goes **✓ Linked** and that line gets a **reconciled transaction** for the
  amount (never a direct `actual_cost` write — `in_budget:false`, same as B1). A 20-file
  drop is triageable via the per-receipt status (scanning / needs review / linked).
- **RCP-SEARCH-01 — ⌘K finds a receipt by vendor / extracted text.** After a scrape,
  ⌘K a vendor name (or a word the OCR pulled from the receipt body) → the receipt
  surfaces under **Receipts**. Selecting it lands on that tour's budget and opens the
  inbox with the receipt at the top + a **View file** (signed URL) action. Search runs
  through the **scoped** `/api/budget/receipts?q=` route (workspace_id + RLS; never a
  broad query), fuzzy-ranked via `fuzzy.ts`. No raw OCR text in logs or errors (PII).
- **RCP-BULK-02 — no B1 regression.** The single Add-Receipt panel + the B1.5
  drag-onto-row flow are unchanged (both still go through `useReceiptScan`); signed
  URLs only; PDFs store-but-don't-scan everywhere.

## Versioning STATE/NAV fix — B2: rollback (feat/versioning-rollback-b2)

> Migration **219** (widen `budget_versions_status_check` to add **`rolled_back`** +
> `budget_version_rollback(p_version_id)` RPC). Run `npm run db:migrate`. Status-only
> changes (no snapshot writes) — the immutability trigger is untouched; the approver
> gate + the one-approved index already cover it. tsc 0, eslint 0, build green.

- **VER-RB-01 — roll back v3 → v1.** With v1 (superseded), v2 (approved Current), v3
  (draft head): view v1 → Settings/lock-modal **"Make this version Current"** → the
  confirm modal lists **"v2 (superseded), v3 (draft — unsaved working copy)"** + the
  draft-loss warning → confirm → **v1 is Current/locked**, **v2 + v3 badged "rolled
  back"**, all four tabs agree (lands on v1, proposed locked).
- **VER-RB-02 — draft loss is warned, not silent.** When an affected version is a
  **draft**, the confirm modal shows the red **"unsaved draft will be discarded"**
  gate; it never auto-dismisses.
- **VER-RB-03 — rolled_back is read-only + viewable.** A `rolled_back` version is
  selectable in the picker (badged "rolled back"), opens **read-only** (all proposed
  cells locked — reuses the B1 non-draft lock path), and its lock modal offers
  **"Switch to the draft"** + **"Make this version Current"**.
- **VER-RB-04 — roll forward.** After VER-RB-01 (v1 Current, v2/v3 rolled_back),
  re-select **v3** → Make Current → v3 becomes Current, **v1 + v2 rolled_back**. The
  `status='approved'` demote clause catches the former Current even though it's a
  LOWER number than the target.
- **VER-RB-05 — non-approver blocked.** A non-approver sees **no** rollback action
  (Settings shows the read-only note; the lock modal omits the button); a direct POST
  to `…/rollback` returns **403** (`is_budget_approver()` gate, mapped via `_rpc-status`).
- **VER-RB-06 — one-approved index never trips.** The RPC **demotes first** (former
  Current + everything newer → rolled_back) **then promotes** the target, so
  `budget_versions_one_approved_per_tour` never sees two approved rows mid-txn.
- **VER-RB-07 — guards intact.** Target must be **non-draft** ("cannot roll back to
  the working draft") and **not already Current** ("already Current"). Frozen
  snapshots are untouched (status-only writes).

## Budget Versioning Phase 1 — B2 (UI, feat/budget-versioning-b2)

> Wires the live B1 contract. tsc 0, eslint 0, build green. Chrome-verify on the
> preview.

- **BUD-VER-07 — version selector + Current pill.** The budget sub-bar shows
  `vN · status ▾` (beside the tour identity). Dropdown lists every version
  (number + status); the approved one carries the orange **Current** pill (in the
  dropdown AND as a persistent chip). Selecting a non-active version views it via
  `?version=` (read-only).
- **BUD-VER-08 — read-only-when-locked proposed.** On an approved version the
  Expenses **est** cells render locked (🔒, mirror the derived-lock); **act**
  stays editable. Income **projected** columns are read-only; the **actuals** view
  stays editable. (Grid `versionLocked` prop, default off → drafts unchanged.)
- **BUD-VER-09 — Unlock-or-New-Version modal.** Editing a locked est cell (click
  or keypress) raises the modal *"This budget is approved & locked — Unlock &
  re-approve / Create a new version"* — **not a toast**. A `423 VERSION_LOCKED`
  API response raises the same modal. A non-approver sees the explanation only
  (no unlock/amend).
- **BUD-VER-10 — Settings approval controls.** Settings tab → "Versions &
  approval" card: **Approve & lock** (draft + approver, optional note) / **Unlock
  & re-approve** / **New version from approved** (amend). Hidden for
  non-approvers (server also enforces).
- **BUD-VER-11 — amend switches version.** Amend → new draft v(n+1) clones v1 +
  v1→superseded; the selector updates and the page switches to the new draft
  (`?version=`).
- **BUD-VER-12 — income proposed from version_income.** Income projected values
  come from the active version's `budget_version_income` (B1 overlay); actuals
  stay on `budget_income.actual_*`; P&L variance reads approved-version income.

> **AI "Add it"** is still a TODO — when built it must surface `423` as the
> BUD-VER-09 modal (noted, not built).

## Budget Versioning Phase 1 — B1 (data + state, feat/budget-versioning-b1)

> Migration **212**. Run `npm run db:migrate` (backfills a DRAFT **v1** per
> existing tour from current proposed). Code: tsc 0, eslint 0, build green,
> reconcile-lock unit test 10/10. **DB-dependent items are Adam's to verify after
> migrating** (the integrity layer can only be exercised against a live DB).

- **BUD-VER-01 — approve atomic + one-Current.** Approve a draft → it becomes
  `approved` (Current); any prior approved flips to `superseded` in one txn. A
  concurrent second approve fails on the `one approved per tour` partial unique
  index (409).
- **BUD-VER-02 — route lock guard (423).** On a tour whose active version is
  approved: a **proposed** write to `/api/budget/line-items` (PATCH or POST add)
  or `/api/budget/income` (pre_tax_*) → **423 `VERSION_LOCKED`**; an **actual**
  write (actual_cost / actual_* / receipts) → **200**; a **mixed** write → 423
  (wholesale, no partial apply). Same guard = the AI "Add it" intercept.
- **BUD-VER-03 — DB-level immutability.** A direct `UPDATE/INSERT/DELETE` on
  `budget_version_lines/_sections/_income` whose parent version isn't `draft` is
  **denied by the trigger** (not just the route) — a locked version is
  uncorruptable even by a buggy server path.
- **BUD-VER-04 — reconcile post-lock → actual only.** Lock a version → change a
  `personnel_rates` rate → the locked **proposed snapshot is UNCHANGED** and
  `budget_line_items.actual_cost` moved. (Logic locked by the unit test;
  end-to-end is Adam's DB verify.)
- **BUD-VER-05 — amend.** Amend → v2 clones v1's lines+income into a new draft
  (`parent_version_id` set); v1 → `superseded`; v2 becomes Current on approval.
- **BUD-VER-06 — approver gate.** approve/unlock/amend require
  `is_budget_approver()` (admin OR a `budget_approver_grants` row) — server + the
  status-change trigger; a non-approver → 403.

## P0 — budget SSR crash hardening (fix/budget-ssr-hardening)

#### BUD-58 — a bad/edge-date tour renders instead of 500-ing
**Do**: Open the budget for the **Good Neighbours / South Africa Aug'26** tour
(the one that crashed the whole page with "Refresh, something went wrong").
**Expect**: the budget grid renders (it may degrade — no phase strip / empty
burn panel if that tour's data is the edge case), and the **real cause is logged
to the Vercel function logs** (`[lp] …`), not shown as a crash.
**Why it crashed**: the page awaited a top-level `Promise.all` of the server data
fns **unwrapped**, and `computeTourPhases.shiftDate` did `new Date(bad).toISOString()`
which **throws `RangeError: Invalid time value`** on a malformed date → the whole
SSR 500'd. **Fix**: guard the date helpers (`shiftDate`, `isoWeekKey`) so an
invalid date logs + falls back instead of throwing; self-guard `computeTourPhases`
/ `getBudgetPanelData` / `loadTourIncome` (degrade to empty + log); `.catch` the
two enrich awaits; `generateMetadata` `.single()`→`.maybeSingle()`. New
`logServerError` helper (console.error → Vercel; no swallowing — Sentry-ready).
**Still wanted**: the actual Good Neighbours trace/URL to confirm the exact
thrower (the hardening is safe either way).
**Last verified**: tsc 0, eslint 0, build green; Adam live.

## Fixed this pass (retest on next deploy)

- **Budget is the landing tab** (BUD-13) — `resolveBudgetTab` defaults to `budget`.
- **No duplicate warning on $0 lines** (BUD-14/15) — `detectDuplicates` skips zero-cost pairs.
- **Phase strip hides when tracking off** (BUD-18) — gated on `track_phases` in `page.tsx`.

## Open — correctness (the real failures)

- **Section CRUD has no optimistic updates + a `.single()` bug.** Create
  /rename/delete sections (and lines) are slow, revert until refresh,
  and throw "Cannot coerce the result to a single JSON object" (a
  `.single()` on a row RLS/returns 0). Same disease the line grid had —
  apply optimistic updates to section ops; swap `.single()` →
  `.maybeSingle()` / return the written row. (BUD-15, BUD-18, BUD-20.)
- **Section model is half-migrated** (`category` vs `section_id`).
  Renaming a line's category doesn't move it between sections; you can
  add lines to categories that aren't real sections; the summary shows
  sections that aren't in the grid. `section_id` must be the single
  grouping source: move a line = pick an existing section (dropdown), no
  free-text orphan categories. (BUD-16, BUD-20.)
- **Delete line is broken** (paused, didn't delete). (BUD-15.)
- **No multi-select** — need shift-click + select-all so bulk ops are
  usable. (BUD-15.)

## Open — UX / polish

- Empty-state picker should be a **modal over the screen**, not an inline
  menu; make it prettier (UX/UI + 21st). (BUD-13.)
- Visible **drag handles** for resizable columns + rows. (BUD-17.)
- **Click-to-rename templates**; the template-contents dropdown should
  match the Advance section style for consistency. (BUD-19.)
- Unclear **add-line / delete-section** buttons. (BUD-15.)
- Slide-over still doesn't match the grid design language. (BUD-04, prior.)
- IA: "too many ways to find things" — consolidate toward a single
  spreadsheet surface.

## Open — Stage 3 (income + spreadsheet maths) — newly requested

- **Income as its own tab**: guarantees, predicted merch sales, VIP.
- **Formula rows**: cost-of-goods % deduction; management commission +
  agent commission (one net, one gross); contingency %. Net P&L bottom
  line. DB already has `budget_income` / `budget_commissions` /
  `budget_settings` (insurance/contingency/accountancy %).
- Goal: spreadsheet-level calculation, not hand-typed totals.

## Templates

- BUD-13 presets are "okay, not quite right." Adam will build the correct
  ones; then persist them site-wide as system/workspace templates
  (template-authoring + save flow needed).

## Grid + nav overhaul (current)

Reference: "Warning Support" (populated) + a fresh empty tour for the picker.

#### BUD-21 — Burn bar
Open `/budget/[tour]`. One burn bar at the top: big **Remaining** + "of $X
budget"; a spent/budget **meter** ("$X spent · NN% used") with a thin
**Committed marker** on the same scale; the fill turns **red** past 100%;
a **Variance** read (arrow + colour, red over / green under) on the right.
No KPI cards.

#### BUD-22 — Quiet section headers
Every section group header reads **NAME · count** only — no
`est… · act… · var…` triplet; the filter bar shows just the row count. The
est/act/var summary lives only in the burn bar.

#### BUD-23 — Raised panel
The grid reads as a **raised panel** lifted off the page (lighter surface
bg than the page + border + visible shadow), not flat. Header + section
rows sit a step higher (`--lp-panel`). Channel-list + payroll grids are
raised the same way.

#### BUD-24 — Fills the width (name column flexes)
The grid fills the container; the **Item/description column stretches** to
absorb the leftover width — no dead band on the right. Numbers stay fixed
+ right-aligned. On ultra-wide the panel caps ~1600px and centres.
Horizontal scroll appears only when columns exceed the container.

#### BUD-25 — Density (app-wide, 3 levels)
Toggle = Compact / Comfortable / Spacious, **default Comfortable**.
Changing it resizes rows + text on the budget grid, the **Income tab**,
AND other grids (channel-list, payroll, a list like Personnel). Persists
on reload. (Shared with UI-05.)

#### BUD-26 — Column resize
Hover a column's right edge → handle appears (grab cursor); drag resizes
that column live; can't drag to zero; dragging the flex (name) column
starts from its **rendered** width (no jump). Widths **persist** on
reload; "Reset widths" restores defaults. Works on channel-list + payroll
too. (Shared with UI-07.)

#### BUD-27 — Two-band budget top
Budget top is **two bands** then content: product bar (Home · Operations ·
Budget · Advance, active = solid orange) → **one context band** (tour
identity + Summary · Expenses · Income tabs + Display/Export/Settings) →
burn bar → grid. Not four stacked layers. The tabs read as tabs and
switch correctly.

#### NAV-01 — Two-bar app nav
No left sidebar anywhere. The top product bar shows on every product;
hover a product → dropdown of its sub-pages → click lands directly (one
load). Each product, the workspace tabs (Artists/Personnel/Equipment), and
Settings/Venues/Bugs all load.

> These supersede the earlier BUD-15/16/20 failures (section CRUD,
> category-vs-section, summary refresh) — all resolved in Fix-pack A.

## Quick-fixes (feat/budget-quick-fixes — retest)

#### BUD-28 — Commissions add/remove in Settings

**Do**: Budget → Settings. Add a commission line, edit its % and basis,
delete one (confirm dialog).

**Expect**: Add/remove are optimistic (no full reload); the Summary P&L
recomputes to match (commission feeds `computeBudgetPnl`).

**Last verified**: 2026-06-07 (Adam, preview) — ✅ PASS after the `main`
merge brought `BudgetSettingsTab` in. Follow-up (redesign): move commissions
out of Settings into a budget tab so it's not buried.

#### BUD-29 — Density toggle present + app-wide

**Do**: On the budget grid, use the density control in the context band:
Compact / Comfortable / Spacious.

**Expect**: Rows + text resize; the choice persists on reload; the same
control resizes the other grids (channel-list, payroll).

**Last verified**: 2026-06-07 (Adam, preview) — ✅ PASS once the merge
conflict in `BudgetContextBand` was resolved. Follow-up (redesign): the grid
now has two toolbars split by the summary bar — too cluttered; consolidate.

#### BUD-30 — Receipts as a compact top button

**Do**: On the budget grid toolbar, click **"Receipts"**; drop a file on it
or open the popover.

**Expect**: A compact button + popover near the top of the grid (the old
bottom drop-zone is gone); upload/link works.

**Last verified**: 2026-06-07 (Adam, preview) — works, but the `main` merge
left TWO Receipts buttons (inline mount + page `receiptSlot`). Fixed by
removing the inline mount in `BudgetSpreadsheetView` (kept the page-driven
slot). Re-verify there's now exactly one on the next build.

## Phase 3 — canonical `<Grid>` on Expenses (in progress)

Mounting the canonical `<Grid>` + `<GridSlideOver>` (see `grid.md`) on
`/budget/[tourId]` Expenses, replacing `BudgetSpreadsheetView`. **Stage A** map:
`docs/handover/PHASE3_BUDGET_MAP.md`. **Stage B floor (landed, this PR):**

#### BUD-31 — `source_entity_type` CHECK drift fixed (migration 208)
**Do**: `npm run db:migrate` (applies `208_widen_source_entity_type_check.sql`).
**Expect**: the live `budget_line_items.source_entity_type` CHECK now matches
what reconcile writes (`hotel_booking·flight_booking·flight·payroll·
payroll_per_diem·gear`). Migration 026 only allowed two; the live DB had
drifted — a fresh clone would have silently dropped the Salary/Per-Diem/gear
derived sections. **Read-safe**; records the drift.
**Last verified**:

#### BUD-32 — budget↔grid adapter (pure, unit-tested)
`src/lib/grid/budgetAdapter.ts` maps `budget_line_items`/`budget_sections` →
grid `Section[]`/`Row` and grid edits → DB patches (both directions tested:
`node --experimental-strip-types src/lib/grid/budgetAdapter.test.ts` → 7 checks).
Formula sections excluded; derived sections classified + sourced; `est`→
`proposed_cost`, `act`→`actual_cost`(+override), no `vendor` column.

#### BUD-33 — Grid (beta) renders on real budget data
**Do**: Budget → Expenses tab → click **Grid (beta)** (default is Classic).
**Expect**: The canonical `<Grid>` renders the live sections + lines (same
data as Classic); the production view is untouched on the **Classic** toggle.
**Last verified**:

#### BUD-34 — Cell edits persist (survive reload)
**Do**: In Grid (beta), edit an Item / Estimate / Actual / Status on a normal
line; reload.
**Expect**: The edit persisted (PATCH `/api/budget/line-items`, optimistic, no
flash). A rejected write toasts + refreshes.
**Last verified**:

#### BUD-35 — Derived sections locked (est + act)
**Do**: Look at the Salary / Accommodation sections.
**Expect**: They show the 🔗 source pill; **both** Estimate and Actual are
read-only with a 🔒 (the reconcile owns them — GRID_SPEC §6).
**Last verified**:

#### BUD-36 — Currency uses the tour FX
**Do**: A foreign-currency line (e.g. EUR on a GBP tour).
**Expect**: The cell shows the SOURCE figure in its currency + a red ≈
conversion in the tour currency (via `src/lib/budget/fx.ts`, not the demo
table); the tour's own symbol (£/$/€) is used throughout.
**Last verified**:

#### BUD-37 — Slide opens (LINE variant, DB statuses)
**Do**: Click the orange **Open** chip on a line.
**Expect**: The slide opens as the LINE variant (no person/hotel/settlement);
the Status menu lists the DB set (`draft·quoted·approved·paid·disputed`); slide
edits to item/est/act/status/notes persist.
**Last verified**:

#### BUD-38 — Line + section CRUD persists
**Do**: In Grid (beta): **＋ Add line** in a section; **🗑 Delete line** (deletes
the active line) from the toolbar; **＋ Add section**; double-click a section
name to rename.
**Expect**: Add line / section + delete line POST/DELETE then re-fetch; rename
PATCHes (no flash). All survive reload. (Derived sections can't be added to /
their lines are reconcile-owned.)
**Last verified**:

#### BUD-39 — Grid (beta) shows all rows (status filter = surface status set)
**Do**: Budget → Expenses → **Grid (beta)** on a populated tour (e.g. "Simple
Plan Support | Fall'26").
**Expect**: Every section renders its lines (Classic and Grid (beta) show the
same row count — e.g. 10 rows: 4 Accommodation + 5 Salary + 1 Uncategorised),
each with its DB status pill (`draft` etc.). The "SHOW STATUSES" filter lists
the surface's status set (`draft·quoted·approved·paid·disputed` for budget),
all checked by default.
**Root cause (fixed)**: the grid's status filter + its default-all-checked init
were hardcoded to the canonical 4 (`budgeted·paid·reconciled·refunded`). Every
budget line's status is `draft` (DB default), so all rows were filtered out →
0 rows. Now driven by `statusUniverse(columns, sections)` — the union of the
status column's `options` and every status actually present in the data — so
the filter defaults to all of the surface's statuses and never silently hides a
row whose status isn't in the canonical set. `/grid-demo` (no status config)
still defaults to the canonical 4. (Grid.tsx: `statusUniverse`, `filterRef`
init, `FilterPop` `statusList`, status-group view.)
**Last verified**: code/build green; Adam to re-confirm live via Chrome DOM.

#### BUD-40 — Totals/KPIs use the display currency + tour FX (not USD)
**Do**: Budget → Expenses → **Grid (beta)** on a GBP-display tour. Read the
toolbar total, every section header `est/act`, and the burn bar together. Then
flip the **Display** selector £→$ and re-read.
**Expect**: With Display = £, the toolbar total, section-header `est/act`, and
group totals all read **£…** and the SALARY total matches the burn bar
(`£11,550`), not `$14,669`. Switching Display to $ converts **cells AND totals
together** consistently.
**Root cause (fixed)**: decision 5 (grid takes FX + display currency as props)
was applied to the cell-render path but missed the total/section-header/KPI
maths, which still used `gridModel.disp`/`fmt` (the demo USD-pivot table, GBP→USD
1.27). Grid.tsx now derives `dispC`/`fmtC` from the injected `fx` and routes the
section totals, grand totals, and calc/formula cell formatting through them; the
unused `disp`/`fmt` imports are dropped. `/grid-demo` (no `fx` prop → `demoFx`)
is unchanged.
**Last verified**: code/build green; Adam to re-confirm live (totals in £
matching the burn bar; a Display switch converting cells + totals together).

#### BUD-41 — Grid binds to the DISPLAY selector
**Do**: Budget → Expenses → **Grid (beta)** on a GBP tour. Flip the **Display**
selector £→$.
**Expect**: grid **cells AND totals** convert to US$ together with the burn bar
(previously the grid ignored the selector and stayed £). A line whose currency
≠ display renders the red ≈ converted note (GRID_SPEC §4). Currency-less lines
fall back to the **native** tour currency, not the display one.
**Last verified**: code/build green; Adam to re-confirm live (DISPLAY flip moves
cells + totals + burn bar in lockstep).

#### BUD-42 — Row + section reorder persists
**Do**: In Grid (beta), drag a line within its section; drag a section. Reload.
**Expect**: the new order survives reload (optimistic; PATCHes `sort_order` on
`budget_line_items` / `budget_sections` — both routes already accept it). A
failed write toasts + refreshes to the true order. Derived rows are reorderable
and persist (reconcile's update path doesn't reset `sort_order`); a brand-new
derived row starts at top until reordered.
**Last verified**: code/build green; Adam to re-confirm live.

#### BUD-43 — Slide Transactions CRUD (real table)
**Do**: In Grid (beta), open a non-derived line's slide → Transactions. Add a
transaction; edit its name/date/amount; attach a receipt; delete it. Reload.
**Expect**: writes hit `budget_line_item_transactions` via the real routes
(POST/PATCH/DELETE) and survive reload. The line's **Actual** auto-syncs to the
Σ transactions server-side **unless** `actual_cost_override` (no double-write —
decision 6); the synced Actual shows on next reload. "Attach receipt" creates +
links an `expense_receipts` row (sets `receipt_id`) and the chip shows the
receipt label. (Demo `/grid-demo` keeps its in-memory transactions.)
**Last verified**: code/build green; Adam live.

#### BUD-44 — Slide Documents CRUD (attachments)
**Do**: In the slide → Documents. **Add** (OS file picker → upload), **rename**
(inline), **delete**. Reload.
**Expect**: writes hit `budget_line_item_attachments` via the route (POST
upload, new **GET** list-on-open, new **PATCH** rename, DELETE). The type chip
shows the file extension (no category column on the table). Survives reload.
**Last verified**: code/build green; Adam live.

#### BUD-45 — 📎 Receipts cell shows a real count
**Do**: Look at the Receipts column; click the 📎 on a line with transactions /
documents.
**Expect**: the badge counts documents + transactions from server-supplied
`attachment_count` + `transaction_count` (no per-row fetch on render); clicking
lazy-loads the lists and the toaster lists them (docs as `Type: name`, txns as
`Txn: vendor 📎`) with **Open line ↗**.
**Last verified**: code/build green; Adam live.

#### BUD-46 — Grid is the default Expenses view
**Do**: Open Budget → Expenses (fresh load).
**Expect**: the **Grid** view renders by default (was Classic). The toggle still
offers **Classic** (one click) and **Grid**. (`BudgetGridToggle` default = `grid`.)
**Last verified**: code/build green; Adam live.

#### BUD-47 — slide Actual live-updates on a transaction edit
**Do**: Open a non-derived line's slide. Add a transaction / edit its amount /
delete it — watch the **Actual** field and the grid's Actual cell **without
reloading**.
**Expect**: Actual tracks Σ transactions immediately (no page reload), matching
the server's auto-sync — **unless** the line has a manual override (typed Actual)
or is derived/locked. Removing the last transaction leaves Actual as-is (the
server preserves it). Done on commit, not per-keystroke.
**Last verified**: code/build green; Adam live.

#### BUD-48 — loaded receipts show their number
**Do**: Attach a receipt to a transaction, reload, reopen the slide.
**Expect**: the receipt chip shows the real **receipt number** (e.g. `R-001`),
not a generic "Receipt". The transactions GET joins `expense_receipts`
(`receipt_number`).
**Last verified**: code/build green; Adam live.

#### BUD-55 — receipt numbers are UNIQUE per tour (+ vendor on chip)
**Do**: Attach **two** receipts (to two transactions); reload; reopen the slides.
**Expect**: each chip shows its **own** number (`R-001`, `R-002`) — no shared
"R-001". When a receipt has a vendor, the chip reads `R-00n · Vendor`.
**Why it was broken**: the receipts POST swallowed its max-query error and was
non-atomic → every receipt stored `R-001`; no UNIQUE guard let it persist
(BUD-01). **Fix**: migration `209` renumbers existing dups per tour + adds
`UNIQUE (tour_id, receipt_number)`; the POST no longer swallows the read error,
computes max defensively, and **retries on `23505`**; the txn GET also embeds
`vendor`. Format unchanged (`R-00n`).
**Migration**: run `npm run db:migrate` (209) before this passes on a tour that
already has dup `R-001`s.
**Last verified**: tsc 0, eslint 0, build green; Adam live.

#### BUD-56 — Phase 0 tab bar (SUMMARY | EXPENSES | INCOME | SETTINGS)
**Do**: Open `/budget/[tourId]`. Read the context-band tabs. Then hit a stale
`?tab=reports`.
**Expect**: exactly **Summary · Expenses · Income · Settings** as four equal
tabs (Settings moved out of the corner, plain — no gear icon; Reports gone).
`?tab=reports` lands on **Summary** (no 404). Grid/Classic toggle + every tab
body still render. (`BudgetContextBand` items; `resolveBudgetTab` maps
`reports → summary`.)
**Last verified**: tsc 0, eslint 0, build green; Adam live.

#### BUD-57 — "Add transaction" is obvious
**Do**: Open a line's slide-over → Transactions.
**Expect**: a clear **"＋ Add transaction"** control — the section-header button
is relabelled (was "＋ Add") AND a full-width dashed **"＋ Add transaction"**
button sits at the **bottom** of the list (where you expect to add a row).
Clicking either adds a transaction via the real route (`addTxn` → `lineApi
.addTransaction`); the trailing-row path still works.
**Last verified**: tsc 0, eslint 0, build green; Adam live.

#### INC-01 — income grid shows routing context columns
**Do**: Budget → Income.
**Expect**: read-only **Date · Type · Venue · City** columns (replacing the
combined "Show" column), from the routing each income row carries (Type =
Show/Travel/Off via `labelForDayType`). Money columns + totals/P&L unchanged
(field names + `/api/budget/income` write path byte-identical; the new columns
are `ro`). (`IncomeRow.day_type` added; `BudgetIncomeGrid` routingCols.)
**Last verified**: tsc 0, eslint 0, build green; Adam live.

#### BUD-49 — transaction row has a discoverable delete
**Do**: Open a line's slide → Transactions. Look at a transaction row.
**Expect**: a clear **trash button** (lucide `Trash2`, bordered, hover turns red)
sits at the end of the row next to the amount — not a faint `✕` buried beside
"🔗 Link". Clicking it deletes the transaction (real route); the line's Actual
re-syncs per BUD-47 (last-txn removal preserves Actual). (`.txn-del` in grid.css.)
**Last verified**: code/build green; Adam live.

> **Phase 3 budget = complete** once BUD-46…49 live-verify (BUD-41…45 already
> green). Then merge `feat/personnel-unify` → main and start Rooming.
> Still out of scope (Phase 4): the txn **🔗 Link** (`transaction_links`),
> settlement / projections.

## Income tab → canonical `<Grid>` (BUD-50…54) — 2026-06-11

> Migrated `BudgetIncomeTab` onto the same `<Grid>` as Expenses. Map:
> `docs/handover/BUDGET_INCOME_MAP.md`. **The P&L bridge is preserved** — same
> income field names, same `post_tax = pre_tax × (1 − wh/100)` rule, same
> `/api/budget/income` upsert, so `computeBudgetPnl`'s `income_gross` is
> unchanged. New file `BudgetIncomeGrid.tsx`; legacy `BudgetIncomeTab.tsx` kept
> **unmounted** as a fallback until the P&L parity is live-verified.
> Two additive `<Grid>` props (default-safe): `allowAddRows` (Income=false) +
> Column `ro` (Show read-only). `tsc` 0 · `eslint` 0 · build green · adapter 7/7.

#### BUD-50 — Income renders on `<Grid>`
> **Preview FAIL → FIXED.** First cut self-fetched on the client and got stuck on
> "Loading income…" (the client fetch never committed after a 200 — a runtime
> lifecycle bug tsc/eslint/build can't catch). **Fix:** Income is now **prop-fed**
> like Expenses — `page.tsx` server-fetches via the shared `loadTourIncome` +
> `toIncomeRows` (`src/lib/budget/income.ts`, the SAME merge the GET route now
> calls) and passes `initialRows`; `BudgetIncomeGrid` renders the `<Grid>`
> synchronously from props with **no loading gate**. The client GET stays only
> for the post-save failure resync. Bridge unchanged (same fields/upsert/P&L).
**Do**: Budget → **Income** tab.
**Expect**: rows = the tour's **shows** (one per routing date; the income +
routing_only merge — a new routing date appears automatically; **no add/delete**,
no Group/Add-section chips). Projected columns: Show (read-only) · Guarantee ·
WH% · Post-tax · Overage · Merch · VIP · Total. **Renders immediately (no
spinner).**

#### BUD-51 — Edit recomputes + persists (no reload)
**Do**: Edit Guarantee / WH% / Overage / Merch / VIP on a show.
**Expect**: **Post-tax + Total recompute live** (calc columns); the value
persists via `POST /api/budget/income` (single field, merge-safe), optimistic,
no reload. WH% clamps 0–100 on save.

#### BUD-52 — Projected ↔ Actual toggle
**Do**: Flip the segmented toggle above the grid.
**Expect**: the **column set swaps** (Actual = Guarantee/Overage/Merch/VIP/Total,
no WH%/Post-tax — actuals are net); actual cells edit + persist to the `actual_*`
fields.

#### BUD-53 — P&L bridge (the must-not-move check)  ⟵ Adam, Chrome
**Do**: Note the Summary P&L **income** for a set of inputs, then re-enter the
same inputs via the new grid.
**Expect**: `computeBudgetPnl`'s **`income_gross` is identical** to pre-migration
for identical inputs (field names + post-tax rule + upsert unchanged).

#### BUD-54 — Currency follows DISPLAY
**Do**: Flip the **Display** selector.
**Expect**: income cells + totals convert via the same `fx` as Expenses (source
figure + red ≈ note when display ≠ tour currency).

> Default-safety proof (BUD-46 invariant): no existing `<Grid>` consumer sets
> `allowAddRows`/`ro` (grep clean) — Expenses (`BudgetGridView`), `/grid-demo`,
> and `gridModel` are byte-for-byte unchanged.

> **Still deferred to the grid-default flip (called out):** row/section
> **reorder** persistence (`sort_order`), and the slide's Transactions/
> Documents CRUD (budget rows don't carry them yet — they live in
> `budget_line_item_transactions` / `_attachments`, a follow-up). The
> **Classic** view keeps those until wired — which is why the toggle stays.

> Cross-ref `docs/smoke-tests/grid.md` for the grid component's GRID-/SLIDE- IDs.

## Known later

- Actual-vs-transactions override math (gates a `transactions.ts` refactor).
- Deliberate gaps: per-artist template override UI; drag-reorder;
  top-level "Line item"/Quick-Add still create section-less lines.
