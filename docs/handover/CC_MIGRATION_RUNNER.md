# CC Sprint — Migration runner + tracking table

> Stop the SQL drift bleed. For the last three months every "column not found" / "bucket not found" / "RLS violation" bug has traced back to one root cause: there's no automated migration runner. SQL files in `database/migrations/` are reference-only — Adam has to remember to paste each one into Supabase SQL Editor, in the right order. This sprint builds the smallest possible migration runner that gets the human out of that loop.
>
> Out of scope: switching to Supabase CLI (`supabase db push`), full schema versioning (`sqitch`, `dbmate`, `node-pg-migrate`). All worthwhile, all overkill for what we need today. The goal is a 100-line Node script + a 20-line tracking table + a CI check.

---

## 0. Required reading

1. `CLAUDE.md`
2. `database/migrations/README.md`
3. `docs/handover/SQL_DRIFT_AUDIT_2026_04_30.md` — the full inventory of drift this fixes
4. `docs/handover/CC_MIGRATION_REPO_SYNC.md` — prior pattern for capturing direct-pasted SQL
5. `docs/handover/AUDIT_2026-05-01.md` §2.7 — the "this is the highest-leverage fix" claim
6. `database/migrations/063_budget_receipts_storage.sql` — reference idempotent migration
7. `database/migrations/065_storage_buckets_orphan_capture.sql` — most recent on `main` (or wherever this branch off main lands)
8. `package.json` — see existing scripts shape

---

## 1. Hard rules

1. No new dependencies. The Node runner uses only `pg` (already in devDeps), `fs`, `path`, `crypto`. If Adam has merged the audit fixup PR by the time you run this, `pg` will have been removed — re-add it explicitly in the runner commit, with a comment explaining why.
2. Build via `next build --webpack` only.
3. Lint clean (75/120 baseline as of 2026-05-01). Typecheck zero errors.
4. No `any`, no `// @ts-ignore`.
5. Five commits in order: M067 (tracking table) → M068 (orphan capture for `workspace_members` if needed — see §A) → runner script → backfill data migration → README.
6. Idempotent everywhere. Re-running any migration must be a no-op. Re-running the runner must skip applied migrations.
7. Adam's product locks (do not relitigate): runner is local-only — does NOT modify production. Adam pastes the tracking table SQL by hand, then runs the runner against a Supabase service-role connection string he provides via env var.
8. Verify before claiming. Hard rule from prior CC sprints — when reporting done, name specific files and line numbers.

---

## A. Tracking table migration (~15 min)

### A.1 Number + filename

`database/migrations/067_lp_migrations_tracking.sql` (or whatever the next free number is when you write this — verify against `main` and active branches first).

### A.2 SQL

```sql
-- ============================================
-- LOWPASS — Migration tracking table
-- Migration 067 (or next free)
--
-- Records which database/migrations/*.sql files have been applied.
-- Used by `npm run db:migrate` to diff the directory against this
-- table and apply only the missing files in numeric order.
--
-- Idempotent: CREATE TABLE IF NOT EXISTS, ON CONFLICT DO NOTHING
-- on the bootstrap insert.
-- ============================================

CREATE TABLE IF NOT EXISTS public._lp_migrations (
  filename TEXT PRIMARY KEY,
  checksum TEXT NOT NULL,
  applied_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  applied_by TEXT
);

-- Public read for service role; no other roles need it.
ALTER TABLE public._lp_migrations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "_lp_migrations_service_only" ON public._lp_migrations;
CREATE POLICY "_lp_migrations_service_only"
  ON public._lp_migrations FOR ALL
  USING (false)
  WITH CHECK (false);
-- (Service role bypasses RLS, so the runner can read/write. Anon and
--  authenticated users have no access — there's nothing here they need.)

COMMENT ON TABLE public._lp_migrations IS
  'Records applied migration filenames. Managed by npm run db:migrate. Do not edit by hand.';
```

### A.3 Acceptance

