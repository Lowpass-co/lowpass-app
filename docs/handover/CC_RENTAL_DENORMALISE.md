# CC Sprint — Denormalise rental_* tables onto workspace_id

> The `rental_inventory`, `rental_jobs`, and `rental_job_items` triplet was originally schemed as user-scoped (`user_id` ownership) with workspace siblings discovered via a join through `workspace_members`. It hasn't fit cleanly into the canonical RLS pattern — every prior RLS audit deferred it. The 2026-04-30 audit and the 2026-05-01 follow-up both flagged it as the next big database hygiene win.
>
> Adam's product call (2026-05-01): denormalise. Add a `workspace_id` column to all three tables, backfill from the user-scope chain, and rewrite RLS to match the canonical pattern (workspace-membership-only on SELECT/INSERT/UPDATE; workspace + admin-gate on DELETE — that follows the canonical entity convention since rental data is destruction-sensitive).
>
> Out of scope: changing the rental_* TypeScript types beyond the new field, adding new product features, touching `gear ↔ rental_inventory` linking (that already works via FK).

---

## 0. Required reading

1. `CLAUDE.md`
2. `docs/handover/SQL_DRIFT_AUDIT_2026_04_30.md` §3 — orphan tables
3. `docs/handover/RLS_AUDIT_DISCOVERY_2026_04_29.md` §1.8 + §3.1 — why this was deferred
4. `docs/handover/AUDIT_2026-05-01.md` §2.2 — the orphan claim
5. `database/migrations/052_gear_canonical.sql` — reference RLS pattern for canonical entity DELETE gate
6. `database/migrations/061_rls_audit.sql` — reference for the workspace-membership SELECT/INSERT/UPDATE pattern
7. `src/app/api/gear/rental-inventory/route.ts` — current workspace_members-based query that this sprint replaces
8. `src/components/equipment/types.ts` — TS shape for rental_inventory / rental_jobs / rental_job_items
9. `src/components/equipment/InventoryModal.tsx`, `JobModal.tsx`, `JobDetail.tsx` — the user-facing surfaces

---

## 1. Hard rules

1. No new dependencies.
2. Five commits in order: M(N) CREATE TABLE for the three tables (orphan capture) → M(N+1) ADD COLUMN workspace_id + backfill → M(N+2) RLS swap to canonical pattern → src/ changes (rewrite the rental-inventory route, update equipment components) → CC report.
3. Pick the next sequential migration number after `main` AND the in-flight branches (currently `feat/product-split-phase3` uses 064; the audit fixup adds 065). Verify with `ls database/migrations/[0-9][0-9][0-9]_*.sql | sort | tail -3`.
4. Idempotent SQL. `CREATE TABLE IF NOT EXISTS`, `ADD COLUMN IF NOT EXISTS`, `DROP POLICY IF EXISTS` then `CREATE POLICY`.
5. Don't drop `workspace_members` from the database in this sprint — even after the rental-inventory route stops using it. Migrate the data away first; deletion is a separate decision.
6. Lint clean (75/120 baseline). Typecheck zero errors. No `any`, no `// @ts-ignore`.
7. Build via `next build --webpack` only.
8. Adam's product locks: rental data is destruction-sensitive (legal documents in rental_jobs, financial in rental_job_items). Apply the canonical-entity DELETE admin gate (`is_workspace_admin()`), not the workspace-membership-only DELETE.
9. Verify before claiming. When reporting done, name specific files and line numbers — especially around the migration backfill.

---

## A. Orphan capture: write CREATE TABLE migrations for all three (~45 min)

The three tables exist in production but have no `CREATE TABLE` statement in any migration. Capture them so a fresh-clone bootstrap reproduces production.

### A.1 Schema introspection

CC: introspect the production schema for each table BEFORE writing the SQL. Use this query (have Adam paste in Supabase SQL Editor):

```sql
SELECT
  c.column_name,
  c.data_type,
  c.is_nullable,
  c.column_default,
  c.character_maximum_length
FROM information_schema.columns c
WHERE c.table_schema = 'public'
  AND c.table_name IN ('rental_inventory', 'rental_jobs', 'rental_job_items')
ORDER BY c.table_name, c.ordinal_position;

-- Indexes:
SELECT t.tablename, i.indexname, i.indexdef
FROM pg_indexes i
JOIN pg_tables t ON t.tablename = i.tablename AND t.schemaname = i.schemaname
WHERE t.schemaname = 'public'
  AND t.tablename IN ('rental_inventory', 'rental_jobs', 'rental_job_items')
ORDER BY t.tablename, i.indexname;

-- Existing RLS policies:
SELECT
  c.relname AS table_name,
  p.polname,
  p.polcmd::text AS operation,
  pg_get_expr(p.polqual, p.polrelid) AS using_clause,
  pg_get_expr(p.polwithcheck, p.polrelid) AS with_check_clause
FROM pg_policy p
JOIN pg_class c ON c.oid = p.polrelid
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public'
  AND c.relname IN ('rental_inventory', 'rental_jobs', 'rental_job_items')
ORDER BY c.relname, p.polcmd, p.polname;
```

