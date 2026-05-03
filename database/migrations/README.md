# Lowpass Database Migrations

Sequential, append-only migration files. Apply via `npm run db:migrate`.

## Workflow

```bash
# See what would run, no writes:
DATABASE_URL=postgres://... npm run db:migrate -- --dry-run

# Actually apply pending migrations:
DATABASE_URL=postgres://... npm run db:migrate
```

The runner (`scripts/db-migrate.mjs`) diffs `database/migrations/[0-9][0-9][0-9]*.sql`
against `public._lp_migrations` and applies the missing files in numeric
order, each in its own transaction. Stops on the first failure with a
ROLLBACK + the offending migration's error message.

`DATABASE_URL` (or `SUPABASE_DB_URL`) must be a service-role connection
string — the RLS policy on `_lp_migrations` denies anon and authenticated.
Drop it into a gitignored `.env` and never commit it.

### First-time bootstrap

The runner needs the tracking table to exist before it'll do anything.
For the very first run on a database (and only the first):

1. Paste `067_lp_migrations_tracking.sql` into Supabase SQL Editor → Run.
2. Paste `068_backfill_lp_migrations.sql` into Supabase SQL Editor → Run.
3. `npm run db:migrate -- --dry-run` should report **No pending migrations.**

After bootstrap, future migrations land in this directory and the runner
picks them up. The "paste SQL by hand" workflow is retired.

## Authoring a new migration

1. **Pick the next free number.** Audit across `main` and every active
   feature branch — never collide.
   ```bash
   ls database/migrations/[0-9][0-9][0-9]_*.sql | sort | tail -1
   git fetch
   for b in $(git branch -r | grep -v HEAD); do
     git ls-tree -r "$b" database/migrations/ 2>/dev/null \
       | awk '{print $4}' \
       | grep -E "^database/migrations/[0-9]{3}_" \
       | sort | tail -1
   done
   ```
   Pick a number HIGHER than every result. Better to leave a gap than collide.

2. **Lowercase, snake_case file names.** `052_gear_canonical.sql` — number,
   underscore, descriptive snake_case, `.sql`.

3. **Header comment in every migration:**
   ```sql
   -- ============================================
   -- LOWPASS — <one line summary>
   -- Migration NNN
   -- YYYY-MM-DD
   --
   -- <why this migration exists in 1–3 sentences>
   -- ============================================
   ```
   Keep the migration number in the header in sync with the filename.

4. **Idempotent where possible.** `CREATE TABLE IF NOT EXISTS`, `ADD COLUMN
   IF NOT EXISTS`, `DROP POLICY IF EXISTS` followed by `CREATE POLICY`,
   `ON CONFLICT DO NOTHING` for seed inserts. Lets the same migration
   apply on partially-converged schemas without crashing.

5. **Use existing RLS helpers.** `public.get_my_workspace_id()` and
   `public.is_workspace_admin()` are defined in early migrations. Don't
   reinvent them inline.

6. **Down migration block at the end**, commented out with `--`. Future
   operators should be able to invert the change.

7. **Back-fill carefully.** Back-fill steps must be safe to re-run
   (idempotent) and must not delete existing data.

8. **Dry-run first.** `npm run db:migrate -- --dry-run` should list your
   new file as the only pending one.

## Editing an applied migration is forbidden

The runner stores a checksum of every applied migration. Editing the file
after it's been applied produces:

```
ERROR: 042_advance_field_renumbering.sql checksum changed.
  Stored: ab12...
  File:   cd34...
Refusing to re-apply. Write a new migration that supersedes this one instead.
```

If you need to change something a previous migration did — write a new
migration with a higher number that does the change.

The literal string `'backfill'` is reserved as the sentinel for migration
068's pre-runner history rows. The runner skips checksum validation when
it sees that value.

## Real-world precedent: don't repeat these mistakes

This repo has hit migration-number collisions twice during the UX overhaul:

- **First collision:** UX09/UX10/UX11 numbered their migrations 033/034/035 —
  but those numbers were already on main as `033_bug_reports.sql`,
  `034_rider_pack_system.sql`, `035_bug_reports_reconcile.sql`. Renumbered to
  049/050/051.
- **Second collision:** UX12 numbered its migration 048 — but
  `048_bugs_2026_04_26_pending_testing.sql` was already on main. Renumbered
  to 052.

Both happened because the feature branch was cut from a stale base and didn't
check `main`'s numbering before picking a number. The runner's checksum check
plus this README's audit instructions exist so the third collision doesn't
happen.

## Cross-reference list

Data-model docs that reference specific migrations:

- `docs/data-model/flights.md` → `049_flight_canonical.sql`
- `docs/data-model/persons.md` → `050_person_canonical.sql`
- `docs/data-model/rooms.md` → (mentions table names; doesn't pin a number)
- `docs/data-model/deal-memos.md` → `053_deal_memos.sql`

When you renumber a migration, **update its data-model doc and the header
comment inside the migration file.**
