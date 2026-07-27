/* ============================================
   LOWPASS — the receipts route writes NO money (RQ-4)

   THE invariant of this whole feature, stated once:

     Amounts land as TRANSACTIONS, never as direct actual_cost writes. The
     transactions route inserts and then calls syncActualCostIfNoOverride, so a
     direct write bypasses both the reconcile and the override guard.

   It has now broken THREE times in this one file — POST added the cost, PATCH
   subtracted-then-added it, DELETE subtracted it — and each break shipped,
   because nothing checked. Two of the three were live in production.

   This is a STRUCTURAL test, and deliberately so. The behavioural version needs
   a live Supabase (these are route handlers whose every statement is a query),
   which is why the bug survived three code reviews and two walks. Reading the
   source for the write is crude, but it is the check that would actually have
   caught all three — and it costs nothing to keep.

   What it does NOT prove: that the numbers come out right. That is the reconcile
   harness's job (64/64), and it is run on every bank.
   ============================================ */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const ROUTE = join(process.cwd(), 'src/app/api/budget/receipts/route.ts');
const APPLY = join(process.cwd(), 'src/app/api/budget/receipts/proposals/apply/route.ts');

/** Source with block comments and line comments stripped — the RQ-4 fix left
 *  long explanatory comments quoting the very code being banned. */
function code(path: string): string {
  return readFileSync(path, 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '');
}

describe('the receipts CRUD route never writes actual_cost', () => {
  const src = code(ROUTE);

  it('has no .update({ actual_cost … }) anywhere', () => {
    // Matches an update payload mentioning actual_cost, across newlines.
    // [\s\S] rather than the /s flag — the repo's tsconfig target predates it.
    expect(/\.update\(\s*\{[\s\S]*?actual_cost/.test(src)).toBe(false);
  });

  it('does not mention actual_cost in live code at all', () => {
    // Nothing legitimate remains: the route neither reads nor writes it.
    expect(src.includes('actual_cost')).toBe(false);
  });

  it('reconciles through the sanctioned helper instead', () => {
    expect(src).toContain('syncActualCostIfNoOverride');
  });

  it('all three verbs are still present — the fix removed writes, not endpoints', () => {
    expect(src).toContain('export async function POST');
    expect(src).toContain('export async function PATCH');
    expect(src).toContain('export async function DELETE');
  });
});

describe('the scan writes its result where the bank can see it (RQ-5 follow-up)', () => {
  /* The reported bug was "image-only PDFs return nulls". A live check proved the
     document block reads them fine. The real fault: the OCR route persisted
     raw_ocr_json and the page range and nothing else, while the Receipts bank
     reads vendor / date / cost_tour_currency — so a perfect scan was displayed
     as "Missing vendor, date, amount", identical to a failure.

     Structural, like the money guard above and for the same reason: the route is
     all queries, so the behavioural version needs a live Supabase. This is the
     check that would have caught it. */
  const src = code(join(process.cwd(), 'src/app/api/budget/receipts/ocr/route.ts'));

  it('spreads the extracted fields into the receipt UPDATE', () => {
    expect(src).toContain('receiptFieldsFromDocument(first)');
  });

  it('still persists the raw extraction for ⌘K search', () => {
    expect(src).toContain('raw_ocr_json');
    expect(src).toContain('extracted_text');
  });
});

describe('the apply route is the money writer, and only via transactions', () => {
  const src = code(APPLY);

  it('posts to the transactions endpoint', () => {
    expect(src).toMatch(/line-items\/\$\{lineItemId\}\/transactions/);
  });

  it('creates new lines at actual_cost 0 — the transaction moves the actual', () => {
    /* Enumerate every value assigned to actual_cost rather than asserting a
       negative lookahead: `/actual_cost:\s*(?!0)/` looks right but backtracks
       `\s*` to zero width and tests the SPACE, so it matches "actual_cost: 0"
       and is always true. Listing the values says what we mean and can't lie. */
    const assigned = [...src.matchAll(/actual_cost:\s*([^,\n}]+)/g)].map((m) => m[1].trim());
    expect(assigned).toEqual(['0']);
  });
});
