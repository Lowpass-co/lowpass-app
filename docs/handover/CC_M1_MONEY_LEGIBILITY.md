# CC — M1: MONEY LEGIBILITY + SETTLEMENT. SINGLE OWNER, BANK-PER-STAGE, PUSH EVERY BANK (Vercel usage is constrained — "banked" = pushed = deployed, raw git evidence per the hard rule).

Competitive context: `docs/design/COMPETITIVE_GAMEPLAN_ATOM_2026-07-19.md` Part 1 §3–§5, Part 3 §M1. The engine is proven (reconcile 64/64 · fees 15 · provenance 18 · FX greps 0); this stage makes that rigour VISIBLE and gives settlement the surface it deserves. Adam's verdicts driving this: "our excel approach is better" (keep grid editing), "the settlement is great" (ATOM's — match it), "the way they break up the budget is also nice."

**Topology first, per house rules:** before writing code, map and report (files:lines) the current settlement schema + route (`api/budget/settlement/`), the budget-line provenance fields (income-actuals pass), and the deal-memo entity's deal fields. Do NOT invent parallel structures — every addition below hangs off the existing single money path. If anything below conflicts with what you find, STOP and flag it, don't improvise.

## Stage M1-A — Provenance chips + data-health banner (presentation only)
1. **Chips on budget lines.** Every line in the Budget expenses/income grids gets a small right-aligned chip: `Auto` (derived — payroll sync, gear sync, settlement cascade, intake), `Manual` (hand-entered), plus the existing FX-lock indicator where a row has a locked rate. Source = the provenance fields you mapped; if a line's provenance is genuinely unknowable, no chip (never guess). Chip styling: 10px caps, neutral surface, NOT orange (hue budget — orange is act/selected). Tooltip names the source ("Synced from Payroll — Ben Quinton").
2. **Data-health banner** on the Budget summary: "N items to review" with expandable list — derivable checks only: shows past date with no settlement · income lines with no FX rate where tour currency ≠ line currency · payroll people with zero rate but assigned days · budget lines flagged duplicate (the existing dupe detector). Each item deep-links to its fix surface. Neutral warning treatment (amber hairline, not red — planning-neutrality rule from the wince fix stays). No new tables — computed server-side at load.
Smokes MON-01 (chips render, tooltip names source) · MON-02 (banner items deep-link).

## Stage M1-B — Settlement build (the arena flip; schema + harness-first)
Map first, then extend. Target surface: the settlement tab/page per show.
1. **Migration** (next free number — verify ≥241 across main + branches; idempotent; down-block; delivered as paste-SQL, WAIT for Adam's "pasted"):
   - `settlement_deductions`: id, workspace_id, settlement/show FK (match existing schema's grain), kind enum (`withholding | tax | venue_cost | commission | other`), label, amount, currency, created_at.
   - `settlement_payments`: id, workspace_id, same FK, method enum (`wire | check | cash | ach`), amount, currency, paid_on date, note.
   - `full_and_final boolean default false` on the settlement grain.
   - Backfill: existing single `deductions` value → one `other` row ("Migrated deductions"), guarded so re-run is a no-op.
2. **HARNESS FIRST (hard gate):** extend the reconcile harness with fixtures proving (a) sum(itemized deductions) reproduces the legacy single-number totals exactly for migrated rows, (b) a multi-line case (withholding + venue cost) flows to the same net the engine reported before with the equivalent single value. Green BEFORE the engine reads the new table. Report fixture names + pre/post totals verbatim.
3. **The Walk panel** — right side of the settlement surface, computing live: Guarantee → − Withholding/deductions (itemized) → Adjusted gross → − Show expenses → **Show net** → + Bonus/overage → **Artist total** → − Deposit received → **Balance due**. Mono numerics, 18px totals, labels 11px caps, tour currency. This is the money moment — build it to the card grammar (one accent max; negative rows red per hue budget's "red = negative variance" rule).
4. **Payments + Full & Final**: log payments (method chips), outstanding = balance − payments; Full & Final checkbox marks the show settled-paid and is the state the catch-up queue clears on.
5. **Catch-up queue** on the Budget/settlement landing: "N shows played, not settled" — checkbox list (date · venue · city), batch "Mark settled" for zero-variance shows, per-row link into the full settlement surface. Feeds the same derivation as the M1-A banner (one check, two consumers — no duplicate logic).
6. **Settlement PDF** through the shared export shell: the walk, itemized deductions, payments, Full & Final state. One show per document.
Smokes SET-01..05 (walk math vs harness fixture · itemized rows persist · payment reduces outstanding · F&F clears queue · PDF renders walk).

## Stage M1-C — Payroll: inline rates + Finalize
1. **Rate inline in the days-matrix left block**: under name·role meta, the person's effective rate in mono 12px ("£300/day" · "£4,500 flat"), from the rates SSOT read path — the matrix answers "what is this cell worth" without opening the rates disclosure (Adam: "rates need to be obvious").
2. **Finalize**: a per-tour payroll lock. `payroll_finalized_at` timestamp (nullable) — same migration as M1-B to keep to ONE paste. When set: rates + day cells read-only, banner "Finalized <date> — Unlock to edit" (unlock = admin-gated, clears timestamp, logged). Fill-all / brush / writeRates paths all respect the lock server-side (guard in the API, not just UI). No pay-math change — harnesses must stay green untouched.
Smokes PAY-15 (inline rate matches SSOT) · PAY-16 (finalize blocks a PATCH server-side, unlock restores).

## Report
Per stage: topology map first (M1-B), files+lines, harness output verbatim (M1-B), screenshots of chips/walk/queue at 1440+1920, smoke IDs, and the two raw git commands. Cowork walks ONCE after the final bank (usage constraint) — make your self-verification evidence strong enough to stand alone.
