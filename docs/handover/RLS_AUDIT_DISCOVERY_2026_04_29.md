# RLS Audit Discovery — 2026-04-29

Companion to migration `061_rls_audit.sql`. Lists every workspace-scoped table in `public`, names its scope-resolution pattern, and records the Treatment the audit applies.

The audit's correctness rule (per `CC_RLS_AUDIT_MIGRATION.md` §1.7):

- **SELECT / INSERT / UPDATE** — workspace-membership only. **No `is_workspace_admin()` checks** on these ops on any table.
- **DELETE** — workspace-membership only, **except** on the six canonical entity tables (`flights`, `persons`, `rooms`, `gear`, `deal_memos`, `expenses`) which retain an admin gate.
- **`roles`** retains admin gating on writes (handled by migration 060).
- **`profiles.is_site_admin`** is out of scope (handled by 036).
- **`bug_reports`** is out of scope (separate site-admin gate).
- **`notifications`** is user-scoped (`user_id = auth.uid()`), not workspace-scoped — out of scope.

This file was generated from migration history (no live DB introspection at write time). Adam should run the queries in §0 against production and paste the output below to confirm before/after parity.

---

## §0. Live-state queries (run in Supabase SQL editor)

```sql
-- 0.1 Tables with workspace_id column (directly scoped)
SELECT table_name FROM information_schema.columns
WHERE table_schema = 'public'
  AND column_name = 'workspace_id'
ORDER BY table_name;

-- 0.2 All tables with RLS enabled
SELECT c.relname AS table_name, c.relrowsecurity AS rls_enabled
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public'
  AND c.relkind = 'r'
  AND c.relrowsecurity = TRUE
ORDER BY c.relname;

-- 0.3 All RLS policies in place
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

**Pre-audit output:** _(Adam pastes here)_

**Post-audit output:** _(Adam pastes here after applying 061)_

---

## §1. Table inventory + Treatment

Treatment column legend:
- **canonical** — SELECT/INSERT/UPDATE workspace-only, DELETE workspace + admin
- **workspace** — all four ops workspace-only (drops any artist-scope / admin gates that crept in)
- **transitive** — workspace gating via parent FK; same shape as `workspace` but the `USING` clause walks the FK chain
- **append-only** — SELECT + INSERT only (audit / export tables; no UPDATE/DELETE policy by design)
- **revoke-pattern** — SELECT + INSERT + UPDATE only (rotation via `revoked_at` flag, no DELETE)
- **out-of-scope** — audit does NOT touch (separate concern)

### 1.1 Direct workspace-scoped tables

| Table | Migration of origin | Current policies | Admin gates? | Treatment |
|---|---|---|---|---|
| `artists` | 001 / 004 / 031 | S, I, U, D | none | **workspace** |
| `tours` | 001 / 004 / 031 | S, I, U, D | none | **workspace** |
| `venues` | 001 / 004 | S, I, U | none | **workspace** (add D if missing) |
| `personnel` | 001 / 004 / 032 | S, I, U, D | none | **workspace** |
| `contacts` | 014 | S, I, U, D | none | **workspace** |
| `advance_templates` | 001 / 011 / 059 | S, I, U, D | none | **workspace + platform-NULL** (SELECT preserves `workspace_id IS NULL OR …` for platform templates) |
| `advance_layout_templates` | 019 | S, I, U, D | none | **workspace** |
| `advance_dropdown_options` | 020 | S, I, U, D | none | **workspace** |
| `advance_schedule_templates` | 021 | S, I, U, D | none | **workspace** |
| `rider_packs` | 034 | S, I, U, D | INSERT/UPDATE/DELETE artist-scope | **workspace** (drop all artist-scope admin gates) |
| `rider_folders` | 039 / 058 | S, I, U, D | DELETE artist-scope (058 dropped INSERT/UPDATE) | **workspace** (drop remaining DELETE admin gate) |
| `rider_assets` | 034 | S, I, U, D | INSERT/UPDATE/DELETE artist-scope | **workspace** (drop all artist-scope admin gates) |
| `mic_library` | 040 | S, I, U, D | none | **workspace + global-NULL** (SELECT preserves `workspace_id IS NULL OR …` for global mic seeds) |
| `budget_line_items` | 017 / 052 | S, I, U, D | none | **workspace** |
| `budget_line_item_attachments` | 017 / 026 | S, I, U, D | none | **workspace** |
| `budget_line_item_notes` | 017 / 024 | S, I, U, D | none | **workspace** |
| `budget_settings` | 017 | S, I, U, D | none | **workspace** |
| `budget_commissions` | 017 | S, I, U, D | none | **workspace** |
| `budget_income` | 017 | S, I, U, D | none | **workspace** |
| `payroll_entries` | 017 / 050 | S, I, U, D | none | **workspace** |
| `personnel_rates` | 017 / 025 | S, I, U, D | none | **workspace** |
| `tour_personnel` | 025 / 050 | S, I, U, D | none | **workspace** |
| `tour_gear` | 052 | S, I, U, D | none | **workspace** |
| `hotels` | 051 | S, I, U, D | none | **workspace** |
| `room_assignments` | 051 | S, I, U, D | none | **workspace** |
| `flight_bookings` | 017 (legacy) | S, I, U, D | none | **workspace** (kept for legacy data; canonical entity is `flights`) |
| `hotel_bookings` | 017 (legacy) | S, I, U, D | none | **workspace** (kept for legacy data; canonical entity is `hotels`) |
| `hotel_room_assignments` | 017 (legacy) | S, I, U, D | none | **workspace** (kept for legacy data) |
| `rooming_grid` | 017 / 050 | S, I, U, D | none | **workspace** |
| `expense_receipts` | 017 | S, I, U, D | none | **workspace** |
| `settlement` | 017 | S, I, U, D | none | **workspace** |

### 1.2 Canonical entity tables — DELETE admin gate retained

| Table | Migration | Treatment |
|---|---|---|
| `flights` | 049 | **canonical** |
| `persons` | 050 | **canonical** |
| `rooms` | 051 | **canonical** |
| `gear` | 052 | **canonical** |
| `deal_memos` | 053 | **canonical** |
| `expenses` | 055 | **canonical** |

### 1.3 Tour-scoped tables (transitive via `tour_id`)

| Table | Migration | Treatment |
|---|---|---|
| `routing` | 001 / 004 / 005 | **transitive** via `tours` |
| `advance_form_configs` | 001 / 004 | **transitive** via `tours` |

### 1.4 Routing-scoped tables (transitive via `routing_id`)

| Table | Migration | Treatment |
|---|---|---|
| `advance_instances` | 001 / 004 | **transitive** via `routing → tours` |

### 1.5 Advance-instance-scoped tables (transitive via `advance_instance_id`)

| Table | Migration | Treatment |
|---|---|---|
| `advance_comments` | 001 / 004 | **transitive** via `advance_instances → routing → tours` |

### 1.6 Pack-scoped tables (transitive via `pack_id`)

| Table | Migration | Treatment | Notes |
|---|---|---|---|
| `rider_sections` | 034 | **transitive** via `rider_packs` (drop artist-scope admin gates) |  |
| `rider_pack_exports` | 034 | **append-only** | No UPDATE/DELETE — audit trail |
| `rider_pack_history` | 034 | **append-only** | No UPDATE/DELETE — 90-day retention via cleanup function |
| `rider_web_links` | 034 | **revoke-pattern** | No DELETE — rotation sets `revoked_at` |
| `channel_list_rows` | 040 | **transitive** via `rider_packs` (drop artist-scope admin gates from 040) |  |
| `sub_snakes` | 040 | **transitive** via `rider_packs` |  |
| `stage_boxes` | 046 | **transitive** via `rider_packs` |  |
| `section_stage_io` | 040 / 043 | **transitive** via `rider_packs` (legacy table; kept for any unmigrated data) |  |

### 1.7 Roles / profiles / workspaces (delicate — handled separately)

| Table | Treatment |
|---|---|
| `roles` | **handled by 060**. Audit re-emits the policies idempotently to ensure they exist on databases where 060 hasn't run yet, but does NOT change their shape (admin gate on write retained per spec). |
| `profiles` | **out-of-scope**. The own-profile policy from 004 and the admin-update policy from 060 stay as-is. Audit re-emits both idempotently. |
| `workspaces` | **out-of-scope**. The own-workspace SELECT from 004 and owner UPDATE policy stay as-is. |

### 1.8 Out of scope

| Table | Why |
|---|---|
| `bug_reports` | Gated on `is_site_admin`, not workspace admin. Separate concern (036). |
| `notifications` | User-scoped (`user_id = auth.uid()`), not workspace-scoped. |
| `storage.objects` (rider-assets, avatars, advance-files, personnel-files, expense-receipts) | Storage bucket policies live on `storage.objects`, not regular tables. Audit only touches `public.*`. Adam: re-audit storage policies separately if drift suspected. |

---

## §2. Post-audit smoke checks

After `061_rls_audit.sql` applies in Supabase, run these.

### 2.1 SQL — every workspace-scoped table has S + I (and U + D where expected)

```sql
SELECT
  c.relname AS table_name,
  count(*) FILTER (WHERE p.polcmd = 'r'::"char") AS select_count,
  count(*) FILTER (WHERE p.polcmd = 'a'::"char") AS insert_count,
  count(*) FILTER (WHERE p.polcmd = 'w'::"char") AS update_count,
  count(*) FILTER (WHERE p.polcmd = 'd'::"char") AS delete_count
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
LEFT JOIN pg_policy p ON p.polrelid = c.oid
WHERE n.nspname = 'public'
  AND c.relkind = 'r'
  AND c.relrowsecurity = TRUE
