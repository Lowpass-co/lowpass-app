# CC — RECEIPTS: the last mile (drag receipts in → proposed budget lines → approve). SINGLE OWNER, bank-per-stage.

Adam's ask, verbatim: *"build the receipts AI parsing thing on the budget page. make it obvious so you can open it and drag in your receipts and it will save, make lines if none exist, suggest values (all need approval) and then add them to lines that exist and are relevant with approval."*

This is the highest value-per-hour item in the competitive backlog (`COMPETITIVE_ATOM_2026-07-19.md` §3 — the only place ATOM's money module beats ours, and it's a last mile, not a build).

## What already exists — REUSE IT, do not build a parallel path
Verified in-repo before writing this spec:
- **`src/components/budget/useReceiptScan.ts`** — the declared "single seam" for upload → OCR → persist → link. Its own header lists the existing routes: `POST /api/budget/receipts` (CRUD, auto R-00n), `/receipts/upload` (signed URL), `/receipts/ocr` (Claude Vision, metered + rate-limited), `PATCH /receipts`, `/receipts/sign`, `POST /api/budget/line-items/{id}/transactions`, `PATCH /api/budget/transactions/{id}`.
- **OCR output shape** (`ReceiptOcr`): `vendor · date · total_amount · currency · category · description · payment_method`, all nullable.
- **THE INVARIANT — do not break it:** "the amount only ever lands as a transaction (which sums into `actual_cost` via the existing reconcile) — never a direct `actual_cost` write." Every proposal this feature applies must go through the transaction path.
- **PDF = store-but-don't-scan** (Vision is images-only) — see §Decisions.
- **Review-queue grammar already exists twice**: `ChangeReviewQueue.tsx` (rider import, V1-2) and X1-B's `import_pending_lines` + Dice-bigram matcher + dupe classification (New / Possible-duplicate / Changed).

**Hard rule: ONE review-queue grammar and ONE fuzzy matcher in the codebase after this stage.** Reuse X1-B's matcher for line-matching; reuse or extend the existing pending/proposal storage rather than inventing a third. Topology-map both first and report file:line + which you're extending BEFORE code.

## Stage RC-1 — The obvious drop zone
On the Budget page (Expenses view), a **Receipts** panel that is impossible to miss: a persistent drop target ("Drop receipts here — photos or PDFs — we'll read them and propose lines") plus click-to-browse, accepting **multi-file drag**. Progress per file (queued → reading → proposed), thumbnail, and a running count. Dropping anywhere on the budget page while dragging should light the zone up (page-level dragover), not just a small box.

Every dropped file is **saved first** (upload + `expense_receipts` row) before OCR runs — Adam: "it will save". A failed OCR must never lose the receipt; it lands as a stored receipt with a "couldn't read — fill manually" state.

## Stage RC-2 — Proposals (the actual last mile)
For each scanned receipt, produce ONE proposal with two possible shapes:

