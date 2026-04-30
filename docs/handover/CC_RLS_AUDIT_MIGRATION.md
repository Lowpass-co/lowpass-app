# RLS Audit Migration — Stop the Whack-a-Mole

> Over the last week we've patched RLS policies on `advance_templates`, `rider_folders`, `rider_packs`, `rider_sections`, `rider_assets` — each one a missing-or-wrong-policy bug discovered the same way: a Supabase write succeeds with no error but the row never exists, or a `.insert(...).select()` chain fails because INSERT passes but SELECT denies. The pattern is unambiguous: across the migration history, workspace-scoped tables shipped with incomplete or wrongly-gated RLS policies. We've been fixing them one table at a time. **This migration ends that.** A single comprehensive audit that brings every workspace-scoped table to the same canonical 4-policy shape.
>
> **Run this AFTER `CC_MIGRATION_REPO_SYNC.md`** so 060 lands first. This prompt produces 061.

---

## 0. Required reading

Read these in order. The audit migration's correctness depends on understanding each table's original intent:

1. `CLAUDE.md`
2. `database/migrations/README.md`
3. `database/migrations/001_initial_schema.sql` — workspaces, profiles, artists, tours, venues, personnel, routing, advance_templates, advance_form_configs, advance_instances, advance_comments
4. `database/migrations/004_fix_rls_recursion.sql` — `get_my_workspace_id()` definition + early policies
5. `database/migrations/011_advance_system_enhancements.sql` — advance_templates SELECT/INSERT (UPDATE/DELETE were missing until 059)
6. `database/migrations/034_rider_pack_system.sql` — rider_packs / rider_sections / rider_assets / rider_pack_exports / rider_pack_history / rider_web_links / `is_workspace_admin()` definition
7. `database/migrations/036_site_admins.sql` — `profiles.is_site_admin` (separate from workspace admin; do NOT touch in this migration)
8. `database/migrations/039_rider_folders.sql` — rider_folders four-policy set
9. `database/migrations/040_channel_list.sql` + `043_channel_list_reorder_and_stage_io.sql` + `046_channel_list_routing.sql` — channel_list_rows policies
10. `database/migrations/049_flight_canonical.sql` through `055_expenses_canonical.sql` — canonical entities
11. `database/migrations/058_rider_folders_relax_admin_gate.sql` and `059_advance_templates_update_delete_policies.sql` — the two ad-hoc patches that landed properly
12. `docs/handover/CC_MIGRATION_REPO_SYNC.md` (this prompt's prerequisite) — establishes 060 as roles wiring

---

## 1. Hard rules

1. No new dependencies.
2. No `any`, no `// @ts-ignore`.
3. Lint clean (75/121 baseline). Typecheck zero errors.
4. Build via `next build --webpack` only.
5. **The migration file is fully idempotent.** Every policy creation goes through `DROP POLICY IF EXISTS` then `CREATE POLICY`. Running it twice must not error and must produce the same end-state.
6. Migration numbering: confirm `061` is next-sequential after 060. If `CC_MIGRATION_REPO_SYNC.md` hasn't run yet and 060 is unfilled, this prompt MUST run after that one. Don't claim 060.
7. Adam's product locks (do not relitigate):
   - **Workspace membership is the gate on SELECT/INSERT/UPDATE everywhere.** No `is_workspace_admin()` checks on those operations on any table.
   - **DELETE keeps an admin gate ONLY on canonical entity workspace-wide tables**: `flights`, `persons`, `rooms`, `gear`, `deal_memos`, `expenses`. These are destructive operations on shared workspace records — admin protection makes sense.
   - **Everything else (rider system, advance, channel_list, etc.) gets workspace-membership-only DELETE.** Routine editing surfaces shouldn't require admin to clean up.
   - The `roles` table itself keeps admin gating on writes (set up in 060) — admins manage other admins, not random members.
   - `profiles.is_site_admin` is OUT OF SCOPE for this migration — that's a separate concern handled by 036 and the bug-reports gate.
8. Single commit. The whole audit lands as one migration file + one verification report.

---

## A. Phase 1 — Discovery (~30 min, read-only)

Before writing any SQL, CC produces an audit report. Goal: enumerate every workspace-scoped table, note its current policy state, and call out gaps.

### A.1 Enumerate workspace-scoped tables

Run this query against the live database (via Supabase's SQL editor, or use the Supabase MCP / supabase-js if you have credentialed access — otherwise paste the SQL into a comment block in your discovery report and have Adam run it):

```sql
-- Tables with workspace_id column (directly scoped)
SELECT table_name FROM information_schema.columns
WHERE table_schema = 'public'
  AND column_name = 'workspace_id'
ORDER BY table_name;

-- Tables with RLS enabled (might be transitively scoped)
SELECT c.relname AS table_name, c.relrowsecurity AS rls_enabled
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public'
  AND c.relkind = 'r'
  AND c.relrowsecurity = TRUE
ORDER BY c.relname;

-- All RLS policies currently in place
SELECT
  c.relname AS table_name,
  p.polname,
  p.polcmd::text AS operation,
  p.polpermissive,
  pg_get_expr(p.polqual, p.polrelid) AS using_clause,
  pg_get_expr(p.polwithcheck, p.polrelid) AS with_check_clause
FROM pg_policy p
JOIN pg_class c ON c.oid = p.polrelid
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public'
ORDER BY c.relname, p.polcmd, p.polname;
```

If you can't run those directly, write them into a `/* RUN THIS IN SUPABASE FIRST */` comment block at the top of your discovery report and ask Adam to paste the output back.

### A.2 Cross-reference with migration history

For each table identified, note:
- Which migration introduced it (grep `CREATE TABLE IF NOT EXISTS <name>` in `database/migrations/`)
- Whether it has all four policies (SELECT/INSERT/UPDATE/DELETE) currently in pg_policy
- Whether any policy references `is_workspace_admin()` (grep the policy text)
- The workspace-resolution pattern (direct `workspace_id = get_my_workspace_id()` vs subquery via parent FK)

### A.3 Produce the discovery report

Write a markdown table to `docs/handover/RLS_AUDIT_DISCOVERY_2026_04_29.md` (use today's actual date). Columns:

| Table | Migration of origin | Policies present | Admin gates? | Workspace pattern | Treatment |
|---|---|---|---|---|---|
| advance_templates | 001 / 011 / 059 | S,I,U,D | none (cleaned in 059) | direct | keep as-is |
| rider_folders | 039 / 058 / patches | S,I,U,D | DELETE artist-scope | direct | drop DELETE admin gate (Adam's "default-relax" stance) |
| rider_packs | 034 / patches | S,I,U,D | INSERT/UPDATE/DELETE artist-scope | direct | drop all admin gates |
| rider_sections | 034 / patches | needs SELECT verification | INSERT/UPDATE/DELETE via subquery | parent FK (rider_packs) | drop admin gates |
| ... | ... | ... | ... | ... | ... |

Treatment column values: `keep as-is`, `drop INSERT admin gate`, `drop DELETE admin gate`, `add missing X policy`, etc.

Special category — **canonical entity tables** (`flights`, `persons`, `rooms`, `gear`, `deal_memos`, `expenses`): treatment is "drop INSERT/UPDATE admin gate, keep DELETE admin gate".

The discovery report is the contract for what the migration does. Adam reviews it before you write the SQL. Don't skip this step.

---

## B. Phase 2 — Write `061_rls_audit.sql` (~2 hrs)

Once the discovery report is approved (or you've made the canonical decision based on the rules in §1.7), produce the migration file.

### B.1 Filename + structure

`database/migrations/061_rls_audit.sql`

Structure (use comment headers between sections):

```
-- ============================================
-- LOWPASS — RLS audit migration
-- Migration 061
--
-- [extended preamble explaining the why — copy from this prompt's
--  intro + the discovery report's findings]
-- ============================================

-- §1. Direct-workspace-scoped tables (workspace_id column)
-- §2. Tour-scoped tables (transitive via tour_id)
-- §3. Routing-scoped tables (transitive via routing_id)
-- §4. Rider-pack-scoped tables (transitive via pack_id)
-- §5. Advance-instance-scoped tables (transitive via advance_instance_id)
-- §6. Canonical entity tables — DELETE admin gate retained
-- §7. Roles + profiles (touched in 060; verify only)

-- (each section: per-table block of DROP POLICY IF EXISTS + CREATE POLICY
--  for all 4 ops, with brief inline comment naming the table's parent
--  scope)
```

### B.2 Per-table policy template

For directly workspace-scoped tables (most cases):

```sql
-- <table>: <one-line description>
ALTER TABLE public.<table> ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "<table>_select" ON public.<table>;
CREATE POLICY "<table>_select"
  ON public.<table> FOR SELECT
  USING (workspace_id = public.get_my_workspace_id());

DROP POLICY IF EXISTS "<table>_insert" ON public.<table>;
CREATE POLICY "<table>_insert"
  ON public.<table> FOR INSERT
  WITH CHECK (workspace_id = public.get_my_workspace_id());

DROP POLICY IF EXISTS "<table>_update" ON public.<table>;
CREATE POLICY "<table>_update"
  ON public.<table> FOR UPDATE
  USING (workspace_id = public.get_my_workspace_id())
  WITH CHECK (workspace_id = public.get_my_workspace_id());

DROP POLICY IF EXISTS "<table>_delete" ON public.<table>;
CREATE POLICY "<table>_delete"
  ON public.<table> FOR DELETE
  USING (workspace_id = public.get_my_workspace_id());
```

For canonical entity tables (DELETE admin gate retained):

```sql
DROP POLICY IF EXISTS "<table>_delete" ON public.<table>;
CREATE POLICY "<table>_delete"
  ON public.<table> FOR DELETE
  USING (
    workspace_id = public.get_my_workspace_id() AND
    public.is_workspace_admin()
  );
```

For transitively workspace-scoped tables, use the parent table's workspace as the gate. Example for `rider_sections`:

```sql
DROP POLICY IF EXISTS "rider_sections_select" ON public.rider_sections;
CREATE POLICY "rider_sections_select"
  ON public.rider_sections FOR SELECT
  USING (
    pack_id IN (
      SELECT id FROM public.rider_packs
      WHERE workspace_id = public.get_my_workspace_id()
    )
  );
-- (and so on for INSERT/UPDATE/DELETE)
```

### B.3 Special cases to handle explicitly

- **`advance_templates`** — has BOTH workspace-scoped rows (workspace_id IS NOT NULL) AND platform-wide rows (workspace_id IS NULL). The original 011 SELECT policy reads `workspace_id IS NULL OR workspace_id = get_my_workspace_id()`. **Preserve this pattern.** Don't break platform template visibility.
- **`profiles`** — has its own primary-key-based update policy from 004 (users can update own profile) AND the admin-update extension from 060. Don't replace either; this audit ENSURES they exist if they don't, otherwise leaves them.
- **`roles`** — set up in 060. Verify the policies are present; recreate them if missing using the same admin-write pattern from 060.
- **`bug_reports`** — gated on `is_site_admin`, not workspace admin. Out of scope; do NOT touch.
- **`notifications`** — user-scoped (`user_id = auth.uid()`), not workspace-scoped in the same way. Verify but don't restructure.
- **Storage bucket policies** (`rider_assets_storage_*` from 034) — these live on `storage.objects` not regular tables. Out of scope for this migration unless the discovery report specifically flags them as broken.

### B.4 Acceptance

- [ ] `database/migrations/061_rls_audit.sql` exists
- [ ] Every workspace-scoped table identified in the discovery report has explicit DROP/CREATE for all four policies
- [ ] No INSERT or UPDATE policy references `is_workspace_admin()` (grep the file: `grep is_workspace_admin database/migrations/061_rls_audit.sql` should only return matches in DELETE policies on canonical entity tables, plus the roles/profiles admin-write policy)
- [ ] Canonical entity tables (`flights`, `persons`, `rooms`, `gear`, `deal_memos`, `expenses`) DELETE policies retain the admin gate
- [ ] `advance_templates` SELECT preserves the `workspace_id IS NULL OR ...` pattern for platform templates
- [ ] Migration runs cleanly twice in a row (idempotent)
- [ ] Pre/post diff: run the pg_policy enumeration query before AND after, capture both, include the diff in the discovery report's "After audit" section
- [ ] Lint + typecheck clean (no migration affects TS but verify nothing else broke)

### B.5 Smoke verification

After applying the migration in Supabase, Adam should run these checks. Bake them into the bottom of the discovery report as a "Post-audit smoke" section so they don't get lost:

```sql
-- Check 1: Every workspace-scoped table has 4 policies (or 3 for tables intentionally
-- missing one — like history/audit tables that don't allow UPDATE/DELETE).
SELECT
  c.relname AS table_name,
  count(*) FILTER (WHERE p.polcmd = 'r'::char) AS select_count,
  count(*) FILTER (WHERE p.polcmd = 'a'::char) AS insert_count,
  count(*) FILTER (WHERE p.polcmd = 'w'::char) AS update_count,
  count(*) FILTER (WHERE p.polcmd = 'd'::char) AS delete_count
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
LEFT JOIN pg_policy p ON p.polrelid = c.oid
WHERE n.nspname = 'public'
  AND c.relkind = 'r'
  AND c.relrowsecurity = TRUE
GROUP BY c.relname
HAVING count(*) FILTER (WHERE p.polcmd = 'r'::char) = 0
    OR count(*) FILTER (WHERE p.polcmd = 'a'::char) = 0
ORDER BY c.relname;
-- Expected: empty result (or only intentional exceptions like
-- rider_pack_history / rider_pack_exports which are append-only).

-- Check 2: No INSERT/UPDATE policy references is_workspace_admin (admin gate
-- should be on DELETE only, on canonical entities only, plus the roles table).
SELECT
  c.relname AS table_name,
  p.polname,
  p.polcmd::text
FROM pg_policy p
JOIN pg_class c ON c.oid = p.polrelid
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public'
  AND p.polcmd::text IN ('a', 'w')
  AND (
    pg_get_expr(p.polqual, p.polrelid) ILIKE '%is_workspace_admin%'
    OR pg_get_expr(p.polwithcheck, p.polrelid) ILIKE '%is_workspace_admin%'
  )
ORDER BY c.relname;
-- Expected: only roles_admin_write (everything else has been relaxed).

-- Check 3: Smoke test — Adam manually creates an artist-scope rider folder + pack
-- + section. Should succeed without RLS errors. (Browser test, not SQL.)
```

### B.6 Commit

```
fix(migrations): 061_rls_audit — comprehensive RLS policy sweep

Brings every workspace-scoped table to the canonical 4-policy shape.
Workspace membership is the gate on SELECT/INSERT/UPDATE across the
entire codebase; admin gates remain ONLY on DELETE for canonical
entities (flights, persons, rooms, gear, deal_memos, expenses) and
on the roles table itself.

Closes the recurring "missing SELECT after .insert(...).select()"
class of bug that's hit advance_templates (059), rider_folders
(058 + post-058 patches), rider_packs, rider_sections, rider_assets
over the last week. Discovery report at
docs/handover/RLS_AUDIT_DISCOVERY_<date>.md documents the before/
after state per table.

Idempotent: every CREATE POLICY preceded by DROP POLICY IF EXISTS.
advance_templates SELECT preserves the platform-template (workspace_id
IS NULL) visibility pattern from 011.

Adam: apply 061 in Supabase SQL editor after this merges, then run
the post-audit smoke checks at the bottom of the discovery report.

Made-with: Claude Code (RLS audit migration)
```

---

## V. Verify (~30 min)

After M061 applies in Supabase:

### V.1 Run the post-audit smoke SQL

The three queries from §B.5. Capture results in the discovery report's "Post-audit smoke" section.

### V.2 Functional smoke (Adam, browser)

Run through these end-to-end as Adam (workspace admin):

1. Create an artist-scope rider folder (Good Neighbours / FoH Rider). Should succeed.
2. Create a rider pack inside that folder. Should succeed.
3. Add a rider section ("Hospitality" or whatever). Should succeed.
4. Edit the section. Should succeed.
5. Delete the section. Should succeed.
6. Delete the pack. Should succeed.
7. Delete the folder. Should succeed (admin gate on rider_folders DELETE was dropped per §1.7).
8. Open `/tours/[any]/advance/[any]?edit=1`, create a custom advance section, save. Should succeed.
9. Delete the custom advance section via the X button. Should succeed (the bug we chased through 059).

If any step fails with an RLS error, the audit missed something — add the table + policy to a follow-up migration.

### V.3 As a non-admin user (if there's a test account)

If you have access to a non-admin workspace account (or set one up via `/settings/team` once the role infrastructure is solid):

1. They should NOT be able to delete a workspace flight / person / room / gear / deal memo / expense (RLS denies)
2. They SHOULD be able to do everything else within the workspace (read/create/update/delete tour-internal stuff, riders, advance, etc.)

This confirms the canonical entity DELETE admin gate is doing its job.

---

## When done

```
RLS audit migration done.
Commit: <061-sha>.
- 061_rls_audit.sql ensures every workspace-scoped table has the
  canonical 4-policy shape (S/I/U/D), with workspace-membership-only
  gating on S/I/U everywhere and DELETE admin gating retained ONLY
  on canonical entities (flights, persons, rooms, gear, deal_memos,
  expenses) and on the roles table itself.
- Discovery report at docs/handover/RLS_AUDIT_DISCOVERY_<date>.md
  documents the per-table before/after state.
- Smoke checks (3 SQL queries + 9 browser flows) recorded in the
  discovery report's Post-audit section.
- Adam: apply 061 in Supabase, then re-run the smoke checks.
- Lint + typecheck clean. Built via next build --webpack.
```

If the discovery phase turns up tables or patterns that don't fit cleanly into the per-table treatment rules in §1.7, surface them in the discovery report rather than guessing — Adam decides per-case before you write the SQL for those.
