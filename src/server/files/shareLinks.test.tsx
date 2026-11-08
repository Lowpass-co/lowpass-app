import { beforeEach, describe, expect, it } from 'vitest';
import { FakeDb } from '@/test-utils/fakeSupabase';
import { hashPassword } from '@/lib/rider-packs/web-links';
import { SHARE_UPLOADS_PER_HOUR } from '@/lib/files/shareLinks';
import type { GrantStorage } from '@/server/uploads/grants';
import {
  ShareError,
  createLink,
  downloadUrl,
  fileInLink,
  linkContents,
  listLinks,
  openLink,
  previousVersionUrl,
  repointFolderLinks,
  revokeLink,
  prepareLinkUpload,
  completeLinkUpload,
  type ShareStorage,
} from './shareLinks';

const WS = 'ws-1';
const T1 = 'tour-1';
const NOW = new Date('2026-11-08T12:00:00Z');
const TOKEN = 'tok_AAAAAAAAAAAAAAAAAAAAAAAA';

class Store implements ShareStorage {
  async signedDownloadUrl(path: string, _s: number, name: string) { return `signed://${path}?download=${name}`; }
}

const file = (id: string, extra: Record<string, unknown> = {}) => ({
  id, workspace_id: WS, file_name: `${id}.pdf`, file_type: 'application/pdf', file_size: 10,
  storage_provider: 'tour-files', provider_file_id: `${WS}/tour/${T1}/${id}.pdf`,
  linked_to_type: 'tour', linked_to_id: T1, metadata: {}, created_at: '2026-10-01T00:00:00Z', ...extra,
});

function world() {
  const db = new FakeDb();
  db.seed('tours', [{ id: T1, workspace_id: WS, name: 'Satellite Tour', artist_id: 'ar-1' }, { id: 'tour-2', workspace_id: WS, name: 'Other' }, { id: 'tour-x', workspace_id: 'ws-2', name: 'Theirs' }]);
  db.seed('artists', [{ id: 'ar-1', workspace_id: WS, name: 'Charlotte Sands' }]);
  db.seed('routing', [{ id: 'show-1', tour_id: T1 }, { id: 'show-9', tour_id: 'tour-2' }]);
  db.seed('file_references', [
    file('top', { metadata: { folder: 'Contracts' } }),
    file('deep', { metadata: { folder: 'Contracts/2026' } }),
    file('beside', { metadata: { folder: 'Contracts 2' } }),
    file('root'),
    file('other-tour', { linked_to_id: 'tour-2', metadata: { folder: 'Contracts' } }),
    file('show-file', { linked_to_type: 'routing', linked_to_id: 'show-1' }),
    file('other-show', { linked_to_type: 'routing', linked_to_id: 'show-9' }),
    file('drive', { storage_provider: 'google_drive', metadata: { folder: 'Contracts' } }),
    file('theirs', { workspace_id: 'ws-2', linked_to_id: 'tour-x' }),
  ]);
  return db;
}

const link = (extra: Record<string, unknown> = {}) => ({
  id: 'l-1', workspace_id: WS, tour_id: T1, target_kind: 'folder', file_id: null, folder_path: 'Contracts',
  access: 'view', token: TOKEN, password_hash: null, expires_at: null, label: null,
  created_at: '2026-11-01T00:00:00Z', revoked_at: null, last_viewed_at: null, ...extra,
});

async function seedLink(db: FakeDb, extra: Record<string, unknown> = {}) {
  db.seed('file_share_links', [link(extra)]);
  return openLink(db.client(), (extra.token as string) ?? TOKEN, (extra.__pw as string) ?? null, NOW);
}

const rejects = async (p: Promise<unknown>, status: number, code: string) => {
  const e = await p.then(() => null, (x) => x);
  expect(e).toBeInstanceOf(ShareError);
  expect([(e as ShareError).status, (e as ShareError).code]).toEqual([status, code]);
};

let db: FakeDb;
let store: Store;
beforeEach(() => { db = world(); store = new Store(); });

