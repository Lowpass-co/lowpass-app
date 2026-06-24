# GRID_V2_MAP — Stage A (map only, no code)

> 5 interaction features in the canonical `<Grid>`. Highest blast radius yet —
> every change **additive / opt-in**; default behaviour unchanged. **Status:**
> **Status:** B1 applied (formula #1, fill-handle #2, click-twice #3,
> Tab-auto-menu #4) — tsc 0, eslint 0, build green, formula 24/24. Decisions:
> **D1 retain formula** (in-session `<key>__f` sidecar), **D2 click-twice
> Grid-wide**, **D3 Tab-menu matrices-only**. **B2 (#5 live totals)** still
> pending — verdict below = cleanly additive (calc-column), its own push.
> Channel-list is the **legacy SpreadsheetGrid**, not the canonical `<Grid>` → out
> of scope for these props. Awaiting Chrome-verify of GV2-01..04.

All line numbers are `src/components/grid/Grid.tsx` unless noted.

---

## 1. Formula input (`=1+1` → 2)

- **Commit point:** `commitEdit` (`:303-323`). The parse is **one line** — `:316`:
  `if (t === 'money' || t === 'number') v = parseFloat(String(v).replace(/[^0-9.\-]/g, '')) || 0;`
- **Plan (B1):** before that strip, `const raw = input.value.trim(); if ((t==='money'||t==='number') && raw.startsWith('='))` → evaluate via a **new pure
  module** `src/lib/grid/formula.ts` (recursive-descent: numbers, decimals, unary
  `-`, `+ - * / ( )`; **no `eval`/`Function`**) → store the numeric result. On a
  parse error, fall back to the existing strip (so a stray `=` never throws).
- **Type-to-edit entry:** `:817-822` only starts an edit on `text|money|number`
  for a printable key. `=` is a printable char → it already opens the editor with
  prefill `=`. ✓ No nav-handler change needed.
- **Risk / isolation:** the branch only fires when the string starts with `=`, in
  money/number cells — every existing numeric edit (`1200`, `-50`, `1,200`) takes
  the unchanged path. budget/income/matrices/demo unaffected. Pure module +
  `formula.test.ts` (node strip-types) to lock the grammar.
- **Decision D1 (store-only vs retain formula):** **Recommend store the numeric
  result only** for v1. Retaining the `=…` string for re-edit means a parallel
  field (`row[key]` = number for compute, `row[key+'__f']` = "=1+1" for the edit
  input's `defaultValue` at `:1014-1031`) **and** teaching `onEdit`/persistence
  about it — net-new surface in every consumer. Defer unless Adam wants it now.

---

## 2. Excel fill-handle

- **Active-cell render:** the standard cell `:1349-1383` (`isActive`/`active2`,
  `cls = ' active'`, `selStyle(...)`). Cells already carry **`data-r`/`data-c`**
  (read by drag-select at `:841-843`) — fill tracking reuses them.
- **Existing gestures (must not collide):**
  - body pointer-down → select / start drag-select (`onCellPointerDown` `:864`,
    sets `selDragRef`); the document `pointermove` (`:832-861`) extends `s.fr/fc`
    via `elementFromPoint`→`.cell[data-r]`.
  - shift-click → extend (`:870-872`).
- **Plan (B1):** render a small `.fillhandle` div in the **active** cell's
  bottom-right (only when `isActive`), gated by an opt-in prop `fillHandle`. It is
  a **distinct hit target**:
  - add `'fillhandle'` to `onCellPointerDown`'s early-return guard (`:866`, next
    to `'openbtn'`/`'chk'`) so grabbing the handle doesn't start select.
  - the handle's own `onPointerDown` sets a new `fillDragRef = { fromR, fromC }`;
    a parallel `pointermove` (extend the existing effect or a sibling) tracks the
    hovered `.cell[data-r][data-c]` and previews the fill rectangle (reuse
    `selStyle`/range tint); `pointerup` writes the **source cell's value** to each
    cell in the range via the **same commit path as a normal edit** (`o.row[k]=v`
    + `onEditRef.current?.(uid,k,v)` — mirrors `commitEdit`/the paste fix) so it
    **persists**, then `render()`.
- **Isolation:** default `fillHandle` off → no handle rendered, zero new hit
  target → budget/income/matrices/demo **identical**. Enable per-surface in B1.
- Risk: the handle must sit above the cell content but not block the resize grip
  (different cells) — bottom-right corner, ~8px, `z` above cell text only.

---

## 3. Click-twice-to-open (dropdown/status cells)

- **Today:** `onCellPointerDown` (`:864-886`) — on a non-shift click it sets the
  selection **and immediately** opens the menu (`:880-885`:
  `if (o && t==='status') openStatusMenu(...) else if (t==='dropdown') openDropMenu(...)`).
  So a single click opens (the payroll/rooming behaviour Adam flagged).
- **Plan (B1):** capture the **previous** selection before overwriting it, and
  open the menu only when the clicked cell was **already active**:
  ```
  const prev = sel();                       // before selRef is reassigned
  const wasActive = prev.fr === r && prev.fc === c && !editRef.current;
  … existing select …
  if (!e.shiftKey && wasActive) { open the menu }   // else: just select
  ```
  Gated by an opt-in prop `clickTwiceToOpen`.
- **Decision D2 (scope):** **Recommend Grid-wide** (one consistent model) via the
  single prop, enabled on every dropdown surface. Surfaces it touches (eyeball
  list) — only cells of type `status`/`dropdown`:
  - **budget Expenses** — `status` column (the only dropdown there).
  - **rooming matrix** — day cells (`dropdown`).
  - **payroll Days matrix** — day cells (`dropdown`).
  - **channel-list** grid — its dropdown columns.
  - **/grid-demo** — `status` + `dropdown` demo columns.
  - **income** — has **no** dropdown/status cells (money/number/calc only) → not
    affected either way.
  Default (prop off) → single-click-opens unchanged everywhere.

---

## 4. Tab auto-opens the menu

- **Tab landing:** the document `onKey` `Tab` case (`:796-799`:
  `e.preventDefault(); move(0, e.shiftKey ? -1 : 1)`).
- **Shipped Tab fix (don't regress):** `onKey` bails at the top when the event
  target is the editing input (`tagName==='INPUT' && classList.contains('editing')`).
  Matrix day cells are **dropdowns (no text editor)**, so matrix Tab is always
  nav-mode → reaches the `Tab` case. The editing-input guard is untouched.
- **Plan (B1):** after `move(0,±1)` in the Tab case, if the **new** active column
  is `dropdown`/`status`, open its menu — in a `requestAnimationFrame` (so the
  post-`move` `render()` has painted the new `.cell.active`, which we query for the
  anchor, same pattern as `move`'s scrollIntoView at `:296-298`). Gated by an
  opt-in prop.
- **Decision D3 (scope):** **Recommend gate to the matrices** via a prop
  `tabOpensMenu` (default off). That's where fast day/room entry matters; leaving
  it off for budget means status-column tabbing isn't hijacked into a popover.
  Confirm: enable on rooming + payroll matrices only; budget/income/demo off.

---

## 5. Live totals — **ADDITIVE VERDICT: YES, cleanly additive. Keep in B2.**

### What's already live (verified)
The Grid recomputes from `data()` on every `render()`, and every edit path
(`commitEdit` `:322`, dropdown `onPick` `:470/492`, paste) ends in `render()`:
- **`calc` columns** — rendered `fmtC(col.calc(row))` at `:1145-1148`, **from the
  live `row`**. ✓ Live on edit.
- **toolbar est/act totals** — summed from `data()` at `:1586-1591`, shown `:1655`.
  ✓ Live.

### What's NOT live (the actual gap)
- **MTX-06 per-person Total** — today it's a **pre-computed text column**: the
  matrix computes `totalsFor(p)` in the *parent* and feeds `row.__total =
  money.format(...)` via `initialData`. The Grid clones `initialData` **once**
  (`:224-243`, `inited.current` guard) and has **no `useEffect` syncing it after
  mount** → editing a day cell never updates `__total`. (Confirmed ref-source-of-
  truth.)
- **`columnFooter`** (`:118`, rendered `:1709-1713`) — a **parent callback** that
  closes over *parent* state; the Grid re-invokes it each render but it returns the
  parent's last-render values, not the Grid's live `data()`.

### The additive fix (NO reseed, NO ref-model change)
The MTX-06 Total derives from the **Grid's own day cells** (+ the person's rate
card, which is static during entry) — so it doesn't need external reseeding at
all. Two purely-additive moves:
1. **MTX-06 → a Grid-native `calc` column.** The matrix builds the Total column
   with `calc: (row) => feeFrom(row's day cells, rates[row._uid])`, closing over a
   `personId→rates` map. `calc` re-runs every render → **live by construction**.
   *Zero Grid-core change* (calc columns already exist). (Detail: `calc` renders
   via `fmtC` which uses the Grid's `fx`; the payroll matrix doesn't pass `fx`
   today, so B2 either passes a minimal `fx` or the column uses a plain formatter —
   small, matrix-side.)
2. **Live `columnFooter`** — extend the signature to an **optional** second arg:
   `columnFooter?(colId, liveRows)`, where the Grid passes `flat()` (its live
   rows). Existing callers ignore the 2nd arg → unchanged; matrices that want live
   per-day counts read `liveRows`. Additive.

### Why NOT the reseed/`revision` approach
A `revision` prop + `useEffect` that reseeds `dataRef` from `initialData` *can* be
made additive (default `undefined` → no effect), **but** a wholesale reseed
clobbers selection, any in-flight edit, and undo history, and fights the
ref-source-of-truth model — risk for no benefit, since the calc-column path gives
the same live Total without touching the model. **Rejected; recommend the calc
path.** (So #5 does **not** need descoping.)

---

## Decisions (for review)
- **D1 — formula storage:** store numeric result only (v1). *Recommend.* Retain
  `=…` for re-edit = later.
- **D2 — click-twice scope:** Grid-wide via one opt-in prop. *Recommend.* Surfaces
  named above (budget status, both matrices, channel, demo; income N/A).
- **D3 — Tab-auto-menu scope:** matrices-only via opt-in prop. *Recommend.*
- **#5 verdict:** **cleanly additive** (calc-column + optional `columnFooter`
  live-rows arg) — **keep in B2**, no reseed, no ref-model change.

## B-split (after approval)
- **B1 (interaction):** `formula.ts` + `commitEdit` branch (#1); `fillHandle` prop +
  handle + fill gesture (#2); `clickTwiceToOpen` prop + `onCellPointerDown` gate
  (#3); `tabOpensMenu` prop + Tab-case menu-open (#4). All opt-in; default off where
  behaviour changes.
- **B2 (live totals):** MTX-06 calc column + `columnFooter(colId, liveRows)`.

## Confirmed-unchanged-where-not-enabled (hard rule)
With all opt-in props default-off / the formula branch only firing on a leading
`=`: **budget Expenses, income, rooming matrix, payroll matrix, `/grid-demo`** all
render + behave identically. The shipped **Tab fix**, **paste-fires-onEdit**,
**drag-select**, **wide-mode frozen columns/footers**, and **`rowMatches`** are all
untouched (each feature is gated or branch-guarded; none alter those code paths).

## Stage A compliance
- ✅ Every feature pinned to exact lines + the opt-in seam.
- ✅ #1 uses a pure parser (no `eval`/`Function`).
- ✅ #2 distinguished from drag-select (separate hit target + `fillDragRef`).
- ✅ #5 **proven additive** via calc-column/columnFooter; reseed rejected with
  reason; not descoped.
- ⛔ **No feature code written.** Stopping for review (D1/D2/D3 + the #5 verdict).
