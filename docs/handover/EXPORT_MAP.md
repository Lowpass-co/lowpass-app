# Document Export — Stage-A MAP (#8, was "GridExport")

> **MAP + PLAN ONLY. No code, no migration.** Reviewed by Adam + Claude before any
> build. Export = bespoke, branded, send-ready **PDFs per surface** — NOT a generic
> grid→CSV/XLSX dump. Four surfaces: **Budget → Rooming / Payroll / Routing**.
> Build order is Budget-first, so the Budget section below is the most detailed.
>
> Read-only feature: every export READS existing data through workspace RLS and
> writes nothing to budget / rooming / payroll / routing.

---

## 0. Model (locked)

A **shared branded shell** (letterhead: artist + tour name, logo, tour dates) wraps a
**per-surface body**. Each surface is a purpose-built layout, not a column dump. The
shell + each body are HTML templates rendered to PDF server-side.

```
┌─ branded shell (letterhead: logo · artist · tour · dates · generated-on) ─┐
│   <per-surface title>                                                      │
│   ┌─ per-surface body (Budget P&L / Rooming list / Payroll / Routing) ─┐   │
│   └────────────────────────────────────────────────────────────────────┘  │
│   footer (page n/m · Lowpass mark · workspace)                             │
└────────────────────────────────────────────────────────────────────────────┘
```

---

## 1. PDF architecture — RECOMMENDATION: HTML template → PDF via puppeteer-core

**Recommended: server-rendered HTML → PDF with the EXISTING puppeteer pipeline.** This
is already a proven, in-repo pattern (three live routes), gives precise letterhead /
page control, and **reuses the app's `var(--lp-*)` design tokens directly in the HTML**
(confirmed: `src/lib/rider-packs/pdf-render.ts:675` uses `var(--lp-text)` etc.).

### What already exists (reuse, don't rebuild)

- **Deps** (`package.json`): `puppeteer-core@^24.43.1` (line 39) + `@sparticuz/chromium@^148.0.0`
  (line 21) — the serverless Chromium binary. Browser resolution is solved.
- **Browser helper**: `src/lib/rider-packs/puppeteer.ts` — `getBrowser()` (caches the
  instance; `@sparticuz/chromium` on Vercel, `PUPPETEER_EXECUTABLE_PATH` in dev) +
  `closePage(page)`. Despite the `rider-packs/` path it's generic; the export routes can
  import it as-is (or we lift it to `src/lib/pdf/puppeteer.ts` in Stage B — a rename, not
  a rewrite).
- **Three live HTML→PDF routes** to copy the shape from:
  - `src/app/api/rider-packs/[id]/pdf/route.ts` — auth → load → `buildRiderPdfHtml()` →
    `page.setContent(html, { waitUntil: 'load' })` → `page.pdf()` → `application/pdf` +
    `Content-Disposition`.
  - `src/app/api/advance-packets/[tourId]/[routingId]/pdf/route.ts` — a **bundled,
    multi-section packet**. Its builder `buildPacketPdfHtml()` (`pdf-render.ts:113`) is the
    closest prior art for our **shared shell + per-section body** model.
  - `src/app/api/stage-plots/dev-pdf/route.ts` — dev-only.
- **HTML builders** live in `src/lib/rider-packs/pdf-render.ts`: `buildRiderPdfHtml()`
  (`:71`), `buildRiderBodyHtml()` (`:96`), `buildPacketPdfHtml()` (`:113`). Pattern: a
  pure `(payload) => string` returning a self-contained `<!DOCTYPE html>` doc with inline
  `<style>` using `var(--lp-*)`.

### The two rejected alternatives

