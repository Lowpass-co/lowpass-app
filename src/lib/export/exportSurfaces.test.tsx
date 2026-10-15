/* ============================================
   LOWPASS — one list of export surfaces (Oct 2026)

   The templates API and the export_templates.surface CHECK each kept their
   own copy of the first four surfaces, so templates silently failed to save
   for every export added later. Both now follow EXPORT_SURFACES; this pins
   the database side (the latest migration that sets the CHECK) to it.
   ============================================ */

import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { EXPORT_SURFACES } from './template-config';

const dir = join(process.cwd(), 'database', 'migrations');

describe('export surfaces', () => {
  it('the latest export_templates surface CHECK allows exactly EXPORT_SURFACES', () => {
    const files = readdirSync(dir).filter((f) => /^\d{3}_.*\.sql$/.test(f)).sort();
    let latest: string[] | null = null;
    for (const f of files) {
      const sql = readFileSync(join(dir, f), 'utf8').replace(/--.*$/gm, '');
      if (!/export_templates/.test(sql)) continue;
      const m = sql.match(/CHECK\s*\(\s*surface\s+IN\s*\(([^)]*)\)/i);
      if (m) latest = [...m[1].matchAll(/'([^']+)'/g)].map((x) => x[1]);
    }
    expect(latest).not.toBeNull();
    expect([...(latest ?? [])].sort()).toEqual([...EXPORT_SURFACES].sort());
  });
});
