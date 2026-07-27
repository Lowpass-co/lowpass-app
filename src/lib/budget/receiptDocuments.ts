/* ============================================
   LOWPASS — receipt extraction → documents[] (RC-5)

   The model returns JSON we do not control. This module is the ONE place that
   turns whatever came back into the array the rest of the pipeline consumes, so
   the route stays a route and the shape rules are testable without a network
   call or an API key.

   Three shapes have to survive, because all three are real:
     • {documents:[…]}  — what RC-5 asks for.
     • {vendor, total_amount, …} — the pre-RC-5 flat object. Older prompts, retries
       and any cached client all still produce it; treated as a one-element array
       rather than as a failure.
     • [{…}] — a bare array, which models emit often enough to be worth handling.

   PAGES ARE A CLAIM, NOT A FACT. `pages` comes from the model, so it is clamped
   to the file's real page count and sorted; a document claiming page 9 of a
   3-page PDF gets a range we can actually show a reviewer. When the count is
   unknown (an image, or a PDF pdf-parse could not read) the claim is kept as-is.

   Nothing here touches money. Amounts pass through untouched — this module
   decides how many receipts there are and which pages each covers, and the
   proposal engine still decides what any of it means.
   ============================================ */

/** One extracted document — the per-receipt fields, unchanged since RC-2. */
export interface ReceiptDocument {
  /** 1-based page numbers this document occupies. `[1]` for a single image. */
  pages: number[] | null;
  vendor: string | null;
  date: string | null;
  total_amount: number | null;
  currency: string | null;
  category: string | null;
  description: string | null;
  payment_method: string | null;
  line_items: Array<{ description: string | null; amount: number | null }> | null;
}

function str(v: unknown): string | null {
  return typeof v === 'string' && v.trim() ? v.trim() : null;
}

/**
 * Money, or null. NEVER 0 as a fallback.
 *
 * The obvious `Number(v) || 0` (which the client used to do) turns "unknown"
 * into a £0.00 that looks like a real reading. Unreadable must stay unreadable
 * so the reviewer is asked, rather than shown a confident wrong number. A
 * genuine 0 still comes through as 0.
 */
function num(v: unknown): number | null {
  if (v == null || v === '') return null;
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  const stripped = String(v).replace(/[^0-9.-]/g, '');
  if (!/\d/.test(stripped)) return null; // no digits at all → not a number
  const n = Number(stripped);
  return Number.isFinite(n) ? n : null;
}

function lineItems(v: unknown): ReceiptDocument['line_items'] {
  if (!Array.isArray(v)) return null;
  const out = v
    .filter((li): li is Record<string, unknown> => !!li && typeof li === 'object')
    .map((li) => ({ description: str(li.description), amount: num(li.amount) }))
    .filter((li) => li.description !== null || li.amount !== null);
  return out.length ? out : null;
}

/**
 * Clamp a claimed page list to what the file actually has.
 * Unknown `pageCount` (image / unreadable PDF) → keep the claim as given.
 */
function pages(v: unknown, pageCount: number | null): number[] | null {
  if (!Array.isArray(v)) return null;
  const seen = new Set<number>();
  for (const p of v) {
    const n = num(p);
    if (n === null) continue;
    const i = Math.trunc(n);
    if (i < 1) continue;
    if (pageCount !== null && i > pageCount) continue;
    seen.add(i);
  }
  if (seen.size === 0) return null;
  return [...seen].sort((a, b) => a - b);
}

function toDocument(raw: Record<string, unknown>, pageCount: number | null): ReceiptDocument {
  return {
    pages: pages(raw.pages, pageCount),
    vendor: str(raw.vendor),
    date: str(raw.date),
    total_amount: num(raw.total_amount),
    currency: str(raw.currency)?.toUpperCase() ?? null,
    category: str(raw.category),
    description: str(raw.description),
    payment_method: str(raw.payment_method),
    line_items: lineItems(raw.line_items),
  };
}

/** True when a document carries nothing worth making a receipt out of. */
function isEmpty(d: ReceiptDocument): boolean {
  return d.vendor === null && d.total_amount === null && d.date === null;
}

/**
 * Whatever the model returned → the documents array the pipeline consumes.
 * Returns `[]` only when there is genuinely nothing usable, which the caller
 * turns into a 422 and the client turns into store-and-flag.
 */
export function normaliseDocuments(parsed: unknown, pageCount: number | null): ReceiptDocument[] {
  let raw: unknown[];
  if (Array.isArray(parsed)) {
    raw = parsed;
  } else if (parsed && typeof parsed === 'object' && Array.isArray((parsed as { documents?: unknown }).documents)) {
    raw = (parsed as { documents: unknown[] }).documents;
  } else if (parsed && typeof parsed === 'object') {
    raw = [parsed]; // pre-RC-5 flat object — the degenerate one-document case
  } else {
    return [];
  }

  const docs = raw
    .filter((d): d is Record<string, unknown> => !!d && typeof d === 'object' && !Array.isArray(d))
    .map((d) => toDocument(d, pageCount))
    .filter((d) => !isEmpty(d));

  /* A single-page file cannot hold several documents. If the model split one
     anyway, the split is noise — keep the element that actually has a total. */
  if (pageCount === 1 && docs.length > 1) {
    return [docs.find((d) => d.total_amount !== null) ?? docs[0]];
  }
  return docs;
}

/** Human-readable page range for a receipt row: "p. 3" / "pp. 3–4" / "". */
export function pageRangeLabel(pages: number[] | null | undefined): string {
  if (!pages || pages.length === 0) return '';
  const first = pages[0];
  const last = pages[pages.length - 1];
  return first === last ? `p. ${first}` : `pp. ${first}–${last}`;
}
