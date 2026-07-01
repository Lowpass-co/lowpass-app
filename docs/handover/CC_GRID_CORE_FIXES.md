# CC — `<Grid>` core bugs: Tab-skip + copy-paste-stale (affect EVERY grid)

Two bugs Adam hit repeatedly across budget, income, payroll, rooming. Both live in
the canonical `<Grid>` (`Grid.tsx` / `useCellNav` / the paste handler), so fixing them
once fixes every surface. ⚠ `<Grid>` is the load-bearing shared component — budget
depends on it; don't regress it.

## The bugs
1. **[BUG] Tab advances TWO cells, not one.** Pressing Tab skips a cell (jumps +2).
   Seen on budget Expenses AND income. Almost certainly a double-fire: the custom Tab
   handler moves the active cell AND the browser's native tab also moves focus, or the
   handler increments twice / doesn't `preventDefault`.
2. **[BUG] Copy-paste shows a STALE value.** After ⌘V into a cell, the underlying data
   updates but the **displayed** value stays the old one until a reload. The paste
   mutates state but the cell render reads a cached/last-committed value, or the paste
   path skips the re-render that a normal edit triggers.

## ⛔ Gated: Stage A (map, no code) → review → Stage B

### Stage A — map (NO code) → `docs/handover/GRID_CORE_FIX_MAP.md`
1. The **Tab** key path: where Tab is handled (`useCellNav`? the Grid keydown?), what
   it does to the `Sel` active/focus cell, whether `preventDefault` is called, and why
   it lands +2. Confirm the off-by-two (double handler vs native focus vs increment).
2. The **paste** path: how ⌘V writes cells, and how a NORMAL edit re-renders the cell
   vs how paste does (the divergence that leaves paste stale). Identify the missing
   re-render / state-commit step.
3. Confirm both fixes are isolated to nav/paste and **don't touch** the render of
   budget/income/grid-demo rows. Then stop.

### Stage B — build (after the map)
1. Tab advances exactly **one** cell (and Shift+Tab one back); `preventDefault` the
   native tab; wrap at row ends per existing arrow-nav behaviour.
2. Paste commits through the same state path a normal edit uses, so the pasted cell
   re-renders immediately (no reload). Multi-cell paste updates every target cell's
   display.

## Out of scope (next Grid pass — do NOT build here)
The bigger interaction rework is a SEPARATE sprint item (Adam approved it as its own
piece): Excel fill-handle drag-out, click-to-select-then-click-to-open-menu, and
Tab-auto-opens-the-menu. Don't change Tab to open menus in THIS pass — just fix the
+2 skip. Those land next so we don't double-pass the handler blindly.

## Hard rules
- Tokens; `next build --webpack`; tsc 0; eslint 0.
- **No regression** to budget Expenses, income, payroll/rooming matrices, or
  `/grid-demo` — name them confirmed-unchanged in the diff.
- **Verify before claiming** — name files/lines; push + include the "Pushed `<hash>`"
  line. I Chrome-verify: Tab advances 1 on budget + income; paste updates the display
  instantly on a matrix; arrow-nav + normal edit unaffected.
