# CC — Payroll PAY-01 (edits don't persist across tabs) + PAY-04 (Summary ≠ Rates)

Two linked bugs, one root cause + one clean fix.

## Root cause (confirmed by Claude in code)
`PayrollView.tsx` renders its three views with a **conditional** (`view==='rates' ?
<PayrollRatesSpreadsheet/> : view==='days' ? <PayrollDaysMatrix/> : <PayrollSummary/>`,
L107-129). Switching the view **unmounts** the current one.

- `PayrollDaysMatrix` owns its `usePayrollGrid(tourId, routingDates, payrollEntries)`.
  The hook holds the day-status state in **local** `entries` + optimistic `overrides`.
- **PAY-01:** edit a cell → `saveDayStatus` POSTs to the DB **and** updates the hook's
  local `entries`. Switch to Rates → the matrix unmounts → that hook state is destroyed.
  Switch back → it remounts and re-seeds `usePayrollGrid` from the **stale
  `payrollEntries` prop** (server-fetched once at page load, never refreshed). The edit
  is in the DB but the view shows the old value → "doesn't persist."
- **PAY-04:** Rates and Summary read the **stale `payrollEntries` prop** directly,
  while the Days matrix shows live edits from its hook → the three diverge.

## The fix — lift the day-status state to `PayrollView` (mirror the existing `rates` lift)
`PayrollView` ALREADY lifts `rates` to the parent (`const [rates, setRates] =
useState(personnelRates)`, L46) and shares it to all three views + updates it on
AddPerson. **Do the same for the day-status layer:** instantiate `usePayrollGrid` in
`PayrollView` and pass `statusOf` / `saveDayStatus` / `entries` / `totalsFor` down to
all three views. Then:
- Editing in the Days matrix updates the PARENT's hook state (parent never unmounts on
  tab switch) → the edit survives navigating to Rates and back. **PAY-01 fixed.**
- Rates + Summary read the SAME hook's `entries` / `totalsFor` → all three agree.
  **PAY-04 fixed** (if the residual divergence is data-staleness — confirm in Stage A
  whether Rates and Summary also differ in their fee *calculation*, not just data).

## ⛔ Gated: Stage A (map, no code) → review → Stage B

### Stage A → `docs/handover/PAYROLL_PERSIST_MAP.md`
1. Confirm the unmount-on-tab-switch + stale-prop reseed above (cite the conditional).
2. `usePayrollGrid` consumers: confirm `PayrollDaysMatrix` is the only one today, and
   what `PayrollRatesSpreadsheet` + `PayrollSummary` currently use for totals
   (`payrollEntries` prop directly? their own calc?). **Confirm whether PAY-04 is pure
   data-staleness (same `fees.ts` calc, different data) or an actual calc divergence**
   — if the latter, name the two calc paths to reconcile onto `fees.ts`.
3. The lift: what `PayrollView` passes to each of the 3 views after hoisting the hook;
   confirm the budget Salary/Per-Diem reconcile feed + `internal_rate` gating are
   untouched (the POST path in `saveDayStatus` is unchanged — only WHERE the hook
   lives changes). Then stop.

### Stage B
1. Hoist `usePayrollGrid` into `PayrollView`; pass `statusOf`/`saveDayStatus`/`entries`/
   `totalsFor` to the three views; `PayrollDaysMatrix` consumes them as props instead
   of calling the hook itself.
2. Point Rates + Summary totals at the shared `totalsFor`/`entries` so they reflect
   live edits and agree with each other.
3. (Ride-along, low-risk) **MTX-06** — now that `totalsFor` is available in the Days
   matrix, show each person's **total fee** beside their name (frozen column / a
   trailing total). Keep it simple.

## Out of scope (separate payroll UX ticket)
**MTX-05** — the Days-matrix header crowding (week label vs date vs city overlap). Pure
layout; do it as its own pass, not here.

## Hard rules
- Don't change the `saveDayStatus` POST, the budget reconcile feed, fee math
  (`fees.ts`), or `internal_rate` gating. Only the state's OWNER moves.
- Tokens; `next build --webpack`; tsc 0; eslint 0. Push + "Pushed `<hash>`".
- **Verify before claiming** — name files/lines. I Chrome-verify: edit a Days-matrix
  cell → switch to Rates → Total reflects it → switch back → the cell still shows the
  edit; Summary == Rates; OPS-17 (Ben £6,300) still holds.