- **jspdf (programmatic)** — already used in two places: `src/components/budget/BudgetExportControls.tsx:21`
  (client-side "PDF summary" = a flat landscape table) and `src/components/equipment/exportJobPdf.ts`
  (a genuinely *branded* job quote: logo via `doc.addImage()`, custom Inter/Montserrat
  fonts, token colours duplicated as RGB tuples because jspdf can't read CSS vars). jspdf
  CAN do branded output, but **layout is manual coordinate math** — letterhead, multi-page
  flow, tables, and page breaks are all hand-built. For four bespoke multi-page documents
  this is far more code than HTML+CSS. **Reject** for the documents; the existing client
  jspdf "PDF summary" can stay as a quick-dump fallback or be retired (open decision §7).
- **Google Docs export** (`src/app/api/rider-packs/[id]/export/google-doc/route.ts`) — a
  *different* pattern entirely (builds a Google Docs API request via
  `src/lib/google/docs-export.ts`, writes to Drive, stores `doc_id`). **Do not conflate.**
  It's for editable hand-off docs, needs OAuth, and gives no print/letterhead control.
  Out of scope for send-ready PDFs.

### Where generation runs + how the file returns

One **server route per surface**, mirroring the rider routes:

| Surface  | Route                                                |
|----------|------------------------------------------------------|
| Budget   | `POST /api/budget/[tourId]/export/pdf`               |
| Rooming  | `GET  /api/operations/[tourId]/rooming/export/pdf`   |
| Payroll  | `GET  /api/operations/[tourId]/payroll/export/pdf`   |
| Routing  | `GET  /api/operations/[tourId]/routing/export/pdf`   |

- **Budget uses POST** because it carries an options body (the Projected/Actual/Both
  toggle, + which version to export). The others are option-light → GET with query params
  (`?scope=`, `?advance=1`). (Open decision §7: standardise on POST everywhere for a
  consistent options dialog.)
- Each route: `auth.getUser()` → resolve `profiles.workspace_id` → load the tour
  `.eq('workspace_id', workspaceId)` (RLS-scoped, 404 if not in workspace) → run the
  surface's existing server loader(s) → resolve the shell inputs → `buildShellHtml(title,
  bodyHtml)` → `getBrowser()` → `page.setContent` → `page.pdf({ format, printBackground:
  true, margin })` → return `application/pdf` with `Content-Disposition: attachment;
  filename="<artist> — <tour> — <surface>.pdf"`.
- **Download UX**: the surface's Export button hits the route and the browser downloads
  the streamed PDF (same as the rider "Download PDF" affordance).

### New Stage-B modules (proposed)

- `src/lib/export/shell.ts` — `buildShellHtml({ letterhead, title, bodyHtml, footer })`
  → the shared branded `<!DOCTYPE html>` wrapper (letterhead block + tokenised `<style>` +
  page `@page` rules). The ONE place artist/tour/logo letterhead is rendered.
- `src/lib/export/budget-pdf.ts`, `rooming-pdf.ts`, `payroll-pdf.ts`, `routing-pdf.ts` —
  each exports a pure `buildXBodyHtml(data) => string`. (Same shape as `pdf-render.ts`.)
- Reuse `src/lib/rider-packs/puppeteer.ts` (or lift to `src/lib/pdf/puppeteer.ts`).

---

## 2. The branded shell (letterhead) + the LOGO gap

**Letterhead inputs — all available server-side today:**

| Field          | Source                                                    |
|----------------|-----------------------------------------------------------|
| Artist name    | `artists.name` (joined via `tours.artist_id`)             |
| Tour name      | `tours.name`                                              |
| Tour dates     | `tours.start_date` / `tours.end_date`                     |
| Tour currency  | `tours.currency` (for the Budget body)                    |
| Logo           | `resolveArtistLogoUrl()` — see gap below                  |
| Generated-on   | request time (server)                                     |

The budget page already loads all of these (`src/app/(app)/budget/[tourId]/page.tsx`
fetches `tours` + `artists` and calls `resolveArtistLogoUrl` — import at `:31`).

### Logo — what exists (mostly closed) + the real gaps

A real **artist logo upload feature EXISTS**:
- Upload route: `src/app/api/artists/[id]/image/[kind]/route.ts` (`kind` = `logo` | `banner`),
  stores to the Supabase Storage **`artist-assets`** bucket at `{workspace_id}/{artist_id}/{kind}.{ext}`,
  writes the public URL into `artists.branding` JSONB (`logo_url`).
- Resolver: `src/lib/artists/imageUrl.ts` → `resolveArtistLogoUrl()` (`:58`), fallback
  chain: `branding.logo_url` → `spotify_image_url` → live Spotify fetch → `null`.

**Gaps to flag (decisions for §7):**
1. **No workspace/company logo.** `workspaces` has no logo column and no upload. A
   letterhead "by Lowpass / by <agency>" mark would need either the hardcoded app logo
   (`/public/lowpass-logo.png`, already used by `exportJobPdf.ts`) or a NEW minimal
   workspace-logo add. **Recommend Stage B ships with: artist logo (existing) as the
   primary mark + the static Lowpass mark in the footer; defer workspace-logo upload.**
2. **Logo URL fetch inside Chromium.** `branding.logo_url` is a **public** Storage URL,
   so puppeteer's `page.setContent` can load it over the network. If we ever move artist
   assets to a private bucket, the shell must inline the logo as a base64 data URI (fetch
   server-side, embed) — the safer pattern regardless, and what `exportJobPdf.ts` already
   does for the Lowpass mark. **Recommend: server-fetch the logo → data URI → inline.**
   No cross-workspace leak risk (we only read the tour's own artist).
3. **Fallback** when no logo resolves: render the artist initials block (the app already
   has a gradient/initials fallback in `TourIdentityChip`).

---

## 3. Surface maps

### 3A. BUDGET (build first — most detailed)

**Shape (locked):** a **summary P&L page** + **full line-item detail** behind it. Columns
are an export-time toggle: **Projected / Actual / Both+Variance** (default Both+Variance).

#### Summary page — source: `computeBudgetPnl`

- `src/lib/budget/computeBudgetPnl.ts:139` —
  `computeBudgetPnl({ lines, income, commissions, settings, tourCurrency, fxRates }): BudgetPnl`.
- Return `BudgetPnl` (`:67`) is **already Projected+Actual pairs** — every figure is a
  `PnlPair { projected, actual }`, so the toggle is a column selector over ONE computation,
  no recompute branching:
  - `grossIncome`, `incomeBreakdown { guarantee, overage, merch, vip, deductions }`,
    `merch`, `merchNet`, `baseExpenses`, `commissions` (+ `commissionRows[]`), `insurance`,
    `contingency`, `accountancy`, `cogs`, `totalExpenses`, **`net`**, plus `pct` + `basis`
    overhead settings, and `currency`.
- **Same call the UI uses**: `src/components/budget/BudgetSummaryTab.tsx:130` — so the PDF
  P&L will match the on-screen Summary exactly. Stage B calls `computeBudgetPnl` server-side
  in the route with the loaders below.

#### Detail — source: line items + sections + income

- **Expense lines**: `budget_line_items` (`label`, `category`, `proposed_cost`,
  `actual_cost`, `currency`, `routing_id`, `section_id`, `sort_order`, `phase_tag`,
  `actual_cost_override`, + fetch-time `transaction_sum`/`transaction_count`). Loaded by the
  budget page (`budget_line_items` select, ordered by section/sort_order/category).
- **Sections**: `budget_sections` (`name`, `sort_order`, `kind` = custom | commission |
  insurance | contingency | cogs). Group detail rows by `section_id`.
- **Income lines (per show)**: `budget_income` via `loadTourIncome()` /
  `src/lib/budget/income.ts` → one row per routing date.

#### Projected / Actual / Both+Variance — exact column mapping

| Layer | Projected source | Actual source |
|-------|------------------|---------------|
| Expense line | `budget_version_lines.proposed_cost` (active/viewed version snapshot, via `getProposedLineMap`) — falls back to `budget_line_items.proposed_cost` | `budget_line_items.actual_cost` (auto-synced from `transaction_sum` unless `actual_cost_override`; read via `getEffectiveActual`, `src/lib/budget/transactions.ts`) |
| Income line | `budget_income.pre_tax_*` / `merch_income` / `vip_income` (or version snapshot via `getProposedIncomeMap`) | `budget_income.actual_guarantee` / `actual_overage` / `actual_merch` / `actual_vip` − `actual_deductions` |
| P&L pair | `PnlPair.projected` | `PnlPair.actual` |

- **Both+Variance** (default): show both columns + `variance = actual − projected` per row /
  per pair. **Baseline nuance (open decision §7):** "projected" already reflects the
  **viewed** version. The *formal* variance baseline is the approved Current version
  (`resolveApprovedVersion`, `versions.ts:57`). Recommend: export the **viewed** version's
  projected (matches what the user sees) and label the PDF with the version number/status,
  rather than silently switching to the approved snapshot.
- The export options body carries `{ scope: 'projected' | 'actual' | 'both', versionId }`.

#### Multi-currency

- Per-show currency (migration 216): `budget_income.currency`; per-line: `budget_line_items.currency`.
- Convert to tour currency with `toTourCurrency()` + `loadTourFxRates()` (`src/lib/budget/fxRates.ts`);
  `computeBudgetPnl` already does this internally for the summary. The **detail** table should
  show each row's native amount AND the tour-currency conversion (decision §7: show native +
  converted, or converted-only with a per-row currency badge). The fallback static map is
  `convertToCurrency` (`src/lib/budget/fx.ts`).

#### Budget loaders to reuse (all in `src/app/(app)/budget/[tourId]/page.tsx`)

`budget_line_items` select · `budget_sections` select · `loadTourIncome` · `budget_commissions`
select · `budget_settings` select · `resolveActiveVersion` / `getProposedLineMap` /
`getProposedIncomeMap` (versions.ts) · `loadTourFxRates` · `enrichLinesWithTransactionAggregates`.
Stage B factors the shared subset into one `loadBudgetExportData(supabase, tourId, workspaceId,
{ versionId })` so the route and page can't drift.

---

### 3B. ROOMING (standard hotel rooming-list)

**Shape:** per hotel + date range, rows of **guest · room type · check-in · check-out ·
nights** — the doc you email a hotel.

**Source — canonical room entity (migration 051), authoritative:**
- `hotels` — `name`, `address`, `city`, `country`, `phone`, `confirmation_number`,
  `check_in_at`, `check_out_at`, `show_id`. **Hotel IS a first-class entity** (this resolves
  the flagged gap — name + address are real columns, not free text).
- `rooms` — `hotel_id`, `room_number`, `room_type`, `cost_amount`, `cost_currency`, `bed_count`.
- `room_assignments` — `room_id`, `person_id`, `starts_on` (check-in), `ends_on` (check-out).
- Guest name: `persons.full_name` (migration 050) via `room_assignments.person_id`.
- **Nights** = `ends_on − starts_on` (computed; the page already does this).

**Reuse the existing loader/shape:** `src/app/(app)/operations/[tourId]/rooming/page.tsx`
already assembles `hotels[] → room_assignments[]` with `{ person_name, check_in, check_out,
nights, room_type, room_number, rate_per_night }` (consumed by `RoomingView`). The PDF body =
that same structure, grouped by hotel, sorted by check-in.

**Note the legacy table:** `rooming_grid` (migration 017: `person_name` free-text,
`routing_id`, `room_type`) is the pre-canonical model — **do NOT export from it**; use
`room_assignments`.

**Gaps:** none blocking — all standard rooming-list fields exist. (Optional nicety: room cost
totals per hotel from `rooms.cost_amount` × nights — a decision, not a gap.)

---

### 3C. PAYROLL (master run-sheet + per-person statements)

**Shape:** a **master run-sheet** (every person: role, rate(s), days, total, grand total)
**+ per-person individual statements** (one page each, hand-out).

**Source:**
- Rates: `personnel_rates` (migration 017) — `show_rate`, `off_rate`, `rehearsal_rate`,
  `rate_type` (`day_rate` | `split_rate`), `per_diem`, `advance_fee`, `role`. Admin-only
  `internal_rate` (migration 106) — **exclude from a hand-out statement** (it's the internal
  P&L rate); decision §7.
- Roster (the row source): `tour_personnel` (migration 050) → `persons.full_name` for the
  live name + `tour_personnel.role`.
- Day counts: `payroll_entries.day_statuses` (JSONB, ISO-date → status), defaulted from
  `routing.day_type` via `dayTypeToStatus` (`src/components/payroll/usePayrollGrid.ts:28`).
- **Fee math (reuse the pure helpers, do not re-derive):** `src/lib/payroll/fees.ts` —
  `countDayStatuses()` → `{ show, offTravel, rehearsal, active }`; `computeTotalFee(rate,
  counts, advanceFee)` = `show×show_rate + offTravel×off_rate + rehearsal×rehearsal_rate +
  advance_fee`; `computeTotalPerDiem()`.
- Currency: `tours.currency` (payroll has no per-person currency).
- Existing loader/shape: `src/app/(app)/operations/[tourId]/payroll/page.tsx` →
  `<PayrollView>` (roster-sourced rows + seeded blank cards).

**Run-sheet body** = one row per roster member (role · show/off/reh day counts · each rate ·
total) + a grand-total row. **Statement body** = one page per person: name + role, the
day-count breakdown, rate lines, total, per-diem, advance.

**Gaps to flag (per-person statement):** the schema does NOT capture **bank/payment details,
tax/NI id, payment terms, or a paid/unpaid advance ledger** (`persons` has no bank/tax
fields). A statement can show the *earnings breakdown* fully, but "remittance"-style fields
are absent. Decision §7: ship statements as earnings summaries (no bank details), or add a
minimal `persons` payment-details extension in a later phase.

---

### 3D. ROUTING (dates / cities / venues + optional per-day advance summary)

**Shape:** the tour routing (dates / cities / venues), with an **optional per-day advance
summary**. NOT daysheets/MasterTour — explicitly out of scope.

**Source — `routing` table** (migration 001 + extensions 008/009/015):
`date`, `day_type`, `city`, `venue_name`, `address`, `venue_phone`, `venue_website`,
`venue_capacity`, `latitude`/`longitude`, `transport_to_next`, `notes`, `sequence`.
Loader/page: `src/app/(app)/operations/[tourId]/routing/page.tsx` → `RoutingEditor`.

**Routing body** = chronological rows: date · day_type · city · venue · capacity (+ optional
address/contact). Off/travel days included or filtered (decision §7).

**Optional per-day advance summary — source:**
- `advance_instances` (migration 001) — `routing_id`, `data` JSONB (filled fields keyed by
  section), `status`, `section_statuses`; `advance_form_configs.sections` is the template.
  Contacts extracted via `src/lib/advance/key-info.ts` → `extractKeyContacts()`.
- `deal_memos` (migration 053, optional) — `promoter_name/email/phone`, `fee_amount`,
  `settlement_method` per `show_id`.
- A per-day block would pull load-in / doors / set times / key contacts from
  `advance_instances.data`. Because that data is free-form JSONB, the advance summary is
  **best-effort** (render whatever key fields resolve) — flag as optional/secondary in Stage B.

---

## 4. Export trigger UX (one consistent pattern)

- **Entry point per surface**: an **Export** button in the surface header.
  - Budget already has one: `<BudgetExportControls>` (`src/components/budget/BudgetExportControls.tsx`),
    mounted in `BudgetContextBand.tsx`, today a menu with **XLSX** + client **"PDF summary"**.
    Stage B adds **"Branded PDF…"** here (opens the options dialog). Decision §7: keep XLSX +
    quick PDF, or replace the quick PDF with the branded one.
  - Operations Payroll / Rooming / Routing pages have **no export affordance today** (Phase-4
    placeholders) — Stage B adds the same Export button to each header.
- **Options dialog** (Budget): Projected / Actual / Both+Variance (default Both+Variance) +
  version selector. Rooming/Routing: minimal (Routing gets an "include advance summary"
  checkbox; Rooming optionally "include room costs"). One shared `<ExportDialog>` component;
  surfaces with no options skip straight to download.
- **Action**: dialog → hit the surface route → browser downloads the streamed PDF.

---

## 5. Blast radius + open decisions

**Reads only (no regression risk):**
- Budget: `computeBudgetPnl` inputs (`budget_line_items`, `budget_sections`, `budget_income`,
  `budget_commissions`, `budget_settings`, `budget_version_*`, `budget_fx_rates`).
- Rooming: `hotels`, `rooms`, `room_assignments`, `persons`.
- Payroll: `personnel_rates`, `payroll_entries`, `tour_personnel`, `persons`, `routing`.
- Routing: `routing`, optionally `advance_instances`, `advance_form_configs`, `deal_memos`.
- All scoped by `tours.workspace_id = profiles.workspace_id` + table RLS → **no cross-workspace
  leak**. Financial/PII docs (Budget, Payroll statements) must keep this guard; the logo is
  read only from the tour's own artist.

**Fields the app does NOT capture yet (gaps):**
1. **Workspace/company logo** — none (only per-artist logo + the static Lowpass mark). §2.
2. **Payroll statement remittance fields** — no bank/tax/payment-terms/advance-ledger on
   `persons`. §3C.
3. **Advance summary is free-form JSONB** — per-day advance fields are best-effort. §3D.

**Open decisions (for Adam at Stage-B kickoff):**
- **D1 — Page size**: A4 vs Letter (recommend **A4**, the app's existing jspdf exports use A4;
  or make it a per-workspace/per-export option).
- **D2 — Budget variance baseline**: viewed version (recommended) vs always the approved
  Current snapshot. §3A.
- **D3 — Multi-currency detail rows**: native + converted vs converted-only with a currency
  badge. §3A.
- **D4 — Payroll statements packaging**: one multi-page PDF (all statements) vs a ZIP of
  per-person PDFs. Recommend **one multi-page PDF** (the puppeteer packet pattern already does
  multi-page; no zip dep needed). §3C.
- **D5 — Internal rate**: confirm `personnel_rates.internal_rate` is excluded from hand-out
  statements + run-sheet. §3C.
- **D6 — Existing client "PDF summary"**: keep alongside the branded PDF, or retire it. §4.
- **D7 — Routing**: include off/travel days? include the advance summary by default? §3D.
- **D8 — Logo embedding**: inline as base64 data URI (recommended, private-bucket-safe) vs
  network URL. §2.

---

## 6. Build order + Stage-B starting point

**Budget first** (most detailed above), then Rooming → Payroll → Routing (Rooming is the
simplest body; Payroll adds the per-person statement pass; Routing adds the optional advance
summary).

Stage-B Budget slice = (1) `src/lib/export/shell.ts` (the branded shell, the reusable
foundation for all four), (2) `loadBudgetExportData()` factored from the budget page loaders,
(3) `src/lib/export/budget-pdf.ts` (`buildBudgetBodyHtml` — summary page via `computeBudgetPnl`
+ detail tables with the scope toggle), (4) `POST /api/budget/[tourId]/export/pdf` (reusing
`getBrowser()`), (5) the **Branded PDF…** option + `<ExportDialog>` in `BudgetExportControls`.
Verify: tokens; `next build --webpack`; tsc 0; eslint 0; RLS (a foreign-workspace tour 404s);
read-only (no writes). New smoke IDs `EXP-BUD-01..` (the P&L matches the Summary tab; the
toggle selects columns; locked/foreign tours are gated).

## STOP

Stage-A map only. Await sign-off on the PDF-architecture recommendation (puppeteer HTML→PDF,
reusing the rider pipeline), the logo plan (§2 — artist logo exists; workspace logo + data-URI
embedding are the decisions), and the open decisions D1–D8 before building the Budget slice.
