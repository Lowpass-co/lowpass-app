# PAYROLL_PERSIST_MAP — Stage A (map only, no code)

> PAY-01 (Days edits don't survive a tab switch) + PAY-04 (Summary ≠ Rates) —
> one root cause (the day-status state lives in a view that unmounts) plus one
> genuine, *separate* calc-input divergence on advance fee that needs a decision.
>
> **Status:** Stage B applied. tsc 0, build green, fees unit test 8/8.
> Awaiting Adam Chrome-verify.
>
> **Adam's decision (PAY-04b):** unify on the **rate-card** advance
> (`personnel_rates.advance_fee` — the value edited in the Rates "Advance"
> column) as the single source of truth across Days, Summary, **and the budget
> reconcile**. The per-week `payroll_entries.advance_fee` is **retired as an
> advance source** (the column is left in place, no migration — it's simply no
> longer read for fees). This preserves the live advance-edit UX in Rates and
> aligns the three with the 5 surfaces that already used the rate-card advance
> (`budget/summary`, `artist-summary`, `SummaryView`, `TourBudgetAccordion`).
> **MTX-06 placement:** second frozen column.
>
> **Known residual (out of scope, flagged):** the "actual / cost-to-date"
> surfaces (`tour-overview`, `SummaryView` actual column, `TourBudgetAccordion`
> actual) read the *persisted* `payroll_entries.total_fee` (written by the POST /
> generate routes, which still bake in the per-week advance). They were not in
> Adam's three named surfaces and would need the POST to persist the rate-card
> advance (or a regenerate) to fully converge. Neutral for OPS-17 (Ben advance
> £0). Recommend a follow-up if full actual-side convergence is wanted.

---

## 1. Root cause — confirmed (unmount + stale-prop reseed)

`PayrollView` renders the three views with a **conditional** — switching the tab
**unmounts** the inactive view:

```tsx
// PayrollView.tsx:107–129
{view === 'rates'  ? <PayrollRatesSpreadsheet … payrollEntries={payrollEntries} />
 : view === 'days' ? <PayrollDaysMatrix … payrollEntries={payrollEntries} />
 :                   <PayrollSummary … payrollEntries={payrollEntries} />}
```

The day-status state lives **inside** the Days view's hook:

- `PayrollDaysMatrix.tsx:76` — `const { statusOf, saveDayStatus } =
  usePayrollGrid(tourId, routingDates, payrollEntries)`.
- `usePayrollGrid.ts:65–67` — `useState(payrollEntries)` (+ an optimistic
  `overrides` Map). Seeded from the prop **once, on mount**.
- `payrollEntries` is fetched **once, server-side** at page load
  (`operations/[tourId]/payroll/page.tsx:47` → `:129` → passed as a prop) and is
  **never refreshed**.

### PAY-01 mechanism
1. Edit a Days cell → `Grid.onEdit` → `saveDayStatus` (`usePayrollGrid.ts:98`)
   POSTs to `/api/budget/payroll` **and** updates the hook's local
   `entries`/`overrides`. DB is now correct; the live view shows the edit.
2. Switch to **Rates** → the conditional unmounts `PayrollDaysMatrix` → **the
   hook (entries + overrides) is destroyed.**
3. Switch back to **Days** → `PayrollDaysMatrix` remounts → `usePayrollGrid`
   re-seeds from the **stale `payrollEntries` prop** (page-load snapshot, no
   edit) → the cell shows the **old** value. "Doesn't persist."
   *(The edit is safely in the DB — only the client snapshot is stale.)*

---

## 2. `usePayrollGrid` consumers + the three totals paths

**Only `PayrollDaysMatrix` calls `usePayrollGrid`** (confirmed: the hook is
imported in exactly `usePayrollGrid.ts` + `PayrollDaysMatrix.tsx`). Rates and
Summary do **not** use the hook — they each recompute counts from the
`payrollEntries` **prop**:

| Surface | Day counts source | Fee formula | Advance source for `total_fee` |
|---|---|---|---|
| Days matrix (`usePayrollGrid.totalsFor` :126–154) | hook `entries` (LIVE) | fees.ts | summed per-week `payroll_entries.advance_fee` (:137) |
| Rates (`PayrollRatesSpreadsheet` :141–165, `buildTotalsColumns` :38–44) | `payrollEntries` prop (STALE) | fees.ts | **rate-card `advance_fee`** (`adv(r)=Number(r.advance_fee)` :36) |
| Summary (`PayrollSummary` :31–95) | `payrollEntries` prop (STALE) | fees.ts | summed per-week `payroll_entries.advance_fee` (:42, :68) |

**The fee FORMULA never diverges** — all three call the same
`countDayStatuses` / `computeTotalFee` / `computeTotalPerDiem` from
`src/lib/payroll/fees.ts`. So PAY-04 is **not** a fees.ts divergence.

### PAY-04 is TWO distinct things
- **(a) Day-count staleness — fixed by the lift.** Days reads the live hook;
  Rates + Summary read the stale prop. After a Days edit, Rates/Summary show the
  pre-edit day counts → totals diverge from the Days matrix. *(Rates and Summary
  read the **same** prop, so on day counts they actually agree with each other —
  the visible "≠" is each of them vs the live Days matrix.)*
- **(b) Advance-fee INPUT divergence — a real, pre-existing discrepancy (a
  DECISION, not a free side-effect of the lift).** Rates' `total_fee` uses the
  **rate-card** `advance_fee` (so editing the Rates "Advance" column visibly
  moves the fee — deliberate, see the `PAY-02 note` comment at
  `PayrollRatesSpreadsheet.tsx:33–36`). Summary + `totalsFor` use the **per-week
  `payroll_entries.advance_fee`**. These two advance sources can drift (editing
  the rate card updates `personnel_rates.advance_fee` but not the per-week
  entries until a regenerate) → **Rates ≠ Summary on `total_fee` even with
  identical day data.** Same fees.ts; different advance input.

---

## 3. The fix — lift `usePayrollGrid` into `PayrollView` (mirrors the `rates` lift)

`PayrollView` already lifts `rates` to the parent (`useState(personnelRates)`
:46) and shares it to all three views. Do the same for the day-status layer:

```
PayrollView:
  const { statusOf, saveDayStatus, totalsFor, entries }
    = usePayrollGrid(tourId, routingDates, payrollEntries);   // owner moves UP

  → PayrollDaysMatrix:  receives statusOf + saveDayStatus as PROPS
                        (stops calling the hook itself)
  → PayrollRatesSpreadsheet: receives shared entries / totalsFor for its counts
  → PayrollSummary:     receives shared entries / totalsFor for its counts
```

Because `PayrollView` never unmounts on a tab switch, the hook state **survives**
→ remounting the Days matrix re-seeds from the **live** `statusOf` → **PAY-01
fixed**. All three read the **same** `entries`/`totalsFor` → day counts agree →
**PAY-04(a) fixed**.

### Decision for Adam — PAY-04(b) advance source
Pointing Rates' totals at the shared `totalsFor` makes Rates == Summary, **but**
`totalsFor` uses the per-week advance, so the Rates "Advance" column edits would
**no longer move the displayed Total fee live** (until a regenerate). Options:
- **(A) Unify on `totalsFor`** (per-week advance) → Rates == Summary == budget
  reconcile; lose the live "advance moves fee" feedback in Rates.
  **Recommended** — it's the "all three agree" the ticket asks for, and matches
  what the budget Salary feed already persists.
- **(B) Keep Rates' rate-card advance for `total_fee`, but feed its day-COUNTS
  from the shared hook.** Day counts agree everywhere; the advance-source
  discrepancy stays (a known PAY-02 item) and the live-advance UX is preserved.

Either way **fees.ts is unchanged** — only which advance *value* is passed in.
**I recommend (A); confirm before Stage B.**

### Untouched (guardrail audit)
- **`saveDayStatus` POST** (`usePayrollGrid.ts:98–122`) — body + endpoint
  identical; only *where the hook lives* changes.
- **Budget Salary/Per-Diem reconcile** — server-side, inside POST
  `/api/budget/payroll/route.ts` (reads `payroll_entries` from the DB). The
  client lift never touches it.
- **`internal_rate` gating** — server-side, in the personnel-rates API routes
  (`tours/[id]/personnel/[memberId]/rates/route.ts` et al.); not in these client
  views (the `PayrollView.tsx:11` mention is only a doc comment).
- **fees.ts** — not edited.

---

## 4. Ride-along + out of scope

- **MTX-06 (ride-along, low-risk):** with `totalsFor` now available to the Days
  matrix, show each person's total fee by their name. `frozenCols={1}` is the
  `person` column, so the cleanest "simple" option is a **trailing read-only
  Total column** (or a second frozen column). Decide the exact placement in
  Stage B; keep it a pure display read of `totalsFor(person)`.
- **⛔ Out of scope — MTX-05** (Days-header crowding: week label / date / city
  overlap). Pure layout; separate payroll-UX pass, not here.

---

## 5. Stage A compliance

- ✅ Confirmed unmount-on-switch + stale-prop reseed (cited `PayrollView:107–129`,
  `usePayrollGrid:65`, `PayrollDaysMatrix:76`, page fetch `payroll/page.tsx:47`).
- ✅ `usePayrollGrid` has exactly **one** consumer today (`PayrollDaysMatrix`).
- ✅ Rates + Summary recompute from the `payrollEntries` **prop**; all three use
  **fees.ts** → PAY-04(a) is data-staleness, PAY-04(b) is an advance-input
  divergence (named both calc paths above).
- ✅ Confirmed the lift leaves `saveDayStatus` POST, the budget reconcile, and
  `internal_rate` gating untouched (server-side / body unchanged).
- ⛔ **No code written.** Stopping for review — esp. the PAY-04(b) advance-source
  decision (A vs B) and the MTX-06 placement.

### Stage B smoke IDs (placeholders — `docs/smoke-tests/payroll.md`)
- **PAY-01** Edit a Days-matrix cell → switch to Rates (Total reflects it) →
  switch back → the cell still shows the edit (survives tab switch, no reload).
- **PAY-04** Summary totals == Rates totals == Days totals for the same person.
- **OPS-17** Ben still £6,300 (21 show × £300 + 10 travel × £0) — fee math intact.
- **MTX-06** Each person's total fee shows beside their name in the Days matrix.
