# CC — Income Phase 3 REWRITE: the deal-aware projection engine. Stage A (MAP ONLY). Gated.

The original Phase 3 ("projected merch/VIP = $/head × cap × sellout%") was **underscoped**.
Adam's real budget (`BUDGET_REFERENCE_GAP_ANALYSIS.md`, the `ROUTING & INCOME` tab) is a
**deal-aware projection engine**. This is the single biggest "match the standard" item.
**Stage A is a map + schema/decision proposal only — no code — reviewed by Adam + Claude
before any build.** Mirror the versioning/income Stage-A discipline.

## The reference engine (the spec — per show)
**Proposed inputs:** `Cap` (venue capacity), `Est Sell-Thru %`, `Face Value` (ticket price),
`Deal type + %` (VS / PLUS, with thresholds e.g. "VS 65% @ 275"), `Withholding %`,
`Pre-tax guarantee`, merch `$/head (net)` + `avg fee %`, VIP `tickets × price`.
**Computed projections:**
- **Guarantee (post-tax)** = pre_tax_guarantee × (1 − withholding%).  *(we have the pieces)*
- **Overage** = `deal% × cap × sell-thru × face − 8% tax − guarantee(if +ve) − WH, × 0.65
  haircut`. This is the real money in a VS deal. *(we don't compute this at all today)*
- **Merch** = `cap × sell-thru × ($/head net) × avg fee %`.
- **VIP** = `tickets × price × nights`.

## ⛔ Stage A — MAP ONLY → `INCOME_P3_PROJECTION_MAP.md`
1. **Current model** — map `budget_income` proposed cols + `BudgetIncomeGrid` + the version
   overlay + `computeBudgetPnl`. What's manual today (guarantee/overage/merch/vip are
   hand-typed); where the projection would slot in.
2. **Schema** — propose the new **proposed** columns on `budget_income` (+ the
   `budget_version_income` mirror — versioning tax): `cap`, `est_sell_thru`, `face_value`,
   `deal_type`, `deal_pct`, `deal_threshold?`, merch `dollars_per_head`/`merch_fee_pct`, VIP
   `vip_tickets`/`vip_price`. Per-tour **defaults** (sell-thru, $/head, fee%, haircut, tax%)
   vs per-show overrides — recommend which live where.
3. **D-DEAL (the crux)** — how to model deal type. Propose: `deal_type ∈ {VS, PLUS}` +
   `deal_pct` + optional `deal_threshold`. Spell out how **VS** (versus = greater of
   guarantee or % of net box office) vs **PLUS** (guarantee + % over a threshold) each
   compute overage. **This needs Adam's touring-deal confirmation — surface it clearly.**
4. **D-HAIRCUT / D-TAX** — the `0.65 haircut` + `8% tax` in the overage formula: per-tour
   config (recommended, overridable) or constants? Map where they live.
5. **D-FIDELITY** — replicate the reference overage formula exactly (recommended — it's the
   standard) or a simplified variant? Flag any place the sheet's formula is ambiguous
   (e.g. the "@ 275" threshold semantics).
6. **Formula behaviour** — projections **pre-fill** the proposed guarantee/overage/merch/vip
   (the existing columns) but stay **user-overridable** (a computed default, not a locked
   value). Map how that interacts with the versioning lock (the *inputs* are proposed →
   versioned; the computed outputs write into the existing proposed value columns).
7. **Versioning tax** — every new proposed input column mirrors into `budget_version_income`
   + joins `PROPOSED_INCOME` (lock guard) + the page overlay + read-only-when-locked.
8. **Migration number** (≥217 — 216 = currency on main; verify across branches).

**Out of scope for P3 (note, don't build):** the **currency Phase 2.5** model (live FX for
projected + lock the settlement-day rate on actuals) — it's coupled but separate; flag where
it would touch this. The P&L visual refresh is **P4**.

Surface D-DEAL / D-HAIRCUT / D-FIDELITY + the defaults-vs-override calls with your
recommendation for each. **Then stop.** No schema, no UI.

## Hard rules
- **Branch off `main`. Commit to the feature branch and PUSH it. Before reporting, run
  `git log origin/<branch>` and confirm the commit is on the remote branch.** (Every recovery
  this session was this miss.)
- Don't regress: Phase 1 (settlement/deductions), Phase 2 (currency/FX), versioning lock,
  P&L parity. Stage A is a doc — name real files/lines.
