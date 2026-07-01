# CC — Document Export Stage B: GO. Build the **Budget** slice first. Branch off `main`.

`EXPORT_MAP.md` reviewed + signed off (architecture + logo + D1–D8) by Adam + Claude. **Commit the map**
if not already on a branch. Decisions LOCKED below. Build **only the Budget PDF + the shared shell** on a
fresh branch off `main` (`feat/export-budget`), then STOP for verify before Rooming/Payroll/Routing.

This slice establishes the **shared branded shell** every later surface reuses — build it clean.

## Decisions — LOCKED
- **Architecture:** server-rendered **HTML → PDF via the existing puppeteer pipeline** (`getBrowser()` in
  `puppeteer.ts`; mirror `buildPacketPdfHtml()` / `pdf-render.ts` — the multi-section prior art). One route
  per surface, streamed `application/pdf`. App `var(--lp-*)` tokens render in the HTML.
- **Page size: A4** (`@page` rules in the shell).
- **Logo:** `resolveArtistLogoUrl()` (artist `branding.logo_url`) as the **primary mark**, **server-fetched
  → base64 data-URI** inlined (private-bucket-safe — don't hand Chromium a network URL). Static
  `/public/lowpass-logo.png` as the **footer** mark. **Fallback:** artist initials block when no logo
  resolves. **Defer** any workspace/company-logo upload.
- **Budget columns:** an export-time toggle **Projected / Actual / Both+Variance** (default **Both+Variance**).
  Variance = `actual − projected` per row + per P&L total. **Baseline = the VIEWED version** (what's on
  screen), not the formal approved-Current.
- **Multi-currency detail:** each foreign-currency row shows **native amount AND tour-currency conversion**
  (e.g. `€1,000 (£850)`); totals in tour currency via `toTourCurrency` / `loadTourFxRates`.
- **Retire** the old client-side jspdf "PDF summary" — the branded PDF replaces it (one export path).
- **D2/D4/D5/D8** as above; no zip; internal rate excluded (Payroll slice, not this one).

## Build — Budget slice
1. **`src/lib/export/shell.ts` — the shared branded shell** (the reusable foundation for all four surfaces).
   Renders the letterhead: **logo (data-URI) · artist · tour · tour dates · generated-on**, the A4 `@page`
   rules, the footer (Lowpass mark + page numbers), tokens. Exposes a `renderDocument({ header, bodyHtml })`
   the per-surface bodies fill. The **one** place letterhead lives.
2. **`loadBudgetExportData(tourId)`** — factor from the budget page loaders in
   `src/app/(app)/budget/[tourId]/page.tsx` (lines noted in the map §3A). Returns lines + income + sections
   + commissions + settings + tour + artist(+logo) + fx rates + the viewed version. **Read-only.**
3. **`src/lib/export/budget-pdf.ts` — `buildBudgetBodyHtml(data, { scope })`**:
   - **Summary page** via `computeBudgetPnl({ lines, income, commissions, settings, tourCurrency, fxRates })`
     — the same P&L the Summary tab shows (income breakdown, expenses by section, Net), rendered as the
     scope's column set.
   - **Detail** tables: line items + income grouped by section, native+converted currency rows, section
     totals. `scope` selects Projected / Actual / Both+Variance columns.
   - It MUST reconcile to the Summary tab to the cent (smoke EXP-BUD-01).
4. **`POST /api/budget/[tourId]/export/pdf`** (`?scope=`) — auth → workspace-RLS scope (a **foreign-workspace
   tour 404s**) → `loadBudgetExportData` → `buildBudgetBodyHtml` → `shell.renderDocument` → `getBrowser()` →
   stream `application/pdf` with a sensible filename (`<Artist> — <Tour> — Budget.pdf`).
5. **UI** — in `BudgetExportControls`: a **"Branded PDF…"** action opening a small `<ExportDialog>` (the
   scope toggle; default Both+Variance) → POSTs the route → downloads. **Remove the old jspdf "PDF summary"**
   in the same PR (D6).

## Hard rules
- **Branch off `main`. Commit + PUSH. Confirm `git log origin/<branch>` before reporting.**
- **Read-only** — export must never write/mutate budget data. **Workspace RLS** — only the user's own
  workspace tours export; a foreign tour 404s; financial/PII must not leak across workspaces.
- The **shell is shared infrastructure** — build it generically (header/body/footer contract) so Rooming/
  Payroll/Routing drop in without rework. Don't bake budget-specific assumptions into `shell.ts`.
- No migration (read-only). Tokens (`var(--lp-*)`); `next build --webpack`; `tsc` 0; `eslint` 0.
- Don't regress the income work, versioning, or the existing puppeteer routes (`pdf-render.ts` /
  rider-pack google-doc — leave them alone; reuse `getBrowser()` only).
- Smoke IDs `EXP-BUD-01..` in `docs/smoke-tests/budget.md`: P&L matches the Summary tab to the cent; the
  scope toggle selects the right columns; native+converted shows on foreign rows; a locked/foreign-workspace
  tour is gated; the old jspdf summary is gone.
- **Verify before claiming** — name files/lines; push the hash. I Chrome-verify: export a budget → branded
  A4 PDF with the artist logo + correct P&L; toggle scope → columns change; foreign-currency row shows
  native+converted; the old quick-PDF button is gone.
