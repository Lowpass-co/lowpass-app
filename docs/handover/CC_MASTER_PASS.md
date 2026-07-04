# CC — MASTER PASS (SINGLE OWNER ONLY). Consolidate → converge rates → unify FX → salvage fixes → nav fixes. Strict stage order.

> **STATUS 2026-07-04:** STAGE 0 COMPLETE at local `main` `771ab56` (13 ahead of origin; recovery + consolidation + branch prune 150→28 done; CLAUDE.md updated). The concurrent-writer detected during Stage 0 was the Cowork design session writing docs — identified and stopped; it stays read-only during CC passes. **Execution mode is now ONE STAGE PER SESSION**: complete the named stage to its full gates, report, STOP. At the start of the next session: `git status` must be quiet except for explicitly named files; if anything else is dirty, stop and report before touching code. **PUSH POLICY (amended 2026-07-04, supersedes "push only at the very end"):** bank every floor-green, gate-verified commit to `origin/main` at session end. Never push mid-chunk or with any gate red. Rationale: unpushed local `main` on this machine is a single point of failure (crashed sessions, hung merges already on record).

**Precondition: NO other CC/agent session active on this tree.** You are on Adam's machine with full git. Do NOT run `npm run db:migrate` (never used — migrations are hand-pasted by Adam). Collect every migration you produce into a final "ADAM PASTES THESE, IN THIS ORDER" list.

**Global gates — after EVERY stage:** `tsc --noEmit` 0 · `eslint` 0 · `next build --webpack` green (never Turbopack). Commit per stage (small, revertable). Push `main` ONLY at the very end, all stages green.
**Stop rules:** money gate fails → STOP, report, do not continue. A stage's spec assumption turns out false → STOP that stage, report the exact tension, continue to the next INDEPENDENT stage only if it shares no files.
**Verify before claiming (hard rule, every stage):** name file + line ranges for every change; open your own diff before reporting a stage done. The report lists anything you did NOT do.

Detail specs live in `docs/handover/` — read each spec IN FULL when you reach its stage. Decisions below OVERRIDE any "default assumption" inside a spec.

---

## STAGE 0 — Consolidation (per `CONSOLIDATION_2026-07-03.md`)
1. On `feat/data-integrity-pass`: commit the modified `CLAUDE.md` as its OWN commit (revertable), then commit the 17 untracked files (migration `232_fix_day_rate_ssot_seed.sql` + 16 handover docs).
2. `git checkout main && git merge feat/data-integrity-pass` — expect fast-forward. If NOT ff-able, STOP and report (something moved on main).
3. Delete `feat/rates-ssot-part-a` (content-contained in dip — verified) and `feat/rates-ssot-and-rider-features` (merged).
4. `git branch --merged main | grep -vE '^\*|main' | xargs -n1 git branch -d` (`-d` is safe — refuses unmerged).
5. Do NOT delete: `fix/connection-hydration-touch`, `claude/thirsty-swartz`, `feat/nav-redesign-artist-tour-hubs`, `feat/sprint-11-closeout`, `fix/advance-status-tokens` (salvage sources for Stage 3; Adam deletes after this pass lands).

## STAGE 1 — Rates convergence (execute `CC_RATES_CONVERGENCE.md` in full)
Money gate: reconciliation harness reproduces `fees.test.ts` exactly (Richie 4610.63 / split 1606.62 / flat 2250 / rehearsal 500 / per-diem 90). Grep gate output pasted in report. 231.HOLD stays HOLD.

## STAGE 2 — FX unify (execute `CC_FX_UNIFY.md` with this DECISION, which supersedes the spec's default)
**Adam's rule: "live until a transaction is entered, then lock" — per-row lock at actualization:**
- Projected/estimated amounts convert at the tour's current stored rate (`budget_fx_rates`, admin-refreshable from live via the existing exchange-rate route, which becomes "fetch → upsert budget_fx_rates").
- The moment a row is ACTUALIZED (expense: transaction entered / actual_cost first set; income: actual entered or settlement), capture the tour rate at that moment into a `locked_fx_rate` column on that row. All subsequent reads of that row use its locked rate, never the live one.
- Income already has `budget_income.locked_fx_rate` (migration 225) — keep it, align its write-trigger to "first actual", not only settlement, if they differ. Expenses need the new column: migration **234** (idempotent, down-block) adding `locked_fx_rate` to the expense-actuals row table — determine the correct table from how transactions attach to `budget_line_items` and say so in the report.
- Lock uses the STORED tour rate at entry time (deterministic, auditable) — never a silent live fetch.
- Delete `src/lib/budget/fx.ts` (static table). Grep gate: zero `RATES_VS_GBP` / `from '@/lib/budget/fx'` hits.
Money gate: old-vs-new P&L diff on one multi-currency test tour, per-line explanation of why every changed number is now right.

