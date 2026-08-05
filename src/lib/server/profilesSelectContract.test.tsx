/* ============================================
   LOWPASS — profiles select ⇄ schema contract

   INCIDENT 2026-08-05 №2 (the /artists ⇄ /login reload loop). The perf pass
   introduced getRequestProfile() selecting `full_name` — a column that exists
   on `persons` (migration 050) but has NEVER existed on `profiles` (001 named
   it `name`). PostgREST answered 42703 on every request; `maybeSingle` handed
   back { data: null, error }, the error was destructured away, and the null
   walked up the chain until the (workspace) layout translated "profile read
   failed" into redirect('/login'). Middleware — correctly — saw a valid
   session on /login and bounced straight back to /artists. The result was an
   infinite full-document reload loop with every auth signal green, which is
   why it was chased as an auth bug (c9affb9) when auth was never the broken
   link. Four more selects in src/ carried the same phantom column and were
   silently returning null-shaped data in production.

   WHY THIS SHAPE. Both failure modes here are SILENT: supabase-js does not
   throw on 42703, and nothing exercises these queries in CI (vitest mocks the
   client; the schema lives in hand-pasted migrations). You cannot alert on an
   absence nobody emits — so this test makes the bad state UNADDABLE instead:

     1. The canonical column set is DERIVED from database/migrations (CREATE
        TABLE profiles + every ALTER TABLE profiles ADD/DROP/RENAME COLUMN),
        not hand-maintained. A future migration extends the set by existing.
     2. Every `.from('profiles')…​.select('…')` in src/ is parsed and each
        selected column (the REAL column — aliases like `full_name:name`
        resolve to the part after the colon) must be in that set.

   A select of a column no migration creates fails HERE, by name, with the
   file that did it — instead of failing in production as a login redirect.

   LIVENESS. The parser could rot into matching nothing and the assertions
   would pass vacuously — so the test also asserts the migration parse found
   the columns 001 provably creates, and that the source scan found the known
   call sites (requestContext at minimum). If those disappear, the test fails
   until the parser (or the moved file) is accounted for.

   Named .test.tsx because vitest's include is scoped to .test.tsx — .test.ts
   is reserved for the standalone node money harnesses.
   ============================================ */

import { describe, it, expect } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';

const ROOT = path.resolve(__dirname, '../../..');
const MIGRATIONS_DIR = path.join(ROOT, 'database', 'migrations');
const SRC_DIR = path.join(ROOT, 'src');

/* ── 1 · canonical profiles columns, derived from migrations ─────────────── */

const CONSTRAINT_KEYWORDS = new Set([
  'primary', 'foreign', 'unique', 'constraint', 'check', 'exclude', 'like',
]);

function parseProfilesColumns(): Set<string> {
  const columns = new Set<string>();
  const files = fs
    .readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith('.sql'))
    .sort(); // numeric prefixes sort into apply order; later files may DROP/RENAME

  for (const file of files) {
    const sql = fs.readFileSync(path.join(MIGRATIONS_DIR, file), 'utf8');

    // CREATE TABLE [IF NOT EXISTS] [public.]profiles ( … );
    const createRe =
      /CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?(?:public\.)?profiles\s*\(([\s\S]*?)\n\);/gi;
    for (const m of sql.matchAll(createRe)) {
      for (const rawLine of m[1].split('\n')) {
        const line = rawLine.trim();
        if (!line || line.startsWith('--')) continue;
        const first = line.split(/[\s(]+/)[0];
        if (!first || CONSTRAINT_KEYWORDS.has(first.toLowerCase())) continue;
        columns.add(first.replace(/"/g, ''));
      }
    }

    // ALTER TABLE [ONLY] [public.]profiles … ;  (one statement, N clauses)
    const alterRe =
      /ALTER\s+TABLE\s+(?:ONLY\s+)?(?:public\.)?profiles\b([\s\S]*?);/gi;
    for (const m of sql.matchAll(alterRe)) {
      const body = m[1];
      for (const add of body.matchAll(
        /ADD\s+COLUMN\s+(?:IF\s+NOT\s+EXISTS\s+)?"?([a-zA-Z_][a-zA-Z0-9_]*)"?/gi,
      )) {
        columns.add(add[1]);
      }
      for (const drop of body.matchAll(
        /DROP\s+COLUMN\s+(?:IF\s+EXISTS\s+)?"?([a-zA-Z_][a-zA-Z0-9_]*)"?/gi,
      )) {
        columns.delete(drop[1]);
      }
      for (const ren of body.matchAll(
        /RENAME\s+COLUMN\s+"?([a-zA-Z_][a-zA-Z0-9_]*)"?\s+TO\s+"?([a-zA-Z_][a-zA-Z0-9_]*)"?/gi,
      )) {
        columns.delete(ren[1]);
        columns.add(ren[2]);
      }
    }
  }
  return columns;
}

/* ── 2 · every profiles select in src/ ───────────────────────────────────── */

interface ProfilesSelect {
  file: string;
  select: string;
}

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === 'node_modules' || entry.name.startsWith('.')) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, out);
    else if (/\.(ts|tsx)$/.test(entry.name) && !/\.test\.tsx?$/.test(entry.name)) {
      out.push(full);
    }
  }
  return out;
}

