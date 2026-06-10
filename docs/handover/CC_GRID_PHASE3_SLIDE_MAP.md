# Phase 3 finalise — Steps 3–5 map + decisions (Transactions / Documents / Receipts)

> Per the hard rule ("map both sides before writing for steps 3–4; surface
> questions, don't guess"). Steps 1–2 shipped (see bottom). Steps 3–5 wire the
> grid **slide-over** + **📎 receipts cell** to real tables. The transactions
> backend is fully ready; the documents backend is **partial**; the slide's
> demo receipt model **conflicts relationally** with the real one. Decisions
> below before any 3–5 code.

---

## What's confirmed to exist (cited)

### Transactions — backend COMPLETE
- Table `budget_line_item_transactions` (migration `104`): `id, workspace_id,
  line_item_id, vendor_name(NOT NULL), amount NUMERIC, currency(nullable=inherit),
  paid_at DATE, receipt_id→expense_receipts, notes, sort_order, timestamps`.
- Routes:
  - `GET/POST /api/budget/line-items/[id]/transactions` (list / create).
  - `PATCH/DELETE /api/budget/transactions/[id]` (edit one / delete).
  - `PATCH /api/budget/transactions/[id]/reorder` (sort_order only).
- `syncActualCostIfNoOverride()` (`src/lib/budget/transactions.ts` L141) keeps
  `actual_cost` = Σ transactions **unless `actual_cost_override`** — so the slide
  must NOT also write actual_cost (honours decision 6, no double-write).
- `enrichLinesWithTransactionAggregates()` already decorates page lines with
  `transaction_sum` + `transaction_count` (`budget/[tourId]/page.tsx` L225).
- A real UI already exists for the OLD slide: `src/components/budget/TransactionsSection.tsx`
  (dnd-kit, auto-save, calls all 4 routes) — reference / possible reuse.

### Documents/attachments — backend PARTIAL
- Table `budget_line_item_attachments` (migration `024`): `id, line_item_id,
  workspace_id, file_url(NOT NULL), file_name(NOT NULL), file_type, file_size_bytes,
  uploaded_by, uploaded_at, notes`. **No `type`/category column.**
- Route `/api/budget/line-items/[id]/attachments`: **POST (multipart file
  upload) + DELETE only**. ❌ no GET (can't list), ❌ no PATCH (can't rename).

### Receipts — separate system (BUD-30)
- Table `expense_receipts` (migration `017`): `id, tour_id, workspace_id,
  receipt_number, date, vendor, …, receipt_file_url, in_budget,
  linked_line_item_id, …`. Routes `/api/budget/receipts` (GET/POST/PATCH/DELETE).
- `budget_line_item_transactions.receipt_id` → `expense_receipts.id`.

### The grid slide today (`src/components/grid/GridSlideOver.tsx`)
- Transactions = **in-memory** `row.transactions[]` (`{date, desc, amount, receipt}`).
- Documents = **in-memory** `row.docs[]` (`{id, type, name}`).
- Receipt link (SLIDE-06/C4): a transaction's `receipt` holds a **`row.docs` id**;
  renaming that doc updates the txn label live (`receiptLabel()` L386).
- 📎 cell count (`Grid.tsx` L1024) = `row.docs.length + row.transactions.filter(receipt).length`.
- `GridSlideOver` takes NO async data — it mutates `row.*` via `commit()`.

---

## The core conflict (must resolve before Step 3/4)

The slide's demo says **a transaction's receipt IS one of the line's Documents**
(same `row.docs` array, linked by id). The real schema says they are **two
different tables**:
- a transaction's receipt = `expense_receipts` row (`receipt_id`), the BUD-30 system;
- a line's documents = `budget_line_item_attachments` rows (uploaded files).

So the C4 "rename a Document → the transaction's receipt label updates" pattern
**cannot hold across two tables** on real data. We must pick the real model.

---

## Decisions needed (D1–D5)

**D1 — Documents = real uploaded files?** The attachments table stores uploaded
files (`file_url/name/type/size`), but the slide's demo Documents are
`{type-picker, name}` with no file. Make budget Documents = **real file uploads**
(Add = file picker → POST multipart; the "type" chip shows `file_type`/extension)?
*(Recommended — matches the table + the BUD-30 receipts drop system. The
type-picker demo doesn't map to a real column.)*

**D2 — Add GET + PATCH to the attachments route?** To list on slide-open and to
rename (`file_name`), the route needs **GET** + **PATCH** (it has only POST/DELETE).
These are API routes, not migrations (no 200-block needed). Add them?
*(Recommended yes — small, mirrors the transactions route shape.)*

**D3 — Transaction "attach receipt" target.** On real data, "attach receipt"
should **create/link an `expense_receipts` row** (BUD-30) and set
`transactions.receipt_id`, NOT link a Document. Confirm — and accept that the
live doc-rename→txn-label pattern becomes **demo-only** (real receipts are named
via the receipts system / `receipt_number`)?
*(Recommended yes — it's the real relation. The slide shows the receipt's
number/vendor as the label.)*

**D4 — Slide data loading.** `GridSlideOver` is currently synchronous
(mutates `row.*`). Wiring real CRUD means **fetch-on-open** + optimistic writes.
Cleanest: inject **optional async CRUD callbacks** from `BudgetGridView`
(`txnList/txnAdd/txnPatch/txnDelete`, `docList/docAdd/docRename/docDelete`); the
demo (`/grid-demo`) passes none and keeps its in-memory behaviour. OK to extend
`GridSlideOverProps` this way (keeps the demo working, no route calls there)?
*(Recommended — same injection pattern as `fx`/`onEdit`.)*

**D5 — Step 5 receipts count source.** The 📎 count should = transactions-with-
receipt + attachments. `transaction_count` already comes from the page enrich;
attachments need the same treatment. Add `enrichLinesWithAttachmentAggregates()`
(mirror of the txn one) at the page level so the grid gets `attachment_count`
without N per-row requests?
*(Recommended yes. Then the 📎 toaster lists vendor/receipt + file names with
"open line ↗", reading the same two sources.)*

---

## Build order once D1–D5 are answered

1. (D2) Add GET + PATCH verbs to `attachments/route.ts`. *(needs-live)*
2. (D5) Add `enrichLinesWithAttachmentAggregates`; feed `transaction_count` +
   `attachment_count` into the grid rows via `budgetAdapter`.
3. (D4) Extend `GridSlideOverProps` with optional async txn/doc CRUD; fetch on
   open; optimistic writes; demo unchanged.
4. (D3) Transactions: wire to the real routes; "attach receipt" → expense_receipts.
5. (D1) Documents: wire to attachments (upload / rename / delete).
6. Step 5: 📎 cell reads real counts + toaster.
7. **Step 6 (gated):** flip the toggle default to Grid once 1–5 are live-verified.

Each step independently verifiable; Adam live-verifies via Chrome before the flip.

---

## Steps 1–2 — SHIPPED this pass (build/code-verified; needs-live)

- **Step 1 / BUD-41 — currency binds to the DISPLAY selector.**
  `BudgetGridView` now reads `?display=` via `useSearchParams` (same source as
  the burn bar + export controls). Split **native** (tour currency, fallback for
  currency-less lines → `budgetToGridSections`) from **display** (`fx`). Flipping
  DISPLAY re-renders the client component → new `fx` → cells AND totals convert
  together; a non-display-currency line renders the red ≈ note (GRID_SPEC §4).
- **Step 2 / BUD-42 — reorder persists.** `Grid` gained `onReorderRow(sectionUid,
  orderedRowUids)` + `onReorderSection(orderedSectionUids)`, fired from
  `endReorder` after the splice. `BudgetGridView` PATCHes each uid's `sort_order`
  to its new index (both PATCH routes already accept `sort_order`; optimistic,
  failure → toast + refresh). Reconcile's **update** path never touches
  `sort_order` (verified `reconcileDerivedLines.ts` L282–288), so existing
  derived rows keep their manual order; only a brand-new derived insert starts at
  `sort_order:0` (bubbles to top until reordered) — acceptable, noted.

Verify floor for 1–2: tsc 0, eslint 0, `next build --webpack` green.
