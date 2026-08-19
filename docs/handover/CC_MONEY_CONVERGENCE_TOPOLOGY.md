# Money convergence — topology confirmed. NO CODE CHANGED.

> **SUPERSEDED IN EMPHASIS, 2026-08-14.** `CC_MONEY_CONVERGENCE.md` gained a
> ROOT CAUSE section after this was written, from probing Coachella live. Read
> that first. What changed:
>
> - **M-1b is NOT the reported symptom.** I called it "the sharpest item in the
>   brief" below. The bug is real and confirmed, but Coachella has no
>   `flat_once` lines at all, so nobody there has an advance to strip. My
>   emphasis was wrong because I ranked by code severity without data — exactly
>   the mistake the brief opens by warning about.
> - **The actual cause is that `payroll_entries` has ZERO rows for the tour.**
>   The column is not merely wrong, it is absent by default: rows are written
>   only when someone paints a day status, and nobody has. Live-computing
>   surfaces show real figures; column-reading surfaces show zero.
> - **The highest-value fix is an EIGHTH formula I did not find** —
>   `lib/commission-context.ts:83-96`, which reads legacy columns that are all
>   zero and an empty `payroll_entries`, so every direct-cost and net-basis
>   commission is computed against a subtotal missing all salaries and per
>   diems. Wrong now, on live data, on what people get paid.
> - **Adam ruled**: drop `payroll_entries.total_fee` as a source of truth. Do
>   not cache it, do not fix its arithmetic — move all seven readers to the
>   derived budget lines and drop the column.
> - **Both orphan checks I flagged as unresolved are now resolved**, both dead:
>   `TourBudgetAccordion` ↔ `TourBudgetAccordionDynamic` are mutual orphans, and
>   `PayrollSummary`'s only apparent referrer is `PayrollSummaryCard` — a
>   different component sharing a prefix.
>
> The path correction below was independently confirmed and still stands.
> Everything else here is accurate but mis-ranked; the brief is authoritative.

`CC_MONEY_CONVERGENCE.md` opens with *"Confirm every file:line below before
planning."* This is that confirmation, and nothing else. **No money code was
touched.**

Banked so the next session does not re-derive it.

## Confirmed exactly as written

**M-1b — the advance fee is silently zeroed on every day-status paint.**
`api/budget/payroll/route.ts`:

```ts
:165  const advanceFee = Number(body.advance_fee) || 0;
:187  const base = computeTotals(lines.filter((l) => l.basis !== 'flat_once'), counts);
:188  const total_fee = base.totalFee + advanceFee;
```

and `usePayrollGrid.ts` carries `advance_fee` only as a TYPE FIELD (`:44`) — it
is never in the request body. So `Number(undefined) || 0 = 0`, and every paint
rewrites `payroll_entries.total_fee` with the advance removed and Flat tour
never in it at all. **Seven surfaces read that column, including commission.**

It is silent, it is persisted, and it corrupts on a routine UI action — but see
the banner above: it is NOT what Adam is looking at on Coachella, because that
tour has no `flat_once` lines for it to strip. Real bug, wrong rank.

**M-1a — the loader's transitional fallback exists**, with `linesByRateId` and
`legacyByRateId` both present and the legacy map documented as *"for the
transitional fallback"*. The two-path divergence the brief describes is real.

## One correction

**The loader is `src/lib/payroll/loadRateLines.ts`, not
`src/server/budget/loadRateLines.ts`.** Line numbers hold; the directory does
not. Same class of slip as the riders brief (`components/tours/`, not
`components/riders/`) — the briefs are line-accurate and directory-approximate,
so resolve the path before trusting a `sed -n`.

## Why I stopped here

The brief's own framing is the reason: *"Do not treat harness-green as evidence
for anything in this bank."* It then requires, for any payroll change, new
harness pins and **before/after totals for Coachella specifically**.

I cannot produce either. I have no database access, so I cannot read Coachella's
roster, cannot tell which rate cards have zero `personnel_rate_lines` rows — the
brief's own "check this first" — and cannot compute a before/after total. Adding
pins to a harness while unable to observe the data they are meant to pin is how
a suite gets a bigger number and no more coverage.

Changing persisted money code at the end of a long session, verified only by the
four gates this project has repeatedly shown are blind to exactly this class,
would be the failure mode the whole convergence bank exists to fix.

## What the next session needs first

1. **The Coachella query the brief asks for**: roster rate cards with zero
   `personnel_rate_lines` rows. That decides whether M-1a is the reported
   symptom or a red herring.
2. **Adam's ruling on `payroll_entries.total_fee`** — cache written from formula
   2, or drop the column and move seven readers. The brief says recommend and
   stop; dropping a persisted money column is not a call to make inside a bug
   fix.
3. **Two orphan checks before deleting anything**: `TourBudgetAccordion` (the
   brief suspects `TourBudgetAccordionDynamic` has no consumer) and
   `PayrollSummary.tsx` (claimed never mounted, carries a seventh formula).
   Both are exactly the "reference count of one deserves following" shape —
   verify by reading the referrer, not by counting.

## Standing gates, unchanged

Harnesses 72 / 27 / 40 and they must be EXTENDED, not merely kept: a blank rate
card, an advance fee whose days get painted, a `pd_only` day, a `promo_radio`
day. Report both numbers and name the pins.

M-2 needs a migration (`hotels.is_placeholder`, an assumed nightly rate on
`budget_settings`, `budget_line_items.unit_cost`) — paste-gated, wait for
"pasted".
