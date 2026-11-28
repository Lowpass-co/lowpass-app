import { beforeEach, describe, expect, it } from 'vitest';
import { FakeDb } from '@/test-utils/fakeSupabase';
import { addLines, createJob, deleteLine, jobWrites, RentalError, updateJob, updateLine } from './jobs';
import { gearToStock } from './stock';

/* Nov 2026, Adam: "make the rental house feature more professional, and
   reliable". Every job-builder write goes through these. */
let db: FakeDb;
beforeEach(() => {
  db = new FakeDb();
  db.seed('rental_jobs', [
    { id: 'j1', workspace_id: 'ws', user_id: 'u', name: 'Roxy', status: 'draft', start_date: '2026-12-01', end_date: '2026-12-04' },
    { id: 'jx', workspace_id: 'other', user_id: 'v', name: 'Theirs', status: 'draft' },
  ]);
  db.seed('gear', [
    { id: 'g-console', workspace_id: 'ws', name: 'LV1', quantity: 1 },
    { id: 'g-xlr', workspace_id: 'ws', name: 'XLR 10m', quantity: 40 },
    { id: 'g-theirs', workspace_id: 'other', name: 'Their desk' },
  ]);
});

const err = async (p: Promise<unknown>) => {
  try {
    await p;
  } catch (e) {
    return e instanceof RentalError ? `${e.status} ${e.message}` : String(e);
  }
  return 'no error';
};

describe('what a job save may write', () => {
  it('only the fields sent; numbers checked', () => {
    expect(jobWrites({ discount_percent: '10', discount_fixed: '' }, { creating: false })).toEqual({ discount_percent: 10, discount_fixed: 0 });
    expect(() => jobWrites({ discount_percent: 120 }, { creating: false })).toThrow('over 100%');
    expect(() => jobWrites({ status: 'sent' }, { creating: false })).toThrow('Unknown status');
    expect(() => jobWrites({ start_date: '2026-12-05', end_date: '2026-12-01' }, { creating: false })).toThrow('on or after');
    expect(jobWrites({ days_per_week: '3.5' }, { creating: false })).toEqual({ days_per_week: 3.5 });
    expect(jobWrites({ days_per_week: null }, { creating: false })).toEqual({ days_per_week: null });
  });
  it('a new job needs a name and dates; workspace + user are the server’s, not the body’s', async () => {
    expect(await err(createJob(db.client(), { workspaceId: 'ws', userId: 'u', body: { name: 'X' } }))).toBe('400 A job needs start and end dates.');
    await createJob(db.client(), { workspaceId: 'ws', userId: 'u', body: { name: ' Club ', start_date: '2026-12-01', end_date: '2026-12-02', workspace_id: 'other', user_id: 'evil' } });
    const made = db.t('rental_jobs').find((j) => j.name === 'Club');
    expect(made).toMatchObject({ workspace_id: 'ws', user_id: 'u' });
  });
  it('another workspace’s job is not found', async () => {
    expect(await err(updateJob(db.client(), { workspaceId: 'ws', jobId: 'jx', body: { name: 'Mine' } }))).toBe('404 Job not found.');
  });
});

describe('lines', () => {
  it('adds new stock by gear id; adding again adds to the quantity, never a second line', async () => {
    await addLines(db.client(), { workspaceId: 'ws', jobId: 'j1', items: [{ gear_id: 'g-console', quantity: 1 }, { gear_id: 'g-xlr', quantity: 12 }] });
    const lines = await addLines(db.client(), { workspaceId: 'ws', jobId: 'j1', items: [{ gear_id: 'g-xlr', quantity: 8 }] });
    expect(lines.map((l) => [l.gear_id, l.quantity])).toEqual([['g-console', 1], ['g-xlr', 20]]);
    expect(db.t('rental_job_items').every((l) => l.inventory_id == null && l.workspace_id === 'ws')).toBe(true);
  });
  it('refuses an item that isn’t in your stock', async () => {
    expect(await err(addLines(db.client(), { workspaceId: 'ws', jobId: 'j1', items: [{ gear_id: 'g-theirs' }] }))).toBe('400 One of those items isn’t in your stock.');
    expect(db.t('rental_job_items')).toHaveLength(0);
  });
  it('quantity must be ≥ 1 and a rate positive; a line on another job is not found', async () => {
    db.seed('rental_job_items', [{ id: 'l1', job_id: 'j1', gear_id: 'g-console', quantity: 1 }, { id: 'l9', job_id: 'jx', gear_id: 'g-theirs', quantity: 1 }]);
    expect(await err(updateLine(db.client(), { workspaceId: 'ws', jobId: 'j1', lineId: 'l1', body: { quantity: 0 } }))).toBe('400 Quantity must be 1 or more.');
    expect(await err(updateLine(db.client(), { workspaceId: 'ws', jobId: 'j1', lineId: 'l1', body: { day_rate_override: -5 } }))).toBe('400 Day rate must be a positive number.');
    expect(await updateLine(db.client(), { workspaceId: 'ws', jobId: 'j1', lineId: 'l1', body: { quantity: 2 } })).toMatchObject({ quantity: 2 });
    expect(await err(deleteLine(db.client(), { workspaceId: 'ws', jobId: 'j1', lineId: 'l9' }))).toBe('404 Line not found.');
  });
});

describe('stock is the one gear list', () => {
  it('maps a gear row into what the job builder prices from', () => {
    expect(gearToStock({ id: 'g', name: 'LV1', purchase_cost: '9000', day_rate: null, quantity: null, status: 'available' })).toMatchObject({
      id: 'g', name: 'LV1', purchase_cost: 9000, day_rate: null, quantity: 1, status: 'available',
    });
  });
});