Paste the output into the prompt continuation. You will write the CREATE TABLE statements based on that output, NOT based on guessing from TypeScript types.

### A.2 Migration filename

`database/migrations/NNN_rental_tables_orphan_capture.sql`

### A.3 SQL shape

```sql
-- ============================================
-- LOWPASS — rental_* tables orphan capture
-- Migration NNN
--
-- The three rental_* tables exist in production but have no CREATE
-- TABLE statement in any migration. Captured here so a fresh-clone
-- bootstrap reproduces production. Idempotent — re-running against
-- production is a no-op.
--
-- This migration ONLY captures the existing schema. Workspace
-- denormalisation lives in the next migration; RLS swap in the one
-- after that.
--
-- See docs/handover/SQL_DRIFT_AUDIT_2026_04_30.md §3 for context.
-- ============================================

CREATE TABLE IF NOT EXISTS public.rental_inventory (
  -- (paste the introspected columns here, in order)
);

CREATE INDEX IF NOT EXISTS idx_rental_inventory_user_id
  ON public.rental_inventory (user_id);

-- repeat for rental_jobs and rental_job_items
```

### A.4 Acceptance

- [ ] All three CREATE TABLE statements match the introspected production schema column-for-column.
- [ ] All indexes that exist in production are reproduced.
- [ ] No RLS policies in this migration — those come next.
- [ ] Idempotent (`IF NOT EXISTS` everywhere).
- [ ] File header explains why the schema is what it is (user-scoped, will be denormalised in next migration).

### A.5 Commit

```
chore(migrations): NNN — rental_* tables orphan capture

CREATE TABLE migrations for rental_inventory, rental_jobs,
rental_job_items so fresh-clone bootstrap reproduces production.
The three tables existed only as direct-pasted SQL in prod.

Idempotent. Captures current schema as-is — workspace denormalisation
lands in the next migration.

Made-with: Claude Code (rental denormalise sprint)
```

---

## B. Add workspace_id + backfill (~30 min)

### B.1 Filename

`database/migrations/NNN_rental_workspace_denormalise.sql`

### B.2 SQL

```sql
-- ============================================
-- LOWPASS — rental_* workspace denormalisation
-- Migration NNN
--
-- Adds workspace_id to rental_inventory, rental_jobs, rental_job_items
-- and backfills from the user-scope chain so the canonical RLS pattern
-- can apply.
--
-- Backfill walks user_id → profiles.workspace_id. After backfill,
-- workspace_id is set NOT NULL with a FK to workspaces.
-- ============================================

-- 1. Add column (nullable for backfill)
ALTER TABLE public.rental_inventory
  ADD COLUMN IF NOT EXISTS workspace_id UUID
  REFERENCES public.workspaces(id) ON DELETE CASCADE;

ALTER TABLE public.rental_jobs
  ADD COLUMN IF NOT EXISTS workspace_id UUID
  REFERENCES public.workspaces(id) ON DELETE CASCADE;

ALTER TABLE public.rental_job_items
  ADD COLUMN IF NOT EXISTS workspace_id UUID
  REFERENCES public.workspaces(id) ON DELETE CASCADE;

-- 2. Backfill rental_inventory.workspace_id from profiles
UPDATE public.rental_inventory ri
SET workspace_id = p.workspace_id
FROM public.profiles p
WHERE ri.user_id = p.id AND ri.workspace_id IS NULL;

UPDATE public.rental_jobs rj
SET workspace_id = p.workspace_id
FROM public.profiles p
WHERE rj.user_id = p.id AND rj.workspace_id IS NULL;

-- rental_job_items: walk through rental_jobs
UPDATE public.rental_job_items rji
SET workspace_id = rj.workspace_id
FROM public.rental_jobs rj
WHERE rji.job_id = rj.id AND rji.workspace_id IS NULL;

-- 3. Set NOT NULL
ALTER TABLE public.rental_inventory ALTER COLUMN workspace_id SET NOT NULL;
ALTER TABLE public.rental_jobs ALTER COLUMN workspace_id SET NOT NULL;
ALTER TABLE public.rental_job_items ALTER COLUMN workspace_id SET NOT NULL;

-- 4. Indexes for the new RLS pattern
CREATE INDEX IF NOT EXISTS idx_rental_inventory_workspace
  ON public.rental_inventory (workspace_id);
CREATE INDEX IF NOT EXISTS idx_rental_jobs_workspace
  ON public.rental_jobs (workspace_id);
CREATE INDEX IF NOT EXISTS idx_rental_job_items_workspace
  ON public.rental_job_items (workspace_id);

-- Down (commented):
-- DROP INDEX IF EXISTS idx_rental_inventory_workspace;
-- DROP INDEX IF EXISTS idx_rental_jobs_workspace;
-- DROP INDEX IF EXISTS idx_rental_job_items_workspace;
-- ALTER TABLE public.rental_inventory DROP COLUMN IF EXISTS workspace_id;
-- ALTER TABLE public.rental_jobs DROP COLUMN IF EXISTS workspace_id;
-- ALTER TABLE public.rental_job_items DROP COLUMN IF EXISTS workspace_id;
```

