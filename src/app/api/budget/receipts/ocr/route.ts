/* ============================================
   LOWPASS — Receipt OCR (Claude Vision)

   POST: Accept image/PDF upload, extract receipt data via Claude, return JSON.

   RC-5 — PDFs GO WHOLE, and one PDF may hold several receipts.

   RC-4 rendered page 1 to a PNG and sent that. Right for a till receipt, where
   page 1 IS the document. WRONG for what actually arrives as a PDF — hotel
   folios, bus invoices, freight bills — where the total sits on the LAST page
   and detail spans several. Page 1 of a 4-page folio yields a confident,
   plausible, wrong number, which on a money path is worse than reading nothing.

   The API reads PDFs natively via a `document` content block: every page is
   converted to an image AND its text extracted, so a stamped total on page 4 is
   read, not guessed. All active models support it, Haiku 4.5 included — so the
   rasteriser (headless Chromium + pdf.js), its outputFileTracingIncludes entry
   and the pdfjs-dist dependency are all DELETED. Fewer moving parts and one
   fewer runtime-resolved native path for the bundler to miss.

   The extraction returns an ARRAY of documents. A folio is one element spanning
   pages 1–4; a stack of receipts scanned into one file is N elements with a page
   range each. Per-document fields are unchanged, so the proposal engine loops
   instead of being rewritten.

   The store-and-flag fallback is untouched: any failure still 400s with a
   manual-entry message AFTER the receipt row and upload exist.
   ============================================ */

import { NextResponse } from 'next/server';
import { APIError } from '@anthropic-ai/sdk';
import { normaliseDocuments, receiptFieldsFromDocument } from '@/lib/budget/receiptDocuments';
/* RQ-5 — the PDF guard lives in its own module so it can be tested against a
   real image-only fixture. It used to be inline here, where nothing could reach
   it without a session and an API key. */
import { isPdfUpload, pdfPageCount, pdfGate } from '@/lib/budget/pdfProbe';
import { effectiveMediaType } from '@/lib/budget/mediaType';
import { createServerSupabaseClient } from '@/lib/supabase-server';
import { withAiUsage, aiCapExceededResponse } from '@/lib/ai/usage';
import {
  requireUserAndWorkspace,
  requireTourInWorkspace,
} from '@/lib/auth/workspace-check';
import { checkRateLimit, markRateLimit } from '@/lib/rate-limit';

/* Sprint 12 §SAFE — per-user rate limit so a runaway client
   (or hostile actor with valid creds) can't burn the AI key
   with rapid scans. 3s window matches the deal-memo extract
   endpoint. */
const RATE_LIMIT_MS = 3_000;
const lastCallByUser = new Map<string, number>();

/** Pull nested message from Anthropic error JSON (SDK puts API body on `.error`). */
function anthropicErrorText(err: APIError): string {
  const parts: string[] = [];
  if (err.message) parts.push(err.message);
  const body = err.error;
  if (body && typeof body === 'object') {
    const o = body as Record<string, unknown>;
    if (typeof o.message === 'string') parts.push(o.message);
    const inner = o.error;
    if (inner && typeof inner === 'object' && inner !== null) {
      const m = (inner as Record<string, unknown>).message;
      if (typeof m === 'string') parts.push(m);
    }
  }
  return parts.join(' ');
}

const BILLING_ERROR_USER_MSG = 'AI service unavailable — contact support.';

/** Works even when the SDK does not use APIError (or embeds 400 + JSON in Error.message). */
function looksLikeAnthropicCreditError(err: unknown): boolean {
  const chunks: string[] = [];
  if (err instanceof APIError) {
    chunks.push(anthropicErrorText(err), err.message ?? '', String(err.status ?? ''));
  } else if (err instanceof Error) {
    chunks.push(err.message);
  } else {
    chunks.push(String(err));
  }
  const t = chunks.join(' ').toLowerCase();
  if (t.includes('balance is too low') || t.includes('plans & billing')) return true;
  if (t.includes('credit') && (t.includes('too low') || t.includes('balance'))) return true;
  return false;
}

const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'] as const;
const PDF_TYPE = 'application/pdf';

/** Flat, searchable text from the Vision extraction — vendor + description +
 *  line-item descriptions + category, deduped + length-capped. NEVER logged. */
function buildExtractedText(data: unknown): string {
  if (!data || typeof data !== 'object') return '';
  const d = data as Record<string, unknown>;
  const parts: string[] = [];
  for (const k of ['vendor', 'description', 'category', 'payment_method'] as const) {
    if (typeof d[k] === 'string' && (d[k] as string).trim()) parts.push((d[k] as string).trim());
  }
  if (Array.isArray(d.line_items)) {
    for (const li of d.line_items as Array<Record<string, unknown>>) {
      if (li && typeof li.description === 'string' && li.description.trim()) parts.push(li.description.trim());
    }
  }
  if (typeof d.date === 'string' && d.date.trim()) parts.push(d.date.trim());
  return parts.join(' ').slice(0, 2000);
}

