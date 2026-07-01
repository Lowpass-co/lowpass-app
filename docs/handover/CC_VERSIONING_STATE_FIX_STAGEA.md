# CC — Versioning STATE/NAV fix (critical). Stage A (map + plan only). Gated.

Adam's live use exposed that the **viewed version is not a consistent, persistent source of
truth** across the budget tabs. Symptoms:
- The version # **doesn't persist across navigation** — land on a superseded version while
  **Settings shows Draft**; the active version differs per tab.
- **Lock state is inconsistent**: V2 shows approved/locked on **Settings + Income** but **NOT
  Expenses** (Expenses seems to always show the active draft, ignoring the approved version).
- **V2 "disappeared"** going back to Expenses; couldn't **select V1** or **unlock** it because
  V2 was Current but unselectable.
- **No read-only viewing** of an old version; **no rollback** flow.
- **Income actuals lock when locked** (wrong — actuals must ALWAYS stay editable), and editing
  a locked proposed income cell shows a **bottom toaster**, not the Unlock/New-version modal.
- The lock modal should fire on **edit**, not click.

**Stage A is a map + fix plan only — no code — reviewed by Adam + Claude before build.**

## ⛔ Stage A — MAP ONLY → `VERSIONING_STATE_MAP.md`
1. **Map how "which version am I viewing" is resolved on EACH surface** — `page.tsx`
   (the `?version=` param + the active/approved resolution), and how **Expenses
   (`BudgetGridView`), Income (`BudgetIncomeGrid`), Summary, Settings** each independently
   read the version + the `versionLocked` flag. **Find why Expenses disagrees** with
   Settings/Income (it likely reads the active draft, not the URL-resolved version).
2. **The single-source-of-truth fix.** Propose making the **viewed version one value**
   (URL `?version=` is the natural home), resolved once in `page.tsx`, threaded **identically**
   to all four tabs — so the lock state + the displayed snapshot + the selector all agree, and
   the selection **persists across tab navigation** (changing tab keeps `?version=`).
3. **Read-only viewing + selection.** The selector must let you **view any version read-only**
   (superseded/old → look-don't-touch, every proposed cell locked), with only the **Current**
   (approved) and the **active Draft** editable per the existing lock rules. Fix the "couldn't
   select V1 / V2 unselectable" bug — every version in the list is selectable + viewable.
4. **Lock correctness (must-fix in this pass).**
   - **Actuals NEVER lock** — on any version state, actual cells stay editable everywhere
     (Expenses AND Income). The lock applies to **proposed** only. Find where income actuals
     got caught by the lock and exclude them.
   - The Unlock/New-version **modal** (not a toaster) fires on an **edit attempt** of a locked
     **proposed** cell — consistently on Expenses AND Income (income currently toasts).
5. **Rollback flow (Adam's spec).** Selecting an older version and choosing to make it live →
   a confirm popup: *"This marks vN as Current; later versions (vN+1…) will be marked
   **rolled-back**."* Propose: a new `rolled-back` status (or reuse `superseded` with a
   rollback flag), the state transition, and the RPC/endpoint. The Current pill follows the
   rolled-back-to version.
6. **Blast radius.** List every surface that reads version/lock state; confirm the fix doesn't
   regress B1/B2 (approve/unlock/amend, the 423 guard, the snapshot overlay) or the income work.

Surface the read-only-viewing model + the rollback-status decision with recommendations.
**Then stop.** No code.

## Hard rules
- **Branch off `main`. Commit to the feature branch and PUSH. Confirm `git log origin/<branch>`
  has the commit before reporting.**
- Don't regress versioning B1/B2 (the lock/approve/amend RPCs, the DB immutability triggers,
  the 423 guard) or the income phases. The DB model is sound — this is mostly a **client
  state-resolution** fix (one viewed-version source threaded everywhere) + the rollback add.
- Stage A is a doc — name real files/lines.
