# CC — Grid-v2 interaction pass (5 features, all in the canonical `<Grid>`)

This reshapes how *every* grid feels (budget, income, rooming, payroll, channel), so
it's the highest-blast-radius work yet. **Heavily gated.** `<Grid>` is load-bearing —
every change is additive / opt-in, and budget Expenses + income + the matrices +
`/grid-demo` must be provably unchanged where a feature isn't enabled.

The five (Adam's list):
1. **Spreadsheet formula input** — typing `=1+1` commits **2** (not "11"). Basic
   arithmetic in number/money cells.
2. **Excel fill-handle** — drag the active cell's bottom-right corner to fill a range.
3. **Click-twice-to-open** — on a dropdown cell, first click **selects**, second click
   (already-selected) **opens** the menu.
4. **Tab auto-opens the menu** — Tab onto a dropdown cell moves there **and** opens its
   menu (fast matrix entry).
5. **Live totals** — MTX-06 / footers update **as you edit**, not only on tab re-entry
   (the Grid is currently ref-source-of-truth and ignores `initialData` after mount).

## ⛔ Gated: Stage A (map, no code) → review → Stage B

### Stage A → `docs/handover/GRID_V2_MAP.md`
Map each feature's exact integration point + the interaction risks, and resolve the
decisions. **Do not write feature code.**

1. **Formula:** where cell commit happens (`commitEdit` in `Grid.tsx`). Plan: on commit
   of a `money`/`number` cell, if the raw input starts with `=`, evaluate a **safe**
   arithmetic expression (`+ - * / ()`, numbers) and store the numeric result. **NO
   `eval`/`Function`** — a tiny shunting-yard/recursive-descent parser. **Decision D1:**
   store result only, or keep the `=…` string for re-edit (spreadsheet-style)?
   (Recommend: store result; retain the formula string for re-edit if cheap.)
2. **Fill-handle:** the active-cell render + the `Sel` model. Plan: a small handle on
   the active cell's bottom-right; mousedown-drag tracks over cells; on release, write
   the source value to each via the same `onEdit` path (so it persists). Must **not**
   collide with the existing Shift/body **drag-to-select** gesture — the handle is a
   distinct hit target. Map the distinction.
3. **Click-twice-to-open** (dropdown cells): today a single click opens the menu
   immediately (seen on payroll/rooming). Change: 1st click selects, 2nd click on the
   already-active cell opens. **Decision D2:** Grid-wide (also budget `status` dropdowns
   — consistent) or only wide-mode matrices? (Recommend Grid-wide for consistency, but
   name every dropdown surface it touches so we eyeball them.)
4. **Tab auto-opens menu:** integrates with the **just-shipped Tab fix** (one editable
   cell, `tagName/classList` guard — don't regress it). Plan: after Tab lands on a
   dropdown cell, open its menu. **Decision D3:** everywhere, or gated to wide-mode
   matrices (so budget status-tabbing isn't disrupted)? (Recommend: gate to the matrices
   via a prop — that's where fast day/room entry matters.)
5. **Live totals — the architectural one. PROVE IT'S ADDITIVE FIRST.** The Grid owns its
   row data after mount (ref-source-of-truth). Making footers/`calc`/`columnFooter`
   reflect live external edits needs a **controlled-reseed** path. Map whether a
   reseed-on-changed-`initialData` (or an explicit `revision` prop) can be added
   **without** changing the default uncontrolled behaviour every current consumer
   relies on. **If it can't be made cleanly additive, STOP and flag — we descope #5 to
   its own pass** rather than risk the Grid.

Then stop. List the decisions + the additive-proof verdict for review.

### Stage B (after the map) — land in TWO pushes for reviewability
- **B1 — interaction:** formula (#1), fill-handle (#2), click-twice (#3), Tab-auto-menu
  (#4). Behind opt-in props where they change existing behaviour.
- **B2 — live totals (#5):** only if Stage A proved it additive; otherwise its own pass.

## Hard rules
- Every change **additive / opt-in**; default behaviour unchanged. Name budget
  Expenses, income, both matrices, `/grid-demo` as confirmed-unchanged-where-not-enabled.
- **No `eval`/`Function`** for formulas. Tokens; `next build --webpack`; tsc 0; eslint 0.
- Don't regress the shipped Tab fix, paste-fires-onEdit, drag-select, wide-mode frozen
  columns/footers, or `rowMatches`.
- **Verify before claiming** — name files/lines; push each B with its hash. I
  Chrome-verify: `=1+1`→2 on budget; fill-handle fills + persists; click-twice opens on
  payroll; Tab auto-opens in the matrix; (B2) a day edit ticks the Total live.

## Out of scope
Cell references in formulas (`=A1+B2`) — v1 is literal arithmetic only. Range copy
semantics beyond fill — later.