function findProfilesSelects(): ProfilesSelect[] {
  const results: ProfilesSelect[] = [];
  // `.from('profiles')` then the next `.select('…')` in the same chain. 300
  // chars is generous for the formatting between them; a select further away
  // than that is a different statement.
  const re = /\.from\(\s*['"]profiles['"]\s*\)[\s\S]{0,300}?\.select\(\s*(['"`])([\s\S]*?)\1/g;
  for (const file of walk(SRC_DIR)) {
    const text = fs.readFileSync(file, 'utf8');
    if (!text.includes("from('profiles')") && !text.includes('from("profiles")')) continue;
    for (const m of text.matchAll(re)) {
      results.push({ file: path.relative(ROOT, file), select: m[2] });
    }
  }
  return results;
}

/** A select list → the REAL columns it asks PostgREST for.
 *  `alias:column` → column (PostgREST alias syntax puts the alias FIRST).
 *  `*` → wildcard (always valid). Embedded relations `rel(…)` name a
 *  relationship, not a profiles column — none exist for profiles today, so a
 *  token containing '(' is surfaced as a failure rather than guessed at. */
function realColumns(select: string): string[] {
  return select
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
    .map((token) => {
      const noCast = token.split('::')[0].trim();
      const parts = noCast.split(':').map((p) => p.trim());
      return parts[parts.length - 1];
    });
}

/* ── the contract ────────────────────────────────────────────────────────── */

describe('profiles select ⇄ schema contract', () => {
  const columns = parseProfilesColumns();
  const selects = findProfilesSelects();

  it('parses the schema the migrations provably create (parser liveness)', () => {
    // 001 creates these; if the parser stops seeing them, every assertion
    // below is vacuous — fail here first.
    for (const known of ['id', 'email', 'name', 'avatar_url', 'workspace_id']) {
      expect(columns.has(known), `parser lost profiles.${known}`).toBe(true);
    }
    // The incident column must NOT be parseable into existence.
    expect(columns.has('full_name'), 'profiles.full_name does not exist in any migration').toBe(false);
  });

  it('finds the known call sites (scanner liveness)', () => {
    expect(selects.length, 'scanner found no profiles selects at all').toBeGreaterThanOrEqual(5);
    expect(
      selects.some((s) => s.file.replace(/\\/g, '/').endsWith('src/lib/server/requestContext.ts')),
      'scanner lost requestContext.ts — the incident call site',
    ).toBe(true);
  });

  it('every selected column exists in the migrations schema', () => {
    const failures: string[] = [];
    for (const { file, select } of selects) {
      for (const col of realColumns(select)) {
        if (col === '*') continue;
        if (col.includes('(')) {
          failures.push(`${file}: embedded relation "${col}" — add explicit handling here before using embeds on profiles`);
          continue;
        }
        if (!columns.has(col)) {
          failures.push(`${file}: selects profiles.${col} — no migration creates it (this is the 2026-08-05 loop bug's shape)`);
        }
      }
    }
    expect(failures, failures.join('\n')).toEqual([]);
  });
});
