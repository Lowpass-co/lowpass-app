# Rates SSOT — Part A EXECUTE (discovery approved)

> Adam approved `RATES_SSOT_DISCOVERY_2026-07-03.md` on 2026-07-03. **That report is the contract.** Read it fully before writing a line. This file is only the trigger + guardrails; the seam, backfill SQL, and drop plan live in the report.
>
> Approved path: **fold-in.** A-W does phase X's job (Add-person seed re-point) AND re-points the `tour_personnel.rate_amount` / `my-schedule` crew-pay reader, in the same seam. Do NOT run a standalone phase X — it would zero new crew pay.

## Scope (exactly this, nothing more)
Canonical per-tour rate SSOT = **`personnel_rate_lines`** (report §2). Execute A-M → A-B → A-W → V.

1. **A-M — migration 230** (verify 230 is still free across main + active branches; the branch just merged, so re-check). Additive only — whatever `personnel_rate_lines` needs to be the sole runtime source. **No DROP in this migration.**
2. **A-B — backfill.** Carry report §4 query (b): seed default lines from `standard_rates` for every `personnel_rates` card that has no lines yet. Idempotent, re-runnable, **SSOT value always wins** over legacy on conflict. Emit a row-count report.
3. **A-W — cutover (the money seam, report §3):**
   - Seed: `api/tours/[id]/personnel/route.ts:343-354` seeds `personnel_rate_lines` from `standard_rates` (a1/a6←show, a2←off, a3←travel, a4←per-diem). **Stop seeding `show_rate` from `body.rate_amount`.**
   - **Phase X (folded in):** remove the Add-person "Rate (optional)" field (`AddPersonnelSlideOver.tsx:97,262,927`); rate entry's only home is the Payroll Rates grid.
   - **`my-schedule` re-point (money-critical):** `my-schedule/route.ts:191` computes crew pay from the SSOT (`computeTotals` over the person's lines × day counts), NOT `rate_amount × days`. `PersonSlideOver.tsx:70,98` surfaces the SSOT rate (read-only, or route its edit to `rate-lines`); stop writing a competing `rate_amount`.
   - Delete confirmed-dead code: `TourPersonnelDetailSlideOver.tsx` (0 importers).
   - Write the **legacy-column DROP as migration 231, WRITTEN-BUT-NOT-APPLIED** (report §5) — Adam applies after production sign-off. Never drop in the backfill migration (Hard rule 3).

## Guardrails (money — do not skip)
- **Reconcile `my-schedule` before/after.** Before re-pointing, run report §4 query (a) to capture the divergent-crew set + their current pay figures; after, prove the SSOT reproduces the intended number for a non-divergent sample and that divergent crew move to the *correct* (line-derived) figure by design. Put the before/after in the done report — do not claim parity you didn't compute.
- Cross-workspace isolation unchanged; RLS via existing helpers.
- `standard_rates` stays library-default only; never a competing runtime value.
- `tsc` 0, eslint 0 (no new warnings), `next build --webpack` exit 0.
- Do NOT apply migration 230 or 231 yourself — Adam applies via Supabase SQL editor. Hand him both, clearly labelled (230 = apply now after backfill; 231 = hold for sign-off).

## V — verify (adds to the earlier smoke; live-smoke IDs are Adam's walk)
- [ ] RATE-01 one rate per person across slide-over + Payroll grid.
- [ ] RATE-02 edit in Payroll → budget salary/PD lines match.
- [ ] RATE-03 new person seeds lines from `standard_rates`; library default untouched.
- [ ] RATE-04 backfill report: card-only people now have lines; 0 rows lost.
- [ ] **RATE-05 crew pay:** `my-schedule` pay now reads the SSOT; divergent-crew before/after reconciled and documented.
- [ ] Migration 230 applies idempotently; 231 written, unapplied.

## When done
```
Rates SSOT Part A done (discovery-approved, fold-in).
- Migration 230 (additive) + backfill: <n> card-only people seeded, 0 lost.
- Cutover: seed→lines from standard_rates; Add-person rate field removed (phase X); my-schedule re-pointed to SSOT; PersonSlideOver rate read-only. Dead code deleted: TourPersonnelDetailSlideOver.
- Crew-pay reconcile (query a): <x> divergent rows, before/after: <summary>.
- DROP migration 231 WRITTEN, NOT APPLIED.
- Adam: apply 230 (after backfill), walk RATE-01..05 live, then apply 231 after prod sign-off.
```
If reconcile shows unexpected crew-pay swings beyond the divergent set from query (a), STOP and report — that means a reader you didn't map. Verify before claiming; name the files/lines changed.
