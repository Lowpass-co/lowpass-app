# P0_BUDGET_CRASH_MAP — Stage A (map only, no code)

> Budget page SSR crash on **Good Neighbours / South Africa Aug'26** (Simple Plan
> loads). Defensive-hardening pass (Adam: harden + **log every caught error**,
> don't swallow; still want the real trace/URL to confirm).
>
> **Status:** Stage A. Awaiting review before Stage B. Fresh branch off `main`.

---

## 1. Why one bad tour takes down the whole page

`budget/[tourId]/page.tsx:124-170` awaits a **top-level `Promise.all([...])`**
(computeTourPhases, getBudgetPanelData, the line-items/routing/sections/settings/
artist queries). It is **not** wrapped — so if **any one** promise rejects, the
whole server render throws → the root error boundary's "Refresh, something went
wrong" (exactly Adam's symptom). The default tab is `budget` (the grid), so the
crash is in the **server data layer**, not a tab body (`computeBudgetPnl` runs
client-side inside `BudgetSummaryTab`, which isn't even mounted on default load —
**excluded**).

Already self-guarded (the pattern to copy): `reconcileDerivedBudgetLines`
(`page.tsx:122`) is wrapped so "a source hiccup can never break the budget page".
Nothing else in the SSR path is.

## 2. The throw points (data-shape dependent → "works on one tour, not another")

- **`computeTourPhases.ts:55-58` `shiftDate`** — `new Date(\`${iso}T12:00:00Z\`)`
  then **`.toISOString()`**. On an invalid/malformed `iso` the Date is
  `Invalid Date` and **`.toISOString()` throws `RangeError: Invalid time value`**.
  This is the prime SSR thrower. (`isoToday` :61 is always valid.)
- **`getBudgetPanelData.ts:44-62` `isoWeekKey` / `monthKey`** — `new Date(...)`
  then `getUTC*()`. On an invalid date these yield **`NaN` → a garbage string**
  (e.g. `"NaN-WNaN"`), **no throw** but corrupt buckets. `daysBetween` (:65-69)
  already guards `NaN → 0`. So panel data degrades rather than crashes — but
  should still be hardened for correctness.
- **`loadTourIncome` (income.ts:63-94)** — null-safe (`?? []`, optional chaining);
  unlikely to throw. Wrap anyway per Adam (belt-and-braces + log).
- **`enrichLinesWithTransactionAggregates` / `enrichLinesWithAttachmentCounts`**
  (`page.tsx:233-241`, awaited) — secondary wrap candidates; confirm they can't
  reject on a row-shape edge.
- **`generateMetadata` `:74` `.single()`** — throws if the tour is missing, but
  it's the same for every tour and Next handles metadata errors separately; not
  the page-render crash. Low priority (could switch to `maybeSingle`).

**Most likely root cause:** a routing/tour date on Good Neighbours that reaches
`shiftDate` → `.toISOString()` throw. **The trace/URL would confirm the exact
line** — Adam to provide; the hardening below is safe regardless.

## 3. Logging facility

**No Sentry / pino / logging dep exists.** "Logging" = **`console.error`**, which
Vercel captures in the function logs (and shows in `next dev`). Stage B adds a
tiny shared helper so it's one call site + ready to grow a Sentry hook later:

```
// src/lib/log/serverError.ts
export function logServerError(context: string, err: unknown, meta?: Record<string, unknown>) {
  console.error(`[lp] ${context}`, { err: err instanceof Error ? err.stack ?? err.message : err, ...meta });
  // (future: Sentry.captureException(err, { tags: { context }, extra: meta }))
}
```

Every catch calls it with the tour id — **nothing is swallowed**; the real stack
still lands in the Vercel log so the true root cause is captured.

## 4. Stage B plan (gated)

1. **Make `shiftDate` (and the week/month helpers) never throw on a bad date:**
   guard `Number.isNaN(d.getTime())` → `logServerError('computeTourPhases.shiftDate invalid date', …, { iso })` and return a safe fallback (the input slice / `''`), so `.toISOString()` is never reached on an Invalid Date.
2. **Wrap each SSR data fn so one failure degrades, not crashes** — mirror the
   reconcile self-guard. Either per-fn try/catch returning a safe default
   (`computeTourPhases → []`, `getBudgetPanelData → its empty shape`,
   `loadTourIncome → {income:[],routing_only:[]}`, enrich → the input lines), or
   wrap the `Promise.all` with per-item `.catch(err => { logServerError(...); return <default>; })`. Each catch **logs** (context + tourId + err).
3. **Add `logServerError`** (console.error now; Sentry-ready).
4. Optional: `generateMetadata` `.single()` → `.maybeSingle()` (+ guard) so a
   missing tour can't error metadata.
5. **Verify floor:** tsc 0, eslint 0, `next build --webpack` green. Confirm the
   budget page renders for a tour with a deliberately-malformed date (or Adam's
   Good Neighbours tour) instead of 500-ing.
6. Smoke `budget.md`: **BUD-58** — a tour with a bad/edge date still renders the
   budget grid (degrades; the error is logged to Vercel, not shown as a crash).

## 5. Stage A compliance
- ✅ Root mechanism pinned: unguarded top-level `Promise.all` (`page.tsx:124`) +
  the `.toISOString()` thrower (`computeTourPhases.ts:58`).
- ✅ Throw vs degrade classified for each SSR fn; `computeBudgetPnl` excluded
  (client, summary-only).
- ✅ Logging facility identified (no Sentry → `console.error`/Vercel) + a
  non-swallowing helper proposed.
- ⛔ **No code written.** Stopping for review. Still want the Good Neighbours
  **trace/URL** to confirm the exact thrower (hardening is safe either way).
