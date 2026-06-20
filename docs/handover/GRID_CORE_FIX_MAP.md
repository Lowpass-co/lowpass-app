# GRID_CORE_FIX_MAP — Stage A (map only, no code)

> Two core `<Grid>` bugs hit across budget / income / payroll / rooming, so
> fixing them in `Grid.tsx` fixes every surface. ⚠ `<Grid>` is load-bearing
> (budget depends on it) — the fixes must be isolated to the **keyboard / paste
> handlers** and not touch the **row render**. Decisions in §3, then stop.
>
> **Status:** Stage B applied (Tab single-fire + paste `onEdit`). tsc 0, eslint
> 0, `next build --webpack` green. Awaiting Adam Chrome-verify of CORE-01..03.

---

## 1. Bug 1 — Tab advances +2

### The two Tab handlers (the asymmetry that matters)
- **Nav mode** — the document `keydown` listener `onKey`
  (`Grid.tsx:734–813`), `case 'Tab'` (**:796–798**): `e.preventDefault();
  move(0, e.shiftKey ? -1 : 1)`. One move.
- **Edit mode** — the editing input's `onKeyDown` (**:1025–1040**), Tab branch
  (**:1031–1034**): `e.stopPropagation(); e.preventDefault(); commitEdit();
  move(0, e.shiftKey ? -1 : 1)`. One move.

**Arrows have only ONE handler** (the document `onKey`, :764–779 — the editing
input lets arrows move the text caret). So **Tab is the only key with two
handlers** → exactly the "Tab +2 but arrows fine" symptom.

### How +2 happens (primary hypothesis)
While **editing** a cell and pressing Tab, the input handler (:1031) runs
`commitEdit()` then `move(0,1)`, relying on `e.stopPropagation()` (:1026) to
suppress the document `onKey`. The document handler's own guards
(`if (editRef.current) return` :745, `if (inField) return` :746) are *also*
meant to suppress it — **but `commitEdit()` sets `editRef.current = null`
(:317-ish) BEFORE `move()` runs**, so if the document listener still fires for
that keydown, the `editRef` guard is already void; only the `inField` guard
stands. If the native event reaches `document` despite `stopPropagation`
(a real-world React-synthetic-vs-native-`document`-listener gap), the document
`onKey` runs `move(0,1)` a **second** time → **+2**. Arrows never hit this (no
second handler).

### Secondary contributor (visual, NOT to "fix")
`navCols` (`gridModel.ts:60–63`) = `visCols.filter(type ∈ EDIT_TYPES)` where
`EDIT_TYPES = text|money|number|status|dropdown|check` (:18). So **idx /
variance / calc / receipts / doc columns are not navigable** — Tab (and arrows)
land on the next *editable* column, visually skipping a read-only one (budget:
`act → [variance skipped] → status`; income: `wh → [post-tax calc skipped] →
overage`). This is correct spreadsheet behaviour and **shared with arrows**, so
it must NOT be changed (the hard rule says arrow-nav stays unaffected). It's
noted only because it can read as "+2" — the genuine fix is the double-fire
above, not `navCols`.

### Ruled out
- Listener double-registration: `render = useCallback(()=>force(),[])` and
  `move = useCallback(...,[render])` are **stable**; the keydown `useEffect`
  registers once (cleanup removes the same `onKey`). Not StrictMode (preview is
  a production build).
- A second app-level Tab handler: the other `onKeyDown`s (:1228, :1298) are the
  formula/fx inline inputs (each `stopPropagation`s) — not nav Tab.

---

## 2. Bug 2 — paste shows a stale value (CONFIRMED root cause)