- [ ] File exists at the next sequential migration number.
- [ ] Idempotent (re-running the SQL produces no error).
- [ ] No RLS policy granting access to anon or authenticated — service role only.

### A.4 Commit

```
chore(migrations): NN — _lp_migrations tracking table

Records applied migration filenames + checksums + timestamps so the
runner script can diff the database/migrations/ directory against
production state and apply only the missing files.

Service-role-only RLS — anon and authenticated users have no business
reading or writing this table. Adam: paste this migration into Supabase
SQL Editor before running `npm run db:migrate` for the first time.

Made-with: Claude Code (migration runner sprint)
```

---

## B. Runner script (~90 min)

### B.1 Location + filename

`scripts/db-migrate.mjs` — new file. Top-level `scripts/` directory if it doesn't exist.

### B.2 Behaviour

```
$ npm run db:migrate
Connecting to <SUPABASE_DB_URL host>...
Found 67 migrations in database/migrations/
Found 65 applied in _lp_migrations
Pending: 066, 067
Applying 066_storage_buckets_orphan_capture.sql ... ✓ (4ms)
Applying 067_lp_migrations_tracking.sql ... ✓ (2ms)
Done. 67/67 migrations applied.

$ npm run db:migrate
Connecting to <SUPABASE_DB_URL host>...
Found 67 migrations in database/migrations/
Found 67 applied in _lp_migrations
No pending migrations.
```

Failure modes:

```
$ npm run db:migrate
ERROR: Migration 042_advance_field_renumbering.sql checksum changed.
       Stored:  ab12...
       File:    cd34...
       Refusing to re-apply. If this change is intentional, write a
       new migration that supersedes the old one.
```

### B.3 Implementation sketch

```js
// scripts/db-migrate.mjs
//
// Runs every migration in database/migrations/ in numeric order against
// the database pointed at by DATABASE_URL (or SUPABASE_DB_URL — both
// supported). Skips migrations whose filename is already in
// public._lp_migrations. Refuses to apply a migration whose stored
// checksum differs from the file's current checksum (indicates the file
// was edited after being applied — make a new migration instead).
//
// Usage:
//   DATABASE_URL=postgres://...  npm run db:migrate
//   DATABASE_URL=postgres://...  npm run db:migrate -- --dry-run
//
// Required: pg (devDep). Resolves DATABASE_URL or SUPABASE_DB_URL.

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
    .sort(); // alphabetical sort = numeric sort for zero-padded prefixes
}

async function main() {
  const client = new pg.Client({ connectionString: url });
  await client.connect();

  // Bootstrap: ensure tracking table exists (handles the cold-start case
  // where the runner itself is creating the tracking table for the first
  // time — apply migration 067 manually via SQL Editor first, OR have
  // the runner detect missing _lp_migrations and create it).
  const { rows: trackingExists } = await client.query(
    `SELECT to_regclass('public._lp_migrations') AS t`,
  );
  if (!trackingExists[0].t) {
    console.error(
      'ERROR: public._lp_migrations does not exist. Apply 067_lp_migrations_tracking.sql via Supabase SQL Editor first.',
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
    if (stored && stored !== sum) {
      console.error(
        `ERROR: ${f} checksum changed.\n  Stored: ${stored}\n  File:   ${sum}\nRefusing to re-apply. Write a new migration instead.`,
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
  console.log(`Pending: ${pending.map((p) => p.filename.match(/^\d{3}/)[0]).join(', ')}`);

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
      console.log(`✓ (${Date.now() - start}ms)`);
    } catch (e) {
      await client.query('ROLLBACK');
      console.log(`✗`);
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
```

### B.4 package.json changes

```json
"scripts": {
  ...,
  "db:migrate": "node scripts/db-migrate.mjs",
  "db:migrate:dry-run": "node scripts/db-migrate.mjs -- --dry-run"
},
"devDependencies": {
  ...,
  "pg": "^8.20.0"
}
```

(Re-add `pg` — it was removed in the audit fixup commit because nothing imported it. Now the runner needs it. Comment in the commit message.)

