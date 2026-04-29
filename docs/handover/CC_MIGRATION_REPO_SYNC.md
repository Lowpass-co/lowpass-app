# Migration Repo Sync — Capture Direct-SQL Patches as Files

> Over the last three days, we've applied a pile of SQL directly through the Supabase SQL editor without committing matching migration files to the repo. Codebase and live database have drifted. Future agents (and a fresh-clone bootstrap) will produce a database that doesn't match prod. This prompt closes that gap: write the missing migration files so the repo's `database/migrations/` directory matches the live database state.
>
> **Run this prompt BEFORE the RLS audit prompt** (`CC_RLS_AUDIT_MIGRATION.md`). The audit migration is numbered 061 in that prompt; this one fills in 060 first.

---

## 0. Required reading

1. `CLAUDE.md`
2. `database/migrations/README.md` — numbering protocol
3. `database/migrations/058_rider_folders_relax_admin_gate.sql` — already in repo, fine as-is
4. `database/migrations/059_advance_templates_update_delete_policies.sql` — already in repo, fine as-is
5. `docs/handover/CC_ROLES_WIRING.md` — the original prompt for roles infrastructure (Adam pasted simplified SQL directly instead of having you ship it as a file)
6. `database/migrations/002_auto_provisioning.sql` — the trigger that already creates a Tour Manager role per signup; informs why migration 060 is a backfill, not a new schema
7. `database/migrations/036_site_admins.sql` — created `profiles.is_site_admin`; the file Adam pasted to promote himself + Ben never landed as a tracked migration

---

## 1. Hard rules

1. No new dependencies.
2. No `any`, no `// @ts-ignore`.
3. Lint clean (75/121 baseline). Typecheck zero errors.
4. Build via `next build --webpack` only.
5. **Each migration file is idempotent.** Use `INSERT … WHERE NOT EXISTS`, `DROP POLICY IF EXISTS`, `ON CONFLICT DO NOTHING`. Running this migration twice must not error and must not duplicate data.
6. Migration numbering: confirm next-sequential before writing. Should be 060 + 062 (the audit prompt will land as 061 between).
7. Two commits, in order: M060 → M062.

---

## M060. Roles infrastructure backfill (~30 min)

Captures the SQL Adam pasted earlier (the "Block 2 — Migration 060 (roles wiring, simplified)" message) as a tracked migration file.

### M060.1 Migration number + filename

`database/migrations/060_roles_wiring.sql`

Verify before writing:

```bash
ls database/migrations/[0-9][0-9][0-9]_*.sql | sort | tail -3
```

Expected result: `057_…`, `058_…`, `059_…` (with 060 about to be added, 061 reserved for the audit migration).

### M060.2 SQL — copy verbatim from what was pasted

