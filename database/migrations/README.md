# Lowpass Database Migrations

Sequential, append-only migration files. Apply in numeric order.

## Numbering rule (read this every time you add a migration)

**Always pick the next sequential number after the highest existing migration on `main`.**

```bash
# Find the highest migration number
ls database/migrations/[0-9][0-9][0-9]_*.sql | sort | tail -1
# → e.g. 048_bugs_2026_04_26_pending_testing.sql
# Therefore your new migration MUST start with 049_
```

Rules:

1. **No collisions.** Two migrations with the same number break the runner. If you're working on a branch, fetch `main` first and base your number on `main`'s highest, not your branch's.
2. **No gaps unless intentional.** Skip-numbering is fine when reserving space (e.g. `050_*` pulled from a parallel feature) but document why in the migration header.
3. **Lowercase, snake_case file names.** `049_flight_canonical.sql` — number, underscore, descriptive snake_case, `.sql`.
4. **Header comment in every migration:**
   ```sql
   -- ============================================
   -- LOWPASS — <one line summary>
   -- Migration NNN
   -- ============================================
   ```
   Keep the migration number in the header in sync with the filename.
5. **Idempotent where possible.** Use `CREATE TABLE IF NOT EXISTS`, `ADD COLUMN IF NOT EXISTS`, `CREATE POLICY IF NOT EXISTS` (when supported), and `ON CONFLICT DO NOTHING` for seed inserts. Lets the same migration apply on partially-converged schemas without crashing.
6. **Use existing RLS helpers.** `public.get_my_workspace_id()` and `public.is_workspace_admin()` are defined in early migrations. Don't reinvent them inline.
7. **Down migration block at the end of every file**, commented out with `--`. Future operators should be able to invert the change.
8. **Backfill carefully.** Back-fill steps must be safe to re-run (idempotent) and must not delete existing data.

## When working with branches

If your feature branch was cut before another branch landed migrations, your numbering is stale. Before opening a PR:

```bash
git fetch origin main
ls database/migrations/[0-9][0-9][0-9]_*.sql | sort | tail -5
# Compare against origin/main:
git ls-tree origin/main database/migrations/ | tail -5
# If your numbers collide with main's, RENUMBER your files before merging.
```

This was a real bug — UX09/UX10/UX11's original 033/034/035 collided with `033_bug_reports.sql`, `034_rider_pack_system.sql`, `035_bug_reports_reconcile.sql`. Renumbered to 049/050/051. See `fix/migration-renumber` branch history.

## Cross-reference list

Data-model docs that reference specific migrations:

- `docs/data-model/flights.md` → `049_flight_canonical.sql`
- `docs/data-model/persons.md` → `050_person_canonical.sql`
- `docs/data-model/rooms.md` → (mentions table names; doesn't pin a number)

When you renumber a migration, **update its data-model doc and any header comment inside the migration file.**
