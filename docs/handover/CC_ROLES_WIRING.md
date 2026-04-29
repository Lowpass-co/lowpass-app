# Roles Infrastructure Wiring

> The `roles` table + `profiles.role_id` were scaffolded in `001_initial_schema.sql` and never wired up. `is_workspace_admin()` (defined in `034_rider_pack_system.sql`) checks `profiles.role_id → roles.is_god` and returns FALSE for everyone because `role_id` is NULL on every profile. RLS gates that depend on it silently lock out legitimate users — the rider_folders bug (fixed in 058) and the advance_templates RLS gap (fixed in 059) were both downstream symptoms. Adam picked Option A: keep the gates, fix the role wire. This prompt does that.

---

## 0. Required reading

1. `CLAUDE.md`
2. `database/migrations/README.md`
3. `database/migrations/001_initial_schema.sql` lines 30-59 — `roles` and `profiles` tables
4. `database/migrations/002_auto_provisioning.sql` — the trigger that creates a profile when a user signs up
5. `database/migrations/034_rider_pack_system.sql` lines 17-35 — `is_workspace_admin()` definition
6. `database/migrations/058_rider_folders_relax_admin_gate.sql` and `059_advance_templates_update_delete_policies.sql` — the symptom fixes that prompted this work
7. `src/app/(app)/settings/page.tsx` — existing settings page; mounts SiteAdminsCard (note: SiteAdmin is a separate concept — Anthropic-internal flag from `@/lib/site-admin` — do not conflate)
8. `src/lib/shell/rails/settingsSections.ts` (or wherever `getSettingsLeftRail` lives) — left-rail section registry; Team needs adding here

---

## 1. Hard rules

1. No new dependencies.
2. All visual values via `var(--lp-…)` tokens.
3. No `any`, no `// @ts-ignore`.
4. Lint clean (75/121 baseline). Typecheck zero errors.
5. Build via `next build --webpack` only.
6. Adam's product decisions, not negotiable:
   - **All existing users with `role_id IS NULL` get Admin** (workspace-wide unblock; he and Ben demote test users via the new UI afterwards).
   - **New users default to Member** (the auto-provisioning trigger assigns Member, not Admin).
   - **UI lives at `/settings/team`** (separate page, not a card on `/settings`).
   - **`is_god` is the only switch for now.** `roles.permissions` JSONB stays empty; granular permissions are a future pass.
7. Three commits, in order: M → U → V.

---

## M. Migration 060 — backfill + auto-provision (~30 min)

### M.1 Migration number

Next sequential after `059_advance_templates_update_delete_policies.sql`. Use `060_roles_wiring.sql`. Verify before writing:

```bash
ls database/migrations/[0-9][0-9][0-9]_*.sql | sort | tail -3
```

### M.2 SQL

