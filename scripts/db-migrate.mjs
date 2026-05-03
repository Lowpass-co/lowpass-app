#!/usr/bin/env node
/* ============================================
   LOWPASS — Migration runner
   ============================================

   Diffs database/migrations/[0-9][0-9][0-9]*.sql against the rows in
   public._lp_migrations and applies the missing files in numeric
   order. Each migration runs in its own transaction; the runner
   stops on the first failure with a rollback.

   Refuses to apply a migration whose filename already lives in
   _lp_migrations with a different checksum — the file was edited
   after being applied, which would silently drift production. Write
   a new migration instead. The literal string 'backfill' is reserved
   for migration 068's pre-runner history rows; the runner skips
   checksum validation when it sees that sentinel.

   Usage:
     DATABASE_URL=postgres://... npm run db:migrate
     DATABASE_URL=postgres://... npm run db:migrate:dry-run

   Bootstrap:
     1. Paste 067_lp_migrations_tracking.sql into Supabase SQL Editor.
     2. Paste 068_backfill_lp_migrations.sql into Supabase SQL Editor.
     3. Set DATABASE_URL (or SUPABASE_DB_URL) to a service-role
        connection string and run `npm run db:migrate -- --dry-run` —
        expected output: "No pending migrations."

   After bootstrap, every new migration drops into
   database/migrations/ and the runner picks it up on the next
   invocation. The "Adam pastes SQL by hand" workflow is retired.

   This script intentionally has no dependencies beyond `pg` and the
   Node standard library. ESM (.mjs) so it loads without needing a
   tsconfig + transpile cycle.
   ============================================ */

import { readdirSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import pg from 'pg';

const __dirname = dirname(fileURLToPath(import.meta.url));
const MIGRATIONS_DIR = join(__dirname, '..', 'database', 'migrations');

const dryRun = process.argv.includes('--dry-run');
const url = process.env.DATABASE_URL ?? process.env.SUPABASE_DB_URL;
if (!url) {
  console.error('ERROR: DATABASE_URL or SUPABASE_DB_URL must be set.');
  console.error('       Use the service-role connection string from your Supabase project.');
  process.exit(1);
}

/** sha256 of the file content, truncated to 16 hex chars. Stable
 *  across machines and short enough to eyeball when debugging. */
const checksum = (s) => createHash('sha256').update(s).digest('hex').slice(0, 16);

/** Lists migration files in numeric (= alphabetic for zero-padded
 *  three-digit prefixes) order. Anything that doesn't match the
 *  NNN_<name>.sql pattern is ignored — README + ad-hoc SQL won't
 *  be picked up. */
const listMigrations = () =>
  readdirSync(MIGRATIONS_DIR)
    .filter((f) => /^\d{3}.*\.sql$/.test(f))
    .sort();

async function main() {
  const client = new pg.Client({ connectionString: url });
  await client.connect();

  // Bootstrap guard: don't try to apply anything until the tracking
  // table exists. Adam pastes 067 by hand for the very first run.
  const { rows: trackingExists } = await client.query(
    `SELECT to_regclass('public._lp_migrations') AS t`,
  );
  if (!trackingExists[0].t) {
    console.error('ERROR: public._lp_migrations does not exist.');
    console.error('       Apply database/migrations/067_lp_migrations_tracking.sql via Supabase SQL Editor first,');
    console.error('       then 068_backfill_lp_migrations.sql, then re-run this script.');
    await client.end();
    process.exit(1);
  }

  const all = listMigrations();
  const { rows: applied } = await client.query(
    `SELECT filename, checksum FROM public._lp_migrations`,
  );
  const appliedMap = new Map(applied.map((r) => [r.filename, r.checksum]));

  const pending = [];
  for (const f of all) {
    const content = readFileSync(join(MIGRATIONS_DIR, f), 'utf8');
    const sum = checksum(content);
    const stored = appliedMap.get(f);
    // 'backfill' is the sentinel inserted by 068 for pre-runner
    // history. We don't know what the file's content was at the
    // time it was applied, so we trust the filename and move on.
    if (stored && stored !== 'backfill' && stored !== sum) {
      console.error(`ERROR: ${f} checksum changed.`);
      console.error(`  Stored: ${stored}`);
      console.error(`  File:   ${sum}`);
      console.error('Refusing to re-apply. Write a new migration that supersedes this one instead.');
      await client.end();
      process.exit(1);
    }
    if (!stored) pending.push({ filename: f, content, checksum: sum });
  }

  console.log(`Found ${all.length} migrations in database/migrations/`);
  console.log(`Found ${applied.length} applied in _lp_migrations`);

  if (pending.length === 0) {
    console.log('No pending migrations.');
    await client.end();
    return;
  }

  console.log(
    `Pending: ${pending.map((p) => p.filename.match(/^\d{3}/)[0]).join(', ')}`,
  );

  if (dryRun) {
    console.log('Dry run. No migrations applied.');
    await client.end();
    return;
  }

  for (const p of pending) {
    process.stdout.write(`Applying ${p.filename} ... `);
    const start = Date.now();
    try {
      await client.query('BEGIN');
      await client.query(p.content);
      await client.query(
        `INSERT INTO public._lp_migrations (filename, checksum, applied_by) VALUES ($1, $2, $3)`,
        [p.filename, p.checksum, process.env.USER ?? 'unknown'],
      );
      await client.query('COMMIT');
      console.log(`✓ (${Date.now() - start}ms)`);
    } catch (e) {
      await client.query('ROLLBACK');
      console.log('✗');
      console.error(`Migration ${p.filename} failed:`);
      console.error(e instanceof Error ? e.message : e);
      await client.end();
      process.exit(1);
    }
  }

  console.log(`Done. ${all.length}/${all.length} migrations applied.`);
  await client.end();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
