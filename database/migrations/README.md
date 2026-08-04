# Lowpass Database Migrations

Sequential, append-only migration files. Apply via `npm run db:migrate`.

## The runner (canonical apply path)

`scripts/db-migrate.mjs`, exposed as `npm run db:migrate`. It:

1. Reads every `database/migrations/*.sql` file matching `^\d{3}.*\.sql$` in numeric order.
2. Reads `public._lp_migrations` to see what's already applied.
3. Verifies stored checksums match current file content. If a stored checksum differs from the file, the runner aborts — editing an applied migration is forbidden. Write a new migration that supersedes it instead.
4. Applies each pending migration inside its own transaction. On failure, the transaction rolls back and the runner exits non-zero. Subsequent re-runs pick up where the failure happened.

```bash
# Apply all pending migrations:
DATABASE_URL=postgres://...service-role-creds... npm run db:migrate

# List pending without applying:
DATABASE_URL=postgres://... npm run db:migrate:dry-run
```

`SUPABASE_DB_URL` is accepted as a fallback for `DATABASE_URL`. Use the **service-role** connection string — anon and authenticated roles cannot read or write `_lp_migrations`. Drop the password into a local `.env` that's gitignored; never check it in.

### Bootstrap (one time, before the first runner run)

The runner depends on `public._lp_migrations`, which is itself defined by a migration. Chicken and egg. Adam:

1. Paste `066_lp_migrations_tracking.sql` into the Supabase SQL Editor → Run.
2. Paste `067_backfill_lp_migrations.sql` → Run. Records every migration that was applied to production by hand before the runner existed.
3. `npm run db:migrate:dry-run` should report `No pending migrations.`

After that, the runner takes over.

### Failure modes

- **`ERROR: public._lp_migrations does not exist`** — bootstrap not done yet. Paste 066 + 067 first.
- **`ERROR: ${file} checksum changed`** — someone edited a migration file that's already been applied. Restore the file from git (`git restore`) and write a NEW migration with the desired change.
- **Migration SQL throws inside the transaction** — runner rolls back, exits non-zero, prints the Postgres error. Fix the SQL and re-run; the failed migration won't have been recorded so the runner picks it up again.

## Numbering rule (read this every time you add a migration)

**Always pick the next sequential number after the highest existing migration on `main` AND on every active feature branch you might be merging with.**

```bash
# Highest on local branch
ls database/migrations/[0-9][0-9][0-9]_*.sql | sort | tail -1

# Highest on main (verify against remote)
git fetch origin main
git ls-tree origin/main database/migrations/ | grep -E "[0-9]{3}_" | sort | tail -3

# Highest across all remote branches you might converge with
for b in $(git branch -r | grep -v HEAD); do
  echo "=== $b ==="
  git ls-tree -r "$b" database/migrations/ 2>/dev/null | grep -E "[0-9]{3}_" | sort | tail -1
done
```

Pick a number HIGHER than every result. Better to leave a gap than collide.

Rules:

1. **No collisions.** Two migrations with the same number break the runner. If you're working on a feature branch, fetch `main` and any sibling feature branches first. Pick a number above all of them.
2. **No gaps unless intentional.** Skip-numbering is fine when reserving space (e.g. `055_*` pulled from a parallel feature) — document why in the migration header.
3. **Lowercase, snake_case file names.** `052_gear_canonical.sql` — number, underscore, descriptive snake_case, `.sql`.
4. **Header comment in every migration:**
   ```sql
   -- ============================================
   -- LOWPASS — <one line summary>
   -- Migration NNN
   -- ============================================
   ```
   Keep the migration number in the header in sync with the filename.