```sql
-- ============================================
-- LOWPASS — Roles infrastructure wiring
-- Migration 060
--
-- 001_initial_schema.sql created the roles table and profiles.role_id
-- but never populated either. is_workspace_admin() (defined in 034)
-- checks profiles.role_id → roles.is_god and returns FALSE for every
-- user because role_id is NULL. Every RLS gate that uses
-- is_workspace_admin() silently locks out the legitimate user.
--
-- This migration:
--   1. Ensures every workspace has an "Admin" role (is_god = true)
--      and a "Member" role (is_god = false).
--   2. Backfills role_id on every profile with NULL role_id, giving
--      them the Admin role of their workspace. Adam: this is the
--      "default-unblock" call — you demote test users via the new
--      /settings/team UI after this lands.
--   3. Updates the auto-provisioning trigger so new signups default
--      to Member, not Admin.
--   4. Adds RLS policies on `roles` and updates the profiles UPDATE
--      policy so workspace admins can change other members' role_id.
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

-- 2. Backfill: every NULL-role profile gets their workspace's Admin role
UPDATE public.profiles p
SET role_id = (
  SELECT r.id
  FROM public.roles r
  WHERE r.workspace_id = p.workspace_id AND r.is_god = TRUE
  ORDER BY r.created_at ASC
  LIMIT 1
)
WHERE p.role_id IS NULL AND p.workspace_id IS NOT NULL;

-- 3. Update auto-provisioning: new signups default to Member
-- IMPORTANT — read 002_auto_provisioning.sql first. The trigger function
-- there inserts into profiles when a row is added to auth.users. Update it
-- to also assign role_id = the workspace's Member role at insert time.
-- Pattern (adapt to whatever the existing function actually looks like):
--
--   INSERT INTO public.profiles (id, email, name, workspace_id, role_id)
--   VALUES (
--     NEW.id,
--     NEW.email,
--     COALESCE(NEW.raw_user_meta_data->>'name', ''),
--     <workspace_id resolution>,
--     (SELECT r.id FROM public.roles r
--      WHERE r.workspace_id = <workspace_id resolution>
--        AND r.is_god = FALSE
--        AND r.name = 'Member'
--      ORDER BY r.created_at ASC
--      LIMIT 1)
--   );
--
-- If the existing trigger creates a workspace for a new user (single-tenant
-- bootstrap), make sure that workspace ALSO gets seeded with the Admin +
-- Member roles BEFORE the profile insert references the Member role —
-- otherwise the LIMIT 1 returns NULL and the new user starts role-less.
-- Insert the role-seed step at the same time as the workspace-create step.

-- (CC: replace the comment block above with the actual CREATE OR REPLACE
-- FUNCTION block, mirrored from 002. Don't drop the trigger; CREATE OR
-- REPLACE FUNCTION reuses the existing trigger binding.)

-- 4. RLS on roles + profiles updates
-- 4a. roles table — workspace members can SELECT their workspace's roles.
--     Only admins can INSERT/UPDATE/DELETE roles.
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

-- 4b. profiles table — extend the UPDATE policy so admins can update
--     OTHER members' role_id within their workspace. Read the existing
--     profiles policies first (likely in 004_fix_rls_recursion.sql) and
--     extend rather than replace if a "users can update own profile"
--     policy already exists. The combined effect should be:
--       - Anyone can update their own profile (existing behaviour).
--       - Admins can update any profile in their workspace
--         (specifically role_id, but the policy doesn't restrict columns
--         — column-level restriction lives in the API layer in U.3).
DROP POLICY IF EXISTS "profiles_admin_update" ON public.profiles;
CREATE POLICY "profiles_admin_update"
  ON public.profiles FOR UPDATE
  USING (workspace_id = public.get_my_workspace_id() AND public.is_workspace_admin())
  WITH CHECK (workspace_id = public.get_my_workspace_id() AND public.is_workspace_admin());

-- Down (commented; uncomment to roll back):
-- ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS ...; -- nothing to drop
-- DROP POLICY IF EXISTS "profiles_admin_update" ON public.profiles;
-- DROP POLICY IF EXISTS "roles_admin_write" ON public.roles;
-- DROP POLICY IF EXISTS "roles_select" ON public.roles;
-- (Don't NULL out role_ids on rollback — keep the assignment, just remove
-- the policies. Rolling back the auto-provisioning function requires
-- restoring the prior CREATE OR REPLACE block from 002.)
```

### M.3 Acceptance

- [ ] Every workspace has exactly one Admin role and exactly one Member role with `name = 'Member'`
- [ ] No profile has `role_id IS NULL` after the migration runs (verified via `SELECT COUNT(*) FROM profiles WHERE role_id IS NULL` = 0)
- [ ] `SELECT public.is_workspace_admin()` returns TRUE for Adam's session
- [ ] Auto-provisioning trigger updated; new signup test (use Supabase auth admin to create a fake user) results in a profile whose role is Member
- [ ] `roles` table is RLS-enabled with the two policies above
- [ ] Lint + typecheck still clean (no migration changes affect TS)

### M.4 Commit

```
fix(roles): wire up role infrastructure — backfill + auto-provision

The roles table and profiles.role_id were scaffolded in 001 and never
populated. is_workspace_admin() returned FALSE for every user because
role_id was NULL — every RLS gate that depended on it silently locked
out legitimate users (rider_folders symptom fixed in 058, others latent).

Migration 060:
- Ensures every workspace has Admin (is_god=true) + Member (is_god=false)
  roles, idempotent via NOT EXISTS guards.
- Backfills profiles.role_id for everyone where it's NULL, assigning the
  workspace's Admin role. Per Adam: default-unblock everyone, then demote
  test users via the new /settings/team UI.
- Updates the auto-provisioning trigger from 002 so new signups default
  to Member.
- Adds RLS on the roles table (members can SELECT, admins can write) and
  extends profiles UPDATE so admins can change other members' role_id
  within their workspace.

Adam: apply 060 in Supabase SQL editor after this merges.

Made-with: Claude Code (roles infrastructure wiring)
```