export async function POST(request: Request) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: 'OCR not configured' }, { status: 503 });
  }

  /* Sprint 12 §SAFE — auth gate. Previously this endpoint
     was open: any caller with the URL could POST a file and
     burn the AI key. Now it requires a workspace member +
     a tour_id that belongs to that workspace. */
  const supabase = await createServerSupabaseClient();
  const auth = await requireUserAndWorkspace(supabase);
  if ('error' in auth) return auth.error;
  const { user, workspaceId } = auth;

  const limited = checkRateLimit(lastCallByUser, user.id, RATE_LIMIT_MS);
  if (limited) return limited;

  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return NextResponse.json({ error: 'Invalid form data' }, { status: 400 });
  }

  const tourId = (formData.get('tour_id') as string | null) ?? '';
  const tourGate = await requireTourInWorkspace(supabase, tourId, workspaceId);
  if (tourGate) return tourGate;

  // B2 — optional: the receipt this scan belongs to. When present we persist the
  // raw extraction onto it (workspace-scoped) so the ⌘K search can match it
  // without re-scanning. Absent → stateless scan (the B1 panel can call before create).
  const receiptId = (formData.get('receipt_id') as string | null) || null;

  const file = formData.get('file') as File | null;
  if (!file?.size) {
    return NextResponse.json({ error: 'No file provided' }, { status: 400 });
  }

  const tourCurrency = (formData.get('currency') as string) || 'GBP';

  /* RQ-5 FINAL — do NOT trust `file.type`.

     A browser reports an empty or generic type routinely (files dragged from
     Finder, odd filenames, share sheets) and FormData carries that straight
     through. Refusing on it meant Adam's two receipts were never scanned at all
     — saved, blank, and only rescued by a Re-scan button nobody would press.

     Resolved from the filename AND the reported type, by the same function the
     client uses. `media_type` is accepted as a hint but re-derived here, so a
     caller that gets it wrong (or omits it) still behaves. */
  const hinted = (formData.get('media_type') as string | null) ?? null;
  const mediaType =
    effectiveMediaType(file.name, file.type) ?? effectiveMediaType(file.name, hinted) ?? '';

  /* RC-5 — a PDF goes to Claude WHOLE as a `document` block; an image goes as an
     `image` block exactly as before. No rasterising, no page dropped.

     The fallback is preserved deliberately: every rejection below happens AFTER
     the caller has already created the receipt row and uploaded the file, so the
     receipt survives and lands in manual entry. A PDF we cannot read must never
     be a PDF we lose. */
  const uploadBuffer = Buffer.from(await file.arrayBuffer());
  const pdf = isPdfUpload(mediaType);

  if (!pdf && !ALLOWED_TYPES.includes(mediaType as (typeof ALLOWED_TYPES)[number])) {
    return NextResponse.json(
      { error: 'File must be an image (JPEG, PNG, WebP, GIF) or a PDF.' },
      { status: 400 }
    );
  }

  let pageCount: number | null = null;
  if (pdf) {
    pageCount = await pdfPageCount(uploadBuffer);
    const gate = pdfGate(pageCount);
    if (!gate.ok) {
      // Cleanly refused, never silently truncated — reading the first N pages of
      // a 200-page file is exactly the confident-wrong-number failure RC-5 exists
      // to remove.
      return NextResponse.json({ error: gate.message, code: 'PDF_TOO_LONG' }, { status: 400 });
    }
  }

  const base64 = uploadBuffer.toString('base64');
  const sourceBlock = pdf
    ? ({ type: 'document', source: { type: 'base64', media_type: PDF_TYPE, data: base64 } } as const)
    : ({
        type: 'image',
        source: {
          type: 'base64',
          media_type: mediaType as 'image/jpeg' | 'image/png' | 'image/webp' | 'image/gif',
          data: base64,
        },
      } as const);

  try {
    const { result: response, blocked, blockReason } = await withAiUsage(
      {
        workspaceId: workspaceId,
        userId: user.id,
        endpoint: 'budget.receipts.ocr',
        model: 'claude-haiku-4-5-20251001',
        metadata: { tour_id: tourId },
      },
      async (anthropic) => {
        const r = await anthropic.messages.create({
          /* Sprint 12 §SAFE — Haiku 4.5 supports vision and is ~10x
             cheaper than Sonnet. Receipt OCR is bounded extraction,
             not reasoning — Haiku handles it. */
          model: 'claude-haiku-4-5-20251001',
          /* RC-5 — a multi-document PDF returns an array, so the old 1024 ceiling
             would truncate the JSON mid-array on a stack of receipts. */
          max_tokens: 4096,
          messages: [
            {
              role: 'user',
              content: [
                sourceBlock,
                {
                  type: 'text',
                  text: `Extract receipt data from this file. It may contain ONE document spanning several pages (a hotel folio, an invoice), or SEVERAL separate receipts scanned into one file.

Decide which, and return ONLY valid JSON in this shape:
{
  "documents": [
    {
      "pages": [1, 2],
      "vendor": "string - business name",
      "date": "string - YYYY-MM-DD format",
      "total_amount": number,
      "currency": "string - 3-letter code e.g. GBP, USD, EUR",
      "category": "string - one of: hotel, transport, production, catering, misc",
      "description": "string - brief description of what was purchased",
      "payment_method": "string - one of: card, cash, bank_transfer",
      "line_items": [{"description": "string", "amount": number}]
    }
  ]
}

Rules that matter:
- ONE logical document = ONE array element, however many pages it covers. Do NOT split a multi-page invoice into one element per page.
- "pages" lists the 1-based page numbers that document occupies. For a single image, use [1].
- "total_amount" is the FINAL amount payable for that document. On a multi-page folio or invoice this is usually on the LAST page — a running subtotal on an earlier page is NOT the total. Read the whole document before deciding.
- If several distinct receipts appear (different vendors, dates, or separate totals), return one element each.
- If any field is unclear, use null. Tour currency is ${tourCurrency}.`,
                },
              ],
            },
          ],
        });
        return { result: r, usage: r.usage };
      },
    );
    if (blocked) return aiCapExceededResponse(blockReason ?? 'workspace_budget');
    if (!response) return NextResponse.json({ error: 'Receipt OCR failed' }, { status: 500 });

    const block = response.content[0];
    const text = block.type === 'text' ? block.text : '';
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      return NextResponse.json({ error: 'Could not parse receipt' }, { status: 422 });
    }

    const parsed = JSON.parse(jsonMatch[0]);
    const documents = normaliseDocuments(parsed, pageCount);
    if (documents.length === 0) {
      return NextResponse.json({ error: 'Could not parse receipt' }, { status: 422 });
    }
    /* Stamp the rate limit only after success so a 5xx/422
       doesn't lock the operator out of retrying. */
    markRateLimit(lastCallByUser, user.id);

    /* B2 — persist the extraction onto the receipt (when one is supplied) so the
       ⌘K search can match it. extracted_text is a flat, searchable concat of the
       scrape. Workspace-scoped UPDATE (RLS + explicit filter). Best-effort: a
       persist failure must NOT fail the scan response. We deliberately log NO raw
       OCR text (financial/PII) — only the receipt id on error.

       RC-5 — the receipt this scan was called for takes the FIRST document; when
       the file held several, the caller creates the sibling rows and patches each
       with its own document (see useReceiptDropQueue). */
    if (receiptId) {
      const first = documents[0];
      const { error: persistError } = await supabase
        .from('expense_receipts')
        .update({
          raw_ocr_json: first,
          extracted_text: buildExtractedText(first),
          /* RQ-5 FOLLOW-UP — the extracted FIELDS, not just the raw blob. This
             update wrote raw_ocr_json + the page range and nothing else, so the
             Receipts bank — which reads vendor/date/cost_tour_currency — showed
             "Missing vendor, date, amount" on every receipt whether the scan had
             worked or not. An image-only PDF looked like a PDF bug when the
             answer was simply written where nothing displays.

             Only non-null values are written (see receiptFieldsFromDocument), so
             a re-scan that reads less than a human already typed cannot erase it.

             NOT a money write: cost_tour_currency lives on expense_receipts and
             carries nothing into the ledger. actual_cost still moves only when a
             transaction is written — RQ-4 made that structural. */
          ...receiptFieldsFromDocument(first),
          /* Page columns only when there IS a range — writing them as null would
             fail the whole UPDATE (taking raw_ocr_json and the ⌘K searchable
             text with it) on a database where migration 252 is not applied. */
          ...(first.pages?.length
            ? { page_from: first.pages[0], page_to: first.pages[first.pages.length - 1] }
            : {}),
        })
        .eq('id', receiptId)
        .eq('workspace_id', workspaceId);
      if (persistError) {
        console.error(`[receipt-ocr] persist failed for receipt ${receiptId}: ${persistError.message}`);
      }
    }

    /* Response carries BOTH shapes: `documents` for the multi-receipt path, and
       the first document spread at top level so the older single-receipt callers
       (AddReceiptPanel, the ⌘K open) keep reading exactly the fields they did. */
    return NextResponse.json({ ...documents[0], documents, page_count: pageCount });
  } catch (err) {
    console.error('Receipt OCR error:', err);
    if (looksLikeAnthropicCreditError(err)) {
      return NextResponse.json({ error: BILLING_ERROR_USER_MSG, code: 'ANTHROPIC_BILLING' }, { status: 503 });
    }
    if (err instanceof APIError) {
      return NextResponse.json(
        { error: 'Could not read this receipt with the AI service. Try again or enter the receipt manually.', code: 'ANTHROPIC_API' },
        { status: 502 },
      );
    }
    return NextResponse.json(
      { error: 'Could not read this receipt. Try again or enter the details manually.', code: 'OCR_FAILED' },
      { status: 500 },
    );
  }
}
