/* Parking maps — saving never silently overwrites someone else's edit. */

import { beforeEach, describe, expect, it } from 'vitest';
import { FakeDb } from '@/test-utils/fakeSupabase';
import { ParkingConflict, ParkingNotFound, drawableKind, loadDrawingFiles, loadParkingIndex, loadParkingMap, loadParkingShow, loadVenueReuse, recordPdf, saveParkingMap, withDrawings } from './maps';
import type { ParkingDrawing } from '@/lib/parking/model';
import type { ParkingMapData } from '@/lib/parking/model';

const WS = 'ws-1';
let db: FakeDb;

const data = (n: number): ParkingMapData => ({
  anchor: { lat: 53.8027, lng: -1.5446 },
  view: { cx: 0, cy: 0, ppm: 2, rotation: 0 },
  notes: `edit ${n}`,
  drawings: [],
  items: [{ id: `b${n}`, kind: 'vehicle', type: 'bus_eu', label: `Bus ${n}`, x: n, y: 0, heading: 0, length: 13.5, width: 2.55, height: 4 }],
});

beforeEach(() => {
  db = new FakeDb({ unique: { parking_maps: [['routing_id']] } });
  db.seed('tours', [{ id: 't1', workspace_id: WS }]);
  db.seed('canonical_venues', [{ id: 'cv-leeds', name: 'First Direct Arena', lat: 53.8027, lng: -1.5446 }]);
  db.seed('routing', [
    { id: 'show-1', tour_id: 't1', date: '2026-12-01', day_type: 'show', city: 'Leeds', venue_name: 'First Direct Arena', canonical_venue_id: 'cv-leeds', venue_frozen_at: null },
    { id: 'show-2', tour_id: 't1', date: '2026-12-02', day_type: 'show', city: 'Glasgow', venue_name: 'Barrowland', canonical_venue_id: null },
  ]);
  db.seed('file_references', [
    { id: 'f-mine', workspace_id: WS, file_name: 'Parking — Leeds.pdf' },
    { id: 'f-theirs', workspace_id: 'ws-2', file_name: 'Theirs.pdf' },
  ]);
});

describe('loadParkingShow', () => {
  it('carries the venue coordinates from the canonical venue', async () => {
    const s = await loadParkingShow(db.client(), 't1', 'show-1');
    expect(s?.venue.coords).toEqual({ lat: 53.8027, lng: -1.5446 });
    expect(s?.venue.canonicalId).toBe('cv-leeds');
    expect(s?.workspaceId).toBe(WS);
  });

  it('a typed venue has no coordinates (the editor asks where it is)', async () => {
    expect((await loadParkingShow(db.client(), 't1', 'show-2'))?.venue.coords).toBeNull();
  });

  it('a show on another tour is not found', async () => {
    expect(await loadParkingShow(db.client(), 't-other', 'show-1')).toBeNull();
  });

  it('opening writes nothing', async () => {
    await loadParkingShow(db.client(), 't1', 'show-1');
    await loadParkingMap(db.client(), 'show-1');
    expect(db.writes()).toBe(0);
  });
});

describe('saveParkingMap', () => {
  it('first save inserts version 1; the next save needs that version and makes 2', async () => {
    const show = (await loadParkingShow(db.client(), 't1', 'show-1'))!;
    const a = await saveParkingMap(db.client(), { show, userId: 'u1', data: data(1), version: null });
    expect(a.version).toBe(1);
    const b = await saveParkingMap(db.client(), { show, userId: 'u1', data: data(2), version: 1 });
    expect(b.version).toBe(2);
    expect((await loadParkingMap(db.client(), 'show-1'))?.notes).toBe('edit 2');
    expect(db.t('parking_maps')[0]).toMatchObject({ workspace_id: WS, tour_id: 't1', canonical_venue_id: 'cv-leeds' });
  });

  it('a stale save is refused with the current map, and nothing is overwritten', async () => {
    const show = (await loadParkingShow(db.client(), 't1', 'show-1'))!;
    await saveParkingMap(db.client(), { show, userId: 'u1', data: data(1), version: null });
    await saveParkingMap(db.client(), { show, userId: 'u2', data: data(2), version: 1 }); // the other TM
    const err = await saveParkingMap(db.client(), { show, userId: 'u1', data: data(3), version: 1 }).catch((e) => e);
    expect(err).toBeInstanceOf(ParkingConflict);
    expect((err as ParkingConflict).current.notes).toBe('edit 2');
    expect((await loadParkingMap(db.client(), 'show-1'))?.notes).toBe('edit 2');
  });

  it('two first saves at once: the second gets a conflict, not a duplicate', async () => {
    const show = (await loadParkingShow(db.client(), 't1', 'show-1'))!;
    await saveParkingMap(db.client(), { show, userId: 'u1', data: data(1), version: null });
    await expect(saveParkingMap(db.client(), { show, userId: 'u2', data: data(2), version: null })).rejects.toBeInstanceOf(ParkingConflict);
    expect(db.t('parking_maps')).toHaveLength(1);
  });
});

