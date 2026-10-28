/* ============================================
   Advance rebuild — the write routes and loaders against the in-memory DB.

   answers   → first write starts the day from its day type's template; merges
               (siblings kept); only real questions; sources recorded
   sections  → Customise marks the day; switching a section off keeps answers;
               "also the template" reaches days that follow it — not customised
               ones, not ones already sent to a venue
   request   → a link that asks only venue-answerable questions; sent_at
   review    → accepting a venue answer merges it atomically, marked Venue;
               empty venue values never blank yours
   packs     → files kept once; every answer remembers file + page + quote;
               new questions land on the day or the template
   loaders   → board cells / counts / gaps; show page linked facts
   ============================================ */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { FakeDb } from '@/test-utils/fakeSupabase';

let db: FakeDb;

function mergeRpc(d: FakeDb, args: Record<string, unknown>) {
  const inst = d.t('advance_instances').find((i) => i.id === args.p_instance);
  if (!inst) return { data: null, error: null };
  const data = { ...((inst.data as Record<string, unknown>) ?? {}) };
  for (const [k, v] of Object.entries((args.p_changes as Record<string, unknown>) ?? {})) {
    if (!v || typeof v !== 'object' || Array.isArray(v)) continue;
    const cur = data[k] && typeof data[k] === 'object' && !Array.isArray(data[k]) ? (data[k] as Record<string, unknown>) : {};
    data[k] = { ...cur, ...(v as Record<string, unknown>) };
  }
  const src: Record<string, unknown> = { ...((inst.field_sources as Record<string, unknown>) ?? {}), ...((args.p_sources as Record<string, unknown>) ?? {}) };
  for (const k of Object.keys(src)) if (src[k] === null) delete src[k];
  inst.data = data;
  inst.field_sources = src;
  inst.last_updated_at = '2026-10-28T12:00:00Z';
  return { data: { data, field_sources: src, last_updated_at: inst.last_updated_at }, error: null };
}

vi.mock('@/lib/supabase-server', () => ({
  createServerSupabaseClient: async () => db.client(),
  createServiceSupabaseClient: () => db.client(),
}));
vi.mock('@/lib/auth/workspace-check', () => ({
  requireWrite: async () => ({ user: { id: 'user-1' }, workspaceId: 'ws-1' }),
  requireUserAndWorkspace: async () => ({ user: { id: 'user-1' }, workspaceId: 'ws-1' }),
  requireTourInWorkspace: async (_s: unknown, tourId: string, ws: string) =>
    db.t('tours').some((t) => t.id === tourId && t.workspace_id === ws) ? null : new Response('no', { status: 404 }),
}));

const answers = await import('./[id]/advance/[routingId]/answers/route');
const sectionsRoute = await import('./[id]/advance/[routingId]/sections/route');
const request = await import('./[id]/advance/[routingId]/request/route');
const packs = await import('./[id]/advance/[routingId]/packs/route');
const templateSet = await import('../advance/template-set/route');
const templateOne = await import('../advance/template-set/[templateId]/route');
const pendingRoute = await import('../advance/intake/pending/route');
const { loadAdvanceBoard } = await import('@/server/advance/board');
const { loadAdvanceShow } = await import('@/server/advance/show');

const json = (body: unknown, method = 'POST') => new Request('http://x', { method, body: JSON.stringify(body) });
const p = (routingId: string) => ({ params: Promise.resolve({ id: 'tour-1', routingId }) });

const SCHED = { template_id: 'tpl-sched', label: 'Schedule', order: 0, fields: [{ id: 'doors', label: 'Doors', type: 'time' }, { id: 'curfew', label: 'Curfew', type: 'time' }] };
const PROD = { template_id: 'tpl-prod', label: 'Production', order: 1, fields: [{ id: 'power', label: 'Power details', type: 'textarea' }] };
const SETTLE = { template_id: '0d0d0d0d-0000-4000-8000-00000000000a', label: 'Settlement', order: 2, fields: [{ id: 'when', label: 'When', type: 'text' }] };
const PACK = 'advance-packs/ws-1/tour-1/b1/0-Tech_pack.pdf';