**(a) Link to an existing line** — when the receipt matches a budget line. Matching signal, in order: explicit category match → vendor/description fuzzy match (X1-B's matcher, ≥0.85) → amount proximity within the line's remaining estimate → date within the tour window. Show *why* it matched ("Vendor matches 'Bus fuel — Nov'"), the target line, and the amount. On approve: write a **transaction** against that line via the existing route (never a direct actual_cost write), link the receipt to the transaction, mark `in_budget`.

**(b) Create a new line** — when nothing matches. Propose section (from OCR category, mapped to the tour's existing sections; fall back to the catch-all/uncategorised section), item name (vendor + description), vendor, date, amount, currency. On approve: create the line through the **existing** `POST /api/budget/line-items` path, then write the transaction, then link.

Rules:
- **Nothing writes without approval.** Propose → review → apply, per the house AI grammar. Batch controls: Approve all links · Approve all new lines · Reject all — but never an auto-apply default.
- **Every proposed value is editable in the queue before approving** (Adam: "suggest values (all need approval)") — amount, vendor, date, section, target line. Editing a target line converts an (a) into a different (a); switching to "new line" converts to (b).
- **Duplicate guard:** if a receipt's vendor+amount+date is within tolerance of an existing transaction, flag it "possible duplicate of TXN-x" and default to skip (X1-B's classification, reused).
- **Multi-currency:** if the receipt currency ≠ tour currency, the proposal carries the receipt currency and the existing FX path applies at write — do not invent a second conversion. If no rate exists, surface it like the budget's existing "no FX rate" warning rather than silently converting 1:1.

## Stage RC-3 — Review UX + the loop closing
The queue lives in the Receipts panel: one card per proposal — thumbnail, extracted fields (editable), the proposed action with its reason, Approve / Edit / Reject. Approving updates the budget grid live (the line's actual moves, provenance chip shows `Auto`). Rejecting keeps the stored receipt, unproposed, so it can be handled manually.

After a batch: a one-line summary ("6 receipts · 4 linked · 1 new line · 1 skipped as duplicate") and the data-health banner (M1-A) picks up any receipts still unfiled.

## Decisions to make (state your choice in the report)
1. **PDF receipts** — Vision is images-only, and a lot of real receipts arrive as PDFs. Either render page 1 to an image server-side before OCR (preferred — the pdf skill/tooling exists in this repo's stack) or store-and-flag-for-manual. Say which and why.
2. **Storage of proposals** — extend `import_pending_lines` (source column) vs a light `receipt_proposals` table. Choose whichever avoids a third grammar; justify.
3. **Metering** — reuse the existing `withAiUsage` wrapper and per-tour rate limits; multi-file drops must not let someone burn the quota in one gesture (queue + cap per batch, state the cap).

## THE MONEY GATE — exact, because it drifted (corrected 2026-07-21)
Several sessions reported "money gates green (fees 15, reconcile 10)". **The 10 was `src/server/budget/reconcileDerivedLines.test.ts` — a lock-decision unit test, NOT the gate the specs name.** CC caught this itself and re-ran the correct set at HEAD: all green, and every affected bank was UI/loader work touching no money path, so nothing is broken. But the gate was nominally weaker than believed, and Cowork read "reconcile 10" in four reports without challenging it — a verification miss on both sides.

**From here, "money gates green" means these three, by path, with these counts:**
```
npx tsx src/lib/payroll/reconcile.harness.ts          → 64 checks
node --experimental-strip-types src/lib/settlement/reconcile.harness.ts → 21 checks
node --experimental-strip-types src/lib/payroll/fees.test.ts            → 15 checks
```
Paste the three output lines verbatim in every receipts bank. `reconcileDerivedLines.test.ts` (10) may also run, but it is NOT the gate and must never be reported as "reconcile".

## RESOLVED — the two unknowns CC flagged at the gate (Cowork checked the repo, 2026-07-21)
1. **`import_pending_lines` has no `source` discriminator yet.** Migration `244_workbook_import_proposals.sql:34-54` gives it: `batch_id` · `target TEXT CHECK (target IN ('budget_line','income_actual'))` · `value JSONB` · `source_ref` · `provenance` · `dup_of` / `dup_reason` · `status CHECK (pending|accepted|rejected|skipped)` · reviewed_at/by. Parent `import_batches` (:19-31) carries `filename` + `status CHECK (mapping|review|applied|discarded)`.
   → **The extension is small and mostly additive:** widen the `target` CHECK to include a receipt action (e.g. `receipt_txn` for link-to-existing-line, reusing `budget_line` for create-new), add a nullable `receipt_id UUID REFERENCES expense_receipts(id)`, and reuse `dup_of`/`dup_reason` for the duplicate-transaction guard. `source_ref` becomes the receipt filename/number. Note the CHECK constraints must be dropped-and-recreated (not `ADD COLUMN IF NOT EXISTS`) — write that carefully and idempotently.
2. **A review UI DOES exist:** `src/components/budget/WorkbookImportModal.tsx` (plus `BudgetExportControls.tsx`). X1-B's queue is NOT API-only. RC-3 should extend/share that component's review grammar rather than building the first one — check whether its proposal-card rendering can take receipts' shape (thumbnail + editable fields + link-vs-create action) before deciding to fork.

## RC-5 — MULTI-PAGE PDFs. Supersedes the "render page 1" decision. (2026-07-21)

**My spec was wrong and CC built exactly what it said.** "Render page 1 server-side" is correct for a till receipt, where page 1 is the whole document. It is WRONG for the documents that actually arrive as PDFs — hotel folios, bus invoices, production invoices, freight bills — where the total is frequently on the last page and line detail spans several. Reading page 1 of a 4-page folio yields a confident, plausible, WRONG number. For a money path that is worse than reading nothing.

Adam: *"if i drag in a multi page pdf it only reads page one? It needs to read the whole document. that's the point."*

### The API reads PDFs natively — delete the rasteriser
Verified against `platform.claude.com/docs/en/build-with-claude/pdf-support`:
- PDFs go in a **`document` content block** (`source.type: base64 | url | file`, `media_type: application/pdf`). No image conversion by us.
- **"All active models support PDF processing"** — including the Haiku 4.5 this route already calls.
- Limits: **600 pages** per request (100 when context < 1M), **32 MB total request**. Over that, upload via the Files API and reference `file_id`.
- Mechanism: the system converts each page to an image AND extracts its text, then gives Claude both — so tables and stamped totals on page 4 are read properly, not guessed.

**Therefore:** replace `renderPdfFirstPageToPng()` + the pdf.js/Chromium path with a `document` block carrying the PDF bytes. Delete `pdfFirstPage.ts`, its `outputFileTracingIncludes` entry, and the `pdfjs-dist` dependency **only after** confirming nothing else imports them (the two other Chromium PDF routes are unrelated — do not disturb them). This removes the exact class of failure CC caught in tracing: a runtime-resolved native path invisible to the bundler.

### One PDF is not always one receipt — the split decision
Two real cases, and the extractor must tell them apart:
1. **One document over several pages** (hotel folio, invoice) → **ONE** receipt, ONE proposal, total taken from wherever it actually appears (usually the last page).
2. **Several receipts scanned into one PDF** (a TM scanning a week's stack) → **N** receipts, N proposals, one per distinct document.

The prompt must ask for an array of documents with a page range each, not a single flat object. Return shape becomes `{ documents: [ { pages: [1,2], vendor, date, total_amount, currency, category, description, line_items[] } ] }`. Case 1 returns a one-element array; case 2 returns N. The existing single-receipt shape is the degenerate case — keep the current fields per document so `proposeForReceipt` needs no rewrite, just a loop.

If N > 1, create N `expense_receipts` rows from the one uploaded file (same `receipt_file_url`, distinct page ranges recorded) so each proposal still points at a real receipt the reviewer can open. State how you handle the file-to-rows relationship in the report.

### Cost — still negligible, and now the honest number
Per the docs, each page costs ~1,500–3,000 text tokens **plus** image tokens. At Haiku 4.5 ($1/M in, $5/M out):
| Document | ≈ input tokens | ≈ cost |
|---|---|---|
| 1-page receipt | ~3,000 | $0.004 |
| 4-page hotel folio | ~14,000 | $0.015 |
| 10-page freight invoice | ~35,000 | $0.04 |
A 20-file drop of mixed receipts lands around **10–20 cents**. Cost is not a reason to read fewer pages. Add a page-count guard (reject > ~50 pages with a clear message and store-and-flag) so one pathological upload can't blow the batch.

### Smokes
RCP-10 multi-page folio: total is read from the LAST page, not page 1 · RCP-11 a PDF containing three separate receipts yields three proposals · RCP-12 a 1-page PDF still yields exactly one · RCP-13 an encrypted/corrupt PDF stores-and-flags with the file intact (RCP-08's guarantee survives) · RCP-14 an over-limit PDF is rejected cleanly, not silently truncated.

## RQ-5..RQ-8 — Adam's real-receipt walk, 2026-07-21. Two real PDFs failed; he could not find them afterwards.

### RQ-5 — Image-only PDFs are the common case and they FAILED
Adam dropped two real receipts. Both were rejected. Cowork analysed the actual files:
```
bytes 593,864 / 504,618 · pages 1 · /Image TRUE · /Font FALSE · /Encrypt FALSE
producer: "iOS Version 26.6 (Build 23G71)"
```
**They contain no text layer — they are iPhone photos of receipts saved as PDF.** That is how most road receipts arrive. Every PDF fixture in the suite so far has been a generated text PDF (mine included), which is why this class was never caught.

RC-5's native `document` block should handle these — the API converts each page to an image, so an image-only page is still read. **But it must be proven with this exact fixture class, not assumed.** Add a test fixture that is a photo-of-a-receipt rasterised into a 1-page PDF with no font resources, at realistic size (500KB–1MB). Smoke **RCP-15**. If the native path still fails on these two files, that is the bug — investigate before shipping.

Optional but valuable: **filename fallback.** Adam's files are named `26:07:2026 | BNA Airport Parking | Nashville airport parking Jul24-26 | $72.00.pdf` — date, vendor, description and amount, all in the filename. When extraction returns nulls, parse the filename as a *low-confidence* proposal clearly labelled as such ("from filename — please confirm"). Never let a filename-derived value look like a read value.

### RQ-6 — THE RECEIPTS BANK (Adam: "now I don't know where they've gone")
This is the important one. A receipt that fails to scan is stored — RCP-08 proves the row lands in `needs_manual` — but **there is no page anywhere that lists stored receipts.** From the user's side the file vanished. Save-first is worthless if nothing surfaces what was saved.

Build a **Receipts** surface (Money mode rail item per `IA_CANONICAL_2026-07-21.md`): every `expense_receipts` row for the tour, filterable by state — **Needs details** (scan failed or fields missing) · **Proposed** (awaiting review) · **Filed** (linked to a line) · **Rejected**. Each row: thumbnail, filename, uploaded-at, extracted fields, state, and the actions to fix it — edit fields inline, retry scan, propose again, link to an existing line, or delete. Uploaded receipts land here regardless of scan outcome, so nothing is ever invisible. The Money-mode rail badge shows the Needs-details count.

### RQ-7 — Category is extracted then thrown away
Cowork's walk: OCR returned `category: "catering"`, and the proposal came back `sectionId: null, sectionName: "catering"` — so the line was created in **Uncategorised**. The signal exists and is discarded at the mapping step.

Fix the mapping: OCR category → the tour's existing sections, matched by name and a small alias table (catering/food/hospitality → Catering; fuel/gas/petrol → Transport or Fuel; parking → Transport; hotel/lodging → Hotels; per diem → Per Diems…). Reuse `dedupe.ts`'s similarity for near-matches rather than writing a second matcher. If nothing matches, **propose creating the section** as part of the reviewable proposal — do not silently dump in Uncategorised. Show the chosen section in the card, editable. Smoke **RCP-16**: a fuel receipt proposes a transport/fuel section, not Uncategorised.

### RQ-8 — Provenance and inline editing (supersedes RQ-3)
Adam: *"They say manual, but I can't edit things like the vendor without opening the slide out."* Two distinct problems:
1. **The chip is wrong.** A line created from a scanned document is derived, not hand-typed. Receipt-backed lines read `AUTO`, with the tooltip naming the source ("From receipt R-006 — BNA Airport Parking").
2. **Vendor isn't editable in the grid.** Vendor is derived from the transaction, so the grid renders it read-only and the only way to correct a misread vendor is the slide-over. Make the vendor cell editable inline in the expenses grid, writing through to the transaction (the existing single write path — no new one). Same for the receipt-set date if it's similarly stranded.

### Sequencing
RQ-4 (the live `DELETE` `actual_cost` bypass) first — it's a money-invariant break in production. Then RQ-6 (receipts are currently invisible), RQ-7 (category), RQ-5 (image-only fixture + verify), RQ-8, RQ-1 (entry point: a button that scrolls to it, or a popover, or a slide-open panel — Adam's call is "EITHER, just make it an explicit affordance"), RQ-2 (retire the second surface).

## Gates
Topology map FIRST (file:line for useReceiptScan's routes, the two review-queue implementations, the matcher, the transactions/reconcile path) — report before code · **reconcile harness 64/64 and fees 15/15 green on every bank; the transaction-only invariant is the thing most likely to break and the harness is what proves it** · floor green · migration (if any) as paste-SQL, wait for "pasted" · screenshots of the drop zone + review queue at 1440/1920 · raw git evidence + Vercel success per bank · smokes RCP-01..06 (multi-file drop saves all · OCR proposes link with reason · proposes new line when no match · edit-then-approve writes the edited value · duplicate flags and skips by default · reject leaves the receipt stored and no ledger rows).