describe('recordPdf', () => {
  it('remembers a file from this workspace', async () => {
    const show = (await loadParkingShow(db.client(), 't1', 'show-1'))!;
    await saveParkingMap(db.client(), { show, userId: 'u1', data: data(1), version: null });
    const m = await recordPdf(db.client(), { show, fileId: 'f-mine' });
    expect(m.pdf).toMatchObject({ fileId: 'f-mine', name: 'Parking — Leeds.pdf' });
  });

  it('refuses a file from another workspace', async () => {
    const show = (await loadParkingShow(db.client(), 't1', 'show-1'))!;
    await saveParkingMap(db.client(), { show, userId: 'u1', data: data(1), version: null });
    await expect(recordPdf(db.client(), { show, fileId: 'f-theirs' })).rejects.toBeInstanceOf(ParkingNotFound);
    expect(db.t('parking_maps')[0].pdf_file_id ?? null).toBeNull();
  });

  it('needs a saved map', async () => {
    const show = (await loadParkingShow(db.client(), 't1', 'show-1'))!;
    await expect(recordPdf(db.client(), { show, fileId: 'f-mine' })).rejects.toBeInstanceOf(ParkingNotFound);
  });
});

describe('loadParkingIndex — Production › Parking', () => {
  it('lists the tour’s show days in date order with their maps; days off are left out unless a map exists', async () => {
    db.seed('routing', [
      { id: 'off-1', tour_id: 't1', date: '2026-12-03', day_type: 'off', city: 'Glasgow' },
      { id: 'off-2', tour_id: 't1', date: '2026-12-04', day_type: 'off', city: 'Glasgow' },
      { id: 'other', tour_id: 't2', date: '2026-12-01', day_type: 'show', city: 'Hull' },
    ]);
    const show = (await loadParkingShow(db.client(), 't1', 'show-1'))!;
    await saveParkingMap(db.client(), { show, userId: 'u1', data: data(1), version: null });
    db.seed('parking_maps', [{ id: 'pm-off', workspace_id: WS, tour_id: 't1', routing_id: 'off-2', items: [], updated_at: '2026-11-01T00:00:00Z', pdf_exported_at: null }]);

    const rows = await loadParkingIndex(db.client(), 't1');
    expect(rows.map((r) => r.routingId)).toEqual(['show-1', 'show-2', 'off-2']);
    expect(rows[0]).toMatchObject({ hasMap: true, summary: '1 bus', venue: 'First Direct Arena' });
    expect(rows[1]).toMatchObject({ hasMap: false, summary: null });
    expect(rows[2]).toMatchObject({ hasMap: true, summary: null });
    expect(db.writes()).toBe(1); // only the save above — the index reads
  });
});

