# CC — Budget Income grid is BROKEN on preview (BUD-50 FAIL). Fix before merge.

Chrome-verified on the `feat/personnel-unify` preview (commit `0212fdd`,
deploy `dpl_sf9D8…`). **The Income tab never renders — permanent "Loading income…".**
`tsc/eslint/build green` did not catch this; it's a runtime client-lifecycle bug.

## Confirmed facts (evidence, not guesses)
1. `BudgetIncomeGrid` IS mounted (`page.tsx:330`) and rendering — the Projected/
   Actual toggle + the "Loading income…" spinner are on screen.
2. Its GET `/api/budget/income?tour_id=6889d072-20c8-467c-9fbc-4d2469f6cac0` returns
   **HTTP 200, `application/json`**, body `{ income: [] , routing_only: [31 shows] }`.
   I re-ran the exact request from the page context — it parses instantly; 31 routing
   rows are present. **The endpoint + the bridge are healthy.**
3. The component is stuck at the initial `rows === null` branch: `setRows` is never
   reflected AND `setLoadError` never fires (no error box). The one state that should
   not survive a successful fetch is the one it's stuck in.
4. **Exactly one** component fetch fired (network shows a single GET) — so it is NOT
   a remount / re-fetch loop.
5. **Expenses (`BudgetGridView`) works on the same deploy.** The architectural
   difference is the whole story: Expenses receives `lines`/`sections` as **props**
   (server-fetched in `page.tsx`) and renders synchronously — no client fetch, no
   loading gate. **Income is the only budget surface that self-fetches on the client**,
   and that path never commits its result.
6. There is an app-wide React **#418 hydration error** (also present on Expenses, so
   not unique to Income — but Income's async mount may interact with it). Repro it
   locally with non-minified React to get the full message + component stack.

## The fix I recommend (primary) — feed Income by props, like Expenses
`page.tsx` is a server component and already fetches `lines`/`sections` server-side.
Do the same for income: fetch the income rows server-side (reuse the **same** server
query/lib the `/api/budget/income` GET uses — don't duplicate the merge logic), pass
them to `BudgetIncomeGrid` as an `initialRows` prop, and render the `<Grid>`
synchronously from props. Drop the `rows===null` loading gate for the initial load
(keep a client re-fetch only for the post-edit failure path). This removes the entire
class of client-fetch-never-commits bug **and** makes Income consistent with the
proven Expenses architecture. The bridge is unchanged — same fields, same upsert,
same `computeBudgetPnl` feed.

## If you insist on keeping the client fetch (secondary)
Instrument why `setRows` doesn't commit after a 200: log inside `load()` right before
`setRows`; confirm `useEffect` runs; check for a mount/unmount race (the instance that
fired the fetch unmounting before the promise resolves) or a swallowed throw between
`res.json()` and `setRows`. But the prop-feed above is the lower-risk fix.

## Rules
- Don't touch the bridge (field names, `post_tax` rule, `/api/budget/income` upsert,
  `computeBudgetPnl`). Keep Expenses / grid-demo / `gridModel.template()` unchanged
  (the `allowAddRows`/`ro` additive props stay default elsewhere).
- `next build --webpack`; tsc 0; eslint 0. **Repro locally first**, fix, then
  **push and include the "Pushed `<hash>`" line.**
- I re-Chrome-verify: Income renders the 31 shows, live post-tax/total recompute +
  persist, Projected↔Actual swap, and the Summary P&L `income_gross` parity (BUD-53,
  which I could not reach this round because the grid never rendered).
- Do NOT delete the legacy `BudgetIncomeTab` until BUD-53 passes (CC already kept it
  unmounted — good; it stays until this is green).

## Note
`feat/personnel-unify` is **not mergeable** until this is fixed — Income is a shipped-
claimed surface that's currently dead.
