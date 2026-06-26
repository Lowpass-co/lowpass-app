# RECEIPTS_OVERHAUL_MAP — Stage A (map + decisions only; no code)

> The desktop receipt flow is broken: attaching a receipt on a budget line /
> transaction mints an **empty numbered `expense_receipts` pill** — no file, no
> drop, no image, no OCR. Adam wants a real **drag-drop + AI-scrape (Claude
> Vision) + searchable** receipt flow. **The backend already exists** (upload,
> OCR, CRUD, a working ReceiptsGrid) — this is a **wiring + UX + convergence**
> job, not from-scratch.
>
> **Status:** Stage A — map only. Awaiting Adam + Claude sign-off on **D-SCRAPE /
> D-SEARCH / D-UNIFY + the Add-Receipt UX placement** before any code. Mirrors the
> Stage-A discipline of `INCOME_REDESIGN_MAP.md` / `INCOME_P3_PROJECTION_MAP.md`.

---

## 1. Current receipt backend — what exists, wired vs orphaned

### 1a. Schema — richer than feared (NOT "just a number + image")
`expense_receipts` (migration **017**, `017_budget_system.sql`) already holds the
structured fields:

| Column | Notes |
|---|---|
| `id`, `tour_id`, `workspace_id` | workspace-scoped |
| `receipt_number` TEXT | `R-001…`, **UNIQUE(tour_id, receipt_number)** added in **209** |
| `date` DATE · `vendor` TEXT · `category` TEXT · `description` TEXT | the scrape targets — **already exist** |
| `payment_method` TEXT default `card` | |
| `cost_tour_currency` NUMERIC · `cost_home_currency` NUMERIC | dual-currency amounts |
| `receipt_file_url` TEXT | the image/PDF link |
| `in_budget` BOOLEAN | counts toward the line's actual (§11 math) |
| `linked_line_item_id` UUID → `budget_line_items` ON DELETE SET NULL | line link |
| `notes` TEXT, `created_at`, `updated_at` | |

- **Per-transaction link exists:** `budget_line_item_transactions.receipt_id` →
  `expense_receipts(id)` ON DELETE SET NULL (migration **104**). So a receipt can
  attach to a **line** (`linked_line_item_id`) and/or a **transaction** (`receipt_id`).
- **Missing for a full scrape:** the receipt's **native `currency`** (the OCR
  returns one; the schema only has tour/home cost) and a **`raw_ocr_json`** to keep
  the full extraction (incl `line_items`) for audit + semantic search. → D-SCRAPE
  migration (§4).