## STAGE 3 — Salvage fixpack (execute `CC_SALVAGE_FIXPACK.md` in full)
Item 4 (routing-save advance guard) requires line-level proof either way — the Stage-0 merge contains the Part 1/2 cascade fixes; verify whether advance_instances are covered. Skip the optional "Today button" — list it as not done.

## STAGE 4 — Nav & entry fixpack (execute `CC_NAV_ENTRY_FIXPACK.md` with these DECISIONS)
- Tour default product — CORRECTED by live UX walk (see `UX_WALK_2026-07-03.md` §Correction): the tour card SELECT-then-banner behavior is correct, KEEP it. Apply **last product used per tour** (localStorage `lp:lastProduct:<tourId>` written by ProductShell on mount, fallback `/operations/[tourId]`) to the affordances that hardwire Budget: trace every call site of `TourPicker.tsx openTour()` and the workspace "Resume …" link, and fix THOSE.
- `/gear`: verify-then-delete — enumerate what `/gear` renders that the Equipment workspace tab does not. If nothing, delete the page; if something, leave it and report the gap.
- Dev sandboxes: gate behind `getUserAndAdminStatus()` (mirror `bugs/page.tsx`) — do not delete.

## STAGE 5 — Income actuals provenance (decision: MANUAL WINS, settlement confirms to override)
Migration **235** (idempotent, down-block): provenance marker on `budget_income` actuals (`actuals_source` `'manual' | 'settlement'`, nullable = untouched). Wire:
- Manual grid edit (`BudgetIncomeGrid.tsx:299-303` → `api/budget/income`) sets `'manual'`.
- Settlement cascade (`api/budget/settlement/route.ts:240-329`) writes rows whose source is NULL or `'settlement'`; rows marked `'manual'` are SKIPPED and returned as a conflict list `{routing/show, field, manual value, settlement value}`.
- Settlement UI surfaces the conflict list with an explicit per-row "overwrite with settlement value" confirm (sets source back to `'settlement'`).
Keep it minimal — no history table, no audit log this pass.

## STAGE 6 — UX-walk mechanical fixes (`UX_WALK_2026-07-03.md` §A, items 1-7 only — §B/§C are OFF-LIMITS)
1. Off-by-one dates in Operations summary "Upcoming Shows" (UTC-shift; routing + advance render correctly — fix is localized to the summary widget's date parsing; align it with how routing renders dates).
2. "Next show" pickers must select the first `Show Day` row, not the first routing row (workspace artist card, artist stats, ops SHOWS stat).
3. Advance header show-count: "11 shows · 24 days", never routing-rows-as-"shows".
4. Workspace + artist activity feeds: render the actor (data exists — Operations feed shows it) or remove the column.
5. Replace "left rail unlocks" copy on the artist-home pick-a-tour panel (rail is retired; reference the bar above).
6. Rename the "ACTIVE TOURS" stat to disambiguate from the "ACTIVE TOUR" (selected) banner — use "ON TOUR NOW", and show planning count when 0.
7. Aggregate money stats (workspace £175K vs artist $16K) must label display currency + scope; use one declared workspace display currency, converted via Stage 2's `getFxRate` — no mixed symbols across tiers.
Each item: name the component file you changed; before/after screenshot or rendered-value note in the report.

## EXCLUDED from this pass (do not touch, even if tempting)
Venue SSOT redesign (decision recorded: live-reference until show day then freeze — future spec) · `CC_HYGIENE_PASS.md` (separate later session) · porting `/tours/[id]/*` legacy pages (Phase 4) · the 29 canonical-entity read violations · applying 231.HOLD.

## FINAL REPORT
Stage-by-stage: files+lines changed, gate outputs (grep gates, money gates verbatim), conflicts/tensions hit, what was skipped. Then: (1) "ADAM PASTES THESE, IN THIS ORDER" — full SQL of 234 + 235 (232 is already applied? CHECK `232_fix_day_rate_ssot_seed.sql`'s header/status with Adam in the report — do not assume). (2) One consolidated smoke list: RATE-01..05, BUD money IDs, INT-01..06, NAV click-paths, hydration/#418 repro, settlement-conflict flow. (3) Branch-deletion list for Adam (salvage branches, post-verification). Push `main`.
