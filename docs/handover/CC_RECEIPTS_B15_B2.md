# CC — Receipts B1.5 (drag-onto-grid) + B2 (bulk scrape inbox + search). Phased. Branch off `main`.

B1 shipped: `AddReceiptPanel` does drag-drop **into the panel** → create → signed upload → Claude Vision
OCR → editable confirm → transaction/link → thumbnail/lightbox, all through the `useReceiptScan` seam.
Adam's asks now: **drag an image straight onto the grid**, and a **bulk inbox that actually scrapes each
receipt and is searchable**. Deliver **B1.5 first, then STOP** for Claude's verify before B2.

**Reuse, don't reimplement.** All scraping goes through the existing `useReceiptScan` seam +
`/api/budget/receipts/ocr` (Claude Vision) + `/api/budget/receipts` (create) + `/upload` (signed) +
`/sign`. Do not add a second OCR path.

## B1.5 — drag an image onto the Expenses grid (no schema)
Today a file drop only works on the `AddReceiptPanel` dropzone. Make the **budget Expenses grid** accept
an image dropped **onto a line-item row** → open the existing `AddReceiptPanel` scrape flow **pre-targeted
to that line item** (so the confirmed amount backs / links that row's transaction, exactly like the panel
flow does today).

- **Where:** the budget grid host (`src/components/budget/BudgetGridView.tsx` + `src/components/grid/Grid.tsx`).
  The Grid has **no file-drop seam today** (its existing "drop" handlers are row-reorder only — don't
  touch those). Add an **opt-in** `onFileDropToRow?(rowId, File)` prop to `Grid` (default undefined → no
  behaviour change for Payroll/Rooming/Income/Channel-List), wired only by `BudgetGridView`.
- On `dragover` of a file over a row, show a drop affordance (row highlight). On `drop`, hand
  `(lineItemId, file)` to a handler that opens `AddReceiptPanel` with the line item pre-selected and the
  file already in the scrape pipeline (image → OCR prefill; PDF → store, no scan, per D-SCRAPE). Nothing
  touches `actual_cost` directly — the amount lands as a reconciled transaction, same invariant as B1.
- Guard: only image/pdf MIME, ≤10MB (mirror `AddReceiptPanel`'s `ALLOWED_EXT`/`MAX_SIZE`). Ignore non-file
  drags so text/row-reorder drags are unaffected.
- **No migration. Then STOP** and report for verify.

## B2 — bulk scrape inbox + searchable (after B1.5 verify)
1. **Turn on per-receipt OCR in the bulk `ReceiptInbox`.** `src/components/budget/ReceiptInbox.tsx`
   currently defers OCR ("OCR auto-extract is deferred"). Drop many files → for each: create → signed
   upload → **OCR (images)** → show an editable confirm row prefilled from the scrape → on confirm,
   PATCH + transaction/link. Route everything through `useReceiptScan` so it matches B1's behaviour and
   metering (`withAiUsage`). PDFs: store, don't scan. Surface per-receipt status (scanning / needs review
   / linked) so a 20-file drop is triageable.
2. **Make receipts searchable.** Migration **`220`** (next free — 219 is the rollback; **re-confirm before
   writing**) adds `raw_ocr_json jsonb` (or `extracted_text text`) to `expense_receipts`, idempotent,
   down-block. The OCR route persists the raw extraction. Add a **`searchReceipts` ⌘K provider** in
   `src/lib/search/providers.ts` (fuzzy over vendor / amount / date / extracted text via the existing
   `fuzzy.ts`), opening the receipt's lightbox/inbox row on select. RLS: receipts are workspace-scoped
   financial/PII — the search must run through the existing scoped receipt route, never a broad query.
3. **No raw OCR text in logs or client errors** (PII). Signed URLs only (B1 already fixed `getPublicUrl` →
   `createSignedUrl`); keep that.

## Hard rules
- **Branch off `main`. Commit + PUSH. Confirm `git log origin/<branch>` before reporting.** B1.5 and B2 as
  **separate commits/pushes** (B1.5 verified before B2 starts).
- **Note the overlap:** B2's migration is `220` (not 218 — that's `drive_time_cache` from the maps merge).
  Re-confirm the number across `main` + active branches (collisions have bitten three times).
- Don't regress B1 (the `AddReceiptPanel` flow, `useReceiptScan`, signed URLs, the transaction-backing
  invariant) or the Grid for other products (the `onFileDropToRow` prop is opt-in, default off).
- Tokens; `next build --webpack`; `tsc` 0; `eslint` 0. New smoke IDs in `docs/smoke-tests/budget.md`
  (RCP-DRAG-01 drag image onto a row → scrape → backs that line; RCP-BULK-01 drop N files → each scrapes +
  confirms; RCP-SEARCH-01 ⌘K finds a receipt by vendor/extracted text).
- **Verify before claiming** — name files/lines; push the hash. I Chrome-verify: drag a receipt image onto
  a budget row → confirm form prefilled from OCR → confirm → that row gets the transaction; bulk-drop a few
  → each scrapes; ⌘K a vendor name → the receipt surfaces.