describe('openLink', () => {
  it('refuses junk, unknown, revoked and expired tokens with the right reason', async () => {
    await rejects(openLink(db.client(), 'short', null, NOW), 404, 'not_found');
    await rejects(openLink(db.client(), TOKEN, null, NOW), 404, 'not_found');
    db.seed('file_share_links', [link({ revoked_at: '2026-11-02T00:00:00Z' }), link({ id: 'l-2', token: 'tok_BBBBBBBBBBBBBBBBBBBBBBBB', expires_at: '2026-11-08T11:00:00Z' })]);
    await rejects(openLink(db.client(), TOKEN, null, NOW), 410, 'revoked');
    await rejects(openLink(db.client(), 'tok_BBBBBBBBBBBBBBBBBBBBBBBB', null, NOW), 410, 'expired');
  });

  it('asks for the password, refuses a wrong one, accepts the right one', async () => {
    db.seed('file_share_links', [link({ password_hash: await hashPassword('backstage') })]);
    await rejects(openLink(db.client(), TOKEN, null, NOW), 401, 'password_required');
    await rejects(openLink(db.client(), TOKEN, 'frontstage', NOW), 401, 'invalid_password');
    expect((await openLink(db.client(), TOKEN, 'backstage', NOW)).id).toBe('l-1');
  });
});

describe('scope — the only lock between a token and a file', () => {
  it('a folder link reaches its folder and subfolders on this tour only', async () => {
    const l = await seedLink(db);
    const ok = async (id: string) => !!(await fileInLink(db.client(), l, id));
    expect(await ok('top')).toBe(true);
    expect(await ok('deep')).toBe(true);
    expect(await ok('beside')).toBe(false);
    expect(await ok('root')).toBe(false);
    expect(await ok('other-tour')).toBe(false);
    expect(await ok('show-file')).toBe(false);
    expect(await ok('theirs')).toBe(false);
    expect(await ok('nope')).toBe(false);
  });

  it('a file link reaches that one file — on the tour or one of its shows', async () => {
    const l = await seedLink(db, { target_kind: 'file', file_id: 'show-file', folder_path: null });
    expect(await fileInLink(db.client(), l, 'show-file')).not.toBeNull();
    expect(await fileInLink(db.client(), l, 'top')).toBeNull();
    const elsewhere = { ...l, file_id: 'other-show' };
    expect(await fileInLink(db.client(), elsewhere, 'other-show')).toBeNull();
  });

  it('lists the folder relative to itself, with every subfolder', async () => {
    const l = await seedLink(db);
    const c = await linkContents(db.client(), l, NOW);
    expect(c).toMatchObject({ kind: 'folder', title: 'Contracts', tourName: 'Satellite Tour', artistName: 'Charlotte Sands', folders: ['2026'], gone: false });
    expect(c.files.map((f) => [f.id, f.folder, f.available])).toEqual([['deep', '2026', true], ['drive', '', false], ['top', '', true]]);
    expect(db.t('file_share_links')[0].last_viewed_at).toBe(NOW.toISOString());
  });

  it('a file link whose file was deleted says so', async () => {
    const l = await seedLink(db, { target_kind: 'file', file_id: 'gone-file', folder_path: null });
    expect(await linkContents(db.client(), l, NOW)).toMatchObject({ gone: true, files: [] });
  });
});

describe('download', () => {
  it('signs a short download URL and logs it', async () => {
    const l = await seedLink(db);
    expect(await downloadUrl(db.client(), store, l, 'deep', 'Sam')).toBe(`signed://${WS}/tour/${T1}/deep.pdf?download=deep.pdf`);
    expect(db.t('file_share_events')).toMatchObject([{ link_id: 'l-1', action: 'download', file_id: 'deep', actor_name: 'Sam' }]);
  });

  it('refuses files outside the link and files not stored in Lowpass', async () => {
    const l = await seedLink(db);
    await rejects(downloadUrl(db.client(), store, l, 'root', null), 404, 'not_found');
    await rejects(downloadUrl(db.client(), store, l, 'drive', null), 409, 'unavailable');
    expect(db.t('file_share_events')).toHaveLength(0);
  });
});

/** Storage as the browser leaves it: objects appear when "uploaded". */
class Objects implements GrantStorage {
  objects = new Map<string, { size: number; contentType: string | null }>();
  signed: string[] = [];
  removed: string[] = [];
  async signUpload(_b: string, path: string) { this.signed.push(path); return `signed-${path}`; }
  async info(_b: string, path: string) { return this.objects.get(path) ?? null; }
  async remove(_b: string, paths: string[]) { for (const p of paths) { this.removed.push(p); this.objects.delete(p); } }
  /** What the browser does between prepare and complete. */
  put(path: string, size = 3, contentType: string | null = 'application/pdf') { this.objects.set(path, { size, contentType }); }
}