```sql
-- ============================================
-- LOWPASS — Roles infrastructure backfill
-- Migration 060
--
-- 001_initial_schema.sql created the roles table and profiles.role_id
-- but never reliably populated either across the user base. The
-- auto-provisioning trigger from 002 creates a "Tour Manager" role
-- with is_god=TRUE for new signups, but accounts created before that
-- trigger existed (or where the trigger ran but the role assignment
-- got cleared) end up with role_id IS NULL — and is_workspace_admin()
-- returns FALSE for them, silently locking them out of admin-gated
-- operations across the app.
--
-- This migration ensures the roles infrastructure is end-to-end:
--   1. Every workspace has Admin (is_god=TRUE) + Member roles.
--   2. Every profile with NULL role_id is backfilled to its workspace's
--      Admin role (Adam's call: default-unblock everyone, demote test
--      users via the new /settings/team UI).
--   3. RLS on the roles table — workspace members SELECT, only admins
--      can write.
--   4. profiles UPDATE policy extended so admins can change other
--      members' role_id within their workspace (powers the Team UI).
--
-- This migration was applied via direct SQL on YYYY-MM-DD. Recording
-- it as a tracked file so codebase and live database stop drifting.
-- (CC: replace YYYY-MM-DD with the actual date the SQL was first
-- applied — check the conversation history or use today's date if
-- uncertain.)
-- ============================================

-- 1. Ensure Admin + Member roles exist per workspace
INSERT INTO public.roles (workspace_id, name, is_god, permissions)
SELECT w.id, 'Admin', TRUE, '{}'::jsonb
FROM public.workspaces w
WHERE NOT EXISTS (
  SELECT 1 FROM public.roles r
  WHERE r.workspace_id = w.id AND r.is_god = TRUE
);

INSERT INTO public.roles (workspace_id, name, is_god, permissions)
SELECT w.id, 'Member', FALSE, '{}'::jsonb
FROM public.workspaces w
WHERE NOT EXISTS (
  SELECT 1 FROM public.roles r
  WHERE r.workspace_id = w.id AND r.is_god = FALSE AND r.name = 'Member'
);

-- 2. Backfill: every NULL-role profile gets their workspace's earliest
--    is_god=TRUE role (typically Tour Manager from 002, or Admin from
--    step 1).
UPDATE public.profiles p
SET role_id = (
  SELECT r.id
  FROM public.roles r
  WHERE r.workspace_id = p.workspace_id AND r.is_god = TRUE
  ORDER BY r.created_at ASC
  LIMIT 1
)
WHERE p.role_id IS NULL AND p.workspace_id IS NOT NULL;

-- 3. RLS on the roles table
ALTER TABLE public.roles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "roles_select" ON public.roles;
CREATE POLICY "roles_select"
  ON public.roles FOR SELECT
  USING (workspace_id = public.get_my_workspace_id());

DROP POLICY IF EXISTS "roles_admin_write" ON public.roles;
CREATE POLICY "roles_admin_write"
  ON public.roles FOR ALL
  USING (workspace_id = public.get_my_workspace_id() AND public.is_workspace_admin())
  WITH CHECK (workspace_id = public.get_my_workspace_id() AND public.is_workspace_admin());

-- 4. Extend profiles UPDATE so admins can change other members' role_id
DROP POLICY IF EXISTS "profiles_admin_update" ON public.profiles;
CREATE POLICY "profiles_admin_update"
  ON public.profiles FOR UPDATE
  USING (workspace_id = public.get_my_workspace_id() AND public.is_workspace_admin())
  WITH CHECK (workspace_id = public.get_my_workspace_id() AND public.is_workspace_admin());

-- Down (commented; uncomment to roll back manually):
-- DROP POLICY IF EXISTS "profiles_admin_update" ON public.profiles;
-- DROP POLICY IF EXISTS "roles_admin_write" ON public.roles;
-- DROP POLICY IF EXISTS "roles_select" ON public.roles;
-- (Don't NULL out role_ids on rollback — keep the assignment.)
```

### M060.3 Acceptance