### B.3 Acceptance

- [ ] All three tables have `workspace_id` NOT NULL after this migration runs.
- [ ] Every existing row got a workspace_id from the backfill (verify by querying `WHERE workspace_id IS NULL` against each table — should return 0).
- [ ] Idempotent.

### B.4 Commit

```
feat(migrations): NNN — rental_* workspace_id denormalisation

Adds workspace_id NOT NULL FK to rental_inventory, rental_jobs,
rental_job_items. Backfills from user_id → profiles.workspace_id
chain. Indexes for the upcoming canonical RLS pattern.

Pre-merge: Adam pastes this AFTER the orphan capture migration in
Supabase SQL Editor.

Made-with: Claude Code (rental denormalise sprint)
```

---

## C. Swap RLS to canonical pattern (~30 min)

### C.1 Filename

`database/migrations/NNN_rental_rls_canonical.sql`

### C.2 SQL

Mirror the `gear_canonical` pattern from migration 052. Four policies per table:

```sql
-- For each of rental_inventory, rental_jobs, rental_job_items:

-- Drop existing user-scoped policies
DROP POLICY IF EXISTS "rental_inventory_user_select" ON public.rental_inventory;
DROP POLICY IF EXISTS "rental_inventory_user_insert" ON public.rental_inventory;
-- ...etc, named after whatever the introspection in §A.1 surfaced.

-- Canonical pattern: workspace-only S/I/U, workspace + admin D
CREATE POLICY "rental_inventory_select"
  ON public.rental_inventory FOR SELECT
  USING (workspace_id = public.get_my_workspace_id());

CREATE POLICY "rental_inventory_insert"
  ON public.rental_inventory FOR INSERT
  WITH CHECK (workspace_id = public.get_my_workspace_id());

CREATE POLICY "rental_inventory_update"
  ON public.rental_inventory FOR UPDATE
  USING (workspace_id = public.get_my_workspace_id())
  WITH CHECK (workspace_id = public.get_my_workspace_id());

CREATE POLICY "rental_inventory_delete"
  ON public.rental_inventory FOR DELETE
  USING (workspace_id = public.get_my_workspace_id() AND public.is_workspace_admin());

ALTER TABLE public.rental_inventory ENABLE ROW LEVEL SECURITY;

-- Repeat for rental_jobs and rental_job_items.
```

### C.3 Acceptance

- [ ] All three tables have exactly 4 policies (one each S/I/U/D).
- [ ] DELETE policy includes the admin gate; S/I/U do not.
- [ ] Old user-scoped policies are gone.
- [ ] RLS is enabled on each table.
- [ ] Smoke check (Adam, post-paste): create a rental_inventory row, edit it, delete it as admin (works) and as a non-admin workspace member (denies — but allows S/I/U).

### C.4 Commit

```
feat(migrations): NNN — rental_* canonical RLS swap

Replaces the user-scoped RLS pattern with the canonical-entity
4-policy shape (workspace-only on S/I/U; workspace + admin gate on D).
Aligns rental_* with flights, persons, rooms, gear, deal_memos,
expenses.

Drops the old user-scoped policies — workspace_members-based queries
in app code will need updating in the next commit.

Made-with: Claude Code (rental denormalise sprint)
```

---

## D. Rewrite the one workspace_members-based query (~20 min)

### D.1 File

`src/app/api/gear/rental-inventory/route.ts` — currently queries `workspace_members` to find sibling user_ids, then filters `rental_inventory` by `user_id IN (...)`. With workspace_id denormalised, this becomes a direct `workspace_id = ?` filter.

### D.2 Implementation

```ts
// Replace the workspace_members lookup + memberIds filter (lines 32–40 of
// the current file) with a direct workspace_id filter on the inventory
// query.

// Before:
//   const { data: members } = await supabase
//     .from('workspace_members')
//     .select('user_id')
//     .eq('workspace_id', profile.workspace_id);
//   ...
//   .in('user_id', memberIds)

// After:
let inventoryQuery = supabase
  .from('rental_inventory')
  .select('id, user_id, workspace_id, name, category, serial_number, ...')
  .eq('workspace_id', profile.workspace_id)
  .order('name', { ascending: true })
  .limit(limit);
```