describe('upload through an edit link (straight to storage)', () => {
  let objs: Objects;
  beforeEach(() => { objs = new Objects(); });
  type L = Awaited<ReturnType<typeof seedLink>>;
  const prep = (l: L, extra: Record<string, unknown> = {}) =>
    prepareLinkUpload(db.client(), objs, l, { fileName: 'Settlement.pdf', size: 3, actor: 'Sam', ...extra }, NOW);
  const done = (l: L, path: string, extra: Record<string, unknown> = {}) =>
    completeLinkUpload(db.client(), objs, l, { path, fileName: 'Settlement.pdf', actor: 'Sam', ...extra }, NOW);
  async function upload(l: L, extra: Record<string, unknown> = {}, size = 3) {
    const g = await prep(l, { ...extra, size });
    objs.put(g.path, size);
    return { g, r: await done(l, g.path, extra) };
  }

  it('view links get no upload at all', async () => {
    const l = await seedLink(db);
    await rejects(prep(l), 403, 'view_only');
    await rejects(prep(l, { replaceFileId: 'top' }), 403, 'view_only');
    expect(objs.signed).toEqual([]);
  });

  it('needs a name, a non-empty file, and at most 100 MB — before any upload URL exists', async () => {
    const l = await seedLink(db, { access: 'edit' });
    await rejects(prep(l, { actor: '  ' }), 400, 'name_required');
    await rejects(prep(l, { size: 0 }), 400, 'empty');
    await rejects(prep(l, { size: 'big' }), 400, 'empty');
    await rejects(prep(l, { size: 100 * 1024 * 1024 + 1 }), 413, 'too_large');
    expect(objs.signed).toEqual([]);
    await expect(prep(l, { size: 100 * 1024 * 1024 })).resolves.toMatchObject({ bucket: 'tour-files' });
  });

  it('the server picks the path, inside this workspace and tour, and records the grant', async () => {
    const l = await seedLink(db, { access: 'edit' });
    const g = await prep(l, { fileName: '../../etc/passwd' });
    expect(g.path.startsWith(`${WS}/tour/${T1}/`)).toBe(true);
    expect(g.path.slice(`${WS}/tour/${T1}/`.length)).not.toContain('/');
    expect(db.t('storage_upload_grants')).toMatchObject([{ path: g.path, link_id: 'l-1', declared_size: 3, created_at: NOW.toISOString() }]);
    expect(db.t('storage_upload_grants')[0].completed_at ?? null).toBeNull();
  });

  it('lands in the chosen subfolder, tagged with who sent it, sized by storage not the browser', async () => {
    const l = await seedLink(db, { access: 'edit' });
    const g = await prep(l, { folder: '2026/Signed', size: 3 });
    objs.put(g.path, 5_000, 'application/pdf'); // the browser said 3 bytes; storage says 5,000
    const r = await done(l, g.path, { folder: '2026/Signed' });
    expect(r).toMatchObject({ action: 'upload', file: { name: 'Settlement.pdf', folder: '2026/Signed', size: 5_000, available: true } });
    const row = db.t('file_references').find((f) => f.provider_file_id === g.path)!;
    expect(row).toMatchObject({ workspace_id: WS, linked_to_type: 'tour', linked_to_id: T1, file_size: 5_000 });
    expect(row.metadata).toEqual({ folder: 'Contracts/2026/Signed', uploaded_via_link: { link_id: 'l-1', by: 'Sam' } });
    expect(db.t('file_share_events')).toMatchObject([{ action: 'upload', actor_name: 'Sam', file_name: 'Settlement.pdf', bytes: 5_000 }]);
    expect(db.t('storage_upload_grants')[0].completed_at).toBe(NOW.toISOString());
  });

  it('finishing twice makes one file, not two', async () => {
    const l = await seedLink(db, { access: 'edit' });
    const { g, r } = await upload(l);
    const again = await done(l, g.path);
    expect(again.file.id).toBe(r.file.id);
    expect(db.t('file_references').filter((f) => f.provider_file_id === g.path)).toHaveLength(1);
    expect(db.t('file_share_events')).toHaveLength(1);
  });

  it('refuses a finish for an upload that never arrived, or a path it never granted', async () => {
    const l = await seedLink(db, { access: 'edit' });
    const g = await prep(l);
    await rejects(done(l, g.path), 409, 'not_uploaded');
    await rejects(done(l, `${WS}/tour/${T1}/made-up.pdf`), 404, 'not_found');
    await rejects(done(l, `${WS}/tour/tour-2/x.pdf`), 400, 'bad_request');
    await rejects(done(l, `${WS}/tour/${T1}/../../x.pdf`), 400, 'bad_request');
    expect(db.t('file_references').filter((f) => String(f.provider_file_id).includes('made-up'))).toHaveLength(0);
  });

  it('a grant issued to one link can’t be finished through another', async () => {
    const l = await seedLink(db, { access: 'edit' });
    db.seed('file_share_links', [link({ id: 'l-2', token: 'tok_CCCCCCCCCCCCCCCCCCCCCCCC', access: 'edit' })]);
    const other = await openLink(db.client(), 'tok_CCCCCCCCCCCCCCCCCCCCCCCC', null, NOW);
    const g = await prep(l);
    objs.put(g.path);
    await rejects(done(other, g.path), 404, 'not_found');
  });

  it('an oversized object is deleted at finish even if the browser lied about its size', async () => {
    const l = await seedLink(db, { access: 'edit' });
    const g = await prep(l, { size: 10 });
    objs.put(g.path, 100 * 1024 * 1024 + 1);
    await rejects(done(l, g.path), 413, 'too_large');
    expect(objs.removed).toEqual([g.path]);
    expect(db.t('storage_upload_grants')).toHaveLength(0);
  });

  it('a file link only takes a new version, never a new file', async () => {
    const l = await seedLink(db, { access: 'edit', target_kind: 'file', file_id: 'top', folder_path: null });
    await rejects(prep(l), 400, 'bad_request');
  });

  it('a new version keeps the file id and folder, and keeps the old one on record', async () => {
    const l = await seedLink(db, { access: 'edit' });
    const { g, r } = await upload(l, { replaceFileId: 'deep', fileName: 'Deal v2.pdf' });
    expect(r).toMatchObject({ action: 'new_version', file: { id: 'deep', folder: '2026', versions: 1 } });
    const row = db.t('file_references').find((f) => f.id === 'deep')!;
    expect(row.file_name).toBe('deep.pdf');
    expect(row.provider_file_id).toBe(g.path);
    expect((row.metadata as { folder: string }).folder).toBe('Contracts/2026');
    expect((row.metadata as { versions: { path: string; replaced_by: string }[] }).versions[0]).toMatchObject({ path: `${WS}/tour/${T1}/deep.pdf`, replaced_by: 'Sam' });
    expect(db.t('file_share_events')).toMatchObject([{ action: 'new_version', previous_path: `${WS}/tour/${T1}/deep.pdf`, previous_name: 'deep.pdf' }]);
    expect(objs.removed).toEqual([]);
  });

  it('if someone replaced it first, the second version is refused and its object removed', async () => {
    const l = await seedLink(db, { access: 'edit' });
    const g = await prep(l, { replaceFileId: 'deep' });
    objs.put(g.path);
    db.beforeWrite.push((op, table) => {
      if (op === 'update' && table === 'file_references') {
        const r = db.t('file_references').find((f) => f.id === 'deep')!;
        r.provider_file_id = 'someone-else.pdf';
      }
    });
    await rejects(done(l, g.path, { replaceFileId: 'deep' }), 409, 'conflict');
    expect(objs.removed).toEqual([g.path]);
    expect(db.t('file_share_events')).toHaveLength(0);
  });

  it('a failed database write never leaves an orphaned object', async () => {
    const l = await seedLink(db, { access: 'edit' });
    const g = await prep(l);
    objs.put(g.path);
    db.failWrites.set('file_references', { message: 'nope', code: 'XX000' });
    await rejects(done(l, g.path), 500, 'error');
    expect(objs.removed).toEqual([g.path]);
  });

  it('the hourly cap counts upload URLs ISSUED — never finishing doesn’t get round it', async () => {
    const l = await seedLink(db, { access: 'edit' });
    for (let i = 0; i < SHARE_UPLOADS_PER_HOUR; i++) await prep(l); // asked, never finished
    await rejects(prep(l), 429, 'rate_limited');
    db.t('storage_upload_grants').forEach((g) => { g.created_at = '2026-11-08T10:00:00Z'; });
    await expect(prep(l)).resolves.toMatchObject({ bucket: 'tour-files' });
  });

  it('a revoked edit link can do nothing', async () => {
    const l = await seedLink(db, { access: 'edit' });
    const g = await prep(l);
    objs.put(g.path);
    const off = { ...l, revoked_at: '2026-11-08T11:00:00Z' };
    await rejects(prep(off), 403, 'view_only');
    await rejects(done(off, g.path), 403, 'view_only');
    await rejects(downloadUrl(db.client(), store, off, 'top', null), 410, 'gone');
  });
});