---

## U. Settings → Team page (~90 min)

A new page at `/settings/team` that lists workspace members and lets admins promote/demote.

### U.1 Routing + page shell

Create `src/app/(app)/settings/team/page.tsx`:

- Server Component, async.
- Use `getUserAndAdminStatus()`-style helper to also resolve the user's workspace role (extend `@/lib/site-admin` or create a sibling `@/lib/workspace-admin.ts` — your call). The page should know: current user id, current user is workspace admin.
- Page shell: same `documentSectionsAppPageShell` as `/settings/page.tsx`, with `getSettingsLeftRail('team')` (extend the rail to include a Team entry).
- Header: "Team" + subtitle "Manage workspace members and roles."
- Body: render `<TeamMembersList />` (Server Component that fetches members), passing `currentUserId` and `currentUserIsAdmin` props.

### U.2 Left-rail section registry

Find `getSettingsLeftRail` (likely `src/lib/shell/rails/settingsSections.ts`). Add a Team entry:

```ts
{ key: 'team', label: 'Team', href: '/settings/team', icon: 'users' /* or whatever the rail icon registry expects */ }
```

Confirm with `RailIconKey` registry — icons must be string keys, not LucideIcon refs (server→client serialization).

### U.3 API: promote/demote

New route: `src/app/api/workspace/members/[id]/role/route.ts`

```ts
// PATCH /api/workspace/members/:id/role
// Body: { role: 'admin' | 'member' }
//
// Auth: caller must be workspace admin (is_workspace_admin() via SQL,
// or the new TS helper). Returns 403 otherwise.
//
// Self-protection: caller cannot demote themselves if they are the
// last remaining admin in the workspace. Return 400 with a
// descriptive error.
//
// Body validation: role must be 'admin' or 'member'. Anything else 400.
//
// Implementation:
//   1. Resolve target profile: SELECT FROM profiles WHERE id = params.id
//      AND workspace_id = caller's workspace_id. 404 if not found.
//   2. Resolve target role: SELECT FROM roles WHERE workspace_id = ws_id
//      AND (is_god = TRUE if 'admin' else is_god = FALSE AND name = 'Member')
//      LIMIT 1.
//   3. If demoting (target role is Member) and target.id == caller.id,
//      check admin count: SELECT COUNT(*) FROM profiles p JOIN roles r
//      ON r.id = p.role_id WHERE p.workspace_id = ws_id AND r.is_god = TRUE.
//      If count = 1, return 400.
//   4. UPDATE profiles SET role_id = <resolved> WHERE id = params.id.
//   5. Return updated profile.
```

Use `createServerSupabaseClient` (user session, RLS-respected). The `roles_admin_write` and `profiles_admin_update` policies from M.2 enforce the caller-is-admin check at the DB layer; the API check is belt-and-braces.

### U.4 UI components

Create `src/components/settings/TeamMembersList.tsx` (Server Component):

- Fetches members: `SELECT p.id, p.email, p.name, p.avatar_url, r.name as role_name, r.is_god FROM profiles p LEFT JOIN roles r ON r.id = p.role_id WHERE p.workspace_id = <caller's ws>`.
- Renders each member as a row in a `<DataTable>` (UX05 primitive — `@/components/data-table/DataTable`).
- Columns: avatar + name + email (combined cell with `<EntityChip kind="person" id={...} />` if a person canonical record exists, else plain text), role pill (Admin = brand-orange, Member = muted), actions menu (only visible if `currentUserIsAdmin && member.id !== currentUserId`).
- Actions menu is a Client Component (`<MemberActionsMenu memberId={...} currentRole={...} />`) wired to PATCH `/api/workspace/members/:id/role`. On success: refresh via `router.refresh()`. On error: toast or alert with the API's error message.
- Self-row shows "(you)" instead of the actions menu, with a "You can't change your own role" tooltip.
- Edge case: if the caller is the last remaining admin, the Demote action on themselves would fail at the API; handle this on the client by surfacing the API error rather than pre-checking (the API is source of truth).