### B.5 Acceptance

- [ ] `scripts/db-migrate.mjs` exists, ESM, no `any`, no `// @ts-ignore` (it's `.mjs` so this is moot, but keep it strict).
- [ ] `npm run db:migrate` works against a Supabase project URL.
- [ ] `npm run db:migrate -- --dry-run` lists pending without applying.
- [ ] Re-running after a successful apply produces "No pending migrations."
- [ ] Editing an applied migration file produces a checksum-mismatch error.
- [ ] Lint + typecheck clean.

### B.6 Commit

```
feat(scripts): db:migrate runner with tracking + checksums

100-line Node script that diffs database/migrations/*.sql against
public._lp_migrations and applies missing files in numeric order
inside a single transaction each. Stops on the first failing
migration; refuses to re-apply a migration whose file content has
changed since it was applied (write a new migration instead).

Re-adds pg to devDependencies (removed in the audit fixup PR
because nothing imported it). Now the runner imports it.

Adam: set DATABASE_URL or SUPABASE_DB_URL to your Supabase project's
service-role connection string before running. Drop the password into
a local .env that's gitignored — never check it in.

Made-with: Claude Code (migration runner sprint)
```

---

## C. Backfill: record every migration that's already in production (~30 min)

The runner refuses to re-apply migrations. So before the first real run, `_lp_migrations` needs to know which files are already in production. Otherwise the runner will try to re-apply 1–67 and every one will error on "table already exists" / "policy already exists" / etc. (Some are idempotent and will succeed; some won't.)

### C.1 Filename

`database/migrations/068_backfill_lp_migrations.sql` (or next free).

### C.2 SQL

```sql
-- ============================================
-- LOWPASS — Backfill _lp_migrations
-- Migration NN
--
-- Records every database/migrations/*.sql file that has already been
-- applied to production by hand, BEFORE the migration runner started
-- tracking. Without this, the runner would re-attempt every migration
-- 001..N and most would error.
--
-- Filenames are hardcoded — this migration is not portable to other
-- environments. That's fine: this is a one-time data migration that
-- captures the current production state.
--
-- Checksums are intentionally placeholders ('backfill') because we
-- don't know what the file content was at the time it was applied.
-- The runner's checksum check is opt-out via the literal value —
-- modify the runner to skip checksum validation when stored = 'backfill'.
--
-- After this migration runs, the runner can take over.
-- ============================================

INSERT INTO public._lp_migrations (filename, checksum, applied_by)
VALUES
  ('001_initial_schema.sql', 'backfill', 'historical'),
  ('002_auto_provisioning.sql', 'backfill', 'historical'),
  -- ... every file in database/migrations/ that's been applied to prod
ON CONFLICT (filename) DO NOTHING;
```

CC: enumerate every `*.sql` file in `database/migrations/` and write the full INSERT. Don't include `068_backfill_lp_migrations.sql` itself (it'll insert its own row when the runner picks it up after this one).

### C.3 Runner change required

Update `scripts/db-migrate.mjs` to skip checksum validation when the stored value is `'backfill'`. One-line change in the loop:

```js
if (stored && stored !== 'backfill' && stored !== sum) { ... error ... }
```

(Add to the same commit as the runner if you can; otherwise as a fix-up commit.)

### C.4 Acceptance

- [ ] `068_backfill_lp_migrations.sql` exists, lists every file in `database/migrations/` except itself.
- [ ] Idempotent (`ON CONFLICT DO NOTHING`).
- [ ] After Adam pastes 067 + 068 in order, `npm run db:migrate -- --dry-run` reports zero pending.
- [ ] Confirms `npm run db:migrate` applies any future-numbered migrations cleanly.

### C.5 Commit

```
chore(migrations): NN — backfill _lp_migrations with applied history

One-time data migration: records every migration that's been applied
to production by hand before the runner existed. Without this, the
runner would re-attempt every old migration on first run.

Stored checksums are 'backfill' because file content has drifted from
what was actually applied. The runner skips checksum validation when
the stored value is 'backfill'.

Made-with: Claude Code (migration runner sprint)
```

---

## D. README + docs (~20 min)

### D.1 Update `database/migrations/README.md`

Replace whatever's there with a runner-aware version that explains:

- New migrations get numbered sequentially after the highest in the directory.
- Idempotency rules (DROP IF EXISTS / IF NOT EXISTS / ON CONFLICT DO NOTHING).
- Down-migration block at the end (commented out).
- File header comment names the migration number, the date, and the reason.
- Run `npm run db:migrate -- --dry-run` before applying to a real database.
- Run `npm run db:migrate` to apply pending migrations.
- Editing an applied migration is forbidden — write a new one instead.

### D.2 Add a section to `CLAUDE.md`

Under "Critical conventions", insert before "Design tokens":

```markdown
### Migrations — runner is now wired

`npm run db:migrate` applies every pending migration in numeric order.
The list of applied migrations lives in `public._lp_migrations`.
Editing an applied migration file is rejected by checksum mismatch —
write a new migration that supersedes it instead.

For new migrations, see `database/migrations/README.md`. The "applied
by hand via Supabase SQL Editor" pattern is retired except for the
runner's own bootstrap (migrations 067 + 068).
```

### D.3 Acceptance

- [ ] `README.md` updated.
- [ ] CLAUDE.md updated.
- [ ] Both files commit cleanly.

### D.4 Commit

```
docs(migrations): document the runner workflow

README + CLAUDE.md updates so any future agent (or person) knows the
runner is the canonical apply path. The "Adam pastes SQL by hand"
workflow is retired.

Made-with: Claude Code (migration runner sprint)
```

---

## V. Verify (~30 min)

### V.1 Local sanity

1. CC's branch is on a fresh feature branch off `main` (e.g. `feat/migration-runner`).
2. `npm install` clean.
3. `npm run lint` — no regressions vs 75/120 baseline.
4. `npm run typecheck` — zero errors (outside any stale `.next/types`).
5. `npm run build` (webpack) — succeeds.

### V.2 Adam-paste loop

CC: stop here and ask Adam to:

1. Paste `067_lp_migrations_tracking.sql` into Supabase SQL Editor → Run.
2. Paste `068_backfill_lp_migrations.sql` into Supabase SQL Editor → Run.
3. Set `DATABASE_URL` in his shell to the Supabase service-role connection string.
4. Run `npm run db:migrate -- --dry-run` — expected: "No pending migrations."

### V.3 Future-migration test

CC: write a one-line test migration like `069_runner_smoke_test.sql`:

```sql
-- Smoke test for the runner. Idempotent no-op.
SELECT 1;
```

Adam runs `npm run db:migrate`. Expected: applies 069 in <100ms, records it in `_lp_migrations`. Then he deletes `069_runner_smoke_test.sql` from the file system AND deletes the row from `_lp_migrations` to clean up.

(Optional — if this feels too risky, skip the smoke test and trust V.2.)

### V.4 No regressions

- [ ] Lint + typecheck clean.
- [ ] `next build --webpack` succeeds.
- [ ] Adam's V.2 dry-run reports zero pending.

---

## When done

```
Migration runner sprint done.
Commits: <hashes>
- 067 _lp_migrations tracking table.
- 068 backfill of every applied migration filename.
- scripts/db-migrate.mjs runner with checksum verification.
- README + CLAUDE.md docs.
- pg re-added to devDependencies for the runner.
- Lint + typecheck clean. Built via next build --webpack.

Adam's paste loop:
- 067 first (tracking table).
- 068 second (backfill).
- Then `npm run db:migrate -- --dry-run` to confirm zero pending.

Future migrations: drop the SQL into database/migrations/, commit, run
the runner. The "paste SQL by hand into Supabase" workflow is retired
except for the runner's own bootstrap.
```

If any phase fails, surface in the report rather than guessing — especially around the checksum-mismatch UX, which is the most likely place to surprise users.
