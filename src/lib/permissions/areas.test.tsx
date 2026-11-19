import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  AREAS,
  LEGACY_RESOURCE_AREA,
  PRESET_ACCESS,
  accessForTour,
  can,
  presetFor,
} from './areas';
import { RESOURCE_CATALOG } from './resources';

const sql = readFileSync(join(process.cwd(), 'database/migrations/292_tour_access_foundation.sql'), 'utf8');

describe('areas ↔ migration 292', () => {
  it('the CHECK on tour_access.area lists exactly AREAS', () => {
    const m = sql.match(/tour_access_area_check CHECK \(area IN \(([^)]*)\)\)/);
    expect(m).not.toBeNull();
    const inSql = [...m![1].matchAll(/'([a-z_]+)'/g)].map((x) => x[1]);
    expect(inSql).toEqual([...AREAS]);
  });

  it('my_tour_access lists exactly AREAS for admins', () => {
    const m = sql.match(/unnest\(ARRAY\[([^\]]*)\]\)/);
    expect([...m![1].matchAll(/'([a-z_]+)'/g)].map((x) => x[1])).toEqual([...AREAS]);
  });

  it('the grants copy uses LEGACY_RESOURCE_AREA', () => {
    const block = sql.slice(sql.indexOf('WITH area_map'), sql.indexOf('grant_members AS'));
    const pairs = Object.fromEntries([...block.matchAll(/\('([a-z_.]+)', '([a-z_]+)'\)/g)].map((x) => [x[1], x[2]]));
    const want = Object.fromEntries(Object.entries(LEGACY_RESOURCE_AREA).filter(([, a]) => a !== null));
    expect(pairs).toEqual(want);
  });

  it('every legacy page id has a decided area (or null)', () => {
    for (const r of RESOURCE_CATALOG) expect(r.id in LEGACY_RESOURCE_AREA, r.id).toBe(true);
  });
});

describe('access rules', () => {
  const T1 = 't1';
  const T2 = 't2';

  it('all-tours and per-tour rows combine; edit wins', () => {
    const rows = [
      { tour_id: null, area: 'files', level: 'view' },
      { tour_id: T1, area: 'files', level: 'edit' },
      { tour_id: T2, area: 'parking', level: 'edit' },
      { tour_id: null, area: 'nonsense', level: 'edit' },
    ];
    expect(accessForTour(rows, T1)).toEqual({ files: 'edit' });
    expect(accessForTour(rows, T2)).toEqual({ files: 'view', parking: 'edit' });
  });

  it('edit implies view; none is nothing', () => {
    expect(can({ files: 'edit' }, 'files', 'view')).toBe(true);
    expect(can({ files: 'view' }, 'files', 'edit')).toBe(false);
    expect(can({}, 'files')).toBe(false);
  });

  it('presets are recognised, custom is not', () => {
    expect(presetFor(PRESET_ACCESS.crew)).toBe('crew');
    expect(presetFor({ ...PRESET_ACCESS.production, receipts: 'edit' })).toBeNull();
    // Adam's production assistant: Production preset + Receipts edit.
    const pa = { ...PRESET_ACCESS.production, receipts: 'edit' as const };
    expect(can(pa, 'receipts', 'edit')).toBe(true);
    expect(can(pa, 'budget')).toBe(false);
  });
});
