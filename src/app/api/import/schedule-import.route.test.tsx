/* ============================================
   AI schedule import — the three routes against the in-memory DB.

   upload  → signed upload URLs, fenced to this workspace's import folder
   read    → downloads by path (others' paths refused), reads with the model
             (mocked), returns clean proposed days, deletes the uploads
   apply   → MERGE-ONLY: updates in place (ids kept), inserts new dates, never
             deletes, widens the tour, drops a stale venue link
   ============================================ */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { FakeDb } from '@/test-utils/fakeSupabase';

let db: FakeDb;
const removed: string[][] = [];
const stored = new Map<string, { bytes: Buffer; type: string }>();
let modelInput: unknown = { days: [] };
const modelCalls: unknown[] = [];

vi.mock('@/lib/supabase-server', () => ({
  createServerSupabaseClient: async () => db.client(),
  createServiceSupabaseClient: () => ({
    storage: {
      from: () => ({
        createSignedUploadUrl: async (path: string) => ({ data: { token: `tok:${path}`, path }, error: null }),
        download: async (path: string) => {
          const f = stored.get(path);
          return f ? { data: new Blob([new Uint8Array(f.bytes)], { type: f.type }), error: null } : { data: null, error: { message: 'not found' } };
        },
        remove: async (paths: string[]) => {
          removed.push(paths);
          return { data: null, error: null };
        },
      }),
    },
  }),
}));
vi.mock('@/lib/auth/workspace-check', () => ({
  requireWrite: async () => ({ user: { id: 'user-1' }, workspaceId: 'ws-1' }),
  requireTourInWorkspace: async (_s: unknown, tourId: string, ws: string) =>
    db.t('tours').some((t) => t.id === tourId && t.workspace_id === ws) ? null : new Response('no', { status: 404 }),
}));
vi.mock('@/lib/ai/usage', () => ({
  withAiUsage: async (_ctx: unknown, call: (a: unknown) => Promise<{ result: unknown }>) => {
    const anthropic = {
      messages: {
        create: async (req: unknown) => {
          modelCalls.push(req);
          return { stop_reason: 'tool_use', usage: {}, content: [{ type: 'tool_use', name: 'record_schedule', input: modelInput }] };
        },
      },
    };
    const { result } = await call(anthropic);
    return { result, blocked: false };
  },
  aiCapExceededResponse: () => new Response('cap', { status: 429 }),
}));
vi.mock('@/lib/rate-limit', () => ({ checkRateLimit: () => null, markRateLimit: () => {} }));
vi.mock('@/server/budget/withDerivedRefresh', () => ({
  withDerivedRefresh: (h: unknown) => h,
  tourFromParams: async () => 'tour-1',
}));

process.env.ANTHROPIC_API_KEY = 'test';
const upload = await import('./schedule/upload/route');
const read = await import('./schedule/route');
const apply = await import('../tours/[id]/routing/import/route');

const json = (body: unknown) => new Request('http://x', { method: 'POST', body: JSON.stringify(body) });
const params = { params: Promise.resolve({ id: 'tour-1' }) };

beforeEach(() => {
  db = new FakeDb();
  removed.length = 0;
  stored.clear();
  modelCalls.length = 0;
  db.seed('tours', [
    { id: 'tour-1', workspace_id: 'ws-1', name: "Simple Plan Support | Fall'26", start_date: '2026-10-01', end_date: '2026-10-31' },
    { id: 'tour-x', workspace_id: 'ws-2', name: 'Other', start_date: null, end_date: null },
  ]);
  db.seed('routing', [
    { id: 'r9', tour_id: 'tour-1', date: '2026-10-09', day_type: 'show', venue_name: 'Roundhouse', city: 'London', canonical_venue_id: 'cv1', notes: 'Bus call 10:00' },
    { id: 'r10', tour_id: 'tour-1', date: '2026-10-10', day_type: 'travel', venue_name: null, city: '' },
  ]);
});

describe('upload', () => {
  it('hands out one signed URL per file, inside this workspace’s import folder', async () => {
    const res = await upload.POST(json({ files: [{ name: 'Tour Book (v3).pdf', size: 1000, type: 'application/pdf' }] }));
    const j = (await res.json()) as { uploads: Array<{ path: string; token: string }> };
    expect(j.uploads).toHaveLength(1);
    expect(j.uploads[0].path).toMatch(/^imports\/ws-1\/[0-9a-f-]+\/0-Tour_Book_v3_.pdf$/);
  });
  it('refuses oversize or too many files', async () => {
    expect((await upload.POST(json({ files: [{ name: 'a', size: 30 * 1024 * 1024 }] }))).status).toBe(400);
    expect((await upload.POST(json({ files: Array.from({ length: 11 }, () => ({ name: 'a', size: 1 })) }))).status).toBe(400);
  });
});

