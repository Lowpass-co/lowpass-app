# CC — Payroll Stage B: GO (D1–D7 answered)

`PAYROLL_MAP.md` reviewed and **spot-verified against source** (`fees.ts`
`computeTotalFee`; grep for the PDF path). The map is accurate. Headline: the
**OPS-17 fee-math split is already correct** — Stage B re-verifies it, does NOT
rewrite it. This is a restructure (rail flip + rates re-skin + rate-card slide) +
the proving smoke.

## Decisions

- **D1 — OPS-17 base math: RE-VERIFY, don't re-write.** Confirmed: `fees.ts`
  splits by day type with no show-rate fallback (the header even cites the OPS-17
  example). Stage B's only fee-math deliverable is landing **PAY-OPS17** (the
  smoke proving Richie $4,611 · Duncan $1,607 · Jake $2,250 · Adam PD $167).
  **Do not touch `computeTotalFee`.**
- **D2 — `acl_per_diem` festival override: DEFER.** It needs a per-date per-diem
  path (`computePerDiemByDate`) threaded through displays + POST + reconcile — a
  real change to the fee contract that deserves its own verify pass, and the
  restructure doesn't depend on it. Ship it as a **focused follow-up**
  (`CC_PAYROLL_ACL.md` later), NOT in this build.
- **D3 — per-diem on rehearsal days: KEEP** `active = show + offTravel + rehearsal`
  (rehearsal is a worked day → earns PD). The design-doc's `(show + off_travel)`
  was a simplification of the verified (rehearsal-free) case. No code change;
  I'll fix the design-doc formula to include rehearsal.
- **D4 — Rates & totals grid: keep `<SpreadsheetGrid>`, RE-SKINNED to canonical
  parity.** The overhaul's goal is a consistent *look + shared primitives*, not
  literally one React component (rooming's matrix + channel's editor aren't
  `<Grid>` either). So keep `<SpreadsheetGrid>` (it already has rate editing,
  section gutter, admin gate) but **re-skin it so it's visually indistinguishable
  from the budget `<Grid>`** (raised panel, section gutter, tokens, row/cell
  styling). Add the explicit columns (show · off/travel · per-diem rates · show
  days · off/travel days · total fee · total PD · advance · notes). **If
  `<SpreadsheetGrid>` genuinely can't reach visual parity with `<Grid>`, stop and
  flag it** — we'll reconsider porting. Default landing view.
- **D5 — Days matrix rail flip: YES.** Reuse the rooming pattern: `RailNightCell`
  as the sticky left column, people across the top, day-type cells (show /
  off_travel / no_tour), **grouped by week** (week-divider rows, since payroll is
  week-grained). Day axis = **ALL routing dates** (incl. no_tour — shown, pays
  nothing) — NOT rooming's nights-away filter. Tokenise the day-type colours (the
  current hardcoded Tailwind emerald/amber/grey is a token violation — fix it).
- **D6 — Branded PDF: NOT built.** Grep confirms no payroll-PDF code; only the
  `payroll-pdfs` bucket + `artists.brand_color` exist (unused). Nothing to
  preserve — don't worry about a PDF path. (Branded payroll PDF is a future build,
  likely alongside the export tool. Leave the bucket/column untouched.)
- **D7 — The 3 views: CONFIRMED.** Rates & totals (default) · Days matrix (week
  rail) · Summary (kept as-is) · + the **Person rate-card slide**
  (show/travel/per-diem/advance editable, internal_rate admin-gated).

## Must stay intact (from the map)
- The fee math (`fees.ts`) + all four call sites stay equal — don't fork it.
- The **budget Salary/Per-Diem reconcile** (`reconcileDerivedLines.ts`) — per-person
  lines recompute from `day_statuses` via the same helper; PAY-05 verifies it's
  unchanged.
- **`internal_rate` admin gating** (server is the real gate; UI hides) — the
  rate-card slide reuses the existing gate; keep it out of any all-staff grid.

## Build order
1. Days matrix on the shared rail (`RailNightCell`, week-grouped, all dates,
   tokenised day-type cells). Persist via the existing `POST /api/budget/payroll`.
2. Rates & totals — re-skin `<SpreadsheetGrid>` to canonical parity + the explicit
   columns. Default view.
3. Person rate-card slide.
4. Keep `PayrollSummary`. Land **PAY-OPS17** + PAY-01…06 smokes.

## Hard rules
- Tokens (fix the hardcoded day-type colours); `next build --webpack`; tsc 0;
  eslint 0; don't regress the budget Salary feed, internal_rate gating, or the
  fee math. Verify before claiming. I Chrome-verify PAY-OPS17 (fees vs the sheet),
  the rail flip, the rates re-skin (parity with budget), and the budget feed.
