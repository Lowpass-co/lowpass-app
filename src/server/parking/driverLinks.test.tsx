/* Driver links — short-lived, one map, nothing else; 3D opens capped. */

import { beforeEach, describe, expect, it } from 'vitest';
import { FakeDb } from '@/test-utils/fakeSupabase';
import { DriverLinkError, createDriverLink, driverMapPayload, hashToken, listDriverLinks, revokeDriverLink, touchLink, type SignStorage } from './driverLinks';
import { loadParkingShow, saveParkingMap } from './maps';
import { DriverLinkInputError, navigateUrls, parseCreate } from '@/lib/parking/driverLinks';
import type { ParkingDrawing } from '@/lib/parking/model';

const WS = 'ws-1';
const FID = '0b6c1c9e-1d2f-4a8b-9c3d-5e6f7a8b9c0d';
const OTHER = '11111111-1111-4111-8111-111111111111';
let db: FakeDb;

// parking_share_touch, as migration 289 writes it (its SQL is tested in PGlite).
const touch = (_db: FakeDb, args: Record<string, unknown>) => {
  const rows = db.t('parking_share_links').filter((r) => r.token_hash === args.p_token_hash);
  const r = rows[0];
  if (!r) return { data: [], error: null };
  const live = !r.revoked_at && new Date(r.expires_at as string).getTime() > Date.now();
  const take = args.p_take_3d === true;
  const ok = live && (!take || (r.opens_3d as number) < (r.max_3d_opens as number));
  if (ok) {
    if (take) r.opens_3d = (r.opens_3d as number) + 1;
    else r.views = (r.views as number) + 1;
  }
  return { data: [{ ...r, took: ok }], error: null };
};

const drawing = (fileId: string): ParkingDrawing => ({
  id: `d-${fileId.slice(0, 4)}`, fileId, name: 'Dock.pdf', kind: 'pdf', page: 1, srcW: 1000, srcH: 600, crop: { u0: 0, v0: 0, u1: 1000, v1: 600 },
  scale: 0.1, calib: null, x: 0, y: 0, rotation: 0, pinned: true, pinCheck: 0, opacity: 0.85, hidden: false, inside: true, floor: 0, clearHeight: null,
});

const signed: string[] = [];
const storage: SignStorage = { sign: async (bucket, path) => (signed.push(`${bucket}/${path}`), `https://signed/${bucket}/${path}`) };

beforeEach(() => {
  signed.length = 0;
  db = new FakeDb({ unique: { parking_maps: [['routing_id']], parking_share_links: [['token_hash']] }, rpc: { parking_share_touch: touch } });
  db.seed('tours', [{ id: 't1', workspace_id: WS }]);
  db.seed('canonical_venues', [{ id: 'cv', name: 'Velodrom', lat: 52.5233, lng: 13.4386 }]);
  db.seed('routing', [{ id: 'show-1', tour_id: 't1', date: '2026-12-01', day_type: 'show', city: 'Berlin', venue_name: 'Velodrom', canonical_venue_id: 'cv' }]);
  db.seed('file_references', [
    { id: FID, workspace_id: WS, file_name: 'Dock.pdf', storage_provider: 'tour-files', provider_file_id: 'ws-1/t1/dock.pdf' },
    { id: OTHER, workspace_id: 'ws-2', file_name: 'Theirs.pdf', storage_provider: 'tour-files', provider_file_id: 'ws-2/x.pdf' },
  ]);
});

async function withMap(drawings: ParkingDrawing[] = [drawing(FID)]) {
  const show = (await loadParkingShow(db.client(), 't1', 'show-1'))!;
  await saveParkingMap(db.client(), {
    show,
    userId: 'u1',
    version: null,
    data: { anchor: { lat: 52.5233, lng: 13.4386 }, view: { cx: 0, cy: 0, ppm: 3, rotation: 0, pages: [], cam3d: { x: 0, y: 0, alt: 100, heading: 0, pitch: -45, roll: 0 } }, notes: 'Gate code 4321', items: [], drawings },
  });
  return show;
}