### D.3 Verify no other workspace_members callers

CC: `grep -rE "workspace_members" src/ --include="*.ts" --include="*.tsx"` — confirm only the rental-inventory route appears. If anything else turns up, surface in the report.

### D.4 Equipment component changes

Most of `src/components/equipment/*.tsx` reads `user_id` from the rental_inventory rows. After this change they'll also see `workspace_id` in the response. Most won't need changes; check:

- `InventoryModal.tsx` — INSERT path. The new INSERT must include `workspace_id`. Add it to the form submit handler (resolve from profile.workspace_id server-side or pass through).
- `JobModal.tsx` — same for rental_jobs INSERT.
- `JobDetail.tsx` — same for rental_job_items INSERT.

Check existing `.insert(...)` calls in these files and ensure each adds `workspace_id`. The simplest pattern: the API route resolves it from auth and sets it server-side; client never sends it.

### D.5 Acceptance

- [ ] `src/app/api/gear/rental-inventory/route.ts` no longer queries `workspace_members`.
- [ ] All rental_* INSERT paths include `workspace_id` (via API or direct).
- [ ] Lint + typecheck clean.
- [ ] Smoke: create a rental_inventory row, see it in the gear picker, link it to gear, see other workspace members' inventory.

### D.6 Commit

```
refactor(rental): swap workspace_members lookup for workspace_id filter

With workspace_id denormalised onto rental_inventory, the gear picker
endpoint no longer needs the workspace_members JOIN dance — it filters
directly. Removes the only workspace_members caller in the codebase.

INSERT paths in InventoryModal / JobModal / JobDetail updated to
include workspace_id (resolved server-side from auth).

Made-with: Claude Code (rental denormalise sprint)
```

---

## V. Verify (~30 min)

### V.1 SQL smoke (Adam pastes the verification queries)

```sql
-- Every rental row has a workspace_id
SELECT count(*) FROM public.rental_inventory WHERE workspace_id IS NULL; -- expect 0
SELECT count(*) FROM public.rental_jobs WHERE workspace_id IS NULL;       -- expect 0
SELECT count(*) FROM public.rental_job_items WHERE workspace_id IS NULL;  -- expect 0

-- Each table has exactly 4 policies, RLS enabled
SELECT c.relname, count(*)
FROM pg_class c
JOIN pg_policy p ON p.polrelid = c.oid
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public'
  AND c.relname IN ('rental_inventory', 'rental_jobs', 'rental_job_items')
GROUP BY c.relname;
-- Expect: 4, 4, 4

-- DELETE admin gate confirmed on all three
SELECT c.relname, p.polname, pg_get_expr(p.polqual, p.polrelid) AS using_clause
FROM pg_policy p
JOIN pg_class c ON c.oid = p.polrelid
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public'
  AND c.relname IN ('rental_inventory', 'rental_jobs', 'rental_job_items')
  AND p.polcmd = 'd';
-- Each USING clause should include is_workspace_admin()
```

### V.2 Browser smoke (Adam, signed in as workspace admin)

- [ ] /equipment — see rental_inventory rows (workspace siblings included)
- [ ] Add a rental_inventory item — saves, persists across reload
- [ ] Edit it — change a field, save, persist
- [ ] Delete it — succeeds
- [ ] Sign in as a non-admin workspace member (or use Team UI to demote a test account)
- [ ] DELETE on a rental_inventory row should DENY
- [ ] CREATE / UPDATE on rental_inventory still ALLOW

### V.3 No regressions

- [ ] Lint + typecheck clean.
- [ ] `next build --webpack` succeeds.
- [ ] Gear picker still shows "From your rental inventory" with siblings' rows.

---

## When done

```
Rental denormalise done.
Commits: <hashes>
- NNN orphan capture (CREATE TABLE for the triplet)
- NNN+1 workspace_id denormalisation + backfill
- NNN+2 RLS swap to canonical pattern
- src/ rewrites: rental-inventory route + equipment INSERTs

Adam's paste loop (in order):
- NNN orphan capture
- NNN+1 denormalise + backfill
- NNN+2 canonical RLS swap

Smoke:
- All three V.1 SQL queries pass.
- /equipment CRUD works as admin.
- DELETE denies for non-admins; S/I/U still works for them.

workspace_members table is no longer queried in app code. Decision on
dropping it from production deferred (separate cleanup PR).
```

If the V.1 backfill query returns >0 nulls, halt and surface — that means a user_id in rental_* doesn't resolve to a profile, which is a data integrity issue we shouldn't paper over with a backfill default.
