#!/usr/bin/env node
// scripts/db-migrate.mjs
//
// Runs every migration in database/migrations/ in numeric order against
// the database pointed at by DATABASE_URL (or SUPABASE_DB_URL — both
// supported). Skips migrations whose filename is already in
// public._lp_migrations. Refuses to apply a migration whose stored
// checksum differs from the file's current checksum (indicates the
// file was edited after being applied — write a new migration that
// supersedes the old one instead).
//
// Stored checksum 'backfill' is treated as an opt-out — used by the
// one-time 067_backfill_lp_migrations.sql to record migrations that
// existed in production before the runner did, when we have no record
// of the original file content.
//
// Usage:
//   DATABASE_URL=postgres://...  npm run db:migrate
//   DATABASE_URL=postgres://...  npm run db:migrate -- --dry-run
//
// Required: pg (devDep). Resolves DATABASE_URL or SUPABASE_DB_URL.
// Bootstrap: 066_lp_migrations_tracking.sql + 067_backfill_lp_migrations.sql
// must be applied via Supabase SQL Editor before the first runner run.

import { readdirSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import pg from 'pg';

const __dirname = dirname(fileURLToPath(import.meta.url));
const MIGRATIONS_DIR = join(__dirname, '..', 'database', 'migrations');

const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');

const url = process.env.DATABASE_URL ?? process.env.SUPABASE_DB_URL;
if (!url) {
  console.error('ERROR: DATABASE_URL or SUPABASE_DB_URL must be set.');
  process.exit(1);
}

function checksum(content) {
  return createHash('sha256').update(content).digest('hex').slice(0, 16);
}

function listMigrations() {
  return readdirSync(MIGRATIONS_DIR)
    .filter((f) => /^\d{3}.*\.sql$/.test(f))
    .sort();
}

function hostFromUrl(connectionString) {
  try {
    const u = new URL(connectionString);
    return u.host || '<unparsed>';
  } catch {
    return '<unparsed>';
  }
}

async function main() {
  const client = new pg.Client({ connectionString: url });
  console.log(`Connecting to ${hostFromUrl(url)}...`);
  await client.connect();

  const { rows: trackingExists } = await client.query(
    `SELECT to_regclass('public._lp_migrations') AS t`,
  );
  if (!trackingExists[0].t) {
    console.error(
      'ERROR: public._lp_migrations does not exist. Apply 066_lp_migrations_tracking.sql via Supabase SQL Editor first.',
    );
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

    if (stored && stored !== 'backfill' && stored !== sum) {
      console.error(
        `ERROR: ${f} checksum changed.\n  Stored: ${stored}\n  File:   ${sum}\nRefusing to re-apply. Write a new migration that supersedes it instead.`,
      );
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

  const pendingNumbers = pending
    .map((p) => {
      const m = p.filename.match(/^(\d{3}[a-z]?)/);
      return m ? m[1] : p.filename;
    })
    .join(', ');
  console.log(`Pending: ${pendingNumbers}`);

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
        `INSERT INTO public._lp_migrations (filename, checksum, applied_by)
         VALUES ($1, $2, $3)`,
        [p.filename, p.checksum, process.env.USER ?? 'unknown'],
      );
      await client.query('COMMIT');
      console.log(`OK (${Date.now() - start}ms)`);
    } catch (e) {
      await client.query('ROLLBACK');
      console.log('FAILED');
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
