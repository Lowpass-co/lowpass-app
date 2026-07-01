# CC — Export v2.1 BATCH (polish from Adam's smoke). Parts A→E, each its own branch + commit + push.

Adam smoke-tested Export v2 — mostly PASS, with specific refinements. This is a **polish round**, not a
rebuild. Run **A→E in order**, each a **separate branch off the prior + commit + push + short report**.
Branch the first off `main`. Same invariants as before (presentation-only — numbers from
`computeBudgetPnl`/`fees.ts`; DEFAULT config reproduces today's output; shared shell generic; read-only +
workspace-RLS; tokens; `tsc`/`eslint`/`build` green per commit; report the hash then continue).

---

## PART A — Editor & preview polish (branch `feat/export-v21-editor`, off `main`)
1. **Printable page in the preview.** The preview document has **no page border/margins** → it looks
   un-printable and runs edge-to-edge. Render the preview as a **real page** — a page boundary with proper
   page margins (the PDF should match). The downloaded PDF is fine; it's the on-screen page framing + the
   document's own inner margins that need to read like a sheet of paper.
2. **Header padding.** The right-hand header text + the logo sit **too close to the page edge** — add inner
   padding so they're not flush to the border.
3. **Hide-header toggle.** Add a control to **remove the entire header** (letterhead) when Adam wants — a
   "Show header" toggle in the Header group (default on; off → no letterhead, content starts at the top
   margin).
4. **Default-pill bug.** The Templates list shows the **"DEFAULT" pill on TWO templates at once** (see
   Adam's screenshot). Only the one actual workspace default for that surface may show the pill. Fix the
   display AND confirm **Set-as-Default clears the previous default** (the CRUD route should unset the old
   `is_default` before setting the new — the partial-unique index allows only one, so make the route do it
   in one transaction, not error).
5. **Preview on template select.** Clicking/applying a template must **update the live preview** to that
   template's config (it currently doesn't re-preview on select).
6. **Control order.** Move the **Format toggle (PDF/Excel) + the surface mode controls ABOVE the Sections
   group** in the panel (Adam: "this should be above sections").

## PART B — Excel rework (branch `feat/export-v21-xlsx`, off A — ALL surfaces)
Adam: "the Excel option is SO bad… needs a lot of work." The current sheets have **no column widths
(everything truncates), numbers stored as TEXT strings (can't sum/format), no header styling.** Rebuild the
xlsx output (`src/lib/export/xlsx.ts`) to be a proper, clean data file:
1. **Column widths** — auto-size every column to its content (no truncation). The routing Excel especially
   (city/venue/address were cut to "Manches", "Düsseldo", etc.).
2. **Numeric cells** — money/quantities are **real numbers**, not strings, with a **currency/number
   format** (e.g. `£#,##0`) so totals + filters work in Excel.
3. **Styled header row** — bold, a fill, **freeze the top row**, and **autofilter** on the header.
4. **Clean per-surface columns** — drop raw junk (routing's `not_start`, duplicate "Advance" columns →
   sensible labels/values; add country; remove capacity by default to match the PDF column choices). Each
   surface gets a tidy, send-ready sheet.
5. A **totals row** where the PDF has one (budget P&L totals, payroll grand total).

## PART C — Payroll polish (branch `feat/export-v21-payroll`, off B)
1. **Rendered grid for "where we were"** → render it like the app's grid (a clean bordered table), and
   **relabel it "Routing"** everywhere (the export + the customise panel) — not "where we were".
2. **Bigger/clearer breakdown** — it's a summary doc; increase the breakdown's size/legibility.
3. **Folder export (combined + individual together).** Add a **"Download all (zip)"** path: a zip containing
   the **combined** run-sheet AND **one file per person** — so Adam can send each person their own. (Add a
   zip dep — `jszip`/`archiver` server-side; keep the single-doc options too.)
4. **People picker** — choose who's in the export: **All** / a multi-select of individuals. (Config field
   `selectedPersonIds: string[] | null`; null = everyone.)

## PART D — Routing polish (branch `feat/export-v21-routing`, off C)
1. **Lowpass-branded checkbox** — the travel-times toggle (and the routing checkboxes generally) should use
   the Lowpass checkbox style, not the raw browser one.
2. **Column picker** — add a column picker for the routing list; **remove Capacity by default, ADD
   Country**. (Mirror this column set in the Excel — Part B.)
3. **Mode-of-transport icon** — show a transport icon (van/plane/ferry — from `transport_to_next`) in the
   travel/leg cell.
4. **Map + List together** — let the user pick **List / Map / Both** (not just list-or-calendar). (Map is
   still the static-map stretch — if it's a big lift, ship List/Both-without-map and flag map as the
   remaining follow-up, but wire the toggle.)
5. **Light/dark discoverability** — the calendar light/dark toggle only appears on calendar view; Adam
   couldn't find it. Keep it scoped to calendar but make it clearly visible when calendar is selected.
6. **Reduced header on the export** — routing currently shows only the footer at top; it needs the **proper
   reduced header band** (the Part-B/v2 running header), like the other surfaces.
7. Routing **Excel** is covered by Part B — make sure routing's sheet is clean.

## PART E — Rooming polish (branch `feat/export-v21-rooming`, off D)
1. **City / country on the list** — show city + country; when a hotel has **no name** ("Unassigned Hotel"),
   **fall back to city/country** as the heading instead of "Unassigned Hotel".
2. **Nights off-by-one (real bug).** A block placed on **2 Oct = ONE night → check-out 3 Oct**. Currently it
   renders 2 Oct → 2 Oct, **0 nights**. Fix the export's nights/checkout calc: a single-day block is 1
   night, check-out = block date + 1; nights = checkout − checkin (min 1). **Presentation/calc only — don't
   mutate the source room data.**
3. **Group people in the same room** — when multiple guests share a room, group them together so the
   sharing is clear. (Adam likes the current formatting — keep it; just group.)

---

## Notes
- **Future (don't build):** the Advance export surface (day sheets / tour books) is still coming — keep the
  shell + config + per-surface pattern generic. Adam also floated a grid-based preview with col/row
  selection (#13) — note as a future idea, not this batch.
- **Verify before claiming** per part — name files/lines; push the hash. Visual/PDF/Excel is Adam's
  download eye, but config→output, numbers-unchanged, DEFAULT byte-for-byte, and build-green are yours.
- Migrations: new config fields live in `export_templates.config` jsonb (no migration). Only the zip
  (Part C) adds a dep, not a migration. Re-confirm if anything genuinely needs a column (224 is high-water).
