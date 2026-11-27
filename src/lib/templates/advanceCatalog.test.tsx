import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { ADVANCE_CATALOG, RETIRED_ADVANCE_SECTIONS } from './advanceCatalog';
import { advanceCatalogSql } from './advanceCatalogSql';
import { FIELD_TYPES } from '@/server/advance/sections';

describe('the advance question catalogue (Nov 2026, Adam: "dressing rooms appears twice")', () => {
  const all = ADVANCE_CATALOG.flatMap((s) => s.fields.map((f) => ({ section: s.name, ...f })));

  it('asks every question once — no id, and no label, in two places', () => {
    const ids = all.map((f) => f.id);
    expect(ids.filter((id, i) => ids.indexOf(id) !== i)).toEqual([]);
    const labels = all.map((f) => f.label.toLowerCase());
    expect(labels.filter((l, i) => labels.indexOf(l) !== i)).toEqual([]);
  });

  it('keeps contact questions in Key Contacts only (the database refuses them elsewhere, 076)', () => {
    expect(all.filter((f) => f.type === 'contact' && f.section !== 'Key Contacts')).toEqual([]);
  });

  it('uses only question types the editor knows', () => {
    expect(all.filter((f) => !FIELD_TYPES.has(f.type))).toEqual([]);
  });

  it('has unique section names and ids, and retires none of its own', () => {
    const names = ADVANCE_CATALOG.map((s) => s.name);
    expect(new Set(names).size).toBe(names.length);
    expect(new Set(ADVANCE_CATALOG.map((s) => s.id)).size).toBe(names.length);
    expect(RETIRED_ADVANCE_SECTIONS.filter((r) => names.includes(r) || ADVANCE_CATALOG.some((s) => s.from.includes(r)))).toEqual([]);
  });

  it('conditions point at a real pick-list question and its real answers', () => {
    for (const s of ADVANCE_CATALOG) {
      if (!s.showWhen) continue;
      const q = all.find((f) => f.id === s.showWhen!.field);
      expect(q?.type, s.name).toBe('select');
      for (const v of s.showWhen.in) expect(q?.options, s.name).toContain(v);
    }
  });

  it('migration 303 is exactly what the catalogue generates (npx tsx scripts/templates/gen303.ts)', () => {
    const sql = readFileSync(join(process.cwd(), 'database/migrations/303_advance_catalog_curated.sql'), 'utf8');
    expect(sql).toBe(advanceCatalogSql());
  });
});
