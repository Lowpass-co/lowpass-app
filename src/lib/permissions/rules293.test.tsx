import { spawnSync } from 'node:child_process';
import { describe, expect, it } from 'vitest';
import { AREAS as TS_AREAS } from '@/lib/permissions/areas';
// @ts-expect-error — plain .mjs data module, no types
import { AREAS, RULES } from '../../../scripts/permissions/rules.mjs';

describe('permissions rules (293)', () => {
  it('rules.mjs uses the same ten areas as areas.ts', () => {
    expect(AREAS).toEqual([...TS_AREAS]);
    for (const r of RULES as { table: string; area?: string; read?: string[]; also?: string[] }[]) {
      for (const a of [r.area, ...(r.read ?? []), ...(r.also ?? [])].filter(Boolean)) {
        expect(TS_AREAS as readonly string[], `${r.table}: ${a}`).toContain(a);
      }
    }
  });

  it('every table has exactly one rule', () => {
    const tables = (RULES as { table: string }[]).map((r) => r.table);
    expect(new Set(tables).size).toBe(tables.length);
  });

  it('293 and its down file are regenerated from rules.mjs', () => {
    const r = spawnSync(process.execPath, ['scripts/permissions/gen293.mjs', '--check'], { encoding: 'utf8' });
    expect(r.stderr).toBe('');
    expect(r.status).toBe(0);
  });
});
