/* Parking maps — saving never silently overwrites someone else's edit. */

import { beforeEach, describe, expect, it } from 'vitest';
import { FakeDb } from '@/test-utils/fakeSupabase';
import { ParkingConflict, ParkingNotFound, loadParkingMap, loadParkingShow, recordPdf, saveParkingMap } from './maps';
import type { ParkingMapData } from '@/lib/parking/model';

const WS = 'ws-1';
let db: FakeDb;

const data = (n: number): ParkingMapData => ({
  anchor: { lat: 53.8027, lng: -1.5446 },
  view: { cx: 0, cy: 0, ppm: 2, rotation: 0 },
  notes: `edit ${n}`,
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
