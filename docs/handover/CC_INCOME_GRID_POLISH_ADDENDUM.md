# CC — Income grid polish ADDENDUM (two more, from Adam's live use). Same branch as `291bafe`.

Two follow-ups on top of the income-grid UX polish you already shipped
(`feat/income-grid-ux-polish`, `291bafe`). Add to **that same branch** (or a fresh one off
`main` if it's already merged) — push, and `git log origin/<branch>` to confirm before
reporting.

## A. Backspace/Delete bypasses read-only — GRID-CORE bug (affects every grid)
Adam: backspace still clears the routing reference cells even though typing is blocked. In
`Grid.tsx`, type-edit (`:430 if (cdef?.ro) return`) and paste (`:1002 if (cd?.ro) continue`)
both respect read-only, but the **Backspace/Delete** handler (`:880` → `doDelete()`, def
`:507`) does **not** — so any `ro` cell can be **wiped with Backspace**.

**Fix:** `doDelete` must skip read-only cells — honour the **same guard** the other mutations
use: `ro` + `versionLocked` (proposed cells on an approved version) + the new `referenceCols`
set + the derived-lock (`sec.kind==='derived' && est|act`). A read-only cell must be
immutable to backspace/delete just as it is to typing and paste.

**Verify:** on income, payroll, rooming, expenses — select a read-only cell (routing
reference, a derived/locked cell), press Backspace → **nothing clears**. Editable cells still
clear normally. This is grid-core, so check all four surfaces.

## B. Label the Actuals "Total" as "Net"
In the income grid's **Actuals** view, the Total column already computes
`guarantee + overage + merch + vip − deductions` — which is **Net**. Just rename that column
header **Net** (settlement computes `reconciled_net` to match). No math change; label only.
(The projected view's Total stays "Total" — it has no deductions.)

## Hard rules
- Tokens; `next build --webpack`; tsc 0; eslint 0. Don't regress the six fixes already in
  `291bafe`, the versioning lock, or P1–P3.
- **Verify before claiming** — name files/lines; push; confirm the commit is on the remote
  branch. I Chrome-verify backspace is blocked on read-only cells across grids + the Net label.
