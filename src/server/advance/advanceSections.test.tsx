/* ============================================
   loadAdvanceSections + the advance_instances column guard.

   Oct 2026: ten call sites selected `advance_instances.sections`, a column
   that has never existed (sections live on advance_form_configs). PostgREST
   rejected the query, every caller read the null as "not found", and venue
   sending 404'd for every show — silently, because the in-memory test DB
   accepts any column name. The guard below makes that unaddable: every
   literal `.select(...)` on advance_instances must name only columns the
   migrations actually create.
   ============================================ */

import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { FakeDb } from '@/test-utils/fakeSupabase';
import { buildIntakeFormSchema } from '@/lib/advance/intake';
import { loadAdvanceSections } from './advanceSections';

const ROOT = resolve(__dirname, '../../..');
const DEAL = '254459f5-7535-4b2f-81b8-294783ce1c85';
const LOCAL = '9756825a-a70a-4f91-9c5e-6082b4f29c08';

function seeded() {
  const db = new FakeDb();
  db.seed('advance_templates', [
    { id: DEAL, name: 'Deal Info', tm_only: true },
    { id: LOCAL, name: 'Local Info', tm_only: false },
  ]);
  db.seed('advance_form_configs', [
    {
      id: 'cfg-1',
      sections: [
        { template_id: LOCAL, label: 'Local Info', order: 0, fields: [{ id: 'nearest_hospital', label: 'Nearest hospital', type: 'text' }] },
        { template_id: DEAL, label: 'Deal Info', order: 1, fields: [{ id: 'guarantee', label: 'Guarantee', type: 'text' }] },
        { template_id: 'custom_merch', label: 'Merch', order: 2, fields: [{ id: 'merch_split', label: 'Split', type: 'text' }] },
      ],
    },
  ]);
  return db;
}

describe('loadAdvanceSections', () => {
  it('reads the show’s sections from its form config and marks TM-only ones', async () => {
    const s = await loadAdvanceSections(seeded().client(), 'cfg-1');
    expect(s.map((x) => [x.label, x.tm_only])).toEqual([['Local Info', false], ['Deal Info', true], ['Merch', false]]);
  });

  it('the venue form never contains a TM-only section (Deal Info / guarantee)', async () => {
    const schema = buildIntakeFormSchema(await loadAdvanceSections(seeded().client(), 'cfg-1'));
    expect(schema.sections.map((x) => x.label)).toEqual(['Local Info', 'Merch']);
    expect(JSON.stringify(schema)).not.toContain('guarantee');
  });

  it('fails CLOSED: if the TM-only lookup errors it throws, never defaults to venue-visible', async () => {
    const db = seeded();
    db.failReads.add('advance_templates');
    await expect(loadAdvanceSections(db.client(), 'cfg-1')).rejects.toThrow(/tm_only/);
  });

  it('no config → no sections', async () => {
    expect(await loadAdvanceSections(seeded().client(), null)).toEqual([]);
    expect(await loadAdvanceSections(seeded().client(), 'missing')).toEqual([]);
  });
});

/* ---------- the column guard ---------- */

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (/\.(ts|tsx)$/.test(name) && !/\.test\.tsx?$/.test(name)) out.push(p);
  }
  return out;
}

/** Columns advance_instances really has, from the migrations (CREATE + ADD/DROP COLUMN). */
function migrationColumns(): Set<string> {
  const dir = join(ROOT, 'database/migrations');
  const cols = new Set<string>();
  const files = readdirSync(dir).filter((f) => f.endsWith('.sql')).sort();
  for (const f of files) {
    const sql = readFileSync(join(dir, f), 'utf8').replace(/--[^\n]*/g, '');
    const create = /CREATE TABLE (?:IF NOT EXISTS )?(?:public\.)?advance_instances\s*\(([\s\S]*?)\n\);/i.exec(sql);
    if (create) {
      for (const line of create[1].split('\n')) {
        const m = /^\s*([a-z_][a-z0-9_]*)\s+[A-Z]/.exec(line);
        if (m && !/^(UNIQUE|PRIMARY|CONSTRAINT|CHECK|FOREIGN)$/i.test(m[1])) cols.add(m[1]);
      }
    }
    for (const stmt of sql.match(/ALTER TABLE (?:IF EXISTS )?(?:public\.)?advance_instances\b[\s\S]*?;/gi) ?? []) {
      for (const m of stmt.matchAll(/ADD COLUMN (?:IF NOT EXISTS )?([a-z_][a-z0-9_]*)/gi)) cols.add(m[1]);
      for (const m of stmt.matchAll(/DROP COLUMN (?:IF EXISTS )?([a-z_][a-z0-9_]*)/gi)) cols.delete(m[1]);
    }
  }
  return cols;
}

describe('advance_instances column guard', () => {
  const columns = migrationColumns();

  it('the migrations give the expected shape (and no `sections`)', () => {
    for (const c of ['id', 'routing_id', 'form_config_id', 'data', 'status', 'section_statuses']) expect(columns.has(c)).toBe(true);
    expect(columns.has('sections')).toBe(false);
  });

  it('every select on advance_instances names only real columns', () => {
    const bad: string[] = [];
    let seen = 0;
    for (const file of walk(join(ROOT, 'src'))) {
      const src = readFileSync(file, 'utf8');
      for (const m of src.matchAll(/from\(\s*['"]advance_instances['"]\s*\)([\s\S]{0,400}?)\.select\(\s*(['"`])([\s\S]*?)\2/g)) {
        if (m[1].includes(';')) continue; // the .select belongs to a later statement
        seen += 1;
        for (const raw of m[3].split(',')) {
          const col = raw.trim();
          if (!col || col === '*' || col.includes('(')) continue; // embeds are other tables
          const name = col.includes(':') ? col.split(':')[1].trim() : col;
          if (!columns.has(name)) bad.push(`${file.replace(ROOT + '/', '')}: ${name}`);
        }
      }
    }
    expect(seen).toBeGreaterThan(10); // the scanner is actually finding the call sites
    expect(bad).toEqual([]);
  });
});
