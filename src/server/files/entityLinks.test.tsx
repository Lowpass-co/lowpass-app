import { beforeEach, describe, expect, it } from 'vitest';
import { FakeDb } from '@/test-utils/fakeSupabase';
import { LinkError, addLink, linkTargets, linkedFiles, linksOfFile, removeLink, showVenue } from './entityLinks';

const WS = 'ws-1';
const VENUE = 'cv-brixton';

const file = (id: string, extra: Record<string, unknown> = {}) => ({
  id, workspace_id: WS, file_name: `${id}.pdf`, file_type: 'application/pdf', file_size: 10,
  storage_provider: 'tour-files', provider_file_id: `${WS}/tour/t1/${id}.pdf`,
  linked_to_type: 'tour', linked_to_id: 't1', metadata: {}, created_at: '2026-10-01T00:00:00Z', ...extra,
});

let db: FakeDb;
beforeEach(() => {
  db = new FakeDb();
  db.seed('tours', [
    { id: 't1', workspace_id: WS, name: 'Satellite ’26' },
    { id: 't0', workspace_id: WS, name: 'Spring ’25' },
    { id: 'tx', workspace_id: 'ws-2', name: 'Theirs' },
  ]);
  db.seed('canonical_venues', [{ id: VENUE, name: 'O2 Academy Brixton', city: 'London', country: 'GB', address: null, capacity: null }]);
  db.seed('routing', [
    { id: 'show-1', tour_id: 't1', date: '2026-11-20', day_type: 'show', city: 'London', canonical_venue_id: VENUE, venue_name: 'Brixton (typed)', venue_frozen_at: null },
    { id: 'show-2', tour_id: 't1', date: '2026-11-21', day_type: 'show', city: 'Leeds', canonical_venue_id: null, venue_name: 'Leeds Beckett', venue_frozen_at: null },
    { id: 'off-1', tour_id: 't1', date: '2026-11-22', day_type: 'off', city: null, canonical_venue_id: null },
    { id: 'old-show', tour_id: 't0', date: '2025-04-02', day_type: 'show', city: 'London', canonical_venue_id: VENUE },
    { id: 'their-show', tour_id: 'tx', date: '2026-11-20', day_type: 'show', city: 'London', canonical_venue_id: VENUE },
  ]);
  db.seed('persons', [{ id: 'p-sam', workspace_id: WS, full_name: 'Sam Jones', preferred_name: 'Sam' }, { id: 'p-x', workspace_id: 'ws-2', full_name: 'Other', preferred_name: null }]);
  db.seed('tour_personnel', [{ id: 'tp1', tour_id: 't1', person_id: 'p-sam', workspace_id: WS }]);
  db.seed('file_references', [
    file('deal'),
    file('old-pack', { linked_to_id: 't0', created_at: '2025-03-01T00:00:00Z' }),
    file('on-show', { linked_to_type: 'routing', linked_to_id: 'show-1', created_at: '2026-11-01T00:00:00Z' }),
    file('passport'),
    file('their-file', { workspace_id: 'ws-2', linked_to_id: 'tx' }),
  ]);
});

const add = (fileId: string, type: 'show' | 'venue' | 'person', entityId: string, ws = WS) =>
  addLink(db.client(), { workspaceId: ws, userId: 'u1', fileId, type, entityId });
const rejects = async (p: Promise<unknown>, status: number) => {
  const e = await p.then(() => null, (x) => x);
  expect(e).toBeInstanceOf(LinkError);
  expect((e as LinkError).status).toBe(status);
};

