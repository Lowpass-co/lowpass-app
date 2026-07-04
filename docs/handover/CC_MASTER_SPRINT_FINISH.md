# CC — MASTER SPRINT: finish the master pass (Stage 1-B → Stage 6) in ONE LONG SESSION. SINGLE OWNER.

Adam's call: one long sprint, smoked and verified at the end. The discipline that makes this safe is **BANK-PER-STAGE**: every stage hits its OWN gates → commit → push `origin/main` BEFORE the next stage begins. A red gate stops the sprint at the last green push — never push red, never blend stages in one commit set. If the session runs out mid-sprint, stop at a stage boundary and report which stages remain; the sprint is resumable.

Preconditions: `git status` quiet; `origin/main` = local `main` (push the banked state if behind). The Cowork design session is read-only for the duration. `231_….sql.HOLD` stays HOLD throughout. Do not touch anything from `CC_DESIGN_PASS.md`.

Read each referenced spec IN FULL when you reach its stage. Decisions below OVERRIDE spec defaults. Floor gates at every stage: `tsc --noEmit` 0 · `eslint` 0 · `next build --webpack` green (never Turbopack).

---

## PART 1 — Channel-list fixpack (Adam's direct request; own commit, push first)
1. Full keyboard tab order across the channel-list editor grid; make EVERY dropdown cell type-searchable the way the mic column already is — find the mic column's combobox pattern and replicate (stand, DI, stage box, all select cells).
2. Typing in the IO/column customiser triggers a full page reload — diagnose root cause (likely unguarded form submit on Enter, or onChange → router.refresh()/server action) and fix. Name the exact cause in the report.
3. "Add column" click also reloads — same diagnosis discipline (button missing `type="button"` in a form / form-action navigation). Fix.
Constraints: UI behavior only, no schema/data-write changes, autosave preserved. Commit `fix(channel-list): keyboard nav + no-reload customiser` → push.

## PART 2 — Stage 1, Checkpoint B (closes Stage 1)
Per `CC_RATES_CONVERGENCE.md` (grep gate has TWO amendments: SSOT lib allowed; API request-DTO field names allowed, mapped once at the top of the handler):
1. Convert the ~25 reader/component files (spec SCOPE list) to read through `loadTourRateContext`/`rateLinesFor`.
2. Amended grep gate clean — paste full output in the report.
3. Update `231…HOLD`'s precondition checklist. HOLD stays HOLD.
Gates: harness verbatim 52/52 (fees.test.ts numbers exact) + floor. Commit → push. **Stage 1 complete.**

## MIGRATION GATE — the one pause
Author BOTH migration files now, per repo rules (idempotent, down-block, header comment, hand-paste model):
- **234** — per-row `locked_fx_rate` for expense actualization (determine the correct table from how transactions attach to `budget_line_items`; state your determination).
- **235** — `budget_income.actuals_source` (`'manual' | 'settlement'`, nullable = untouched).
Commit the files, then **STOP and post both SQL bodies in chat for Adam to paste into the Supabase SQL editor. Do not proceed until Adam replies "pasted."** (No runner exists; `_lp_migrations` is not maintained; this is the only mid-sprint interaction.)

## STAGE 2 — FX unify (`CC_FX_UNIFY.md`, with Adam's decision)
**Decision (supersedes spec default): "live until a transaction is entered, then lock."** Projected amounts convert at the tour's stored rate (`budget_fx_rates`, admin-refreshable via the exchange-rate route which becomes fetch→upsert into `budget_fx_rates`); the moment a row is ACTUALIZED (expense: first transaction/actual_cost; income: first actual/settlement) the tour rate at that moment is captured into that row's `locked_fx_rate` and used forever after. Lock uses the STORED rate (deterministic), never a silent live fetch. Income's existing lock (migration 225) aligns to first-actual if it differs.
Work: `getFxRate` server helper (+ preloaded-map variant for grid/export hot paths — check how `computeBudgetPnl` iterates before designing the signature) → migrate every `convertToCurrency` consumer → delete `src/lib/budget/fx.ts` → collapse `budget_settings.exchange_rate` (migration 234 handles any data movement if needed — if you find values there, say so) → missing-rate = visible warning chip, never silent GBP-pivot math → rate inspectability (tooltip/settings showing tour rates + last-updated).
**Money gate:** before touching consumers, snapshot P&L (projected + actual, per section and net) for a multi-currency fixture via a script against `computeBudgetPnl` with representative lines; after conversion, re-run and paste the old-vs-new diff with a per-line explanation of why each changed number is now RIGHT. Grep gates: zero `RATES_VS_GBP` / `from '@/lib/budget/fx'` hits — paste. Re-run the rates harness (must still be 52/52 — FX must not touch payroll math). Floor. Commit → push. **Banked.**