beforeEach(() => {
  db = new FakeDb({ rpc: { advance_merge_answers: mergeRpc } });
  db.seed('tours', [
    { id: 'tour-1', name: 'Fall run', workspace_id: 'ws-1', artist_id: 'art-1' },
    { id: 'tour-x', name: 'Other', workspace_id: 'ws-2' },
  ]);
  db.seed('artists', [{ id: 'art-1', name: 'Charlotte Sands' }]);
  db.seed('routing', [
    { id: 'r1', tour_id: 'tour-1', date: '2026-10-02', day_type: 'show', venue_name: 'O2 Apollo Manchester', city: 'Manchester' },
    { id: 'r2', tour_id: 'tour-1', date: '2026-10-03', day_type: 'show', venue_name: 'OVO Arena Wembley', city: 'London' },
    { id: 'r3', tour_id: 'tour-1', date: '2026-10-04', day_type: 'travel', city: 'Brussels' },
    { id: 'r4', tour_id: 'tour-1', date: '2026-10-05', day_type: 'off', city: 'Brussels' },
    { id: 'r5', tour_id: 'tour-1', date: '2026-10-06', day_type: 'show', venue_name: 'Forest National', city: 'Brussels' },
  ]);
  db.seed('advance_layout_templates', [{ id: 'lt-show', workspace_id: 'ws-1', name: 'Show day', sections: [SCHED, PROD, SETTLE], updated_at: null }]);
  db.seed('advance_day_type_templates', [{ workspace_id: 'ws-1', day_type: 'show', layout_template_id: 'lt-show' }]);
  db.seed('advance_templates', [{ id: '0d0d0d0d-0000-4000-8000-00000000000a', tm_only: true }]);
});

describe('answers', () => {
  it('the first write starts the day from its template, then merges', async () => {
    const r1 = await answers.POST(json({ changes: { 'tpl-sched': { doors: '19:00' } }, sources: { 'tpl-sched:doors': { kind: 'you' } } }), p('r1'));
    expect(r1.status).toBe(200);
    const cfg = db.t('advance_form_configs').find((c) => c.routing_id === 'r1')!;
    expect(cfg).toMatchObject({ layout_template_id: 'lt-show', customised: false });
    expect((cfg.sections as { label: string }[]).map((s) => s.label)).toEqual(['Schedule', 'Production', 'Settlement']);
    await answers.POST(json({ changes: { 'tpl-sched': { curfew: '23:00' } } }), p('r1'));
    const inst = db.t('advance_instances').find((i) => i.routing_id === 'r1')!;
    expect(inst.data).toEqual({ 'tpl-sched': { doors: '19:00', curfew: '23:00' } });
    expect(db.t('advance_instances').filter((i) => i.routing_id === 'r1')).toHaveLength(1);
    expect((inst.field_sources as Record<string, unknown>)['tpl-sched:doors']).toEqual({ kind: 'you' });
  });

  it('refuses questions that aren’t on the day, bad values and other tours', async () => {
    expect((await answers.POST(json({ changes: { 'tpl-sched': { nope: 'x' } } }), p('r1'))).status).toBe(400);
    expect((await answers.POST(json({ changes: { 'tpl-sched': { doors: { a: 1 } } } }), p('r1'))).status).toBe(400);
    expect((await answers.POST(json({ changes: {}, sources: { 'tpl-sched:doors': { kind: 'hacker' } } }), p('r1'))).status).toBe(400);
    expect((await answers.POST(json({ changes: {} }), { params: Promise.resolve({ id: 'tour-x', routingId: 'r1' }) })).status).toBe(404);
  });
});