describe('owner side', () => {
  const input = { tourId: T1, fileId: null, folder: 'Contracts', access: 'edit' as const, expiresAt: null, password: 'backstage', label: 'Promoter' };

  it('creates a link with a long random token and a hashed password', async () => {
    const l = await createLink(db.client(), { workspaceId: WS, userId: 'u1', input });
    expect(l).toMatchObject({ kind: 'folder', folder: 'Contracts', access: 'edit', hasPassword: true, label: 'Promoter' });
    expect(l.token).toMatch(/^[A-Za-z0-9_-]{32}$/);
    const row = db.t('file_share_links')[0];
    expect(String(row.password_hash)).toMatch(/^s1:/);
    expect(row.password_hash).not.toContain('backstage');
    expect(JSON.stringify(await listLinks(db.client(), { workspaceId: WS, tourId: T1 }))).not.toContain('s1:');
  });

  it('refuses another workspace’s tour, and a file that isn’t on the tour', async () => {
    await rejects(createLink(db.client(), { workspaceId: WS, userId: 'u1', input: { ...input, tourId: 'tour-x' } }), 404, 'not_found');
    await rejects(createLink(db.client(), { workspaceId: WS, userId: 'u1', input: { ...input, folder: null, fileId: 'other-tour' } }), 404, 'not_found');
    await expect(createLink(db.client(), { workspaceId: WS, userId: 'u1', input: { ...input, folder: null, fileId: 'show-file' } })).resolves.toMatchObject({ kind: 'file' });
  });

  it('revokes once; a revoked link stops opening', async () => {
    const l = await createLink(db.client(), { workspaceId: WS, userId: 'u1', input: { ...input, password: null } });
    await revokeLink(db.client(), { workspaceId: WS, id: l.id, now: NOW });
    await rejects(revokeLink(db.client(), { workspaceId: WS, id: l.id, now: NOW }), 404, 'not_found');
    await rejects(openLink(db.client(), l.token, null, NOW), 410, 'revoked');
    await rejects(revokeLink(db.client(), { workspaceId: 'ws-2', id: l.id }), 404, 'not_found');
  });

  it('a folder rename carries its links and its subfolders’ links', async () => {
    db.seed('file_share_links', [
      link({ id: 'a', token: 'tok_a', folder_path: 'Contracts' }),
      link({ id: 'b', token: 'tok_b', folder_path: 'Contracts/2026' }),
      link({ id: 'c', token: 'tok_c', folder_path: 'Contracts 2' }),
      link({ id: 'd', token: 'tok_d', tour_id: 'tour-2', folder_path: 'Contracts' }),
    ]);
    expect(await repointFolderLinks(db.client(), { workspaceId: WS, tourId: T1, from: 'Contracts', to: 'Deals' })).toBe(2);
    expect(db.t('file_share_links').map((l) => l.folder_path)).toEqual(['Deals', 'Deals/2026', 'Contracts 2', 'Contracts']);
  });

  it('lists activity, and the owner can get a replaced version back', async () => {
    const l = await seedLink(db, { access: 'edit' });
    const objs = new Objects();
    const g = await prepareLinkUpload(db.client(), objs, l, { fileName: 'v2.pdf', size: 1, actor: 'Sam', replaceFileId: 'top' }, NOW);
    objs.put(g.path, 1);
    await completeLinkUpload(db.client(), objs, l, { path: g.path, fileName: 'v2.pdf', actor: 'Sam', replaceFileId: 'top' }, NOW);
    const { links, events } = await listLinks(db.client(), { workspaceId: WS, tourId: T1, folder: 'Contracts' });
    expect(links.map((x) => x.id)).toEqual(['l-1']);
    expect(events).toMatchObject([{ action: 'new_version', actor: 'Sam', previousName: 'top.pdf', hasPrevious: true }]);
    expect(await previousVersionUrl(db.client(), store, { workspaceId: WS, eventId: events[0].id })).toBe(`signed://${WS}/tour/${T1}/top.pdf?download=top.pdf`);
    await rejects(previousVersionUrl(db.client(), store, { workspaceId: 'ws-2', eventId: events[0].id }), 404, 'not_found');
  });
});
