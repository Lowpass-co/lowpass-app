/* ============================================
   A ticket receipt is proposed against the flight it paid for (Oct 2026):
   the review queue gets a receipt_txn on the flight's own budget line, split
   evenly across a group booking — and money still only moves on apply.
   ============================================ */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { FakeDb } from '@/test-utils/fakeSupabase';

let db: FakeDb;
vi.mock('@/lib/supabase-server', () => ({
  createServerSupabaseClient: async () => db.client(),
  createServiceSupabaseClient: () => db.client(),
}));
vi.mock('@/lib/auth/workspace-check', () => ({
  requireWrite: async () => ({ user: { id: 'user-1' }, workspaceId: 'ws-1' }),
}));

const proposals = await import('./proposals/route');
const post = (body: unknown) => proposals.POST(new Request('http://x', { method: 'POST', body: JSON.stringify(body) }));

const ticket = (o: Partial<{ bookingRef: string | null; passengers: string[] }> = {}) => ({
  vendor: 'Delta',
  date: '2026-08-01',
  total_amount: 900,
  currency: 'USD',
  category: 'transport',
  description: 'E-ticket',
  ticket: { bookingRef: 'ABC123', passengers: [], legs: [{ flightNumber: 'DL1234', date: '2026-09-09', from: 'JFK', to: 'BNA' }], ...o },
});

beforeEach(() => {
  db = new FakeDb();
  db.seed('profiles', [{ id: 'user-1', workspace_id: 'ws-1' }]);
  db.seed('tours', [{ id: 'tour-1', workspace_id: 'ws-1', start_date: '2026-09-01', end_date: '2026-10-01' }]);
  db.seed('flights', [
    { id: 'fl-a', tour_id: 'tour-1', person_name: 'Adam Rowley', airline: 'DL', flight_number: '1234', pnr: 'ABC123', depart_at: '2026-09-09T09:10:00', origin_airport: 'JFK', destination_airport: 'BNA' },
    { id: 'fl-b', tour_id: 'tour-1', person_name: 'Ben Quinton', airline: 'DL', flight_number: '1234', pnr: 'ABC123', depart_at: '2026-09-09T09:10:00', origin_airport: 'JFK', destination_airport: 'BNA' },
    { id: 'fl-c', tour_id: 'tour-1', person_name: 'Dil', airline: 'DL', flight_number: '1234', pnr: 'ABC123', depart_at: '2026-09-09T09:10:00', origin_airport: 'JFK', destination_airport: 'BNA' },
  ]);
  db.seed('budget_line_items', [
    { id: 'line-a', tour_id: 'tour-1', label: 'Flight — Adam', section: 'Travel', category: 'transport', proposed_cost: 450, actual_cost: 0, flight_id: 'fl-a' },
    // An older row linked the other way.
    { id: 'line-b', tour_id: 'tour-1', label: 'Flight — Ben', section: 'Travel', category: 'transport', proposed_cost: 450, actual_cost: 0, source_entity_type: 'flight', source_entity_id: 'fl-b' },
    { id: 'line-x', tour_id: 'tour-1', label: 'Delta lounge', section: 'Travel', category: 'transport', proposed_cost: 50, actual_cost: 0 },
  ]);
  db.seed('expense_receipts', [{ id: 'rc-1', receipt_number: 'R-001' }, { id: 'rc-2', receipt_number: 'R-002' }]);
});

describe('ticket receipts', () => {
  it('one passenger → one proposal on that flight\'s line, for the whole amount', async () => {
    const r = await post({ tourId: 'tour-1', receipts: [{ receiptId: 'rc-1', ocr: ticket({ passengers: ['ROWLEY/ADAM MR'] }) }] });
    expect(r.status).toBe(201);
    const rows = db.t('import_pending_lines');
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ target: 'receipt_txn', receipt_id: 'rc-1', status: 'pending' });
    expect(rows[0].value).toMatchObject({ lineItemId: 'line-a', flightId: 'fl-a', amount: 900, currency: 'USD' });
    expect(String((rows[0].value as { reason: string }).reason)).toContain('booking ref ABC123');
  });

  it('a group booking → one proposal per ticket that has a line, the amount split', async () => {
    await post({ tourId: 'tour-1', receipts: [{ receiptId: 'rc-1', ocr: ticket() }] });
    const rows = db.t('import_pending_lines');
    // Dil's flight has no budget line, so it can't take a share.
    expect(rows.map((x) => (x.value as { lineItemId: string }).lineItemId)).toEqual(['line-a', 'line-b']);
    expect(rows.map((x) => (x.value as { amount: number }).amount)).toEqual([450, 450]);
  });

  it('a non-ticket receipt still goes through the normal matcher', async () => {
    await post({ tourId: 'tour-1', receipts: [{ receiptId: 'rc-2', ocr: { ...ticket(), ticket: null, vendor: 'Uber' } }] });
    const rows = db.t('import_pending_lines');
    expect(rows).toHaveLength(1);
    expect((rows[0].value as { flightId?: string }).flightId).toBeUndefined();
  });

  it('nothing is written to the budget here', async () => {
    await post({ tourId: 'tour-1', receipts: [{ receiptId: 'rc-1', ocr: ticket({ passengers: ['Adam Rowley'] }) }] });
    expect(db.t('budget_line_item_transactions')).toHaveLength(0);
    expect(db.t('budget_line_items').find((l) => l.id === 'line-a')?.actual_cost).toBe(0);
  });
});
