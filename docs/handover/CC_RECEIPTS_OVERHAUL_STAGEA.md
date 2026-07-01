# CC — Receipts overhaul (real upload + AI scrape + searchable). Stage A (MAP ONLY). Gated.

The desktop receipt flow is broken: attaching a receipt on a budget line/transaction just
mints an **empty numbered `expense_receipts` pill** (`GridSlideOver.tsx:397` `attachReceipt`)
— **no file upload, no drop, no image, no OCR.** Adam: "it just adds a random pill… doesn't
open an add-receipt tab or let you drop a receipt." He also wants **AI to scrape the receipt
for its info and make it searchable.**

**The backend mostly exists — this is a wiring + UX job, not from-scratch:**
- `api/budget/receipts/upload/route.ts` — uploads to Supabase Storage bucket
  **`budget-receipts`**, returns a public URL.
- `api/budget/receipts/ocr/route.ts` — **Claude Vision OCR**: accepts image/PDF, extracts
  receipt data, returns JSON (with AI-usage metering + rate-limit). **The AI scraper Adam
  wants already exists** — it's just not wired into the desktop attach.
- `api/budget/receipts/route.ts` — `expense_receipts` CRUD (numbering via migration 209's
  unique constraint).
- `components/spreadsheet-view/ReceiptsGrid.tsx`, `components/mobile/MobileReceiptCapture.tsx`,
  `app/(app)/m/receipt/page.tsx` — a receipts grid + a mobile capture flow.

**Stage A is a map + proposal only — no code — reviewed by Adam + Claude before build.**

## ⛔ Stage A — MAP ONLY → `RECEIPTS_OVERHAUL_MAP.md`
1. **Map the existing receipt backend.** `expense_receipts` schema (every column — does it
   already hold vendor/amount/date/category, or only a number + image_url?); the **OCR
   route's exact output shape** (what fields Claude Vision returns); the upload route
   (path/bucket/url); the receipts CRUD; `ReceiptsGrid`; `MobileReceiptCapture`. **Flag what's
   wired vs orphaned** (the OCR + upload appear orphaned on desktop — confirm).
2. **Map the broken desktop attach.** `GridSlideOver.tsx` — `attachReceipt` (the empty pill),
   the **Documents** section, the **Transactions** flow. Exactly where a real upload/drop +
   OCR would slot in (line-level Documents, and/or per-transaction).
3. **Propose the desktop Add-Receipt flow.** A real panel: **drag-drop OR file-pick** a
   receipt image/PDF → upload (existing route) → **run Claude Vision OCR (existing route)** →
   pre-fill vendor/date/amount/category/currency → create/link the `expense_receipts` row
   with the **image URL + extracted fields + number** → attach to the line (and/or a
   transaction). Show a **thumbnail/preview** on the line, click → full image (lightbox), not
   just a number. Where it mounts; the drop targets (line row? slide-over? transaction?).
4. **AI scrape wiring (D-SCRAPE).** Confirm the OCR output → which fields auto-fill, which
   need confirm; auto-suggest the amount → the line's actual / a transaction. Keep the
   metering + rate-limit. **If `expense_receipts` lacks the scraped fields, a migration adds
   them** (vendor, amount, txn_date, category, raw_ocr_json) — flag it.
5. **Searchability (D-SEARCH — the explicit ask).** Make receipts findable. Options: (a) index
   the structured OCR fields (vendor/amount/date/description) into the **⌘K search providers**
   (`lib/search/*`, UX08b); (b) push receipt text into the **RAG index** (the AI agent's
   `lib/ai/rag/*`) for semantic "find the hotel receipt from Berlin" search; (c) both.
   Recommend one; note the RAG path needs coordinating with the AI agent.
6. **Unify the surfaces.** A receipt created via desktop attach, the `ReceiptsGrid`, or mobile
   capture should be **the same `expense_receipts` row** — all searchable, all linkable to a
   line/transaction. Map how to converge them (don't leave three parallel half-systems).
7. **Migration number** (≥218 if schema changes; verify free).

Surface D-SCRAPE / D-SEARCH + the Add-Receipt UX placement with recommendations. **Then stop.**

## Hard rules
- **Branch off `main`. Commit to the feature branch and PUSH. Confirm `git log origin/<branch>`
  has the commit before reporting.**
- Don't regress: the budget grid, the line slide-over, versioning lock, the income work,
  mobile capture. Reuse the existing upload/OCR/CRUD routes — don't duplicate them.
- Storage: confirm the `budget-receipts` bucket exists (the upload route errors if not);
  flag if Adam must create it. Receipts hold financial/PII data — RLS workspace-scoped via
  existing helpers; signed/scoped URLs if the bucket isn't already private.
- Stage A is a doc — name real files/lines.