Token usage:
- Role pill bg: `color-mix(in srgb, var(--lp-orange) 12%, transparent)` for Admin; `var(--lp-bg-tertiary)` for Member
- Role pill text: `var(--lp-orange)` for Admin; `var(--lp-text-secondary)` for Member

### U.5 Acceptance

- [ ] `/settings/team` page renders for any signed-in user
- [ ] Page lists every member of the caller's workspace with their role
- [ ] Admins see Promote/Demote actions on every other member's row
- [ ] Members (non-admin) see no actions, just the read-only roster
- [ ] Promoting a Member to Admin updates the role pill and persists across reload
- [ ] Demoting an Admin to Member updates and persists
- [ ] Demoting yourself when you're the last Admin returns a clean error message (toast or inline)
- [ ] Settings left-rail shows Team entry; clicking from `/settings` lands on `/settings/team`
- [ ] No lint/type regressions

### U.6 Commit

```
feat(settings): /settings/team page + workspace role management

New page lists workspace members and lets admins promote/demote.
Built on the <DataTable> primitive (UX05) with role pills and an
actions menu gated on caller-is-admin. Self-row shows "(you)" and
no actions; the API rejects last-admin self-demote with a clean
error.

API route at PATCH /api/workspace/members/:id/role does the role
swap (validated against the workspace's Admin/Member roles seeded
by migration 060). Belt-and-braces: caller-is-admin checked both
in the API and at the RLS layer (profiles_admin_update policy
from migration 060).

Settings left-rail extended with a Team entry.

Made-with: Claude Code (roles infrastructure wiring)
```

---

## V. Verify (~15 min)

After M and U merge AND Adam runs migration 060 in Supabase:

### V.1 RLS smoke tests

In the app, signed in as Adam (now Admin):

1. `/rider-packs` — create an artist-scope rider folder (the original 058 symptom). Should succeed. (058 already dropped this gate, but verify nothing regressed.)
2. `/tours/[id]/advance/[routingId]?edit=1` — create a custom advance section, click Save layout. Should succeed (this exercises the at_update policy added in 059).
3. `/personnel/[id]` — try to delete a person record (the at_delete policy on persons_canonical was admin-gated in 050). Should succeed now that you have an Admin role.
4. `/equipment` — try to delete a workspace gear record. Same, should succeed.

### V.2 UI smoke

1. `/settings/team` — see roster. Adam's row shows "(you)" + Admin pill. Ben's row shows actions menu.
2. Demote a test user from Admin to Member. Reload — pill updates.
3. As that demoted user, sign in (use a separate browser profile) — try to delete a workspace gear record. Should now FAIL with an RLS error. This is the gate doing its job.
4. Sign back in as Adam, promote the test user back to Admin. Verify they regain the ability to delete.

### V.3 Last-admin guard

1. As Adam, click Demote on your own row (it shouldn't render — but if it does, that's a bug). Verify no demote action exists for self.
2. If you have only one admin in your workspace and you somehow trigger a demote against yourself via the API directly (curl / Postman), expect a 400 with a clean error message.

If any check fails, fix before declaring done. Then report SHAs to Adam.

---

## When done

```
Roles infrastructure wired.
Commits: <M-sha>, <U-sha>, <V-sha — verification only, no code changes>.
- Migration 060 seeds Admin + Member roles per workspace, backfills
  every NULL role_id to Admin (Adam: demote test users via new UI),
  updates auto-provisioning trigger so new signups default to Member,
  adds RLS on roles table + extends profiles UPDATE for admin role
  changes.
- /settings/team page lists workspace members with role pills and an
  actions menu (gated on caller-is-admin). PATCH
  /api/workspace/members/:id/role does the role swap, with last-admin
  self-demote guard.
- Settings left-rail extended with Team entry.
- RLS smoke tests pass: artist-scope rider folders, advance template
  edits, canonical entity deletes all work for Admin Adam; canonical
  deletes correctly fail for a demoted Member test user.
- Adam: apply 060 in Supabase SQL editor after merge.
```

If anything in M.2's auto-provisioning trigger update is genuinely unclear after reading 002 (it's been edited a few times), surface it explicitly in the report rather than guessing. The trigger function is small and stable but has been the source of one prior bootstrap bug.