`doPaste` (`Grid.tsx:375–393`):
```ts
clip.forEach((rw, dr) => rw.forEach((val, dc) => {
  const o = flat()[r0 + dr]; const k = NC()[c0 + dc];
  o.row[k] = t==='money'||'number' ? parse(val) : val;   // mutate in-memory only
}));
render();                                                  // re-render
```
It mutates the row + `render()` — but **never fires `onEdit`**. Compare a NORMAL
edit, `commitEdit` (:303–320):
```ts
o.row[key] = v;
if (o.row._uid) onEditRef.current?.(o.row._uid, key, v);  // ← the persist/propagate step
```
**`doPaste` omits the `onEditRef.current(...)` call.** Consequences:
- The paste is **never persisted** (no PATCH / `saveCell` / `saveDayStatus` /
  income POST) and the **parent never learns of it** (the matrices' hook state,
  the budget `onEdit`→PATCH, income's `setRows`).
- The grid's own `dataRef` IS updated + re-rendered, so the *grid* cell shows the
  new value — until anything causes the grid to re-seed from the parent (a
  re-key on count change, a `router.refresh()`, or a reload), at which point the
  unpersisted paste **reverts to the old value** → "displayed value stays the old
  one until a reload". On the matrices the footer/totals (read from the hook,
  not `dataRef`) also stay stale because the hook never saw the paste.

→ **Root cause: paste skips the `onEdit` commit path a normal edit uses.**

---

## 3. Isolation + the fixes (Stage B)

Both fixes live in the **keyboard / paste handlers only**; the **row render
(`renderCell` / `cellInner` / `renderSections`) is untouched** → budget Expenses,
income, the matrices, and `/grid-demo` render byte-for-byte the same.

### Bug 1 — Tab single-fire
Make Tab move **exactly once**, regardless of the `stopPropagation` gap:
- The document `onKey` must hard-ignore a Tab that originated from the editing
  input — e.g. bail when `e.target` is inside the grid's `.editing` input (or a
  short re-entrancy guard set by the edit-Tab path). Keep `preventDefault` + the
  existing wrap behaviour (`move` already clamps; arrow-nav code path unchanged).
- Do **not** change `navCols` (arrows must stay unaffected).
- *(Decision for Adam: confirm the repro is the **editing**-Tab (type → Tab →
  jumps 2 editable cells), which the two-handler analysis points to. If it's a
  nav-mode +2 with no edit in progress, that points elsewhere and I'll
  re-investigate before touching it.)*

### Bug 2 — paste through the normal commit path
In `doPaste`, after `o.row[k] = …`, fire `onEditRef.current?.(o.row._uid, k,
val)` per pasted cell (mirroring `commitEdit`), then `render()`. Multi-cell paste
loops already → each target cell persists + re-renders. No new endpoint; uses the
surface's existing `onEdit` (budget PATCH / `saveCell` / `saveDayStatus` / income
POST), so it's consistent everywhere.

### Out of scope (next Grid pass — do NOT build here)
Excel fill-handle drag-out, click-to-select-then-click-to-open-menu,
Tab-auto-opens-menu. **Do not change Tab to open menus in this pass.**

---

## 4. Hard-rule compliance (Stage A)

- ✅ Traced both bugs to exact lines: Tab handlers (`Grid.tsx:796`, `:1031`),
  `navCols` (`gridModel.ts:60`), `doPaste` (`:375`) vs `commitEdit` (`:303`).
- ✅ Confirmed both fixes are in the keyboard/paste handlers — **no row-render
  change** → budget/income/matrices/`grid-demo` render unchanged.
- ✅ Ruled out listener double-registration + a second app handler.
- ⛔ **No code written.** Stopping for review (esp. the Tab-repro confirmation).

### Stage B smoke IDs (placeholders)
`docs/smoke-tests/grid.md` (cross-ref budget/operations):
- **CORE-01** Tab advances exactly one editable cell on budget Expenses + income
  (type a value → Tab → lands on the next editable cell, not +2); Shift+Tab back one.
- **CORE-02** Paste (⌘V) updates the cell display **immediately** and **persists**
  (survives reload) on a matrix + budget; multi-cell paste fills every target.
- **CORE-03** Arrow-nav + normal single-cell edit unchanged; budget/income/
  `grid-demo` visually + behaviourally identical.
