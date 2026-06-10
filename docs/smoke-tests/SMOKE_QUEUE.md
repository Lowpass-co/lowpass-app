# Adam's smoke queue — grids

The things **Adam needs to manually smoke** that I can't fully verify via Chrome
(mostly file uploads + destructive ops). Grows as each grid surface ships. Tick
them off; report fails by ID.

> Loop: build → I Chrome-verify what I can → the rest lands here for your manual
> smoke → after all grids are smoked, we un-park the export.

## Budget (Grid is now the default view)
- [ ] **SMK-BUD-01 (BUD-48)** — Open a line, add a transaction, **attach a
  receipt** (upload a file or pick an existing doc), then **reload**. The receipt
  chip should show its **number**, not a generic "Receipt".
- [ ] **SMK-BUD-02 (BUD-42)** — In a **normal** multi-row section (NOT a derived
  Accommodation/Salary section — add a couple of `Uncategorised` lines if needed),
  **drag a row** to reorder, then **reload**. The new order persists.
- [ ] **SMK-BUD-03 (BUD-49)** — Open a line that has a transaction and **try to
  delete the transaction**. It should remove cleanly. ⚠ If there's **no delete
  control**, that's the BUD-49 gap — flag it. (This also clears the leftover empty
  "New transaction" row on the Freight line.)
- [ ] **SMK-BUD-04** — Confirm **Classic** is still reachable via the toggle and
  renders the same data (the flip to Grid-default didn't strand Classic).

## Rooming  — *pending build (CC_ROOMING.md). Smokes added when it ships.*

## Payroll — *pending build (CC_PAYROLL.md). Smokes added when it ships.*

## Channel list — *pending re-skin. Smokes added when it ships.*

---
Already Chrome-verified by Claude (no action needed): BUD-41 (currency↔DISPLAY),
BUD-43/44 (slide txn/doc load), BUD-45 (📎 count), BUD-46 (Grid default), BUD-47
(Actual live-update both directions), RAIL-05 (Advance rail intact), OPS-17
salary-population (208), `/grid-demo` untouched.
