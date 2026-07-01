# CC — Versioning state fix Stage B: GO. Build B1 first, then stop. Branch off `main`.

`VERSIONING_STATE_MAP.md` reviewed + both root causes verified (Settings keys off
`activeVersionId` not `viewed`; default landing is the draft head). **Commit the map.**
Decisions LOCKED below. Deliver **B1 only** on a fresh branch off `main`, then stop for
Claude's verify before B2 (rollback).

## Decisions — LOCKED
- **Single source = `viewed`.** Thread `page.tsx`'s `viewed` to **all four tabs including
  Settings**. `VersionApprovalCard` must key off **`viewed`**, not `activeVersionId`
  (`:33`/`:95`), and its actions (approve/unlock/amend) target the **viewed** version. The
  cross-tab lock disagreement disappears once Settings stops reading the head.
- **Default landing = the approved Current** (Adam's call). When a budget opens, `viewed`
  resolves to the **approved (Current) version if one exists, else the draft head**. You land
  on the signed-off baseline (proposed **locked**); switch to the draft via the selector to
  edit.
- **Persistent version indicator.** A clear, always-visible cue: **"Viewing v{n} · {status} —
  Current v{approved}"** so you always know which version + lock state you're on. (This is the
  orientation fix for the confusion Adam hit.)
- **Read-only viewing of non-draft versions.** Any viewed version that isn't the editable
  draft → **all proposed cells read-only**. The Unlock/New-version modal is **status-aware**:
  on the approved **Current** → Unlock & re-approve / New version; on a **historical**
  (superseded/rolled-back) version → "Switch to the draft to edit." Every version in the
  selector is **selectable + viewable** (fixes "couldn't select V1 / V2 unselectable").
- **Lock correctness (must-fix):**
  - **Actuals NEVER lock.** The shared `currency` column carries `ro: versionLocked` and bleeds
    into the **Actual** view (`BudgetIncomeGrid.tsx:238`) — fix so `ro: versionLocked` applies
    on the **Projected** view only, and **audit that no Actual-view column ever locks**
    (guarantee/overage/merch/vip actuals, deductions, currency-in-actual-view all editable on
    any version). *(Keep proposed-currency versioned in the Projected view; the Actual view's
    currency is the live settlement currency — editable.)*
  - **Modal, not toaster, on EDIT.** Generalise the Grid's version-lock from the hard-coded
    `est` column to a **configurable locked-column set** that fires `onLockedEdit`, so **Income
    renders `<VersionLockModal>` on an edit attempt (startEdit) exactly like Expenses** — not a
    bottom toast. The 423 server response stays as the backstop.

## B1 scope (no schema — build this, then STOP)
- Thread `viewed` to Settings (`VersionApprovalCard`) + audit Expenses/Income/Summary all read
  `viewed` consistently.
- Resolve `viewed` default to the **approved Current** (else draft head) in `page.tsx` /
  `versions.ts`.
- The persistent version indicator + status-aware modal + read-only viewing of non-draft.
- The income-lock fixes (actuals never lock; configurable Grid locked-column set → modal on
  edit for Income too).
- **No migration in B1.**

## B2 (separate prompt after B1 verify)
Rollback: migration 218 widens the `212` status CHECK to add **`rolled_back`** +
`budget_version_rollback(p_version_id)` RPC + `POST /api/budget/versions/[id]/rollback` + the
confirm modal ("This marks vN Current; later versions become rolled-back"). The RPC **demotes
the current approved first** (so the one-approved partial-unique index is never violated) →
marks vN+1… `rolled_back` → sets vN `approved`. Approver gate + immutability trigger cover it
(status-only changes don't touch frozen snapshots).

## Hard rules
- **Branch off `main`. Commit to the feature branch and PUSH. Confirm `git log origin/<branch>`
  has the commit before reporting.**
- Don't regress B1/B2 versioning (approve/unlock/amend RPCs, the immutability + approver
  triggers, the one-approved index, the 423 proposed-write guards, the snapshot overlay) or the
  income phases (P1–P4 + the projection engine). The DB model is sound — B1 is a **client
  state-resolution** fix + the income lock corrections.
- Tokens; `next build --webpack`; tsc 0; eslint 0.
- **Verify before claiming** — name files/lines; push the hash. I Chrome-verify: open a budget
  → lands on Current (locked) with the indicator; Settings agrees with the viewed version
  (Unlock shows for the approved Current); switch to V1/superseded → read-only, modal says
  "switch to draft"; income **actuals stay editable** on a locked version; editing a locked
  proposed income cell → the **modal** (not a toast); approve V2 → Expenses/Income/Settings all
  show locked consistently.