describe('venue drawings', () => {
  const FID = '0b6c1c9e-1d2f-4a8b-9c3d-5e6f7a8b9c0d';
  const drawing: ParkingDrawing = {
    id: 'd1', fileId: FID, name: 'Dock.pdf', kind: 'pdf', page: 1, srcW: 1191, srcH: 842, crop: { u0: 0, v0: 0, u1: 1191, v1: 842 },
    scale: 0.0847, calib: null, x: 10, y: -5, rotation: 12, pinned: true, pinCheck: 0.8, opacity: 0.85, hidden: false, inside: true, floor: -5, clearHeight: 4.2,
  };

  it('a map saves and loads its drawings', async () => {
    const show = (await loadParkingShow(db.client(), 't1', 'show-1'))!;
    await saveParkingMap(db.client(), { show, userId: 'u1', data: { ...data(1), drawings: [drawing] }, version: null });
    expect((await loadParkingMap(db.client(), 'show-1'))?.drawings).toEqual([drawing]);
  });

  it('before migration 288 (no drawings column) a query runs again without it; drawings need the SQL', async () => {
    const calls: string[] = [];
    const r = await withDrawings(async (cols, withCol) => {
      calls.push(withCol ? 'with' : 'without');
      return withCol ? { data: null, error: { code: '42703', message: 'column parking_maps.drawings does not exist' } } : { data: 'ok', error: null };
    });
    expect(calls).toEqual(['with', 'without']);
    expect(r.data).toBe('ok');
    // Any other error is not swallowed.
    const other = await withDrawings(async () => ({ data: null, error: { code: '23505', message: 'duplicate' } }));
    expect(other.error?.code).toBe('23505');
  });

  it('lists the tour’s PDFs and images (not other files, not other workspaces), plus files the map already uses', async () => {
    db.seed('file_references', [
      { id: '11111111-1111-4111-8111-111111111111', workspace_id: WS, linked_to_type: 'tour', linked_to_id: 't1', file_name: 'S2 Truck Parking.pdf', file_type: 'application/pdf', storage_provider: 'tour-files', provider_file_id: 'ws-1/t1/s2.pdf' },
      { id: '22222222-2222-4222-8222-222222222222', workspace_id: WS, linked_to_type: 'tour', linked_to_id: 't1', file_name: 'dock.JPG', file_type: null, storage_provider: 'tour-files', provider_file_id: 'ws-1/t1/dock.jpg' },
      { id: '33333333-3333-4333-8333-333333333333', workspace_id: WS, linked_to_type: 'tour', linked_to_id: 't1', file_name: 'Rider.docx', file_type: 'application/msword', storage_provider: 'tour-files', provider_file_id: 'x' },
      { id: FID, workspace_id: WS, linked_to_type: 'tour', linked_to_id: 't-old', file_name: 'Velodrom.pdf', file_type: 'application/pdf', storage_provider: 'tour-files', provider_file_id: 'ws-1/t-old/v.pdf' },
      { id: '44444444-4444-4444-8444-444444444444', workspace_id: 'ws-2', linked_to_type: 'tour', linked_to_id: 't1', file_name: 'Not yours.pdf', file_type: 'application/pdf', storage_provider: 'tour-files', provider_file_id: 'ws-2/x.pdf' },
    ]);
    const show = (await loadParkingShow(db.client(), 't1', 'show-1'))!;
    const files = await loadDrawingFiles(db.client(), show, [FID, '44444444-4444-4444-8444-444444444444']);
    expect(files.map((f) => [f.name, f.kind])).toEqual([
      ['dock.JPG', 'image'],
      ['S2 Truck Parking.pdf', 'pdf'],
      ['Velodrom.pdf', 'pdf'],
    ]);
    expect(files.find((f) => f.name === 'Velodrom.pdf')?.path).toBe('ws-1/t-old/v.pdf');
    expect(drawableKind('plan.png', null)).toBe('image');
    expect(drawableKind('notes.txt', 'text/plain')).toBeNull();
  });

  it('offers the latest other map at the same venue that has drawings; none at a typed venue', async () => {
    db.seed('parking_maps', [
      { id: 'pm-a', workspace_id: WS, tour_id: 't0', routing_id: 'old-1', canonical_venue_id: 'cv-leeds', anchor_lat: 53.8027, anchor_lng: -1.5446, drawings: [drawing], updated_at: '2026-03-01T00:00:00Z' },
      { id: 'pm-b', workspace_id: WS, tour_id: 't0', routing_id: 'old-2', canonical_venue_id: 'cv-leeds', anchor_lat: 53.8027, anchor_lng: -1.5446, drawings: [], updated_at: '2026-06-01T00:00:00Z' },
      { id: 'pm-c', workspace_id: 'ws-2', tour_id: 'tx', routing_id: 'theirs', canonical_venue_id: 'cv-leeds', anchor_lat: 53.8, anchor_lng: -1.5, drawings: [drawing], updated_at: '2026-09-01T00:00:00Z' },
    ]);
    const show = (await loadParkingShow(db.client(), 't1', 'show-1'))!;
    const r = await loadVenueReuse(db.client(), show);
    expect(r?.routingId).toBe('old-1');
    expect(r?.drawings).toHaveLength(1);
    const typed = (await loadParkingShow(db.client(), 't1', 'show-2'))!;
    expect(await loadVenueReuse(db.client(), typed)).toBeNull();
  });
});
