# CC — Two fixes: budget receipt shows "R-001" (BUD-01) + add a "New rider pack" button

Independent bugs, bundled. Both gated (Stage A map → Stage B). I traced the anchors
below so you start in the right place.

---

## Bug A — receipt chip shows a generic "R-001" instead of the real number (BUD-01)
Adam: attach a receipt → it shows on initial load, then after **reload** the chip
degrades to a generic "R-001". The chain (files I found):
- `src/app/api/budget/receipts/route.ts:21` — `receipt_number` is auto-generated
  `R-${n.padStart(3)}` (R-001, R-002…), max-query at `:127`. **Check this first: is the
  "next number" query scoped correctly (per workspace/tour) and ordered so it doesn't
  always return R-001?** A mis-scoped/mis-ordered max → every receipt becomes "R-001".
- `src/app/api/budget/line-items/[id]/transactions/route.ts:51-63` — the txn GET
  embeds `receipt:expense_receipts(receipt_number)` and flattens to a `receipt_number`
  field on each txn.
- `GridSlideOver.tsx` `receiptLabel(t)` (~`:438`) — renders `t.receiptLabel`, else a
  row.doc lookup, else `String(t.receipt)` (the id). And `attachReceipt` sets
  `t.receiptLabel = label` from the API on attach.

### Stage A → `docs/handover/RECEIPT_FIX_MAP.md`
Pin which of the two it is:
1. **Generation bug** — `receipt_number` itself is always "R-001" (the max-query at
   `route.ts:127` isn't finding the real max). OR
2. **Mapping/reload bug** — receipts get unique numbers, but on reload the budget
   adapter / txn load doesn't map `receipt_number` → `t.receiptLabel`, so the chip
   falls back to a generic value. (Trace where the txn GET's `receipt_number` is
   supposed to populate `t.receiptLabel` for the grid slide-over — that mapping is the
   likely gap.)
Name the exact broken line. Then stop.

### Stage B
Fix the identified break so each receipt's **own** number (and ideally vendor) shows on
the chip, persisting across reload. Don't change the receipt_number FORMAT (R-00n) —
just make it correct + correctly displayed.

---

## Bug B — no "New rider pack" button (can't create a pack)
Adam deleted the only pack (RID-03) and there's no way to make a new one. The endpoint
**already exists**: `POST /api/rider-packs` (`route.ts:8` — "creates a rider_folders
row + one rider_packs row", body `{ scope, artist_id, tour_id, … }`). There's also
`POST /api/rider-packs/clone` for "amend/duplicate".

The list (`src/components/tours/RiderPacksTourClient.tsx`) has **no create affordance** —
its only button is the per-row "…" details (`:81`).

### Stage A (light) → note in the same map
Confirm the exact `POST /api/rider-packs` body for a **tour-scoped** pack (scope, the
tour_id + artist_id source — `RiderPacksTourClient` gets `tourId`; where's the
artist_id?), and the success response shape (does it return the new pack id for
navigation?).

### Stage B
Add a **"+ New rider pack"** button in `RiderPacksTourClient`'s header (next to the
title / "1 row" area). On click → `POST /api/rider-packs` (tour scope) → on success,
`router.push('/operations/[tourId]/riders/[newId]')` to open the new pack's editor
(the route you just built). Optimistic add to the list is a bonus; `router.refresh()`
is fine.

---

## Hard rules
- Tokens; `next build --webpack`; tsc 0; eslint 0. Don't regress the budget grid,
  the receipt attach flow, the riders list/editor/delete, or templates.
- **Verify before claiming** — name files/lines; push + "Pushed `<hash>`". I
  Chrome-verify: attach two receipts → both show their **own** numbers after reload;
  click "New rider pack" → a pack is created + its editor opens.
- Land smoke IDs in `budget.md` (receipt) + `riders.md` (create).
