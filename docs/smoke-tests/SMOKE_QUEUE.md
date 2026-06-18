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

## Rooming  — built (a22fa57); 3 views Chrome-verified. Your manual checks:
- [ ] **SMK-ROOM-01** — In **Cards**, assign a person to a room via the "+ room…"
  picker on a night; switch to **Matrix** → the code shows; reload → it persists.
- [ ] **SMK-ROOM-02** — Set a room's **rate/cost** (Nights row → hotel sheet, or
  the assumed-rate field) → the **budget Accommodation** line picks up the cost
  (the reconcile feed with a non-£0 value — I only verified the £0 baseline).
- [ ] **SMK-ROOM-03** — Shared room: two people, same letter (e.g. `DBL (A)`) →
  the **Nights** view counts + costs it **once** (not twice).
- [ ] **SMK-ROOM-04** — Off-roster person shows as a greyed ✕ column (Matrix) and
  can be removed; roommates keep their room.

## Payroll — built (c674daf); Rates + Days matrix + PAY-OPS17 + PAY-05 Chrome-verified. Your manual checks:
- [ ] **SMK-PAY-01** — Edit a day-type cell in **Days matrix** (Show↔Off/Travel↔
  No-tour) → the person's **Total fee** in Rates & totals + the **budget Salary**
  line both update; survives reload.
- [ ] **SMK-PAY-02** — **internal_rate** stays admin-only: as a non-admin it must
  not appear or be editable anywhere in payroll (PAY-04).
- [ ] **SMK-PAY-03** — Advance editing: once the **inline advance stopgap** ships,
  edit an advance fee in the Rates grid → it persists + flows to the total. (Until
  then, advance has no editor — known gap.)
- [ ] **SMK-PAY-04** — Summary view totals match the Rates view.

## Riders fix (`ff9cf8a`) — Claude-verified this session:
- ✅ **SMK-RID-01 Open** — clicking the pack opened
  `/operations/[tourId]/riders/[id]` (no 404), in Operations chrome. **The 404 is
  fixed.**
- ✅ **SMK-RID-02** — the standalone `/rider-packs/[id]` route renders the identical
  editor body; only the outer shell differs. Confirmed.