describe('linking', () => {
  it('a deal memo linked to a show appears on that show, and only there', async () => {
    await add('deal', 'show', 'show-1');
    const here = await linkedFiles(db.client(), { workspaceId: WS, type: 'show', id: 'show-1' });
    expect(here.map((f) => [f.id, f.via, f.tourName])).toContainEqual(['deal', 'show', 'Satellite ’26']);
    const there = await linkedFiles(db.client(), { workspaceId: WS, type: 'show', id: 'show-2' });
    expect(there).toEqual([]);
  });

  it('a venue file appears on every one of YOUR shows at that venue, labelled with its tour', async () => {
    await add('old-pack', 'venue', VENUE);
    const now = await linkedFiles(db.client(), { workspaceId: WS, type: 'show', id: 'show-1' });
    expect(now.find((f) => f.id === 'old-pack')).toMatchObject({ via: 'venue', tourName: 'Spring ’25' });
    const venuePage = await linkedFiles(db.client(), { workspaceId: WS, type: 'venue', id: VENUE });
    expect(venuePage.map((f) => f.id)).toEqual(['old-pack']);
  });

  it('another workspace at the same venue never sees your files, and you never see theirs', async () => {
    await add('old-pack', 'venue', VENUE);
    db.seed('file_entity_links', [{ id: 'theirs', workspace_id: 'ws-2', file_id: 'their-file', entity_type: 'venue', entity_id: VENUE }]);
    const mine = await linkedFiles(db.client(), { workspaceId: WS, type: 'venue', id: VENUE });
    expect(mine.map((f) => f.id)).toEqual(['old-pack']);
    const theirs = await linkedFiles(db.client(), { workspaceId: 'ws-2', type: 'venue', id: VENUE });
    expect(theirs.map((f) => f.id)).toEqual(['their-file']);
    await rejects(linkedFiles(db.client(), { workspaceId: 'ws-2', type: 'show', id: 'show-1' }), 404);
  });

  it('a link row from another workspace is ignored even if it points at your file', async () => {
    db.seed('file_entity_links', [{ id: 'foreign', workspace_id: 'ws-2', file_id: 'deal', entity_type: 'venue', entity_id: VENUE }]);
    expect(await linkedFiles(db.client(), { workspaceId: WS, type: 'venue', id: VENUE })).toEqual([]);
  });

  it('files uploaded onto the show itself are listed too, and can’t be “unlinked”', async () => {
    const files = await linkedFiles(db.client(), { workspaceId: WS, type: 'show', id: 'show-1' });
    expect(files).toEqual([expect.objectContaining({ id: 'on-show', via: 'home', linkId: null, tourName: 'Satellite ’26' })]);
  });

  it('one row per file, with the most specific reason', async () => {
    await add('deal', 'venue', VENUE);
    await add('deal', 'show', 'show-1');
    const files = await linkedFiles(db.client(), { workspaceId: WS, type: 'show', id: 'show-1' });
    expect(files.filter((f) => f.id === 'deal')).toEqual([expect.objectContaining({ via: 'show' })]);
  });

  it('people: linked once, seen on their panel', async () => {
    await add('passport', 'person', 'p-sam');
    expect((await linkedFiles(db.client(), { workspaceId: WS, type: 'person', id: 'p-sam' })).map((f) => f.id)).toEqual(['passport']);
  });

  it('linking twice is one link', async () => {
    const a = await add('deal', 'show', 'show-1');
    const b = await add('deal', 'show', 'show-1');
    expect(a.id).toBe(b.id);
    expect(db.t('file_entity_links')).toHaveLength(1);
  });

  it('refuses things outside your workspace: their file, their show, their person, a venue you never played', async () => {
    await rejects(add('their-file', 'show', 'show-1'), 404);
    await rejects(add('deal', 'show', 'their-show'), 404);
    await rejects(add('deal', 'person', 'p-x'), 404);
    await rejects(add('deal', 'venue', 'cv-nowhere'), 404);
    // ws-2 can't hang their file on your show either.
    await rejects(add('their-file', 'show', 'show-1', 'ws-2'), 404);
    expect(db.t('file_entity_links')).toHaveLength(0);
  });

  it('unlinking removes the link, never the file; only your own links', async () => {
    const { id } = await add('deal', 'show', 'show-1');
    await rejects(removeLink(db.client(), { workspaceId: 'ws-2', id }), 404);
    await removeLink(db.client(), { workspaceId: WS, id });
    expect(db.t('file_entity_links')).toHaveLength(0);
    expect(db.t('file_references').some((f) => f.id === 'deal')).toBe(true);
    await rejects(removeLink(db.client(), { workspaceId: WS, id }), 404);
  });
});

describe('targets', () => {
  it('a tour’s shows (not days off), the venues they’re at, and its crew — named via resolveVenue', async () => {
    const t = await linkTargets(db.client(), { workspaceId: WS, tourId: 't1' });
    expect(t.map((x) => [x.type, x.id, x.label])).toEqual([
      ['show', 'show-1', '2026-11-20 · O2 Academy Brixton'],
      ['show', 'show-2', '2026-11-21 · Leeds Beckett'],
      ['venue', VENUE, 'O2 Academy Brixton'],
      ['person', 'p-sam', 'Sam'],
    ]);
    await rejects(linkTargets(db.client(), { workspaceId: WS, tourId: 'tx' }), 404);
  });

  it('a show’s venue, for “every show at …”', async () => {
    expect(await showVenue(db.client(), { workspaceId: WS, showId: 'show-1' })).toEqual({ id: VENUE, name: 'O2 Academy Brixton' });
    expect(await showVenue(db.client(), { workspaceId: WS, showId: 'show-2' })).toBeNull();
    expect(await showVenue(db.client(), { workspaceId: 'ws-2', showId: 'show-1' })).toBeNull();
  });

  it('a file’s current links, for the dialog', async () => {
    await add('deal', 'show', 'show-1');
    await add('deal', 'person', 'p-sam');
    const l = await linksOfFile(db.client(), { workspaceId: WS, fileId: 'deal' });
    expect(l.map((x) => [x.type, x.entityId]).sort()).toEqual([['person', 'p-sam'], ['show', 'show-1']]);
  });
});
