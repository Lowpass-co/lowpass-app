# CC — #21 Riders + #18 Payroll restructure. One run, two parts. Off `main` (a03d936, current).

Two independent surfaces, both branch off `main`. Do Part 1 then Part 2. Don't stop between; floor green +
commit + push each; smoke at the end.

> ## ⚙️ PROTOCOL
> Check the cited files first (cite file:line) → build → floor green (tsc 0 · eslint 0 · `next build --webpack`)
> → commit + PUSH → continue. Tokens only. **Part 2 touches money-adjacent surfaces — do NOT change the fee
> math** (`src/lib/payroll/fees.ts` `computeTotalFee`/`computeTotalPerDiem` are the tested single source; this
> is a LAYOUT + consolidation + chrome pass, not a math change). Stop only on a real invariant risk.

## PART 1 — Riders: fold the manager into the click-open rider. Branch `feat/revamp-riders`.
Adam: the rider **manager** (the packs list / management) is "blocky and old looking and seems unnecessary —
build it into the rider menu that opens on click."
1. **Map first:** the Riders surface — the packs list (Pack · Status · Recipient · Last sent · Updated + the
   `…` menu) and the rider detail that opens on click (sections / Edit template). Cite the components.
2. **Restyle the packs list** to the Phase-1 chrome (sits on the page, not a boxed table; tokens).
3. **Fold the management actions** (rename, status, recipient, send, delete — currently the `…` menu / the
   separate manager) INTO the rider detail panel that opens on click, so managing a pack happens in the same
   place you open it — not a separate blocky surface. Keep the list as the index; the detail owns management.
Smoke: open a rider → its status/recipient/send/delete live in the detail; the list reads as Phase-1 chrome.

## PART 2 — Payroll: two-grid Rates/Summary + kill the duplicate. Branch `feat/revamp-payroll` off `main`.
Absorbs #15 (header formatting). Grounded in the mapped rate model:
- **Canonical rate card = `personnel_rates`** (show_rate/off_rate/rehearsal_rate/per_diem/advance_fee +
  internal_rate admin-only). `computeTotalFee` (`fees.ts:58`) is the single source — **do not touch it.**
- **The dangling duplicate:** `tour_personnel.rate_amount/currency/period` (mig 050) — the simple "Rate" field
  in `PersonnelManageSlideOver.tsx:339-369`. Payroll IGNORES it entirely. It's the confusing third surface.
- Rates are editable in TWO real surfaces today, both writing `personnel_rates`: `PersonnelRatesSection`
  (the slide) + `PayrollRatesSpreadsheet` (the grid).

### 2a. Two-grid Rates/Summary page (Adam's proposal)
Collapse the confusing Rates&totals / Summary tabs into ONE page with **two grids**:
- **Rates grid** (editable): rows = people (grouped by person_type: Principal / Band / Crew), columns = the
  rate types (Show / Off / Rehearsal / Per diem / Advance; internal_rate admin-only) — clearly editable.
  Writes `personnel_rates` via the existing `/api/budget/personnel-rates` PATCH.
- **Summary grid** (read-only, above or below): per-person day counts (show / off-travel / rehearsal) +
  Total fee + Total PD + grand total — from `computeTotalFee`/`computeTotalPerDiem` (unchanged).
- Keep the **Days matrix** as its own view (it's the per-day day-type input; feeds the counts).
- Fix the **header formatting** (canonical grid header treatment) and Phase-1 chrome (de-box — "part of the
  page not a window"). Make the editable-vs-computed distinction obvious.

### 2b. Single source of truth — kill the duplicate (the SSOT decision — Adam, veto if wrong)
Adam: "why can I edit rates in two places? they should be in the rates bit." Assumed direction (confirm):
**payroll owns rate editing; the personnel slide stops editing rates.**
- **Remove** the dangling `tour_personnel.rate_amount/currency/period` simple-rate field from
  `PersonnelManageSlideOver` (it writes nothing payroll reads). Migration to drop the columns is optional —
  at minimum stop rendering/writing them.
- Make `PersonnelRatesSection` in the slide **read-only** — display the person's rates with an "Edit in
  Payroll" link — so there's ONE edit surface (the payroll Rates grid). (Don't delete the display; TMs want to
  SEE a person's rate on their card.)

### 2c. DEFERRED — extensible/user-defined rate types (money-critical; NOT in this build)
Adam wants to "add more rate types." Today the four rates are **hardcoded columns**; adding a type means a
schema column + a `fees.ts` change + every reader (budget, exports, artist-summary). That's a real decision:
- **(b1)** add a few more fixed rate-type columns (quick, still not user-definable), OR
- **(b2)** a proper extensible model (a rate-type catalog + a `personnel_rate_lines` table), which redesigns
  the fee calc + touches money across payroll/budget/exports.
**Do NOT build this in this run.** Show the existing rate types well (2a). Flag b1-vs-b2 for Adam — it needs a
migration + a fee-math change + sign-off, as its own gated piece.

Smoke: Rates grid edits save to `personnel_rates` and the Summary totals match `computeTotalFee` (node-verify a
sample against `fees.test.ts` numbers — proves the math is untouched); the slide shows rates read-only (no
double edit, no dangling simple rate); headers + chrome match the app.

## Final
Each part its own branch off `main`, commit + PUSH, report hash + the click-tests + confirm `fees.ts` untouched
(diff it). Flag the SSOT direction (2b) and the b1/b2 rate-type decision (2c) for Adam.