describe('customise', () => {
  it('switching a section off marks the day and keeps its answers', async () => {
    await answers.POST(json({ changes: { 'tpl-prod': { power: '125A' } } }), p('r1'));
    const res = await sectionsRoute.PUT(json({ sections: [SCHED, SETTLE] }, 'PUT'), p('r1'));
    expect(res.status).toBe(200);
    const cfg = db.t('advance_form_configs').find((c) => c.routing_id === 'r1')!;
    expect(cfg.customised).toBe(true);
    expect(db.t('advance_instances').find((i) => i.routing_id === 'r1')!.data).toEqual({ 'tpl-prod': { power: '125A' } });
    // back to the template
    await sectionsRoute.POST(json({ action: 'reset' }), p('r1'));
    expect(db.t('advance_form_configs').find((c) => c.routing_id === 'r1')).toMatchObject({ customised: false });
  });

  it('“also the template” reaches following days, not customised or sent ones', async () => {
    for (const r of ['r1', 'r2', 'r5']) await answers.POST(json({ changes: {} }), p(r));
    await sectionsRoute.PUT(json({ sections: [SCHED] }, 'PUT'), p('r2')); // r2 customised by hand
    db.seed('advance_intake_links', [{ id: 'l5', tour_id: 'tour-1', routing_id: 'r5', status: 'pending', created_at: '2026-10-01' }]);
    const ferry = { ...SCHED, fields: [...SCHED.fields, { id: 'day_ferry', label: 'Ferry', type: 'text' }] };
    const res = await sectionsRoute.PUT(json({ sections: [ferry, PROD, SETTLE], alsoTemplate: true }, 'PUT'), p('r1'));
    expect(await res.json()).toMatchObject({ customised: false, templateDays: { updated: 0, kept: 2 } });
    const tpl = db.t('advance_layout_templates')[0];
    expect((tpl.sections as { fields: { id: string }[] }[])[0].fields.map((f) => f.id)).toContain('day_ferry');
    expect((db.t('advance_form_configs').find((c) => c.routing_id === 'r2')!.sections as unknown[]).length).toBe(1);
  });

  it('refuses a malformed layout', async () => {
    expect((await sectionsRoute.PUT(json({ sections: [{ template_id: 'a', label: 'A', fields: [{ id: 'x', label: 'X', type: 'script' }] }] }, 'PUT'), p('r1'))).status).toBe(400);
    expect((await sectionsRoute.PUT(json({ sections: [SCHED, SCHED] }, 'PUT'), p('r1'))).status).toBe(400);
  });
});

