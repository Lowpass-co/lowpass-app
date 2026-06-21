# RECEIPT_FIX_MAP — Stage A→B

> Two independent bugs. **Status:** Stage B applied. tsc 0, eslint 0,
> `next build --webpack` green. **Bug A needs `npm run db:migrate` (209)** to
> renumber Adam's existing dup `R-001`s + add the UNIQUE guard. Awaiting Adam
> Chrome-verify (BUD-55 + RID-05).

---

## Bug A — receipt chip shows "R-001" (BUD-01) → it's the GENERATION path

### The decisive deduction (rules out the mapping)
The reload mapping is **provably correct**, so a chip literally reading `"R-001"`
can only mean the stored `receipt_number` **is** `"R-001"`:

- `transactions/route.ts:59-64` flattens the embed to `receipt_number` per txn:
  `receipt_number: receipt?.receipt_number ?? null`. ✅
- `BudgetGridView.tsx:242` maps it:
  `receiptLabel: t.receipt_id ? (t.receipt_number ?? 'Receipt') : undefined`. ✅
- `GridSlideOver.tsx:436-440` renders `t.receiptLabel`, else a `row.docs` name,
  else `String(t.receipt)` (a **UUID**).

**None of those fallbacks can produce the string `"R-001"`** — they produce
`'Receipt'` or a UUID. The only place `"R-001"` exists in the codebase is
`formatReceiptNumber(1)` in the receipts POST (`receipts/route.ts:20`). So the
chip is faithfully displaying a **real, stored** `receipt_number` of `"R-001"`.

`attachReceipt` (`BudgetGridView.tsx:275-288`) also links the txn to the **same**
receipt row it reads the label from (`receipt.id` for the PATCH,
`receipt.receipt_number` for the on-attach label) — so for any single receipt the
on-attach label and the reload embed value are the **same row** and cannot
diverge. The "degrades on reload" across **multiple** receipts therefore means
**several receipts carry the same number `R-001`** — i.e. duplicate numbers.

→ **Conclusion: Candidate 1 (generation). NOT candidate 2 (mapping is correct).**

### Why duplicates are possible + the exact suspect lines
- `expense_receipts.receipt_number` is `TEXT NOT NULL` with **no UNIQUE
  constraint** (`migrations/017_budget_system.sql:199`) — duplicate `R-001`s
  insert silently, no DB guard.
- Generation: `receipts/route.ts:125-136`
  ```ts
  const { data: existingReceipts } = await supabase            // :125 — error SWALLOWED
    .from('expense_receipts')
    .select('receipt_number')
    .eq('tour_id', tour_id)
    .eq('workspace_id', profile.workspace_id);                 // scoping LOOKS correct
  let maxNum = 0;
  for (const r of existingReceipts ?? []) { … max … }          // :131-135 — JS max
  const receiptNumber = formatReceiptNumber(maxNum + 1);       // :136 — maxNum 0 ⟹ R-001
  ```
  The scoping (`tour_id` + `workspace_id`) and the JS-max loop **read correct**.
  The defect is that `maxNum` collapses to `0` at runtime, which the static code
  permits via two non-exclusive routes:
  1. **Swallowed SELECT error (`:125`)** — `error` is destructured away. Any
     failed/empty read → `existingReceipts` null → `?? []` → `maxNum = 0` →
     `R-001`, **every time**, no error surfaced.
  2. **Non-atomic read-then-insert** — two attaches before the first row is
     visible both read `maxNum = 0` → both `R-001`. (The slide-over attach can
     fire in quick succession.)

  *(I can't run the DB to see which of 1/2 fired, but it does not change the fix:
  the value displayed is real, so numbering must be made correct + robust. The
  mapping needs no change.)*

### Stage B (Bug A)
Make per-tour numbering **correct, atomic-ish, and non-swallowing** — keep the
`R-00n` format:
- In `receipts/route.ts` POST: check the SELECT `error` (don't swallow); compute
  the next number defensively (e.g. `.order('receipt_number', {ascending:false})
  .limit(1)` for the max, or keep the JS max but **fail loudly** if the read
  errors rather than silently using 0). Optionally re-query-and-retry on a
  duplicate to close the race.
- **Vendor on the label (task "ideally vendor"):** add `vendor` to the txn GET
  embed (`receipt:expense_receipts(receipt_number, vendor)`), thread it through
  the flatten + `BudgetGridView` map, and render `R-00n · Vendor` when vendor is
  present (attach-created receipts are blank, so this is graceful when empty).
- **No mapping change needed** — it already works; only the stored numbers +
  (optional) the vendor field change.
- Smoke `budget.md`: **BUD-01** — attach two receipts → each chip shows its **own**
  R-00n after reload (no duplicate R-001).

---

## Bug B — no "New rider pack" button (light)

### Confirmed
- **Endpoint exists:** `POST /api/rider-packs` (`route.ts:86`). Tour-scoped body:
  `{ scope: 'tour', artist_id, tour_id }` — **`artist_id` is required**
  (`:124-126`), tour scope requires `tour_id` and **no** `routing_id`
  (`:134-139`). `kind` defaults to `'rider'` (`:119`) — omit it.
- **Response:** the new `rider_packs` row, `status 201`, with `id`
  (`:287`) → use `inserted.id` for navigation.
- **`artist_id` source:** the riders page already has it from the tour, but the
  current tour query **doesn't select it** —
  `operations/[tourId]/riders/page.tsx:29-34` selects `id, name, workspace_id`
  only. The per-pack `artist_id` at `:45` is on the `rider_packs` rows (no good
  when the list is **empty**). So Stage B must add `artist_id` to the **tour**
  select and pass it down.
- `RiderPacksTourClient` (`:18`) currently receives `{ tourId, tourName, rows }`
  and has no create affordance (only the per-row "…" button at `:81`).

### Stage B (Bug B)
- `riders/page.tsx`: add `artist_id` to the tour select (`:31`); pass
  `artistId={tour.artist_id}` to `<RiderPacksTourClient>` (`:65`).
- `RiderPacksTourClient`: accept `artistId`; add a **"+ New rider pack"** button
  in the header (next to the title / count). On click →
  `POST /api/rider-packs` with `{ scope: 'tour', artist_id: artistId, tour_id: tourId }`
  → on success `router.push(`/operations/${tourId}/riders/${created.id}`)` to open
  the new pack's editor. `router.refresh()` is fine; optimistic add is a bonus.
  Disable the button while the request is in flight; toast on error.
- Smoke `riders.md`: **RID-05** — click "New rider pack" → a pack is created and
  its editor opens at `/operations/[tourId]/riders/[newId]`.

---

## Stage A compliance
- ✅ Bug A pinned to **generation** (`receipts/route.ts:125-136`), with the proof
  that the mapping (`transactions/route.ts:59-64`, `BudgetGridView.tsx:242`,
  `GridSlideOver.tsx:436-440`) cannot emit `"R-001"` → the value is real; no
  UNIQUE guard (`017:199`) lets duplicates persist.
- ✅ Bug B confirmed: POST body `{scope:'tour', artist_id, tour_id}`, returns the
  pack `id` (201); `artist_id` must be added to the tour select + threaded to the
  client.
- ⛔ **No code written.** Stopping for review.
