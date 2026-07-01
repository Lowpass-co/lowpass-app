# CC — Receipts overhaul Stage B: GO. Build B1 first, then stop. Branch off `main`.

`RECEIPTS_OVERHAUL_MAP.md` reviewed + the key claims verified (the private-bucket/`getPublicUrl`
403 bug and the blank-pill `attachReceipt` are both confirmed). **Commit the map.** Decisions
below are LOCKED. Deliver **B1 only** on a fresh branch off `main`, then stop for Claude's
verify before B2–B4.

## Decisions — LOCKED
- **D-SCRAPE — confirm-before-save, never silently mutate actuals.** The OCR route stays as-is
  (Claude Vision, metered, rate-limited). It pre-fills an **editable form the user confirms
  before save** — the scrape is a *suggestion*, not an authority. The scraped amount maps to
  an **explicit transaction** on the line (which sums into `actual_cost` through the existing
  reconcile) **or** an `in_budget` flag — it must **NEVER write `actual_cost` directly**, or it
  breaks the settlement→actuals math (P1) and the versioning lock. A receipt **backs** a
  transaction; it doesn't bypass the model.
- **D-SEARCH — ⌘K now, RAG later.** B2 adds a `searchReceipts` ⌘K provider (the reserved
  `'expense'` kind, `providers.ts:16`) for deterministic "find the Hilton receipt." The RAG
  `expense_receipt` source (`sources.ts`) is **B3**, coordinated with the AI agent (don't
  touch the RAG index unilaterally).
- **D-UNIFY — one `expense_receipts` row.** The new Add-Receipt panel and `ReceiptsGrid`
  share a **`useReceiptScan`** seam (upload → OCR → confirm → persist) so they can't drift.
  Mobile's separate `expenses`-table flow is a **B4** convergence workstream — **do not block
  B1 on it**.
- **PDF = store-but-don't-scrape in v1** (Adam's call, via Claude). Vision is images-only:
  accept + upload + view PDFs, but skip OCR for them (rasterise-then-OCR is a later add). Only
  images go through the scraper.
- **Signed URLs (the 403 fix) — required, in B1.** The `budget-receipts` bucket is private
  (migration 063, `public=false`); `getPublicUrl` (`upload/route.ts:99`) yields a URL that
  403s. Replace with `createSignedUrl` (scoped, short-lived) wherever a receipt image is shown.

## B1 scope (build this, then STOP)
The desktop Add-Receipt flow + the signed-URL fix — i.e. the visible breakage, end to end.
- **Add-Receipt panel** mounted from the **line slide-over** (the Documents section) and the
  **transaction chip** (replacing the blank-pill mint at `BudgetGridView attachReceipt :300`):
  **drag-drop OR file-pick** → create/locate the `expense_receipts` row → **upload via signed
  path** → if image, **call the existing OCR route** → **prefill an editable confirm form**
  (vendor / date / amount / category / description) → on confirm, **PATCH** the row's fields +
  `receipt_file_url` + `linked_line_item_id` (and the txn `receipt_id` when attached to a
  transaction) → show a **thumbnail chip** → click → **signed-URL lightbox** (image) / open
  (PDF). No more blank numbered pill.
- **Signed-URL fix** so the thumbnail + lightbox actually render (createSignedUrl).
- Reuse the existing upload + OCR + receipts CRUD routes — **don't duplicate them**. Extract
  the `useReceiptScan` seam now so `ReceiptsGrid` can adopt it in B2.
- **No migration in B1** — use the existing `expense_receipts` columns (vendor/date/amount/
  category/`receipt_file_url`/`in_budget`/`linked_line_item_id`). Migration 218 (`currency` +
  `raw_ocr_json`) lands in **B2**; B1 drops the scraped currency/raw-json gracefully until then.

## Later phases (separate prompts after B1 verify)
- **B2:** migration 218 (`currency`, `raw_ocr_json`) + the ⌘K `searchReceipts` provider +
  `ReceiptsGrid` adopts `useReceiptScan` (and finally stores its image).
- **B3:** RAG `expense_receipt` source (agent-coordinated).
- **B4:** converge mobile capture onto `expense_receipts`.

## Hard rules
- **Branch off `main`. Commit to the feature branch and PUSH. Confirm `git log origin/<branch>`
  has the commit before reporting.**
- Receipts are financial/PII — RLS workspace-scoped via existing helpers; signed (not public)
  URLs; the OCR route keeps its metering + rate-limit.
- Don't regress: the budget grid, line slide-over, transactions/actuals math, versioning lock,
  income work. Tokens; `next build --webpack`; tsc 0; eslint 0.
- **Verify before claiming** — name files/lines; push the hash. I Chrome-verify: drop a
  receipt image on a line → it uploads, scrapes, prefills a confirm form, attaches, and shows
  a **viewable thumbnail** (no 403); the amount lands as a transaction, not a silent
  `actual_cost` write; the blank pill is gone.