describe('request from venue', () => {
  it('asks only venue-answerable questions; all of them means “everything”', async () => {
    const r = await request.POST(json({ recipientEmail: 'pm@venue.com', askFields: ['tpl-sched:doors', '0d0d0d0d-0000-4000-8000-00000000000a:when', 'bogus:x'] }), p('r1'));
    expect(r.status).toBe(201);
    const j = (await r.json()) as { link: { id: string; path: string } };
    expect(j.link.path).toMatch(/^\/advance-intake\//);
    expect(db.t('advance_intake_links')[0]).toMatchObject({ ask_fields: ['tpl-sched:doors'], recipient_email: 'pm@venue.com', routing_id: 'r1' });
    await request.POST(json({ askFields: ['tpl-sched:doors', 'tpl-sched:curfew', 'tpl-prod:power'] }), p('r1'));
    expect(db.t('advance_intake_links')[1].ask_fields).toBeNull();
    expect((await request.POST(json({ recipientEmail: 'not-an-email' }), p('r1'))).status).toBe(400);
    expect((await request.POST(json({ askFields: ['0d0d0d0d-0000-4000-8000-00000000000a:when'] }), p('r1'))).status).toBe(400);
  });

  it('marks it sent once', async () => {
    const j = (await (await request.POST(json({}), p('r1'))).json()) as { link: { id: string } };
    expect(await (await request.PATCH(json({ linkId: j.link.id, sent: true }, 'PATCH'), p('r1'))).json()).toEqual({ updated: 1 });
    expect(db.t('advance_intake_links')[0].sent_at).toBeTruthy();
  });
});

describe('info packs', () => {
  it('keeps the file once and records where each answer came from', async () => {
    const body = {
      files: [{ path: PACK, name: 'Tech pack.pdf', mime: 'application/pdf', size: 1000, pageCount: 24 }],
      answers: [{ section_id: 'tpl-sched', field_id: 'curfew', value: '22:30', file: 0, page: 2, quote: 'Strict curfew 22:30' }],
      newQuestions: [
        { label: 'Bus shore power', value: '2 bays, 32A', section_id: 'tpl-prod', scope: 'template', file: 0, page: 3, quote: 'shore power' },
        { label: 'Overtime charge', value: 'Per 30 min', scope: 'day', file: 0, page: 2 },
      ],
    };
    const res = await packs.POST(json(body), p('r1'));
    expect(res.status).toBe(200);
    await packs.POST(json({ ...body, newQuestions: [] }), p('r1'));
    expect(db.t('advance_documents')).toHaveLength(1);
    const doc = db.t('advance_documents')[0];
    const inst = db.t('advance_instances').find((i) => i.routing_id === 'r1')!;
    expect((inst.field_sources as Record<string, unknown>)['tpl-sched:curfew']).toMatchObject({ kind: 'pack', doc_id: doc.id, page: 2, quote: 'Strict curfew 22:30', file_name: 'Tech pack.pdf' });
    const cfg = db.t('advance_form_configs').find((c) => c.routing_id === 'r1')!;
    const secs = cfg.sections as { template_id: string; fields: { id: string; label: string; day_only?: boolean }[] }[];
    expect(secs.find((s) => s.template_id === 'tpl-prod')!.fields.map((f) => f.label)).toContain('Bus shore power');
    expect(secs.find((s) => s.template_id === 'from_info_packs')!.fields[0]).toMatchObject({ label: 'Overtime charge', day_only: true });
    expect(cfg.customised).toBe(true);
    const tpl = db.t('advance_layout_templates')[0].sections as { template_id: string; fields: { label: string }[] }[];
    expect(tpl.find((s) => s.template_id === 'tpl-prod')!.fields.map((f) => f.label)).toContain('Bus shore power');
    expect((inst.data as Record<string, Record<string, unknown>>)['tpl-prod']['day_bus_shore_power']).toBe('2 bays, 32A');
  });

  it('refuses files from another workspace', async () => {
    expect((await packs.POST(json({ files: [{ path: 'advance-packs/ws-2/tour-1/x.pdf' }] }), p('r1'))).status).toBe(403);
  });
});

describe('templates', () => {
  it('maps day types and pushes a layout change to following days', async () => {
    const put = await templateSet.PUT(json({ mapping: { festival: 'lt-show', rehearsal: null } }, 'PUT'));
    expect(await put.json()).toEqual({ mapping: { show: 'lt-show', festival: 'lt-show' } });
    await answers.POST(json({ changes: {} }), p('r1'));
    const res = await templateOne.PATCH(json({ sections: [SCHED] }, 'PATCH'), { params: Promise.resolve({ templateId: 'lt-show' }) });
    expect(await res.json()).toMatchObject({ days: { updated: 1, kept: 0 } });
    expect((db.t('advance_form_configs').find((c) => c.routing_id === 'r1')!.sections as unknown[]).length).toBe(1);
  });
});

describe('loaders', () => {
  it('board: cells, counts, gaps folded, TM-only never “asked”', async () => {
    await answers.POST(json({ changes: { 'tpl-sched': { doors: '19:00', curfew: '23:00' } } }), p('r1'));
    db.seed('advance_intake_links', [{ id: 'l1', tour_id: 'tour-1', routing_id: 'r1', status: 'pending', created_at: '2026-10-01T00:00:00Z', sent_at: '2026-10-20T00:00:00Z' }]);
    const b = (await loadAdvanceBoard(db.client(), 'tour-1', Date.parse('2026-10-22T00:00:00Z')))!;
    expect(b.columns.map((c) => c.label)).toEqual(['Schedule', 'Production', 'Settlement']);
    expect(b.rows.map((r) => r.kind)).toEqual(['show', 'show', 'gap', 'show']);
    const gap = b.rows[2] as { label: string; from: string; to: string };
    expect(gap).toMatchObject({ from: '2026-10-04', to: '2026-10-05', label: 'Travel, Day off' });
    const r1 = b.rows[0] as import('@/server/advance/board').BoardShowRow;
    expect(r1.cells.schedule).toMatchObject({ state: 'done' });
    expect(r1.cells.production).toMatchObject({ state: 'asked' });
    expect(r1.cells.settlement).toMatchObject({ state: 'none' });
    expect(r1.request.label).toBe('Sent 2 days ago');
    expect(b.counts).toMatchObject({ shows: 3, waiting: 1, notSent: 2 });
    expect((b.rows[1] as typeof r1).started).toBe(false); // nothing written for a day you only looked at
  });

  it('show: linked hotel / travel / deal, read-only', async () => {
    db.seed('hotels', [{ id: 'h1', show_id: 'r1', name: 'Malmaison', check_in_at: '2026-10-02', check_out_at: '2026-10-03', rooms: [{ id: 'a' }, { id: 'b' }] }]);
    db.seed('flights', [{ id: 'f1', tour_id: 'tour-1', airline: 'BA', flight_number: '1386', origin_airport: 'LHR', destination_airport: 'MAN', depart_at: '2026-10-02T08:00:00Z' }]);
    db.seed('deal_memos', [{ id: 'd1', show_id: 'r1', title: 'Manchester deal', status: 'signed' }]);
    const s = (await loadAdvanceShow(db.client(), 'tour-1', 'r1'))!;
    expect(s.instanceId).toBeNull();
    expect(s.template).toEqual({ id: 'lt-show', name: 'Show day' });
    expect(s.sections.map((x) => [x.label, x.tm_only])).toEqual([['Schedule', false], ['Production', false], ['Settlement', true]]);
    expect(s.linked.flights[0].label).toBe('BA 1386 · LHR → MAN');
    expect(s.linked.deal).toEqual({ title: 'Manchester deal', status: 'signed' });
    expect(s.tour.artistName).toBe('Charlotte Sands');
  });
});

describe('venue review', () => {
  it('accept merges through the one write and marks the answer as the venue’s', async () => {
    await answers.POST(json({ changes: { 'tpl-sched': { doors: '19:00', curfew: '23:00' } } }), p('r1'));
    const inst = db.t('advance_instances').find((i) => i.routing_id === 'r1')!;
    db.seed('profiles', [{ id: 'user-1', workspace_id: 'ws-1' }]);
    db.seed('intake_pending_answers', [
      { id: 'pa1', workspace_id: 'ws-1', advance_instance_id: inst.id, section_id: 'tpl-sched', field_id: 'doors', value: '19:30', status: 'pending' },
      { id: 'pa2', workspace_id: 'ws-1', advance_instance_id: inst.id, section_id: 'tpl-sched', field_id: 'curfew', value: '', status: 'pending' },
      { id: 'pa3', workspace_id: 'ws-1', advance_instance_id: inst.id, section_id: 'tpl-prod', field_id: 'power', value: '3ph 63A', status: 'pending' },
    ]);
    const r = await pendingRoute.POST(json({ advance_instance_id: inst.id, accept: ['pa1', 'pa2'], reject: ['pa3'] }));
    expect(r!.status).toBe(200);
    expect(inst.data).toEqual({ 'tpl-sched': { doors: '19:30', curfew: '23:00' } });
    const src = inst.field_sources as Record<string, { kind: string }>;
    expect(src['tpl-sched:doors'].kind).toBe('venue');
    expect(src['tpl-sched:curfew']).toBeUndefined();
    expect(db.t('intake_pending_answers').map((x) => [x.id, x.status])).toEqual([['pa1', 'accepted'], ['pa2', 'accepted'], ['pa3', 'rejected']]);
  });

  it('a failed write leaves the venue answers pending', async () => {
    await answers.POST(json({ changes: { 'tpl-sched': { doors: '19:00' } } }), p('r1'));
    const inst = db.t('advance_instances').find((i) => i.routing_id === 'r1')!;
    db.seed('profiles', [{ id: 'user-1', workspace_id: 'ws-1' }]);
    db.seed('intake_pending_answers', [{ id: 'pa1', workspace_id: 'ws-1', advance_instance_id: inst.id, section_id: 'tpl-sched', field_id: 'doors', value: '19:30', status: 'pending' }]);
    const failing = new FakeDb({ rpc: { advance_merge_answers: () => ({ data: null, error: { message: 'boom' } }) } });
    for (const t of ['profiles', 'advance_instances', 'advance_form_configs', 'advance_templates', 'intake_pending_answers']) failing.seed(t, db.t(t));
    db = failing;
    const r = await pendingRoute.POST(json({ advance_instance_id: inst.id, accept: ['pa1'] }));
    expect(r!.status).toBe(500);
    expect(db.t('intake_pending_answers')[0].status).toBe('pending');
  });
});
