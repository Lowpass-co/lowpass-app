# Cowork walk — M1: Money legibility + Settlement

**Status:** M1-A / M1-B / M1-C all built, floor-green, harness-green, pushed to `main`
(deployed). Migration **243 is pasted** (confirmed by Adam). This is the ONE walk for
the whole stage — please walk every smoke below and grade.

**Deployed HEAD:** `6aab5ce` (the 8 M1 commits are listed at the bottom).

**What I could NOT self-verify (why this walk exists):** anything requiring an
authenticated running app — the visual layout of the chips / banner / Walk panel /
finalize bar, and the actual PDF render. The money **math** is already proven by
harnesses (see below), independent of this walk.

---

## Money is proven before you start (verbatim)

```
settlement reconcile: 21 checks passed — itemized Walk reproduces legacy net EXACTLY.
payroll fees: 15 checks passed
payroll reconciliation: 64 checks passed — engine reproduces legacy EXACTLY.
```

Run them yourself if you want:
```
node --experimental-strip-types src/lib/settlement/reconcile.harness.ts
node --experimental-strip-types src/lib/payroll/fees.test.ts
npx tsx src/lib/payroll/reconcile.harness.ts
```

---

## M1-A — Provenance chips + data-health banner  (docs/smoke-tests/budget.md)

**MON-01 — chips.** Open Budget → **Expenses** grid. Every line has a right-aligned
neutral chip (10px caps, NOT orange): `Auto` on derived lines (payroll/gear/rooming
sync), `Manual` on hand-entered. Hover `Auto` → tooltip names the source ("Synced
from Payroll"). A line with a settlement-locked FX rate also shows an `FX` lock chip.
Switch to **Income** → **Actual** view: same chips (`Auto` = `actuals_source=settlement`,
`Manual`, `FX`). `/grid-demo` shows NO chips (correct — it sets neither flag).
→ **Screenshot the Expenses grid with visible Auto/Manual/FX chips at 1440 + 1920.**

**MON-02 — data-health banner.** Budget → **Summary** tab. If the tour has issues, an
**amber** (not red) "N items to review" banner sits above the dashboard. Expand it:
each check — past shows not settled · income lines with no FX rate · assigned people
with no rate · possible duplicate lines — has a "Fix →" deep-link to the right surface.
A fully-healthy tour shows no banner.
→ **Screenshot the expanded banner.**

---

## M1-B — Settlement Walk  (docs/smoke-tests/settlement.md)

Open **Budget → Settlement** (`/budget/[tourId]/settlement`). Left = shows list /
catch-up queue (past shows not Full & Final flagged **Due** amber; settled ones
**Settled** green). Right = the selected show's **Walk**.

**SET-01 — Walk math.** Read down: Guarantee → (− Deductions) → **Adjusted gross** →
(− Show expenses) → **Show net** → (+ Overage) (+ Merch) → **Artist total** → (− Deposit)
→ **Balance due** → (− Payments) → **Outstanding**. Key totals mono 18px, labels 11px
caps, negatives **red**. A show with only a legacy single deductions value still walks
correctly (shows a "Legacy value — add itemized lines" note until you itemize).
→ **Screenshot the full Walk at 1440 + 1920.**

**SET-02 — itemized rows persist.** Add a deduction (pick a kind + amount), a show
expense, a payment. Reload — all persist; the Walk recomputes. (First add auto-creates
the settlement row.) Deductions Σ is pushed into `reconciled_deductions`, so the
income P&L stays consistent.

**SET-03 — payment reduces Outstanding.** Note Balance due. Log a payment → Outstanding
drops by that amount; the payment shows a method chip (Wire/Check/Cash/ACH) + date.

**SET-04 — Full & Final clears the queue.** Find a **Due** past show, open it, tick
**Full & Final** → it flips to **Settled** and drops from the M1-A banner's
"N shows not settled" count (same derivation feeds both).

**SET-05 — PDF.** Click **Export PDF** on a show → a branded one-show settlement PDF
downloads (letterhead + the full Walk + itemized rows + Full&Final chip). One show per
document. → **Save the PDF and attach it.**

> Note: the legacy day-of/reconciled entry + files live under a "Day-of / reconciled
> details & files" disclosure below the Walk — intentionally kept until this walk
> confirms the Walk surface, then it can be retired.

---

## M1-C — Inline rate + payroll finalize  (docs/smoke-tests/operations.md)

Open **Operations → Payroll**.

**PAY-15 — inline rate.** In the days-matrix left block, under each person's name·role,
the effective rate shows in mono (`£300/day`, `£4,500 flat`, `£1,000/wk`, `£40/day PD`)
— read from the rates SSOT, no need to open the Rates disclosure.
→ **Screenshot the matrix left block showing rates.**

**PAY-16 — finalize lock (SERVER-SIDE — grade this carefully).**
1. Click **Finalize payroll** → an amber "Finalized <date> — read-only" bar appears;
   the matrix paint/fill and the rates grid go read-only in the UI.
2. **The important part — prove the server enforces it, not just the UI.** With the
   tour finalized, hit the write APIs directly (or via devtools) and confirm **409**:
   - `POST /api/budget/payroll` → 409 "Payroll is finalized…"
   - `PATCH /api/budget/rate-lines` → 409
3. **Unlock is admin-only:** as a non-admin, `DELETE /api/tours/[id]/payroll/finalize`
   → 403. As admin → clears the lock, writes flow again.
→ **Screenshot the finalized bar; paste the 409 + 403 responses.**

---

## Grading rubric

- **PASS math** = the three harness lines above are green (already are) AND SET-01's
  on-screen Walk totals match a hand-check on one real show.
- **PASS finalize** = PAY-16 step 2 returns **409 server-side** (UI-only would FAIL).
- **PASS visuals** = chips/banner/Walk/finalize-bar render per the screenshots asked
  for, negatives are red, chips are neutral (never orange).

If anything fails, name the smoke ID + the exact observed vs expected, and (for math)
paste the show's numbers so I can add a harness fixture.

---

## The 8 M1 commits (all on `main`, deployed)

```
6aab5ce feat(M1-B): settlement PDF via shared export shell (SET-05) — M1 complete
246b8fd feat(M1-C): inline payroll rate + server-side finalize lock
0a91a38 feat(M1-B): settlement Walk surface (the arena flip)
de68c8e feat(M1-B): settlement itemization engine — lines CRUD + Walk loader
0b54526 feat(M1-B): settlement Walk math + reconcile harness (hard gate, green)
9fb5b26 feat(M1-A): data-health banner on Budget summary (+ shared derivation)
29296ec feat(M1-A): provenance chips (Auto / Manual / FX-lock) on budget grids
f7f6c37 feat(M1-B): migration 243 — settlement itemization + finalize (paste-SQL)
```

Floor on every bank: `tsc --noEmit` 0 · `eslint` 0 errors on changed lines ·
`next build --webpack` green. Migrations ≥200 idempotent (243). No pay-math touched —
`fees.ts`/`reconcile` untouched, harnesses green throughout.