- ✅ **SMK-RID-03 Delete (wiring)** — `…` → detail slide-over → footer confirm
  ("Delete "CS | One Off Plot"? This permanently removes the pack, its sections, and
  its history. This can't be undone.") + Delete permanently / Cancel. Cancel works. I
  did NOT execute the permanent delete.
  - [ ] **You: run the destructive half** — Delete permanently → pack gone + list
    refreshes + reopening 404s. (Use a throwaway pack, or accept losing "CS | One Off
    Plot".)
- [ ] **SMK-RID-04 (minor, non-blocking)** — the left "packs" rail doesn't list the
  existing pack: shows "Loading packs…" (stuck) on `/rider-packs/[id]` and "No rider
  packs in this context yet" on the operations route. Editor itself is fine. Worth a
  follow-up fix, not a merge blocker.

## Rooming + Payroll matrices rebuilt ON `<Grid>` (wide mode) — MTX-01…09. Your manual checks:
> Both matrices are now `<Grid>` instances (people=rows, days=columns) via
> additive opt-in wide mode. The budget invariant is the key one. See
> `docs/smoke-tests/rooming.md` MTX-01…09 + `MATRIX_ON_GRID_MAP.md`.
- [ ] **SMK-MTX-01** — Both matrices: people are rows, days are columns; frozen
  person column stays visible while scrolling horizontally.
- [ ] **SMK-MTX-02** — **Drag-to-select** works across day cells (the feature
  that was lost); the active ring shows.
- [ ] **SMK-MTX-03** — Day cells are **tint-filled** by room code / day status;
  clicking opens the dropdown and the pick persists (no reload).
- [ ] **SMK-MTX-04** — Rooming **rooms-per-night footer** + shared-room letter
  counting correct; off-roster people are greyed rows + removable (✕).
- [ ] **SMK-MTX-05** — Payroll **week markers** on Monday day-headers; all
  routing dates incl. no-tour appear.
- [ ] **SMK-MTX-06** — **Budget feeds unchanged**: edit rooming/payroll cells →
  Budget Accommodation + Salary reconcile exactly as before.
- [ ] **SMK-MTX-07** — **THE INVARIANT**: Budget Expenses + Income grids and
  `/grid-demo` are visually + behaviourally identical to before wide mode.

## Budget Income → `<Grid>` (BUD-50…54). Your manual checks (P&L parity is the key one):
> Migrated `BudgetIncomeTab` onto the canonical `<Grid>`. The legacy tab is kept
> unmounted as a fallback until you confirm parity. See `budget.md` BUD-50…54.
- [ ] **SMK-INC-01** — Income renders on the Grid: rows = shows, read-only Show
  column, **no add/delete** affordances; projected columns present.
- [ ] **SMK-INC-02** — Edit Guarantee/WH%/Overage/Merch/VIP → **Post-tax + Total
  recompute live**, persist with no reload (POST `/api/budget/income`).
- [ ] **SMK-INC-03** — Projected↔Actual toggle swaps the column set; actuals persist.
- [ ] **SMK-INC-04** — **P&L parity**: the Summary `income_gross` matches the old
  value for the same inputs (field names + post-tax rule + upsert unchanged).
- [ ] **SMK-INC-05** — Display-currency flip converts income cells + totals.
- [ ] **SMK-INC-06** — Regression: **Expenses** + `/grid-demo` still show
  add-line / Group / Add-section exactly as before (allowAddRows default).

## Channel list — re-skin shipped (Option A: visual + arrow-key nav only). Your manual checks:
> Only 3 files changed (useCellNav, ChannelListSectionBand, ChannelListEditor
> outer container); every feature is otherwise untouched — these confirm the
> re-skin didn't visually break anything. See `docs/smoke-tests/channel-list.md`.
- [ ] **SMK-CL-01** — Re-skin reads right: editor is a **raised panel** + the
  Inputs/Outputs/Inventory bands match the canonical look (parity vs budget `<Grid>`).
- [ ] **SMK-CL-02** — **Arrow-key nav**: ↑/↓ move rows, ←/→ jump cells at the
  caret edge; typing mid-cell + the Mic/DI and other **selects' own ↑↓** still work.
- [ ] **SMK-CL-03** — **Counters** (Mics/DIs · Stands · Cables · Stage boxes ·
  Snakes) still compute; **Stage-box Patch** one-shot still assigns all ports.
- [ ] **SMK-CL-04** — **Mic search** + "Add to library" + **+48 auto-flash** intact.
- [ ] **SMK-CL-05** — **Outputs** sub-grid: add-output, stereo pairing, independent numbering.
- [ ] **SMK-CL-06** — **Drag-reorder** rows still reindexes; the **stage-plot link**
  still resolves the same channels (ids/linkage unchanged).
- [ ] **SMK-CL-07** — Templates assign-to-tour + show inheritance + export
  (Google Docs / ⌘P) all behave as before.

---
Already Chrome-verified by Claude (no action needed):
- **Income (95c9086):** renders 31 shows (BUD-50); edit recompute — guarantee 1000 →
  post-tax 1000, WH 10% → post-tax/total £900 (BUD-51); **P&L parity** — Summary Gross
  income = £900 = persistence + `computeBudgetPnl` feed intact (SMK-INC-04 / BUD-53).
- **Payroll Days matrix (eeb84f8/95c9086):** 5 crew as rows, tint-filled day cells,
  frozen PERSON column, week dividers.
- **Rooming matrix:** frozen column survives horizontal scroll; structure correct.
- **rowMatches regression:** Expenses renders; status filter works (uncheck draft → 0
  rows, re-check → 12) — statusless rows always visible, status-bearing rows filter as
  before.
- **Riders (ff9cf8a):** RID-01 Open (404 fixed), RID-02 identical body, RID-03 Delete
  wiring (see above).
- Earlier: BUD-41 (currency↔DISPLAY), BUD-43/44 (slide txn/doc load), BUD-45 (📎
  count), BUD-46 (Grid default), BUD-47 (Actual live-update), RAIL-05 (Advance rail),
  OPS-17 salary-population (208), `/grid-demo` untouched.
