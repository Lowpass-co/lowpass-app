# CC — Export v2 BATCH (polish + features, autonomous, sequenced). Parts A→G, each its own branch + commit + push.

Adam smoke-tested the live export builder and gave detailed feedback. The core works (4 surfaces, config →
output, templates persist). This batch is the **polish + the feature gaps**. Run **A→G in order**, each a
**separate branch off the prior + commit + push + short report** before the next. Branch the first off
`main`.

> **Run rules (same as the last batch):**
> - Each part: branch as named, commit + PUSH, confirm `git log origin/<branch>`, report the hash + what
>   landed, THEN continue. Stacked branches FF on the prior.
> - After EACH part: `next build --webpack` green · `tsc` 0 · `eslint` 0 · smoke IDs in `budget.md`.
> - **Invariants (hold for ALL parts):** presentation-only (numbers from `computeBudgetPnl` / pure
>   `fees.ts`); `DEFAULT_CONFIG` reproduces today's output; shared shell/render stays generic; read-only +
>   workspace-RLS; tokens (`var(--lp-*)`); don't regress income/versioning/receipts/the render fixes.
> - **"All payroll + routing notes also apply to ROOMING"** (Adam) — the three external-facing surfaces
>   (payroll, routing, rooming) share the visual-quality + date-range bar. Budget stays the more traditional
>   financial doc.
> - If a part hits a real design ambiguity that risks an invariant, stop + flag it. Otherwise keep going.

---

## PART A — Editor & layout polish (branch `feat/export-v2-editor`, off `main`)
The immediate UX annoyances. No schema.
1. **Modal z-index / backdrop bug** — the budget **top bar (ProductHeader) bleeds through the top of the
   editor modal.** Give the editor a full-viewport backdrop ABOVE all app chrome (correct z-index /
   portal), so nothing shows through.
2. **Collapsible settings sections** — the right panel is long; make each group (Templates / Sections /
   Figures / General / Header / Footer) a **collapsible accordion** so Adam isn't scrolling constantly.
   Remember open/closed per group (localStorage).
3. **Preview zoom** — page-size changes aren't visible because the preview is cropped. **Fit-to-width by
   default + zoom controls** (buttons and/or scroll-to-zoom + click-to-zoom) so Adam can inspect formatting
   and actually see A4 vs Letter reflow. Show the page boundary.
4. **Default-template UX** — replace the **hollow star** with a small **"Default" pill** that goes **orange
   when active** (remove the star entirely). Template rows must **animate on hover AND on click/select**
   (it's currently unclear that clicking the row selects it) — clear hover + selected states.
5. **Open behaviour** — opening Export… for a surface **opens the last-used template for that surface in
   this workspace**; if a workspace **default** is set, open that instead. On **close OR export without
   saving**, prompt **"Save these settings as a template?"** before proceeding.
6. **Universal Export button** — on **Routing the Export button is grey**; everywhere else it's orange.
   Make the export entry point **orange + identical on all surfaces** (budget/rooming/payroll/routing).

## PART B — Multi-page layout fix (branch `feat/export-v2-pagination`, off A — shared shell, all surfaces)
The attached budget PDF: **page 1 = the header banner then EMPTY; all content on page 2 with NO header.**
1. **Content must flow on page 1** directly under the letterhead — fix whatever pushes the body to page 2
   (a stray `page-break`, the header's height/min-height, or a margin). The header should NOT consume the
   whole first page.
2. **Overflow pages (2+) get a REDUCED repeating header** — a compact one-line letterhead (artist · tour ·
   surface · page x/y) at the top of every page after the first, via puppeteer `headerTemplate` (or a
   print-CSS running header). Not the full banner — a slim band.
3. Verify with a budget that spans 2+ pages: page 1 starts with content under the full header; pages 2+
   carry the reduced header; the footer page x/y stays correct. Applies to **all four surfaces**.

## PART C — Format: PDF ↔ Excel (branch `feat/export-v2-format`, off B)
1. **Remove the standalone "Export to Excel / XLSX" button** (the old client-side one).
2. Add a **format toggle** in the editor — **PDF / Excel** — that changes BOTH the output format AND the
   **presentation**: the Excel variant emits an **Excel-friendly layout** (flat tabular data, one row per
   line, machine-readable headers — not a styled print doc). Reuse the existing data loaders; build an
   `xlsx` export path alongside the PDF path. (The presentation differs by format — a print PDF vs a clean
   data grid.)
3. The **Download button label updates to the chosen format** — "Download PDF" / "Download Excel".

## PART D — Header customisation (branch `feat/export-v2-header`, off C)
Per Adam: the letterhead should be more custom.
1. **Custom font sizes + text** for the header elements (the artist/tour/title/subtitle) — size controls +
   editable label/title text in the Header settings.
2. **Custom notes block** in the header — a free-text note Adam can add to the letterhead (config field +
   editor control + render).

## PART E — Payroll upgrade (branch `feat/export-v2-payroll`, off D)
Payroll goes OUT to people to invoice against — make it clear + flexible. **These options also wire into
Rooming where they make sense (date range + visual quality).**
1. **Mode toggle: Combined vs Individual.** Combined = the master run sheet (today). Individual = a separate
   per-person export to send each person (their statement only). The output differs per mode.
2. **Date-range picker** — currently exports the whole tour; add a **from/to range** (default whole tour) so
   Adam can export a slice. (This range control is **shared** — add it to Routing + Rooming too.)
3. **Per-person invoice clarity** — options to include: the **days grid**, **days worked**, any **extra
   advance fee**, and **where we were + venue** per day. The statement must make it obvious **what the
   person is invoicing for**.
4. **Visually excellent** — it's external; clean, branded, easy to read (not a bare table).

## PART F — Routing upgrade (branch `feat/export-v2-routing`, off E)
Routing is external + currently "line-by-line, almost ASCII-looking." Make it beautiful + multi-view.
1. **View options** (a config choice, each renders + is pretty):
   - **Routing list** (the table — but restyled, not ASCII).
   - **Calendar view** — Adam likes the app's calendar view; render a print-friendly version (with a
     **light/dark toggle**, since the app's is dark-mode).
   - **Travel times** — include leg travel times between days when toggled.
   - **Map view** — *stretch / optional*: a static route map (needs a static-map image service + the routing
     lat/lng already on the table). If it's a big lift, ship the others and **flag map view as a follow-up**
     rather than blocking the batch.
2. **Date-range picker** (the shared control from Part E).
3. **Visually excellent** — branded, readable, external-quality.

## PART G — Rooming visual polish (branch `feat/export-v2-rooming`, off F)
Apply Parts E/F's external-quality standard to Rooming: the **date-range** control, the visual polish
(clean branded hotel-grouped layout), and the shared header/format controls. It's the third external doc —
it should match payroll/routing in quality.

---

## Final notes
- **Future (DON'T build now, just leave room):** an **Advance** export surface (day sheets / tour books) is
  coming — keep the shell + config generic enough that a 5th surface drops in.
- **Global templates:** Adam doesn't know how to create them (they're admin/SQL-authored). Low priority —
  if trivial, add a note in the Templates panel explaining the global tier is read-only house styles;
  otherwise leave it.
- **Verify before claiming** per part — name files/lines; push the hash. Visual/PDF/Excel is Adam's
  download eye, but the **config→output**, **numbers-unchanged**, and **build green** are yours.
- Migrations: Parts likely need none (config is jsonb on the existing `export_templates`); if Part E/F add a
  config field it lives in the jsonb, no migration. If anything genuinely needs a column, re-confirm the
  next free number (224 is the high-water).