5. **Idempotent where possible.** Use `CREATE TABLE IF NOT EXISTS`, `ADD COLUMN IF NOT EXISTS`, `DROP POLICY IF EXISTS` + `CREATE POLICY`, and `ON CONFLICT DO NOTHING` for seed inserts. Lets the same migration apply on partially-converged schemas without crashing.
6. **Use existing RLS helpers.** `public.get_my_workspace_id()` and `public.is_workspace_admin()` are defined in early migrations. Don't reinvent them inline.
7. **Down migration block at the end of every file**, commented out with `--`. Future operators should be able to invert the change.
8. **Backfill carefully.** Back-fill steps must be safe to re-run (idempotent) and must not delete existing data.
9. **Once applied, never edit.** The runner enforces this via checksums. Make a new migration that supersedes the change instead.
10. **Dry-run before applying to anything you care about.** `npm run db:migrate:dry-run` lists pending without applying.

## Write policies carry a role predicate (P0-C convention)

P0 found this the expensive way: route code did authentication + tenancy and
left ROLE to RLS, but RLS only encodes role on the nine tables migration 079
strict-gated. Every table added since was workspace-scoped at both layers and
role-scoped at neither — so a readonly member created an artist and it
persisted.

Workspace scoping is not authorization. `get_my_workspace_id()` answers *which
tenant*, never *may this person write*. A policy that checks only the first is
a policy that lets every member of the tenant write.

**Any new table's write policies (INSERT / UPDATE / DELETE) must carry a role
predicate**, not workspace scope alone:

```sql
-- Wrong — every member of the workspace may write, readonly included.
CREATE POLICY foo_write ON public.foo FOR ALL
  USING (workspace_id = public.get_my_workspace_id());

-- Right — tenancy AND role.
CREATE POLICY foo_write ON public.foo FOR ALL
  USING (workspace_id = public.get_my_workspace_id() AND public.is_workspace_admin())
  WITH CHECK (workspace_id = public.get_my_workspace_id() AND public.is_workspace_admin());
```

`WITH CHECK` as well as `USING` — `USING` alone filters what an UPDATE can see,
and leaves INSERT wide open.

**The migration header must state who may write**, in words, e.g.:

```sql
-- WRITE: admin + manager (is_workspace_admin). Readonly members may SELECT only.
-- WRITE: the owning user only (auth.uid() = user_id) — self-scoped, not role-gated.
```

Not decoration. `is_workspace_admin()` is used in ~135 places whose intended
meaning has drifted apart (P0-D exists to reconcile it), and the header is what
tells the next reader which meaning THIS table wanted.

Where a table is genuinely self-scoped — a profile row, an avatar, a preference
— say so in the header and predicate on `auth.uid()`. That is a real answer, and
it is the reason those routes are permanently exempt from the P0-C route
ratchet (`src/lib/auth/route-guard-coverage.test.tsx`).

**A route guard is not a substitute for a policy.** `requireWrite()` protects
the endpoint you remembered; RLS protects the table. Anything reachable by a
service-role client, a second route, or the SQL editor goes around the route
entirely. Write both.

## Real-world precedent: don't repeat these mistakes

This repo has hit migration-number collisions twice during the UX overhaul:

- **First collision:** UX09/UX10/UX11 numbered their migrations 033/034/035 — but those numbers were already on main as `033_bug_reports.sql`, `034_rider_pack_system.sql`, `035_bug_reports_reconcile.sql`. Renumbered to 049/050/051.
- **Second collision:** UX12 numbered its migration 048 — but `048_bugs_2026_04_26_pending_testing.sql` was already on main. Renumbered to 052.

Both happened because the feature branch was cut from a stale base and didn't check `main`'s numbering before picking a number. The runner's checksum check doesn't catch this — it only catches edits to files already in the tracking table. Pre-merge, fetch main and grep `database/migrations/` on every active branch before picking a number.

## Cross-reference list

Data-model docs that reference specific migrations:

- `docs/data-model/flights.md` → `049_flight_canonical.sql`
- `docs/data-model/persons.md` → `050_person_canonical.sql`
- `docs/data-model/rooms.md` → (mentions table names; doesn't pin a number)
- `docs/data-model/deal-memos.md` → `053_deal_memos.sql`

When you renumber a migration, **update its data-model doc and the header comment inside the migration file.**