## STAGE 3 — Salvage fixpack (`CC_SALVAGE_FIXPACK.md`, commit per item)
Items 1–6 as specced: (1) cherry-pick `bde61aa` hydration//touch/rollback fixes — verify assumptions still hold; (2) advance-copy N+1 batched, before/after measurement; (3) layout-templates dup `template_label` write resolved (migration only if a column is dead — flag, don't auto-write another migration without posting SQL); (4) routing-save advance-instances guard — line-level proof either way (the Part 1/2 cascade fixes may already cover it → NO-OP with proof is a valid result); (5) single-artist auto-skip post-auth (reimplement the idea, don't merge the branch); (6) status-dot tokens in `AdvanceSectionBuilder` ~2862. Skip the optional Today button. Smoke IDs for items 1/4/5 in the same commits. Floor per item; push after item 6. **Banked.**

## STAGE 4 — Nav & entry fixpack (`CC_NAV_ENTRY_FIXPACK.md`, with decisions + UX-walk correction)
Decisions: tour default = last-product-used (`lp:lastProduct:<tourId>` written by ProductShell on mount, fallback `/operations/[tourId]`) applied at the ACTUAL `openTour()` call sites and the workspace "Resume …" link — the card select-then-banner behavior is correct, KEEP it (see `UX_WALK_2026-07-03.md` §Correction). `/gear`: verify-then-delete (name what it shows that Equipment doesn't; if nothing, delete). Dev sandboxes: gate behind `getUserAndAdminStatus()`, don't delete. Also: login fallback → `/artists` (composes with Stage 3 item 5), `/budget` landing + `/artists/[id]/edit` off shell-v1 (check `ArtistEditSlideOver` first), `/settings/ai-limits` linked from `/settings`, `/tours` redirect added, `/admin/ai-usage` double-chrome fixed. NAV-* smoke IDs land in `docs/smoke-tests/`. Floor. Commit per item → push. **Banked.**

## STAGE 5 — Income provenance (migration 235 already pasted at the gate)
Wire per master pass: manual grid edits set `actuals_source='manual'`; settlement cascade writes only NULL/`'settlement'` rows and returns a conflict list `{routing/show, field, manual value, settlement value}` for rows it skipped; settlement UI surfaces the conflicts with per-row explicit "overwrite" confirm (sets source back to `'settlement'`). Minimal — no history table. Verify settlement still never null-stomps (existing invariant). Floor + a small conflict-path test or scripted proof. Commit → push. **Banked.**

## STAGE 6 — UX-walk mechanical fixes (`UX_WALK_2026-07-03.md` §A items 1–7 ONLY; §B/§C off-limits)
(1) Off-by-one dates in Ops summary "Upcoming Shows" (UTC-shift; routing + advance render correctly — fix is localized; align with routing's date handling). (2) "Next show" pickers select the first Show Day, not the first routing row (workspace card, artist stats, ops SHOWS stat). (3) Advance header "11 shows · 24 days" — never rows-as-shows. (4) Workspace/artist activity feeds render the actor or drop the column. (5) "left rail unlocks" copy replaced (rail is retired). (6) "ACTIVE TOURS" stat renamed "ON TOUR NOW" + planning count when 0. (7) Aggregate money stats labeled with display currency + scope, converted via Stage 2's `getFxRate` — note: the workspace money stat is DELETED later by the design pass; if trivial, delete it now instead of fixing it (say which you did). Floor. Commit → push. **Banked. Sprint complete.**

## FINAL REPORT (one consolidated report at the end)
Per stage: files+lines, gate outputs VERBATIM (harness lines, grep outputs, P&L diff, N+1 measurement), root causes named for the reload bugs, conflicts/tensions hit, anything skipped or NO-OP'd with proof. Then: (a) confirmation both migrations were pasted (Adam's word) and any follow-up SQL; (b) ONE consolidated smoke list for Adam covering: channel-list keyboard/type-search/no-reload, RATE-01..05, BUD money IDs + FX behaviors (projected vs locked rows, missing-rate chip), INT-01..06, hydration//touch/rollback repros, auto-skip, NAV click-paths, settlement-conflict flow, date off-by-one checks, renamed stats; (c) final `origin/main` hash. The Cowork session will independently verify the full diff after your report.