describe('making a link', () => {
  it('needs a saved map', async () => {
    const show = (await loadParkingShow(db.client(), 't1', 'show-1'))!;
    await expect(createDriverLink(db.client(), { show, userId: 'u1', input: { label: null, hours: 48, max3d: 20 } })).rejects.toMatchObject({ status: 409 });
  });

  it('returns the token once and stores only its hash, with an expiry', async () => {
    const show = await withMap();
    const now = new Date('2026-11-11T10:00:00Z');
    const { token, link } = await createDriverLink(db.client(), { show, userId: 'u1', input: { label: 'Bus 2 – Dave', hours: 48, max3d: 20 }, now });
    expect(token).toMatch(/^[A-Za-z0-9_-]{30,}$/);
    const row = db.t('parking_share_links')[0];
    expect(row.token_hash).toBe(hashToken(token));
    expect(JSON.stringify(row)).not.toContain(token);
    expect(link).toMatchObject({ label: 'Bus 2 – Dave', expiresAt: '2026-11-13T10:00:00.000Z', max3d: 20, opens3d: 0 });
  });

  it('the input is checked: 1 h to 14 days, 0–100 3D opens', () => {
    expect(parseCreate({})).toEqual({ label: null, hours: 48, max3d: 20 });
    expect(() => parseCreate({ hours: 24 * 30 })).toThrow(DriverLinkInputError);
    expect(() => parseCreate({ max3d: 500 })).toThrow(DriverLinkInputError);
    expect(parseCreate({ label: '  Truck 1  ' }).label).toBe('Truck 1');
  });
});

describe('a driver opening it', () => {
  it('sees that one map, its venue and the drawing file it uses — signed — and nothing from the editor’s pages / 3D cameras', async () => {
    const show = await withMap([drawing(FID), drawing(OTHER)]);
    const { token } = await createDriverLink(db.client(), { show, userId: 'u1', input: { label: null, hours: 48, max3d: 20 } });
    const link = await touchLink(db.client(), token, false);
    const p = await driverMapPayload(db.client(), storage, link);
    expect(p.venue.name).toBe('Velodrom');
    expect(p.map.notes).toBe('Gate code 4321');
    expect(p.files.map((f) => f.url)).toEqual(['https://signed/tour-files/ws-1/t1/dock.pdf']);
    expect(signed).toEqual(['tour-files/ws-1/t1/dock.pdf']); // the other workspace's file was never signed
    expect(p.map.drawings.map((d) => d.fileId)).toEqual([FID]);
    expect(p.map.view).not.toHaveProperty('pages');
    expect(p.map.view).not.toHaveProperty('cam3d');
    expect(db.t('parking_share_links')[0].views).toBe(1);
  });

  it('a wrong, malformed, revoked or expired token says so', async () => {
    const show = await withMap();
    const { token, link } = await createDriverLink(db.client(), { show, userId: 'u1', input: { label: null, hours: 48, max3d: 20 } });
    await expect(touchLink(db.client(), 'x'.repeat(32), false)).rejects.toMatchObject({ status: 404 });
    await expect(touchLink(db.client(), '../../etc', false)).rejects.toMatchObject({ status: 404 });
    await revokeDriverLink(db.client(), { routingId: 'show-1', id: link.id });
    await expect(touchLink(db.client(), token, false)).rejects.toMatchObject({ status: 410, code: 'revoked' });
    const second = await createDriverLink(db.client(), { show, userId: 'u1', input: { label: null, hours: 1, max3d: 20 } });
    db.t('parking_share_links')[1].expires_at = new Date(Date.now() - 1000).toISOString();
    await expect(touchLink(db.client(), second.token, false)).rejects.toMatchObject({ status: 410, code: 'expired' });
  });

  it('3D opens stop at the cap; the plan keeps working', async () => {
    const show = await withMap();
    const { token } = await createDriverLink(db.client(), { show, userId: 'u1', input: { label: null, hours: 48, max3d: 2 } });
    await touchLink(db.client(), token, true);
    await touchLink(db.client(), token, true);
    const err = await touchLink(db.client(), token, true).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(DriverLinkError);
    expect((err as DriverLinkError).status).toBe(429);
    await expect(touchLink(db.client(), token, false)).resolves.toBeTruthy();
    const [owner] = await listDriverLinks(db.client(), 'show-1');
    expect(owner).toMatchObject({ opens3d: 2, max3d: 2, views: 1, state: 'live' });
  });

  it('“Navigate here” hands the point to the driver’s own app', () => {
    const u = navigateUrls({ lat: 52.5233, lng: 13.4386 });
    expect(u.google).toContain('destination=52.523300,13.438600');
    expect(u.waze).toContain('ll=52.523300,13.438600');
    expect(u.apple).toContain('daddr=52.523300,13.438600');
  });
});