- [ ] `database/migrations/060_roles_wiring.sql` exists with the SQL above
- [ ] File header references the conversation context (this prompt + Adam's direct-SQL paste)
- [ ] Running the migration against a fresh database (test against a Supabase branch or local Postgres if available) produces the same end-state as the live production database
- [ ] Lint + typecheck still clean (no migration affects TS)

### M060.4 Commit

```
chore(migrations): write 060_roles_wiring.sql to capture direct-SQL backfill

The roles infrastructure backfill (originally CC_ROLES_WIRING.md) was
pasted directly into Supabase rather than landing as a tracked file.
This commit captures that SQL as 060_roles_wiring.sql so the repo
state matches production.

Backfills profiles.role_id from is_god=TRUE workspace roles (defaulting
every existing user to Admin per Adam's "default-unblock" call), seeds
Admin + Member roles where missing, adds RLS on roles table, extends
profiles UPDATE for admin role changes.

Idempotent: NOT EXISTS guards on inserts, DROP IF EXISTS on policies.

Made-with: Claude Code (migration repo sync)
```

---

## M062. Initial site admins data migration (~10 min)

Adam pasted `UPDATE profiles SET is_site_admin = true WHERE email IN ('adam@lowpass.co', 'ben@lowpass.co')` directly. Capture that as a one-time data migration so a fresh-clone bootstrap promotes them automatically (assuming the same emails are in the seed data — which they aren't outside production, so the migration will be a no-op in any other env, which is correct).

### M062.1 Migration number + filename

`database/migrations/062_initial_site_admins.sql`

Note: 061 is reserved for the RLS audit migration (`CC_RLS_AUDIT_MIGRATION.md`). If you're running this prompt FIRST and the audit hasn't shipped yet, use 061 for this one — but coordinate with the audit prompt's instructions to avoid collision. Confirm by running the next-sequential check.

### M062.2 SQL

```sql
-- ============================================
-- LOWPASS — Initial site admin promotions
-- Migration 062
--
-- 036_site_admins.sql added the profiles.is_site_admin flag for
-- triaging bug reports at /bugs. Adam and Ben were promoted via
-- direct SQL on YYYY-MM-DD; this records that as a tracked
-- migration so the production state is reproducible.
--
-- In non-production environments these emails won't exist, so the
-- UPDATE affects 0 rows — that's the expected behaviour. Site
-- admin promotion in any other environment should happen through
-- a separate process (e.g. seed data or manual SQL by an env owner).
-- ============================================

UPDATE public.profiles
SET is_site_admin = TRUE
WHERE email IN ('adam@lowpass.co', 'ben@lowpass.co')
  AND is_site_admin = FALSE;

-- Down (commented):
-- UPDATE public.profiles
-- SET is_site_admin = FALSE
-- WHERE email IN ('adam@lowpass.co', 'ben@lowpass.co');
```

The `AND is_site_admin = FALSE` clause makes the UPDATE genuinely idempotent — re-running affects 0 rows on the second pass.

### M062.3 Acceptance

- [ ] `database/migrations/062_initial_site_admins.sql` exists with the SQL above
- [ ] Running against production is a no-op (both rows already promoted)
- [ ] Running against a fresh dev/staging environment with these seed emails would promote them; in environments without these emails it's a no-op (0 rows)
- [ ] Lint + typecheck clean

### M062.4 Commit

```
chore(migrations): write 062_initial_site_admins.sql to capture site-admin promotions

Adam and Ben were promoted to site admin (profiles.is_site_admin =
TRUE) via direct SQL during the bug-reports access debugging session.
This commit captures those promotions as a tracked migration so the
production state is reproducible from a clean clone.

Idempotent via AND is_site_admin = FALSE on the UPDATE clause.

In non-production environments without these emails, the UPDATE
affects 0 rows — by design. Site-admin promotion outside production
should be handled by env-specific seed data or manual SQL.

Made-with: Claude Code (migration repo sync)
```

---

## V. Verify (~10 min)

After M060 + M062 land:

### V.1 Repo state

```bash
ls database/migrations/[0-9][0-9][0-9]_*.sql | sort | tail -8
```

Expected: `055_…`, `056_…`, `057_…`, `058_…`, `059_…`, `060_roles_wiring.sql`, `062_initial_site_admins.sql`

(061 is reserved for the audit migration from `CC_RLS_AUDIT_MIGRATION.md` — gap is intentional.)

### V.2 Live database vs repo

The migrations should already match production state — running them is a no-op. Verify by querying live:

```sql
-- Should return TRUE for adam@lowpass.co + ben@lowpass.co
SELECT email, is_site_admin FROM profiles WHERE email IN ('adam@lowpass.co', 'ben@lowpass.co');

-- Should return non-NULL role_ids for everyone
SELECT count(*) FROM profiles WHERE role_id IS NULL;
-- Expected: 0

-- Should return at least one Admin role per workspace
SELECT w.id, count(r.id) FILTER (WHERE r.is_god = TRUE) AS admin_role_count
FROM workspaces w LEFT JOIN roles r ON r.workspace_id = w.id
GROUP BY w.id;
-- Every row should have admin_role_count >= 1
```

If any of these checks fail, the corresponding migration didn't take effect properly — surface that in the report.

---

## When done

```
Migration repo sync done.
Commits: <M060-sha>, <M062-sha>.
- 060_roles_wiring.sql captures the role backfill + roles RLS +
  profiles_admin_update extension that was applied via direct SQL.
- 062_initial_site_admins.sql captures the is_site_admin = TRUE
  promotion for adam@lowpass.co and ben@lowpass.co.
- 061 reserved for the RLS audit migration (next prompt).
- Both migrations idempotent. Both verified no-op against production
  (state already matches).
- Lint + typecheck clean. Built via next build --webpack.
```

If the M062.1 numbering check shows 061 is already taken (audit migration ran first), bump M062 to 063 and update the file/header accordingly.