### 1b. OCR route — the AI scraper Adam wants ALREADY EXISTS (orphaned on the line attach)
`src/app/api/budget/receipts/ocr/route.ts` — **Claude Vision (Haiku 4.5)**,
auth-gated (`requireUserAndWorkspace` + `requireTourInWorkspace`), per-user
**rate-limited** (3s), **AI-metered** (`withAiUsage`, endpoint `budget.receipts.ocr`).
POST multipart `{file, tour_id, currency}` → returns JSON (it **persists nothing**):
```json
{ "vendor": str, "date": "YYYY-MM-DD", "total_amount": number,
  "currency": "GBP|USD|EUR…", "category": "hotel|transport|production|catering|misc",
  "description": str, "payment_method": "card|cash|bank_transfer",
  "line_items": [{ "description": str, "amount": number }] }
```
- ⚠️ **Images only** — `ALLOWED_TYPES = jpeg/png/webp/gif`; **PDF is rejected** for
  vision (the upload route accepts PDF, the OCR route doesn't — mismatch to flag).
- Used **only** by `ReceiptsGrid` (§1e). **NOT** called from the budget line
  slide-over / transaction attach → **orphaned on desktop attach** (confirms Adam).

### 1c. Upload route — works, but the returned URL is broken for a private bucket
`src/app/api/budget/receipts/upload/route.ts` — POST `{file, tour_id, receipt_id}`
→ Supabase Storage bucket **`budget-receipts`**, path
`tours/{tour_id}/receipts/{receipt_id}/{filename}`, accepts **PDF + images** (≤10MB).
- ⚠️ Returns **`getPublicUrl(path)`** — but the bucket is **PRIVATE** (migration
  **063**, `public: false`). A "public" URL on a private bucket **403s**. → the
  stored `receipt_file_url` won't render. **Fix in build: store the path + serve a
  `createSignedUrl` on read** (or a signed-url endpoint). Flag (§7).
- Requires the `receipt_id` to exist first (path keys on it) → flow is **create
  receipt → upload to its id → PATCH `receipt_file_url`**.

### 1d. Receipts CRUD — `src/app/api/budget/receipts/route.ts`
- **POST** (`:72`): auto-numbers `R-00n` (max+1 per tour, **retry on 23505** =
  209's unique constraint). If `in_budget && linked_line_item_id` → adds cost to the
  line's `actual_cost` (math spec §11).
- **PATCH** (`:208`) / **DELETE** (`:328`): apply/undo the `in_budget` delta on the
  line actual. So **`in_budget` is the "count this receipt toward actuals" toggle.**

### 1e. ReceiptsGrid — the WORKING desktop scrape (but discards the image)
`src/components/spreadsheet-view/ReceiptsGrid.tsx` `handleOcrFile` (`:152-205`):
file → `/receipts/ocr` (`:166`) → `/receipts` create with vendor/date/amount/
category/description (`:181`). **It does NOT call the upload route → the image is
never stored** (`receipt_file_url` stays null). So the scrape works here, but you
lose the picture. (And it's a separate surface from the budget grid.)

### 1f. Mobile capture — a DIFFERENT table (the convergence problem)
`src/components/mobile/MobileReceiptCapture.tsx` (+ `app/(app)/m/receipt/page.tsx`)
camera-captures → **`/api/expenses`** (`:319`) → the **`expenses` table** (NOT
`expense_receipts`; `src/app/api/expenses/route.ts:50`). So mobile receipts live in
a **parallel system** that desktop never sees. → D-UNIFY (§6).

### Wired-vs-orphaned summary
| Piece | State |
|---|---|
| `expense_receipts` schema + numbering | ✅ solid (rich fields, unique numbers) |
| Upload route (bucket + path) | ⚠️ works but returns a public URL for a **private** bucket → 403 |
| OCR route (Claude Vision) | ✅ works, metered/limited — **orphaned** except ReceiptsGrid; **no PDF** |
| Receipts CRUD + in_budget math | ✅ solid |
| **ReceiptsGrid** scrape | ⚠️ OCR works but **never stores the file** |
| **Desktop line/txn attach** | ❌ empty pill (no file/OCR) — §2 |
| **Mobile capture** | ⚠️ writes `expenses`, not `expense_receipts` — divergent |
| ⌘K search of receipts | ❌ `'expense'` kind deferred (providers.ts:16) |
| RAG index of receipts | ❌ not a source kind (sources.ts:29) |

---

## 2. The broken desktop attach (`GridSlideOver.tsx` + `BudgetGridView.tsx`)

- **The empty pill.** Transaction "＋ attach receipt" (`GridSlideOver.tsx:552`) →
  `attachReceipt` (`:397`) → `lineApi.attachReceipt` whose budget impl
  (`BudgetGridView.tsx:300`) POSTs `/receipts` with **only**
  `{tour_id, linked_line_item_id, in_budget:false}` → a **blank numbered row** (no
  file, vendor, amount, OCR) → PATCHes the txn's `receipt_id`. The chip shows just
  the number → "it just adds a random pill." The demo path (`:417-432`) is worse
  (mints a fake `Doc`).
- **Documents section** (`GridSlideOver.tsx:636`) — a SEPARATE concept:
  `addDocument` (`BudgetGridView.tsx:334`) → `/budget/line-items/{id}/attachments`
  → **`budget_line_item_attachments`** (general files, no OCR, not `expense_receipts`).
  This has a **real file-upload input** already (the pattern to reuse for the drop
  zone) — but it's documents, not scraped receipts.
- **Where the real flow slots in:** (a) the **transaction** "attach receipt" chip
  (`:552`) → open the Add-Receipt panel instead of minting a blank; (b) a new
  **"Add receipt"** affordance + **drop zone** in the line slide-over (next to /
  inside Documents), creating a line-linked `expense_receipts` row.

---

## 3. Proposed desktop Add-Receipt flow (the build target)

A single **Add-Receipt panel** (slide-over section or modal), opened from **both**
the line slide-over and the per-transaction chip. One flow:

```
drop OR file-pick (image/PDF)
  → POST /receipts (create row, get id + R-00n)            [existing CRUD]
  → POST /receipts/upload {file, tour_id, receipt_id}       [existing upload]
  → POST /receipts/ocr {file, tour_id, currency}            [existing Claude Vision]
  → prefill an editable form: vendor / date / amount / currency / category / payment
  → user reviews + confirms
  → PATCH /receipts {…fields, receipt_file_url, linked_line_item_id}   [existing CRUD]
  → (optional) link to the transaction (receipt_id) / toggle in_budget
  → chip shows a THUMBNAIL; click → lightbox (signed URL), not just a number
```
- **Mount points / drop targets:** the line slide-over Documents/Receipts area
  (drop zone + "Add receipt"); the transaction "attach receipt" chip (`:552`); and
  ideally the **line row's receipts cell** in the grid (drop a file onto the row).
- **Reuse, don't duplicate:** extract the upload→OCR→create→prefill sequence into a
  **shared hook/component** (e.g. `useReceiptScan` / `<AddReceiptPanel>`) used by
  BOTH the slide-over attach AND `ReceiptsGrid` (which today does a thinner version
  and loses the file). This is the seam that prevents a 4th parallel half-system.
- **PDF:** the OCR route rejects PDF. Options: (a) only OCR images, store PDFs
  without scrape (manual entry); (b) add PDF→image rasterisation before OCR. Flag
  for Adam — recommend (a) for v1 (store + manual), (b) later.

---

## 4. ⛔ D-SCRAPE — OCR → fields, auto-fill vs confirm, the migration

- **Field mapping** (OCR → `expense_receipts`): `vendor→vendor`, `date→date`,
  `description→description`, `payment_method→payment_method`, `category→category`
  (map the 5 OCR categories to the receipt vocabulary), `total_amount→cost_*`
  (native amount; if `currency==tour` → `cost_tour_currency`, else convert / store
  native + flag), `currency→` **new `currency` column**, full payload →
  **new `raw_ocr_json`**.
- **Auto-fill vs confirm (recommended):** OCR **pre-fills an editable form**; the
  user **reviews + confirms** before the row is finalised (receipts are financial —
  don't silently trust the model). Low-confidence/null fields highlight for entry.
- **Amount → actual:** do **NOT** auto-mutate a line's `actual_cost`. Surface the
  scraped amount and let the user **explicitly** set `in_budget` (the existing §11
  toggle) and/or set a transaction `amount`. This keeps the actuals math + the
  versioning lock honest. (Recommend a one-click "Apply £X to this line's actual"
  that just flips `in_budget` — explicit, reversible.)
- **Keep** the OCR route's **metering + rate-limit** exactly as-is (reuse the route).
- **Migration 218** (D-SCRAPE schema): `expense_receipts` ADD
  `currency TEXT`, `raw_ocr_json JSONB`, (optional) `ocr_status TEXT` /
  `scanned_at TIMESTAMPTZ`; and for the private-bucket fix, either keep
  `receipt_file_url` (served as a signed URL) or add `receipt_file_path TEXT`
  (store path, sign on read). Additive, nullable, idempotent, down-block.

---

## 5. ⛔ D-SEARCH — make receipts findable (the explicit ask)

- **(a) ⌘K provider (recommended first).** `src/lib/search/providers.ts` already
  reserves the **`'expense'`** kind (deferred, `:16`). Add a `searchReceipts`
  provider querying `expense_receipts` by `vendor / description / receipt_number /
  amount` → instant deterministic "find R-014 / the Hilton receipt." Low effort,
  ships the literal "searchable" ask. Action: open the receipt (in ReceiptsGrid or
  a receipt slide-over).
- **(b) RAG index (semantic — coordinate with the AI agent).**
  `src/lib/ai/rag/sources.ts` indexes `deal_memo / venue / budget_line_item`
  (`RAG_SOURCE_KINDS`, `:29`) — **budget figures are already indexed**, so receipts
  fit the precedent + PII stance. Add an `expense_receipt` source kind (vendor +
  description + line_items + amount + date) → "find the hotel receipt from Berlin."
  Needs reindex hooks on receipt create/update/delete (`rag/reindex.ts`) and
  **coordination with the AI-agent owner**.
- **Recommendation: BOTH, phased — (a) now** (cheap, deterministic, closes the ask),
  **(b) as a follow-up** coordinated with the agent. Flag the RAG dependency.

---

## 6. ⛔ D-UNIFY — converge the three surfaces onto one `expense_receipts` row

Today: **desktop attach** (empty `expense_receipts`), **ReceiptsGrid** (scraped
`expense_receipts`, no file), **mobile** (`expenses` table). Recommendation:
- **`expense_receipts` is the single source of truth.** The new Add-Receipt flow +
  ReceiptsGrid share the `useReceiptScan`/`<AddReceiptPanel>` seam (§3) → identical
  rows, file stored, OCR'd, linkable to line + transaction, searchable (§5).
- **Mobile** (`/api/expenses` → `expenses`) is a **separate workstream** — don't
  block the desktop fix on it. Map the convergence (re-point mobile capture at the
  receipts routes, or a one-time `expenses → expense_receipts` reconcile) as a
  follow-up; flag the duplication so it isn't entrenched further.
- A receipt created in ANY surface then appears in ReceiptsGrid, on its line/txn,
  and in search — because they're one table.

---

## 7. Storage, security, migration

- **Bucket `budget-receipts`** is created **private** by migration **063** (+ 4 RLS
  policies on `storage.objects`). **Confirm 063 is applied** on Adam's DB (the
  upload route errors "Bucket not found" otherwise — flag for Adam to verify, no
  manual dashboard step needed if migrations are run).
- **Private bucket → signed URLs.** The upload route's `getPublicUrl` is wrong for a
  private bucket; the build must serve receipt files via **`createSignedUrl`** (the
  thumbnail + lightbox read a short-lived signed URL). Receipts hold financial/PII —
  keep the bucket private + workspace-scoped (the routes already gate by
  `get_my_workspace_id()` / profile workspace).
- **Migration `218`** (next free — 215/216/217 are the income phases on main; verify
  across active branches at write time). Only if the D-SCRAPE columns (§4) land.

---

## Decisions to sign off (then Stage B, phased)
- **D-SCRAPE:** OCR pre-fills an **editable, confirm-before-save** form; amount →
  explicit `in_budget`/txn (never silent); migration **218** adds `currency` +
  `raw_ocr_json` (+ signed-URL path). Reuse the metered OCR route. *(Rec.)*
- **D-SEARCH:** **both, phased** — ⌘K `searchReceipts` provider now (the deferred
  `'expense'` kind), RAG `expense_receipt` source as an agent-coordinated follow-up.
  *(Rec.)*
- **D-UNIFY:** one `expense_receipts` row; Add-Receipt + ReceiptsGrid share a
  `useReceiptScan` seam; mobile (`expenses`) convergence is a flagged follow-up. *(Rec.)*
- **Add-Receipt UX:** a drop-zone panel from the line slide-over + the transaction
  chip (replacing the empty-pill mint), thumbnail chip → signed-URL lightbox. *(Rec.)*
- **PDF:** v1 stores PDFs without OCR (images scrape); rasterise-then-OCR later. *(Rec.)*
- **Storage fix:** private bucket + `createSignedUrl` (the upload route's public URL
  is broken today). *(Required.)*
- **Phasing:** B1 = Add-Receipt panel (upload+OCR+prefill+link) + signed URLs +
  thumbnail/lightbox (no schema if we defer raw_ocr_json); B2 = migration 218 +
  ⌘K provider; B3 = RAG source (agent-coordinated); B4 = mobile convergence.

⛔ **No code.** Stopping for review.
