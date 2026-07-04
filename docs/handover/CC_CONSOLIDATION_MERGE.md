# CC — Consolidation merge (SINGLE OWNER ONLY). Bring all verified branches onto `main`. Then Adam migrates.

Ten verified branches are stacked unmerged off `main` (a03d936). Merge them all onto `main` in one careful
single-owner session, floor-green after EACH merge, reconcile the money math, push `main`. **Precondition: no
other CC session active on this tree** (this is what caused the collision). Do NOT run `db:migrate` (no DB in
your env) — Adam runs it after.

> Work on `main` locally. After each merge: `tsc` 0 · `eslint` 0 · `next build --webpack` green BEFORE the next
> merge (a bad merge is caught immediately, not 5 merges later). Resolve conflicts by unifying (keep both
> intents). Commit each merge. Push `main` only at the very end, once everything's integrated + green.

## STEP 0 — rescue the payroll core directly onto `main` (it's stranded)
The reconciliation-proven core lives only on `feat/payroll-rate-types`, with the discarded `804a824`
(channel-list) interleaved between its two commits. Cherry-pick the two real commits straight onto `main`,
skipping `804a824`:
`git checkout main && git cherry-pick 0bb9873 cf849ec`  (mig 228 + the `computeTotals` engine).
`804a824` is safe to drop — the channel-list work is already clean on `feat/revamp-channel-list @ 63e6595`.
Then run the reconcile harness on `main` (`0bb9873` includes `reconcile.harness.ts`; if it's still parked as
`.moved` in the scratchpad, restore it) → confirm the 5 defaults reconcile + `fees.test.ts` passes BEFORE
continuing. Abandon the empty `payroll-rate-types-clean` branch. Delete `feat/payroll-rate-types` once the
cherry-pick is confirmed on `main`.

## MERGE ORDER (onto `main`, floor-green after each)
Independent visual surfaces first (low conflict), then the money branches last so they're verified on the
integrated tree:
1. `feat/revamp-routing`
2. `feat/revamp-rooming`
3. `feat/revamp-channel-list`
4. `feat/revamp-stageplot`
5. `feat/revamp-advance-polish`
6. `feat/revamp-riders`
7. `feat/budget-summary-pershow-labels`
8. `feat/revamp-personnel`  (brings migration **227**)
9. `feat/revamp-payroll`  (two-grid Rates/Summary + SSOT — personnel slide read-only)
_(The rate-types core + migration 228 already landed in STEP 0, so there's no 10th branch — but the money gate
below still runs on the integrated tree.)_

**Expected conflicts:** the shared grid components (`SpreadsheetGrid`/`DataTable` flat/de-box prop) — several
branches touched them on top of the Phase-1 de-box already on `main`. Resolve by **unifying** (one flat prop,
all callers keep working), not by dropping either side. Note each conflict you resolved.

## MONEY GATE (after merges 9 + 10 are integrated)
Re-run the payroll reconciliation harness on the integrated `main`: the 5 default rate types must still
reproduce the `fees.test.ts` numbers exactly (Richie 4610.63, split 1606.62, flat 2250, rehearsal 500,
per-diem 90). If the merge scrambled anything, STOP and report — do not push a `main` where the money moved.
Confirm `fees.ts` on integrated main == the reconciliation-proven version.

## MIGRATIONS present after merge
`main` should now carry **227** (role_tag_band) + **228** (payroll_rate_types). Confirm both files present, no
duplicate numbers. Adam runs `npm run db:migrate` after you push.

## FINAL
Push `main`. Report: the merge order actually applied, every conflict resolved (file + how), the reconciliation
harness output, floor-green confirmation, and ONE consolidated smoke list for Adam covering all ten surfaces.
Then Adam: `npm run db:migrate`, redeploy, smoke.
