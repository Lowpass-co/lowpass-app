# CC — Document Export (#8, was "GridExport"). Stage A (map + plan only). Gated.

Replaces the vague "GridExport." Adam's requirements gathered + LOCKED below. Export is **bespoke,
branded, send-ready PDFs per surface** — NOT a generic grid→CSV dump. Four surfaces in scope. **Budget
first.** Stage A is a **map + plan only — no code, no migration — reviewed by Adam + Claude before build.**

## Locked requirements (from Adam)
- **Model:** bespoke document per surface, each its own purpose-built layout. A **shared branded shell**
  (letterhead: artist + tour name, logo, tour dates) wraps a **per-surface body**.
- **Format:** branded **PDF**, send-ready.
- **Four surfaces + their shapes:**
  1. **Budget** — a **summary P&L page + full line-item detail** behind it. Columns are a
     **toggle at export time: Projected / Actual / Both+Variance** (default Both+Variance).
  2. **Payroll** — a **master run sheet** (every person: role, rate(s), days, total, grand total) **+
     per-person individual statements** (one page each, hand-out).
  3. **Rooming** — **standard hotel rooming-list format** (per hotel + date range: guest · room type ·
     check-in · check-out · nights) — the doc you email a hotel.
  4. **Routing** — **dates / cities / venues** (the tour routing), with an **optional per-day advance
     summary**. **NOT daysheets/MasterTour** — Adam uses MasterTour for daysheets; don't build those.
- **Build order: Budget → then Rooming / Payroll / Routing.**

## ⛔ Stage A — MAP ONLY → `EXPORT_MAP.md`
1. **PDF architecture — recommend one.** `puppeteer-core` + `jspdf` are already deps. Map the trade-off and
   recommend: most likely **HTML template → PDF via `puppeteer-core`** (a branded HTML shell gives precise
   letterhead/print control + reuses the app's tokens) vs `jspdf` (programmatic, harder layout). Note the
   **rider-pack → Google Docs** export (`/api/rider-packs/[id]/export/google-doc`) is a **different
   pattern** — don't conflate; this is server-rendered PDF. Define where generation runs (a route per
   surface, e.g. `/api/budget/[tourId]/export/pdf`) and how the file is returned/downloaded.
2. **The branded shell.** Map the letterhead inputs — **artist name, tour name, tour dates, logo**. **Find
   where a logo would come from** (is there an artist/workspace logo upload today? If not, flag it as a gap
   + propose the minimal add). The shell is shared; each surface supplies a title + body.
3. **Per-surface data source + exact fields** (name the real tables/functions; flag anything missing):
   - **Budget:** `computeBudgetPnl` (the P&L summary + `incomeBreakdown`) for the summary page; the line
     items (`budget_line_items` + sections, `budget_income`) for detail. Map how the **Projected/Actual/
     Both** toggle selects columns (it already exists in the model — projected vs actual). Respect per-show
     currency (216) + the tour currency conversion.
   - **Payroll:** `personnel_rates` (`show_rate`/`off_rate`/`rehearsal_rate`/`rate_type`) + the per-person
     day counts. Map the run-sheet rows + the per-person statement page. Note currency.
   - **Rooming:** the canonical **room** entity (migration `051`: `check_in_at`, `check_out_at`,
     `room_type`) + the budget rooming (`nights`, `room_type`, 017) + the guest (person) + hotel. Confirm
     the standard-format fields all exist (guest · room type · in · out · nights, grouped by hotel/date).
     Flag any gap (e.g. is "hotel" a first-class field or free text?).
   - **Routing:** the `routing` table (date, city, venue, address, capacity, day_type). Map the columns for
     the routing doc + what the **optional per-day advance summary** would pull (and from where).
4. **Export trigger UX.** Map where the export button lives per surface and the options dialog (Budget's
   Projected/Actual/Both toggle; any date-range/scope choices). One consistent entry pattern.
5. **Blast radius + open decisions.** List what each doc reads; flag fields the app doesn't capture yet
   (logo, possibly hotel-as-entity); surface open decisions (e.g. multi-currency on the P&L PDF; page size
   A4 vs Letter; whether Payroll statements are one PDF or a zip). Confirm no regression risk — export is
   **read-only** over existing data.

Surface the PDF-architecture recommendation + the logo-source gap + the per-doc field maps with
recommendations. **Then stop. No code.**

## Hard rules
- **Branch off `main`. Commit the map + PUSH. Confirm `git log origin/<branch>` before reporting.**
- Stage A is a doc — name real files/tables/lines.
- Export is **read-only** — it must not write or mutate budget/rooming/payroll/routing data, and must
  respect workspace RLS (a user only exports their workspace's tours). Financial/PII docs → no data leak
  across workspaces.
- Build order is **Budget first**; the map should make Budget the most detailed section so Stage-B can
  start there.