GROUP BY c.relname
HAVING count(*) FILTER (WHERE p.polcmd = 'r'::"char") = 0
    OR count(*) FILTER (WHERE p.polcmd = 'a'::"char") = 0
ORDER BY c.relname;
```

**Expected:** empty result, OR only intentional exceptions:
- `rider_pack_history` — append-only, no DELETE policy (intentional)
- `rider_pack_exports` — append-only, no UPDATE/DELETE policy (intentional)
- `rider_web_links` — no DELETE policy (revoke-pattern, intentional)

**Result:** _(Adam pastes here)_

### 2.2 SQL — no INSERT/UPDATE references `is_workspace_admin`

```sql
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
```

**Expected:** only `roles_admin_write` (the roles table retains admin gating per 060). Everything else has been relaxed.

**Result:** _(Adam pastes here)_

### 2.3 SQL — DELETE admin gates remaining

```sql
SELECT
  c.relname AS table_name,
  p.polname
FROM pg_policy p
JOIN pg_class c ON c.oid = p.polrelid
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public'
  AND p.polcmd::text = 'd'
  AND pg_get_expr(p.polqual, p.polrelid) ILIKE '%is_workspace_admin%'
ORDER BY c.relname;
```

**Expected:** exactly six rows — `flights_delete`, `persons_delete`, `rooms_delete`, `gear_delete`, `deal_memos_delete`, `expenses_delete`. (Plus the `roles_admin_write` policy if pg returns it under DELETE because it's a `FOR ALL` policy.)

**Result:** _(Adam pastes here)_

### 2.4 Browser smoke (Adam, signed in as a workspace admin)

End-to-end flow that exercises the previously-broken paths. Each step should succeed without the "new row violates row-level security policy" or "row was not deleted" toast.

- [ ] Create an artist-scope rider folder (any artist, "FoH Rider" or whatever)
- [ ] Create a rider pack inside that folder
- [ ] Add a rider section
- [ ] Edit the section (rename + edit a field)
- [ ] Delete the section
- [ ] Delete the pack
- [ ] Delete the folder _(this is the regression check — pre-audit, DELETE admin gate would have allowed this for Adam but blocked it for non-admins; post-audit any workspace member can delete)_
- [ ] Open `/tours/[any]/advance/[any]?mode=edit`, create a custom advance section, save
- [ ] Delete that custom advance section via its X button _(the bug 059 chased)_

If any step fails with an RLS error, the audit missed something — capture the table + operation in a follow-up migration.

### 2.5 Browser smoke (non-admin workspace member)

Optional but valuable: sign in as a non-admin (or use the new `/settings/team` UI from 060 to demote a test account temporarily).

**Should DENY:**
- [ ] DELETE a flight
- [ ] DELETE a person
- [ ] DELETE a room
- [ ] DELETE a gear item
- [ ] DELETE a deal memo
- [ ] DELETE an expense

**Should ALLOW:**
- [ ] Read all tables
- [ ] Create / update / delete tour-internal stuff (routing, advance, channel-list, rider sections, etc.)
- [ ] Create / update flights / persons / rooms / gear / deal memos / expenses (just not delete them)

This confirms the canonical-entity DELETE admin gate is doing its job.

---

## §3. Notes for follow-up

- If query 2.1 surfaces tables with no SELECT or INSERT policy that aren't in §1.8 (out-of-scope), they're new since this discovery and need their own audit pass. Likely culprits: anything added in migrations 062+.
- Storage bucket policies (`rider-assets`, `avatars`, `advance-files`, `personnel-files`, `expense-receipts`) sit on `storage.objects`, not in `public.*`. They were not touched by 061 — re-audit separately if drift suspected.
- `tour_gear` was added in 052 alongside the canonical `gear` table. The treatment for `tour_gear` is `workspace` (regular RLS) — it's a tour-scoped link table, not a destructive workspace-wide operation surface.
