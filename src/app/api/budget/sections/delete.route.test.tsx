/* ============================================
   DELETE /api/budget/sections — the grid's right-click "Delete section" and
   Budget › Money's Sections card.

   Lines are never deleted: the FK moves them to Uncategorised. Refused when
   the section isn't yours (404), the budget is approved (409 VERSION_LOCKED),
   it holds automatic lines (409 DERIVED_LINES — reconcile files them there),
   or RLS lets you read it but not delete it (403; it used to say 204).
   ============================================ */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { FakeDb } from '@/test-utils/fakeSupabase';

let db: FakeDb;
let locked = false;

vi.mock('@/lib/supabase-server', () => ({ createServerSupabaseClient: async () => db.client() }));
vi.mock('@/lib/auth/workspace-check', () => ({ requireWrite: async () => ({ userId: 'user-1' }) }));
vi.mock('@/server/budget/versions', () => ({
  resolveLockState: async () => ({ locked, version: locked ? { id: 'v1' } : null }),
}));

const { DELETE } = await import('./route');

const WS = 'ws-1';
const del = (qs: string, body?: unknown) =>
  DELETE(new Request(`http://x/api/budget/sections${qs}`, { method: 'DELETE', body: body === undefined ? undefined : JSON.stringify(body) }));
const sectionIds = () => db.t('budget_sections').map((s) => s.id).sort();
const lineSection = (id: string) => db.t('budget_line_items').find((l) => l.id === id)?.section_id;

beforeEach(() => {
  locked = false;
  db = new FakeDb({ cascade: [{ child: 'budget_line_items', column: 'section_id', parent: 'budget_sections', onDelete: 'set null' }] });
  db.seed('profiles', [{ id: 'user-1', workspace_id: WS }]);
  db.seed('budget_sections', [
    { id: 'misc', tour_id: 't1', workspace_id: WS, name: 'Misc' },
    { id: 'empty', tour_id: 't1', workspace_id: WS, name: 'Empty' },
    { id: 'sal', tour_id: 't1', workspace_id: WS, name: 'Salaries' },
    { id: 'theirs', tour_id: 'tx', workspace_id: 'ws-2', name: 'Theirs' },
  ]);
  db.seed('budget_line_items', [
    { id: 'm1', tour_id: 't1', workspace_id: WS, section_id: 'misc', label: 'Gaffer tape' },
    { id: 'm2', tour_id: 't1', workspace_id: WS, section_id: 'misc', label: 'Batteries' },
    { id: 'pay', tour_id: 't1', workspace_id: WS, section_id: 'sal', label: 'Ben', source_entity_type: 'payroll' },
  ]);
});

describe('DELETE /api/budget/sections', () => {
  it('deletes the section; its lines move to Uncategorised, none deleted', async () => {
    const res = await del('?id=misc');
    expect(res.status).toBe(204);
    expect(sectionIds()).toEqual(['empty', 'sal', 'theirs']);
    expect(lineSection('m1')).toBeNull();
    expect(lineSection('m2')).toBeNull();
    expect(db.t('budget_line_items')).toHaveLength(3);
  });

  it('an empty section goes too (body form)', async () => {
    expect((await del('', { id: 'empty' })).status).toBe(204);
    expect(sectionIds()).not.toContain('empty');
  });

  it('a section holding automatic lines is refused, and names where they come from', async () => {
    const res = await del('?id=sal');
    expect(res.status).toBe(409);
    const j = await res.json();
    expect(j.code).toBe('DERIVED_LINES');
    expect(j.error).toMatch(/Payroll/);
    expect(sectionIds()).toContain('sal');
    expect(lineSection('pay')).toBe('sal');
  });

  it('an approved budget refuses', async () => {
    locked = true;
    const res = await del('?id=misc');
    expect(res.status).toBe(409);
    expect((await res.json()).code).toBe('VERSION_LOCKED');
    expect(sectionIds()).toContain('misc');
  });

  it('another workspace’s section → 404, untouched', async () => {
    expect((await del('?id=theirs')).status).toBe(404);
    expect(sectionIds()).toContain('theirs');
  });

  it('readable but not deletable (RLS) → 403, not a silent 204', async () => {
    // RLS filters the DELETE to zero rows while the read still sees it.
    const stash: Record<string, unknown>[] = [];
    db.beforeWrite.push((op, table) => {
      if (op === 'delete' && table === 'budget_sections') {
        const rows = db.t('budget_sections');
        stash.push(...rows);
        db.tables.set('budget_sections', []);
      }
    });
    const res = await del('?id=misc');
    expect(res.status).toBe(403);
    expect(stash.map((s) => s.id)).toContain('misc');
  });

  it('no id → 400', async () => {
    expect((await del('')).status).toBe(400);
  });
});
