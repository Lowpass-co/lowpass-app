import { beforeEach, describe, expect, it } from 'vitest';
import { FakeDb } from '@/test-utils/fakeSupabase';
import { UploadError, completeGrant, issueGrant, sweepStale, type GrantStorage } from './grants';
import { completeFileUpload, startFileUpload } from '@/server/files/ownerUpload';

const WS = 'ws-1';
const NOW = new Date('2026-11-08T12:00:00Z');

class Objects implements GrantStorage {
  objects = new Map<string, { size: number; contentType: string | null }>();
  removed: string[] = [];
  failSign = false;
  async signUpload(_b: string, path: string) { return this.failSign ? null : `tok:${path}`; }
  async info(_b: string, path: string) { return this.objects.get(path) ?? null; }
  async remove(_b: string, paths: string[]) { for (const p of paths) { this.removed.push(p); this.objects.delete(p); } }
}

const rejects = async (p: Promise<unknown>, status: number, code: string) => {
  const e = await p.then(() => null, (x) => x);
  expect(e).toBeInstanceOf(UploadError);
  expect([(e as UploadError).status, (e as UploadError).code]).toEqual([status, code]);
};

let db: FakeDb;
let objs: Objects;
beforeEach(() => {
  db = new FakeDb();
  db.seed('tours', [{ id: 't1', workspace_id: WS }, { id: 'tx', workspace_id: 'ws-2' }]);
  db.seed('artists', [{ id: 'a1', workspace_id: WS }]);
  objs = new Objects();
});

describe('grants', () => {
  it('a grant that can’t be signed is not left behind', async () => {
    objs.failSign = true;
    await rejects(issueGrant(db.client(), objs, { workspaceId: WS, bucket: 'tour-files', path: 'p1', declaredSize: 5, now: NOW }), 500, 'error');
    expect(db.t('storage_upload_grants')).toHaveLength(0);
  });

  it('the sweep removes only unfinished uploads older than 24 hours', async () => {
    db.seed('storage_upload_grants', [
      { id: 'old-open', workspace_id: WS, bucket: 'tour-files', path: 'old-open', declared_size: 1, created_at: '2026-11-07T11:00:00Z', completed_at: null },
      { id: 'old-done', workspace_id: WS, bucket: 'tour-files', path: 'old-done', declared_size: 1, created_at: '2026-11-07T11:00:00Z', completed_at: '2026-11-07T11:01:00Z' },
      { id: 'new-open', workspace_id: WS, bucket: 'tour-files', path: 'new-open', declared_size: 1, created_at: '2026-11-08T11:00:00Z', completed_at: null },
    ]);
    expect(await sweepStale(db.client(), objs, NOW)).toBe(1);
    expect(objs.removed).toEqual(['old-open']);
    expect(db.t('storage_upload_grants').map((g) => g.id)).toEqual(['old-done', 'new-open']);
    expect(await sweepStale(db.client(), objs, NOW)).toBe(0);
  });

  it('of two finishes for one upload, only one claims it', async () => {
    await issueGrant(db.client(), objs, { workspaceId: WS, bucket: 'tour-files', path: 'p1', declaredSize: 5, now: NOW });
    objs.objects.set('p1', { size: 5, contentType: 'application/pdf' });
    const [a, b] = await Promise.all([
      completeGrant(db.client(), objs, { workspaceId: WS, path: 'p1', now: NOW }),
      completeGrant(db.client(), objs, { workspaceId: WS, path: 'p1', now: NOW }),
    ]);
    expect([a.alreadyDone, b.alreadyDone].sort()).toEqual([false, true]);
  });

  it('a grant from another workspace can’t be finished here', async () => {
    await issueGrant(db.client(), objs, { workspaceId: 'ws-2', bucket: 'tour-files', path: 'p2', declaredSize: 5, now: NOW });
    objs.objects.set('p2', { size: 5, contentType: null });
    await rejects(completeGrant(db.client(), objs, { workspaceId: WS, path: 'p2' }), 404, 'not_found');
  });
});

describe('Files uploads (owner)', () => {
  const start = (extra: Record<string, unknown> = {}) =>
    startFileUpload(db.client(), db.client(), objs, { workspaceId: WS, userId: 'u1', scope: 'tour', scopeId: 't1', name: 'Rider.pdf', size: 1000, now: NOW, ...extra });
  const finish = (path: string, extra: Record<string, unknown> = {}) =>
    completeFileUpload(db.client(), db.client(), objs, { workspaceId: WS, scope: 'tour', scopeId: 't1', path, name: 'Rider.pdf', now: NOW, ...extra });

  it('only into a tour or artist in your own workspace', async () => {
    await rejects(start({ scopeId: 'tx' }), 404, 'not_found');
    await rejects(start({ scopeId: 'nope' }), 404, 'not_found');
    const g = await start({ scope: 'artist', scopeId: 'a1' });
    expect(g.path.startsWith(`${WS}/artist/a1/`)).toBe(true);
  });

  it('100 MB is fine, a byte more is refused before any upload', async () => {
    await expect(start({ size: 100 * 1024 * 1024 })).resolves.toMatchObject({ bucket: 'tour-files' });
    await rejects(start({ size: 100 * 1024 * 1024 + 1 }), 413, 'too_large');
    await rejects(start({ size: 0 }), 400, 'empty');
  });

  it('records the file once, sized by storage, in the folder that was open', async () => {
    const g = await start();
    objs.objects.set(g.path, { size: 52_000_000, contentType: 'application/pdf' });
    const r = await finish(g.path, { folder: ' Venue packs / Brixton ' });
    expect(r).toMatchObject({ file_name: 'Rider.pdf', file_size: 52_000_000, file_type: 'application/pdf', provider_file_id: g.path, linked_to_type: 'tour' });
    expect(db.t('file_references')[0].metadata).toEqual({ folder: 'Venue packs/Brixton' });
    const again = await finish(g.path);
    expect(again.id).toBe(r.id);
    expect(db.t('file_references')).toHaveLength(1);
  });

  it('refuses paths it didn’t grant, from another scope, or that never arrived', async () => {
    const g = await start();
    await rejects(finish(g.path), 409, 'not_uploaded');
    await rejects(finish(`${WS}/tour/t1/made-up.pdf`), 404, 'not_found');
    await rejects(finish(g.path, { scopeId: 'tx' }), 400, 'bad_request');
    await rejects(finish('ws-2/tour/t1/x.pdf'), 400, 'bad_request');
  });

  it('a failed insert removes the object so nothing invisible is left', async () => {
    const g = await start();
    objs.objects.set(g.path, { size: 10, contentType: null });
    db.failWrites.set('file_references', { message: 'nope', code: 'XX000' });
    await rejects(finish(g.path), 500, 'error');
    expect(objs.removed).toEqual([g.path]);
  });
});
