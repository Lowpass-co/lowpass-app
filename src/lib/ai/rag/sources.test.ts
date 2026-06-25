/* node --experimental-strip-types src/lib/ai/rag/sources.test.ts

   The privacy-invariant test: the embedded `content` must never carry an
   email, phone, passport number, or DOB. We pass rows that INCLUDE those
   fields (as a real source row would) and assert they don't leak — the
   allow-list interfaces mean TS wouldn't even let the builders read them,
   but we test the runtime output as belt-and-braces. */
import assert from 'node:assert';
import {
  buildDealMemoChunk,
  buildVenueChunk,
  buildBudgetLineItemChunk,
  buildChunk,
} from './sources.ts';

let pass = 0;
const check = (label: string, cond: boolean) => {
  assert.ok(cond, label);
  pass++;
};

// PII tokens that must NEVER appear in embedded content.
const PII = ['promoter@example.com', '+44 7700 900123', 'X1234567', '1985-04-12', 'John Q. Promoter'];
const leaks = (content: string) => PII.some((p) => content.includes(p));

// ── deal_memo: terms in, promoter PII out ────────────────────────────
{
  // Cast through unknown so we can stuff PII-bearing columns a real DB row
  // would have — the builder's allow-list interface excludes them by type.
  const row = {
    id: 'd1',
    title: 'Berlin guarantee',
    fee_amount: 15000,
    fee_currency: 'EUR',
    settlement_method: 'bank transfer',
    terms_summary: '90/10 over breakeven',
    venue_name: 'Astra',
    city: 'Berlin',
    show_date: '2026-09-01',
    // PII a real row carries — must NOT surface:
    promoter_name: 'John Q. Promoter',
    promoter_email: 'promoter@example.com',
    promoter_phone: '+44 7700 900123',
    notes: 'call John on +44 7700 900123, DOB 1985-04-12',
  } as unknown as Parameters<typeof buildDealMemoChunk>[0];
  const out = buildDealMemoChunk(row);
  check('deal_memo: builds content', !!out && out.content.length > 0);
  check('deal_memo: includes the fee figure', !!out && out.content.includes('15000'));
  check('deal_memo: includes terms', !!out && out.content.includes('90/10'));
  check('deal_memo: no PII leak', !!out && !leaks(out.content));
  check('deal_memo: metadata carries no PII', !!out && !leaks(JSON.stringify(out.metadata)));
}

// ── deal_memo: empty → null ──────────────────────────────────────────
check('deal_memo: empty row → null', buildDealMemoChunk({ id: 'd2' }) === null);

// ── venue: business facts in, contacts/notes out ─────────────────────
{
  const row = {
    id: 'v1',
    name: 'Astra Kulturhaus',
    city: 'Berlin',
    country: 'Germany',
    capacity: 1500,
    // PII / free-form a real row carries — excluded by the interface:
    contacts: [{ name: 'John Q. Promoter', email: 'promoter@example.com' }],
    notes: 'ask for John, +44 7700 900123',
    technical_specs: { contact: 'promoter@example.com' },
  } as unknown as Parameters<typeof buildVenueChunk>[0];
  const out = buildVenueChunk(row);
  check('venue: builds content', !!out && out.content.includes('Astra Kulturhaus'));
  check('venue: includes capacity', !!out && out.content.includes('1500'));
  check('venue: no PII leak', !!out && !leaks(out.content));
}
check('venue: nameless → null', buildVenueChunk({ id: 'v2', city: 'Berlin', capacity: 900 }) === null);

// ── budget_line_item: figures in, notes out ──────────────────────────
{
  const row = {
    id: 'b1',
    category: 'prod_audio',
    label: 'PA hire',
    proposed_cost: 3200,
    currency: 'GBP',
    city: 'London',
    notes: 'contact engineer at eng@example.com',
  } as unknown as Parameters<typeof buildBudgetLineItemChunk>[0];
  const out = buildBudgetLineItemChunk(row);
  check('budget: builds content', !!out && out.content.includes('PA hire'));
  check('budget: includes cost', !!out && out.content.includes('3200'));
  check('budget: no notes/PII leak', !!out && !out.content.includes('eng@example.com'));
}
check('budget: labelless → null', buildBudgetLineItemChunk({ id: 'b2', proposed_cost: 10 }) === null);

// ── F1: currency resolution (line currency, else tour currency) ──────
check(
  'budget: line currency wins',
  buildBudgetLineItemChunk({ id: 'b3', label: 'PA', proposed_cost: 100, currency: 'USD', tour_currency: 'GBP' })
    ?.content.includes('100 USD') === true,
);
check(
  'budget: falls back to tour currency when line currency null',
  buildBudgetLineItemChunk({ id: 'b4', label: 'PA', actual_cost: 115000, currency: null, tour_currency: 'GBP' })
    ?.content.includes('115000 GBP') === true,
);
check(
  'budget: no currency when neither set',
  buildBudgetLineItemChunk({ id: 'b5', label: 'PA', proposed_cost: 50 })?.content.includes('50\n') === false &&
    buildBudgetLineItemChunk({ id: 'b5', label: 'PA', proposed_cost: 50 })?.content.endsWith('50') === true,
);

// ── dispatch ─────────────────────────────────────────────────────────
check('buildChunk dispatches venue', buildChunk('venue', { id: 'v3', name: 'O2' })?.content.includes('O2') === true);

console.log(`rag sources: ${pass} checks passed`);