describe('read', () => {
  it('reads pasted text, returns clean days, and passes the tour context', async () => {
    modelInput = {
      tour: { name: 'Fall run' },
      days: [
        { date: '2026-10-11', day_type: 'Show', venue_name: 'O2 Ritz', city: 'Manchester', confidence: 'high' },
        { date: '2026-10-12', day_type: 'day off', confidence: 'high' },
        { date: 'nope', day_type: 'show' },
      ],
    };
    const res = await read.POST(json({ text: 'Sun 11 Oct O2 Ritz Manchester\nMon 12 Oct OFF', tour_id: 'tour-1' }));
    expect(res.status).toBe(200);
    const j = (await res.json()) as { days: Array<{ date: string; day_type: string }>; warnings: string[] };
    expect(j.days.map((d) => [d.date, d.day_type])).toEqual([['2026-10-11', 'show'], ['2026-10-12', 'off']]);
    expect(j.warnings.length).toBe(1);
    const sys = (modelCalls[0] as { system: string }).system;
    expect(sys).toContain("Simple Plan Support | Fall'26");
  });

  it('reads an uploaded CSV by path, then deletes it', async () => {
    modelInput = { days: [{ date: '2026-10-20', day_type: 'show', city: 'Leeds', confidence: 'high' }] };
    stored.set('imports/ws-1/b/0-routing.csv', { bytes: Buffer.from('Date,City\n2026-10-20,Leeds\n'), type: 'text/csv' });
    const res = await read.POST(json({ paths: ['imports/ws-1/b/0-routing.csv'] }));
    expect(res.status).toBe(200);
    const sent = JSON.stringify((modelCalls[0] as { messages: unknown }).messages);
    expect(sent).toContain('2026-10-20,Leeds');
    expect(removed.flat()).toContain('imports/ws-1/b/0-routing.csv');
  });

  it('an Excel routing grid reaches the model with ISO dates (not US-style)', async () => {
    const XLSX = await import('xlsx');
    const ws = XLSX.utils.aoa_to_sheet([['Date', 'Venue', 'City'], [new Date(Date.UTC(2026, 9, 9)), 'Roundhouse', 'London']]);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Routing');
    const bytes = Buffer.from(XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }));
    stored.set('imports/ws-1/b/0-grid.xlsx', { bytes, type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    modelInput = { days: [] };
    await read.POST(json({ paths: ['imports/ws-1/b/0-grid.xlsx'] }));
    const sent = JSON.stringify((modelCalls[0] as { messages: unknown }).messages);
    expect(sent).toContain('2026-10-09,Roundhouse,London');
  });

  it("refuses another workspace's file and another workspace's tour", async () => {
    expect((await read.POST(json({ paths: ['imports/ws-2/b/0-x.pdf'] }))).status).toBe(403);
    expect((await read.POST(json({ paths: ['imports/ws-1/../ws-2/x.pdf'] }))).status).toBe(403);
    expect((await read.POST(json({ text: 'x', tour_id: 'tour-x' }))).status).toBe(404);
  });

  it('asks for a PDF instead of a Word file', async () => {
    stored.set('imports/ws-1/b/0-book.docx', { bytes: Buffer.from('PK'), type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' });
    const res = await read.POST(json({ paths: ['imports/ws-1/b/0-book.docx'] }));
    expect(res.status).toBe(400);
    expect(((await res.json()) as { error: string }).error).toMatch(/save it as PDF/);
  });
});

describe('apply (merge-only)', () => {
  it('updates in place, inserts new dates, never deletes, widens the tour', async () => {
    const res = await apply.POST(
      json({
        days: [
          { date: '2026-10-09', fields: { address: 'Chalk Farm Rd', notes: 'Bus call 10:00\nDoors 19:00' } },
          { date: '2026-09-29', fields: { day_type: 'rehearsal', city: 'London' } },
        ],
      }),
      params,
    );
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ inserted: 1, updated: 1, tourDates: { start_date: '2026-09-29', end_date: '2026-10-31' } });
    const r9 = db.t('routing').find((r) => r.id === 'r9')!;
    expect(r9).toMatchObject({ address: 'Chalk Farm Rd', notes: 'Bus call 10:00\nDoors 19:00', venue_name: 'Roundhouse', canonical_venue_id: 'cv1' });
    expect(db.t('routing').some((r) => r.id === 'r10')).toBe(true); // untouched, not deleted
    expect(db.t('routing').find((r) => r.date === '2026-09-29')).toMatchObject({ day_type: 'rehearsal', city: 'London' });
    expect(db.t('tours').find((t) => t.id === 'tour-1')!.start_date).toBe('2026-09-29');
  });

  it('a changed venue name drops the old library-venue link', async () => {
    await apply.POST(json({ days: [{ date: '2026-10-09', fields: { venue_name: 'KOKO' } }] }), params);
    expect(db.t('routing').find((r) => r.id === 'r9')).toMatchObject({ venue_name: 'KOKO', canonical_venue_id: null });
  });

  it('refuses unknown fields and unreal dates', async () => {
    expect((await apply.POST(json({ days: [{ date: '2026-10-09', fields: { tour_id: 'x' } }] }), params)).status).toBe(400);
    expect((await apply.POST(json({ days: [{ date: '2026-02-30', fields: { city: 'x' } }] }), params)).status).toBe(400);
    expect((await apply.POST(json({ days: [] }), params)).status).toBe(400);
  });
});
