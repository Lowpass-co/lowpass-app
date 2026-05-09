# CC Sprint 9 — Permissions foundation + Operations migration (Routing + Personnel)

The biggest sprint yet. Two intertwined goals:

**A. Multi-user foundation** — schema, RLS, members management UI, real-time sync infrastructure. Lays the architectural seam every subsequent feature builds on.

**B. Operations Phase 4 migration (first two pages)** — Routing (RoutingGrid into the new shell) and Personnel (assignment workflow, conflict detection, crew-side view). Personnel directly addresses Adam's content-creator pain point.

These ship in one sprint because they're load-bearing for each other: Operations pages need permissions baked in from day one, and the foundation is hard to validate without real surfaces consuming it.

**Branch off `main`** (after 8.1+8.2+8.3+8.4+8.5 are merged). Six phases + V verify. ~3-4 days CC time.

---

## 0. Required reading

Foundation context:
- `CLAUDE.md`
- `docs/handover/CC_SPRINT_08_5_FIXES.md` for the most recent architectural state
- `database/migrations/` — find existing `workspace_members` schema (direct-pasted in production per CLAUDE.md), `tours`, `artists`, `personnel` tables
- `src/lib/site-admin.ts` — existing role/admin-gating pattern (`getUserAndAdminStatus()`)
- All existing RLS policies use `public.get_my_workspace_id()` and `public.is_workspace_admin()` helpers — extend, don't replace
- `src/contexts/ArtistTourContext.tsx` — workspace-level state; will gain a workspace switcher concept

Operations context:
- `src/components/routing/RoutingGrid.tsx` — already built; Routing page wraps it in the new shell
- `src/app/(app)/operations/[tourId]/personnel/page.tsx` — current placeholder
- `src/app/(app)/operations/[tourId]/routing/page.tsx` — current placeholder
- `docs/data-model/persons.md` and `personnel.md` — entity schema docs (per CLAUDE.md, both `persons` and `personnel` tables exist; canonical entity registry has `person`)
- Adam's Sprint 9 spec answers (in chat above) — read all 15 answers before starting

---

## 1. Hard rules

1. No new dependencies.
2. No `any`, no `// @ts-ignore`.
3. Lint baseline 75 errors / 120 warnings. Strict hold.
4. Typecheck zero.
5. Build via `next build --webpack` only.
6. Six commits in numeric order: 1 → 2 → 3 → 4 → 5 → 6.
7. Verify before claiming. Quote post-fix file:line.
8. **Mockup sign-off required on Phase 3 (members management UI), Phase 5 (Routing page integration), Phase 6 (Personnel page UX).**
9. **Diagnosis sign-off required on Phase 1 (schema design — role enum + tag system + audit_log shape) and Phase 2 (RLS pattern — tag-based vs role-based vs both).**
10. **Phase 4 (real-time sync infra) ships continuously** — mechanical setup, no UX decisions.
11. **Batch the sign-off requests:** Ship Phase 1+2 schema/RLS first as a wave; post diagnosis for both before any code. Then Phase 3+4 wave; mockup sign-off on Phase 3 only. Then Phase 5+6 wave; mockup sign-off on both.
12. Halt criteria: data corruption, build break, lint exceeded, structural assumption wrong with no graceful fallback.

---

## 2. Phase 1 — Schema foundation (~3 hr)

### 2.1 Goal

Lay schema for: roles, tags, multi-workspace membership, audit log, personnel-as-user linking. All idempotent migrations.

### 2.2 Diagnosis required (post to chat for sign-off)

Read the existing schema. For each of the following, identify what's there and what's needed:

**A. workspace_members:**
- Confirm columns: `id`, `user_id`, `workspace_id`, `role` (does it exist?), `created_at`.
- Per CLAUDE.md, this table is direct-pasted in production with no migration. Sprint 9 should formalize via migration AND add `role` if missing.
- Adam's spec: Admin / Manager / Read-only with sub-types via tags.
- **Decision needed:** role enum values exact spelling. Recommend `'admin' | 'manager' | 'readonly'`. Workspace owner is a flag on top of admin (`is_workspace_owner BOOLEAN`).

**B. workspace_member_tags:**
- New table. Each row: `member_id` FK, `tag_name TEXT`, `workspace_id` FK (denormalized for RLS speed), `created_at`.
- Unique index on (member_id, tag_name).
- Tags created on-the-fly by admin in members UI. No separate `tags` table — tag values are free-form strings scoped to workspace.

**C. permission_grants:**
- New table for granular page-level permissions per Adam's spec ("give my assistant access to receipts, rooming, payroll but not line items").
- Schema: `workspace_id` FK, `subject_type ENUM('user', 'tag')`, `subject_id` (user_id OR tag_name), `resource_type ENUM('page', 'product')`, `resource_id TEXT` (e.g. 'budget.receipts', 'budget.line_items', 'operations.personnel'), `permission ENUM('read', 'write')`.
- This is the granularity layer.

**D. audit_log:**
- New table. Schema: `id`, `workspace_id` FK, `actor_user_id` (nullable for system events), `action TEXT` (e.g. 'created', 'updated', 'deleted'), `entity_type TEXT` (e.g. 'tour', 'budget_line_item', 'personnel_assignment'), `entity_id UUID`, `field_changes JSONB` (old/new values for changed fields), `created_at`.
- Indexes on (workspace_id, created_at DESC) and (entity_type, entity_id, created_at DESC).
- Adam's spec: full audit if storage permits, summarized in inline labels and dedicated audit page later.

**E. personnel.user_id (nullable):**
- Personnel records can optionally link to a Lowpass user account.
- Migration adds `personnel.user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL`.
- One personnel record can map to one user. One user can be tied to multiple personnel records (across workspaces).

**E2. Canonical persons via sibling table (PRE-SPRINT VERIFICATION COMPLETE):**

Pre-sprint Supabase queries confirmed:
- `persons` table EXISTS but workspace-scoped (has `workspace_id NOT NULL`).
- `persons` columns: id, workspace_id, full_name, preferred_name, pronouns, email, phone, emergency_contact, passport_*, date_of_birth, dietary, notes, audit columns.
- `personnel.person_id` already exists (FK presumably to persons).

Migrating `persons` to platform-shared in-place is risky — would require deduplication, RLS rewrites, FK chain updates. Use the sibling-table pattern instead.

**Sibling table approach:**

```sql
-- New platform-shared table (no workspace_id)
CREATE TABLE IF NOT EXISTS public.canonical_persons (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT,
  phone TEXT,
  display_name TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
-- Email is UNIQUE when present; allows multiple rows with NULL email.
CREATE UNIQUE INDEX IF NOT EXISTS canonical_persons_email_unique
  ON public.canonical_persons (email) WHERE email IS NOT NULL;

-- Each workspace's persons row optionally links to canonical
ALTER TABLE public.persons
  ADD COLUMN IF NOT EXISTS canonical_person_id UUID
    REFERENCES public.canonical_persons(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS persons_canonical_idx
  ON public.persons (canonical_person_id) WHERE canonical_person_id IS NOT NULL;
```

**RLS on canonical_persons:**
- SELECT: allowed if user has any `personnel` record whose `person.canonical_person_id` matches (i.e. they've worked with someone linked to this canonical person), OR if they're a workspace admin/manager.
- INSERT: allowed for any authenticated user (creating personnel implicitly creates canonical entries).
- UPDATE / DELETE: admin/manager only, AND only for canonical rows referenced by their workspace's persons.

**RLS on persons.canonical_person_id (existing persons table):**
- Existing workspace-scoped RLS preserved (no change).
- Update permission required to set/change canonical_person_id (sensitive-info warning when linking — exposes cross-workspace conflict visibility).

**E3. Personnel creation/edit dedupe flow:**

When a manager creates or edits a personnel record:
1. Form captures name + email + optional phone (existing flow — no UI change yet).
2. Server-side after persons row write: if `email` is non-null, search `canonical_persons WHERE email = ?`. Match found → set `persons.canonical_person_id = matched_id`. No match → create new `canonical_persons` row → set `persons.canonical_person_id = new_id`.
3. **Sensitive-info warning** when match found across a workspace boundary: "John Smith (john@example.com) is also in workspace X. Linking enables cross-workspace conflict detection — they'll see scheduling overlaps but no private data." User confirms or skips linking.
4. Admin can manually link/unlink via Personnel manage slide-over: "Link to canonical person" search field that searches existing canonical_persons by email or display_name.

For phone-only matches (email missing both sides): defer phone matching to future sprint. Email is the v1 dedupe key.

**Backfill — explicit out-of-scope:**

Existing persons rows have `canonical_person_id = NULL`. Sprint 9 does NOT auto-link existing rows. A future sprint can run a one-off migration that groups existing persons by email and creates canonical_persons rows. Until that runs, cross-workspace detection only works for newly-created or manually-linked persons.

This is acceptable v1: it preserves existing behavior, ships the full canonical pattern, and leaves the dedupe migration for a focused sprint.

**F. confirmation status:**
- Adam's spec: auto-confirmed by default, with manual states for tentative/awaiting/cancelled/fired.
- Add to existing `personnel_tour_assignments` (or equivalent — verify table name): `status ENUM('confirmed', 'tentative', 'awaiting_contract', 'cancelled', 'fired') DEFAULT 'confirmed'`.

**Diagnosis post format:**

```
Phase 1 schema diagnosis:
- workspace_members current state: <columns + presence of role>
- workspace_member_tags: confirm new table needed; tag_name as freeform vs separate tags table?
- permission_grants: confirm shape; alternative simpler model considered?
- audit_log: confirm shape; partition strategy if heavy writes anticipated?
- personnel.user_id: confirm column doesn't exist; FK target auth.users vs profiles?
- personnel assignment status: confirm enum values vs text; existing column?
- Migration count: <single migration vs split per-table>
- Idempotency strategy: <ADD COLUMN IF NOT EXISTS, etc>
```

Wait for Adam's sign-off.

### 2.3 Migration shape (subject to diagnosis)

Single migration `070_permissions_foundation.sql` (verify next number) covering all changes:

```sql
-- 1. workspace_members.role
ALTER TABLE public.workspace_members
  ADD COLUMN IF NOT EXISTS role TEXT NOT NULL DEFAULT 'admin' 
    CHECK (role IN ('admin', 'manager', 'readonly'));
ALTER TABLE public.workspace_members
  ADD COLUMN IF NOT EXISTS is_workspace_owner BOOLEAN NOT NULL DEFAULT false;

-- 2. workspace_member_tags
CREATE TABLE IF NOT EXISTS public.workspace_member_tags (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  member_id UUID NOT NULL REFERENCES public.workspace_members(id) ON DELETE CASCADE,
  tag_name TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (member_id, tag_name)
);
CREATE INDEX IF NOT EXISTS workspace_member_tags_workspace_idx 
  ON public.workspace_member_tags (workspace_id);

-- 3. permission_grants
CREATE TABLE IF NOT EXISTS public.permission_grants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  subject_type TEXT NOT NULL CHECK (subject_type IN ('user', 'tag')),
  subject_id TEXT NOT NULL,  -- user_id::text OR tag_name
  resource_type TEXT NOT NULL CHECK (resource_type IN ('page', 'product')),
  resource_id TEXT NOT NULL, -- e.g. 'budget.receipts', 'operations.personnel'
  permission TEXT NOT NULL CHECK (permission IN ('read', 'write')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS permission_grants_workspace_idx 
  ON public.permission_grants (workspace_id);
CREATE INDEX IF NOT EXISTS permission_grants_subject_idx 
  ON public.permission_grants (subject_type, subject_id);

-- 4. audit_log
CREATE TABLE IF NOT EXISTS public.audit_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  actor_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  action TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id UUID,
  field_changes JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS audit_log_workspace_time_idx 
  ON public.audit_log (workspace_id, created_at DESC);
CREATE INDEX IF NOT EXISTS audit_log_entity_idx 
  ON public.audit_log (entity_type, entity_id, created_at DESC);

-- 5. personnel.user_id (only if column doesn't exist)
ALTER TABLE public.personnel
  ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS personnel_user_id_idx 
  ON public.personnel (user_id) WHERE user_id IS NOT NULL;

-- 6. personnel_tour_assignments.status
ALTER TABLE public.personnel_tour_assignments
  ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'confirmed'
    CHECK (status IN ('confirmed', 'tentative', 'awaiting_contract', 'cancelled', 'fired'));

-- Down migration commented at the end.
```

### 2.4 Acceptance

- [ ] Migration applies idempotently. Re-running is a no-op.
- [ ] All new tables/columns visible in Supabase Studio after migration.
- [ ] `_lp_migrations` records the migration as applied.
- [ ] No existing data altered destructively. Default values populate correctly for existing rows.
- [ ] Lint + typecheck clean (no app changes in this phase).

### 2.5 Quote in report

- The full migration file.
- Diagnosis sign-off timestamp.

### 2.6 Commit

`feat(db): permissions foundation schema (Sprint 9 §1 — roles, tags, grants, audit_log, personnel.user_id)`

---

## 3. Phase 2 — RLS policies (~3 hr)

### 3.1 Goal

Update RLS policies on every workspace-scoped table to enforce role + tag + grant logic. Role gating sits ABOVE tag/grant gating: admins see everything; managers see most things; readonly users see only what their tags + grants allow.

### 3.2 Diagnosis required (post to chat for sign-off)

Audit the existing RLS pattern:
- `public.get_my_workspace_id()` — returns the caller's workspace. Multi-workspace? Confirm whether this returns ONE workspace (current model) or all (needs change for multi-workspace).
- `public.is_workspace_admin()` — returns boolean. Define new helpers: `public.get_my_role()`, `public.has_permission(resource_type, resource_id, permission)`, `public.has_tag(tag_name)`.

For each existing table with RLS, propose how policies update. Pattern:
- Admin: full access (existing `is_workspace_admin()` check)
- Manager: full access to most tables (decide which tables are admin-only — probably workspace_members, permission_grants, billing-related)
- Readonly: requires explicit grant via permission_grants OR tag membership

For the granular case Adam mentioned ("assistant gets receipts but not line items"):
- `budget_line_items` SELECT requires `has_permission('page', 'budget.line_items', 'read')` if role is readonly.
- `expense_receipts` SELECT requires `has_permission('page', 'budget.receipts', 'read')` if role is readonly.

This is a LOT of policy work. The diagnosis should propose:
- A helper function `public.can_access(resource_type, resource_id, permission)` that bundles role + tag + grant logic. Tables call this in their policies.
- A canonical resource_id naming convention (e.g. 'budget.line_items', 'operations.personnel.list', 'operations.personnel.compensation').
- Which tables get the strict treatment vs which trust workspace membership.

**Diagnosis post format:**

```
Phase 2 RLS diagnosis:
- get_my_workspace_id(): single vs multi-workspace today; change strategy if multi
- New helpers: get_my_role(), has_permission(), has_tag(), can_access()
- Resource ID convention: <list of resource IDs we'll use>
- Tables getting strict role+grant gating: <list>
- Tables trusting workspace membership: <list>
- Multi-workspace switching: how does the user pick "which workspace am I currently acting as"? URL param? user_preferences column?
```

Wait for Adam's sign-off.

### 3.3 Implementation

Migration `071_permissions_rls_helpers.sql` (idempotent):
- Create helper functions: `get_my_role()`, `has_permission()`, `has_tag()`, `can_access()`.
- Update RLS policies on every workspace-scoped table to call `can_access()` for readonly users; admins/managers fall through.

Multi-workspace switching: 
- Adam's spec says one user can be in multiple workspaces. Currently `get_my_workspace_id()` likely returns one. For Sprint 9, propose:
  - Add `user_preferences.active_workspace_id` (or similar) to track which workspace the user is currently acting as.
  - Update `get_my_workspace_id()` to return `auth.jwt()->>'active_workspace_id'` OR the user_preferences value.
  - Workspace switcher UI in Phase 3 sets this.

### 3.4 Acceptance

- [ ] Migration applies cleanly.
- [ ] Helper functions usable in policies AND in app code (via Supabase's `rpc()`).
- [ ] Existing RLS still works for admins (they fall through to existing checks).
- [ ] Readonly users with no grants/tags see NOTHING (empty queries).
- [ ] Readonly users with explicit grants see only granted resources.
- [ ] Tag-based grants apply correctly (user with 'crew' tag and grant on 'crew' tag for 'operations.personnel.read' can see personnel page).
- [ ] Multi-workspace switching works: user can change active_workspace_id, queries return data for that workspace.
- [ ] Lint + typecheck clean (mostly DB; minimal app changes).

### 3.5 Quote in report

- Helper function definitions (verbatim).
- Sample RLS policy update (one table, one policy).
- Multi-workspace switching mechanism.
- Diagnosis sign-off timestamp.

### 3.6 Commit

`feat(db): permissions RLS helpers + policy updates (Sprint 9 §2)`

---

## 4. Phase 3 — Workspace settings → members management UI (~4 hr)

### 4.1 Goal

A new page/slide-over where workspace admins manage members: invite by email, set role, assign tags, grant permissions, remove. Also: the workspace switcher UI for users in multiple workspaces.

### 4.2 Mockup required (post to chat for sign-off)

```
WORKSPACE SETTINGS → MEMBERS

┌──────────────────────────────────────────────────────────────────────┐
│  WORKSPACE                                                            │
│  Lowpass Music                                          [Edit name]  │
├──────────────────────────────────────────────────────────────────────┤
│  MEMBERS · 6                                          [+ INVITE]      │
│                                                                       │
│  ┌────────────────────────────────────────────────────────────────┐ │
│  │ [avatar] Adam Rowley · adam@lowpass.co                          │ │
│  │          OWNER · Admin role · all permissions                   │ │
│  │          Tags: —                                                │ │
│  │                                                  [Manage]       │ │
│  ├────────────────────────────────────────────────────────────────┤ │
│  │ [avatar] Joe Manager · joe@lowpass.co                           │ │
│  │          Manager role                                            │ │
│  │          Tags: management                                        │ │
│  │                                                  [Manage]       │ │
│  ├────────────────────────────────────────────────────────────────┤ │
│  │ [avatar] Crew Member · crew@example.com                         │ │
│  │          Read-only role                                          │ │
│  │          Tags: crew, content                                    │ │
│  │          Granted: operations.personnel.read,                    │ │
│  │                   advance.read                                  │ │
│  │                                                  [Manage]       │ │
│  └────────────────────────────────────────────────────────────────┘ │
└──────────────────────────────────────────────────────────────────────┘

Per-member [Manage] opens a slide-over:

┌────────────────────────────────────────────────┐
│  MANAGE MEMBER                            [×]  │
├────────────────────────────────────────────────┤
│  Crew Member                                    │
│  crew@example.com                               │
├────────────────────────────────────────────────┤
│  ROLE                                           │
│  ( ) Admin    ( ) Manager    (•) Read-only      │
│                                                 │
│  TAGS                                           │
│  [crew] [content] [+ add tag]                  │
│                                                 │
│  PERMISSIONS                                    │
│  ┌────────────────────────────────────────┐   │
│  │  PAGE                    READ    WRITE  │   │
│  │  Operations / Personnel  [✓]    [ ]   │   │
│  │  Operations / Routing    [ ]    [ ]   │   │
│  │  Budget / Line items     [ ]    [ ]   │   │
│  │  Budget / Receipts       [✓]    [✓]  │   │
│  │  Budget / Payroll        [ ]    [ ]   │   │
│  │  Advance                 [✓]    [ ]   │   │
│  │  ...                                    │   │
│  └────────────────────────────────────────┘   │
│                                                 │
│  ⚠ This user will see budget receipts          │
│    including amounts. Sensitive info — confirm │
│    when saving.                                │
├────────────────────────────────────────────────┤
│         [Remove member]   [Cancel] [Save]      │
└────────────────────────────────────────────────┘
```

**Spec:**
- Members page at `/settings/members`. Admin-only.
- Each row shows: avatar, name, email, role badge, tags (chips), granted permissions count, [Manage] button.
- Manage slide-over: role radio, tag editor (add/remove chips), permission matrix (page × read/write checkboxes).
- **Sensitive-info warnings**: when granting permissions to budget/payroll/contracts, show inline warning above Save button. Confirmation modal on Save when warnings present.
- **Invite flow**: [+ INVITE] opens slide-over. Enter email → role → tags → optional initial permissions → Send invite. Backend: create `workspace_invites` row (NEW table — add to Phase 1 if missed). Email sent via Supabase Auth invite function. User clicks link → creates account → joins workspace.
- **Remove member**: confirmation modal. Cascades to revoke all grants and tags.

**Workspace switcher UI:**
- For users in multiple workspaces. Top-left of every page (above the artist/tour switcher).
- Shows current workspace name + dropdown chevron. Click → list of workspaces user is member of → click switches `active_workspace_id`.
- Page reloads or refreshes data for new workspace.

### 4.3 Implementation

New page: `src/app/(app)/settings/members/page.tsx` (or extend existing settings).
New slide-overs: `<MemberManageSlideOver>`, `<InviteMemberSlideOver>`.
New components: `<PermissionMatrix>`, `<TagEditor>`.
New API routes: `/api/workspaces/members`, `/api/workspaces/members/[id]`, `/api/workspaces/invite`.

For workspace switcher: `<WorkspaceSwitcher>` mounted in AppShell alongside (or above) `<ArtistTourSwitcher>`. Updates `user_preferences.active_workspace_id` on switch; triggers `router.refresh()`.

### 4.4 Acceptance

- [ ] `/settings/members` lists members with role/tags/permissions visible.
- [ ] Admin can invite by email → email sent → invitee clicks → creates account → lands in workspace as readonly user (default role).
- [ ] Admin can change member role.
- [ ] Admin can add/remove tags from a member.
- [ ] Admin can toggle permission grants per page; sensitive warnings appear for budget/payroll grants.
- [ ] Admin can remove a member (cascades).
- [ ] Workspace switcher visible for users in 2+ workspaces; switching reloads data.
- [ ] Non-admins see read-only view of members page (or no access).
- [ ] Lint + typecheck clean.

### 4.5 Quote in report

- Mockup sign-off timestamp.
- The new page/route components.
- API route handlers.
- Workspace switcher mount.

### 4.6 Commit

`feat(settings,api): workspace members management + invite + workspace switcher (Sprint 9 §3)`

---

## 5. Phase 4 — Real-time sync infrastructure (~2 hr)

### 5.1 Goal

Adam's spec: real-time sync. Set up Supabase Realtime subscription pattern. NOT wiring it everywhere — just the foundation + one demonstrative use (e.g. Routing rows live-updating across collaborators).

### 5.2 Implementation

- Verify Supabase Realtime is enabled on tables that need it (tours, routing, budget_line_items, advance_instances, personnel_tour_assignments). Add via migration if not.
- New hook: `useRealtimeRows(tableName, filterColumn, filterValue, onChange)` — subscribes to changes for a specific filter; calls onChange on INSERT/UPDATE/DELETE; cleans up on unmount.
- Wire into RoutingGrid for one demonstrative use: when collaborator A edits a row, collaborator B sees the update within ~1s.
- Document the pattern in a README at `src/lib/realtime/README.md` so future pages follow the same pattern.

### 5.3 Acceptance

- [ ] `useRealtimeRows` hook works in RoutingGrid: edits in one tab appear in another tab within ~1s.
- [ ] Hook handles unmount cleanup (no orphan subscriptions).
- [ ] README documents pattern + how to add to future pages.
- [ ] Lint + typecheck clean.

### 5.4 Quote in report

- The hook implementation.
- The RoutingGrid integration.
- README contents.

### 5.5 Commit

`feat(realtime): Supabase Realtime hook + RoutingGrid integration (Sprint 9 §4)`

---

## 6. Phase 5 — Operations: Routing page (~2.5 hr)

### 6.1 Goal

The current `/operations/[tourId]/routing` is a placeholder. Build the real page using the existing `<RoutingGrid>` component wrapped in the new product shell.

### 6.2 Mockup required (post to chat for sign-off)

```
┌────────────────────────────────────────────────────────────────────────┐
│ [Lowpass]  [Switcher: Artist · Tour]                       OPERATIONS  │
├────────────────────────────────────────────────────────────────────────┤
│  [TourHeader strip]                                                     │
├────────────────────────────────────────────────────────────────────────┤
│ [Operations sub-nav: Personnel · Routing · Channel List · Payroll · …] │
├────────────────────────────────────────────────────────────────────────┤
│  ROUTING                                              [+ Add show]      │
│  Last edit: 2h ago by Adam                                              │
│                                                                         │
│  [RoutingGrid — full version, not compact mode]                        │
│  Date | Day type | Location | City | Country | Address | Capacity | … │
│  ...                                                                    │
│                                                                         │
│  [drive time bands between consecutive shows]                          │
└────────────────────────────────────────────────────────────────────────┘
```

**Spec:**
- Wraps RoutingGrid (existing, NOT compact mode — full features).
- Operations sub-nav at top — links to Personnel, Routing (active), Channel List, Payroll, Rooming, Files, Riders. The currently-active sub-page underlined orange.
- "Last edit by X, Yh ago" derived from audit_log query.
- "+ Add show" button → opens an inline row OR a slide-over form (your call). Mirrors the multi-step TourCreateSlideOver routing builder pattern.
- Permissions: read requires `can_access('page', 'operations.routing', 'read')` (which falls through to admin/manager always). Write requires `'write'` permission.
- Real-time: subscribes to routing table changes for this tour via Phase 4's hook.

### 6.3 Acceptance

- [ ] `/operations/[tourId]/routing` renders RoutingGrid with all features (autocomplete, drive time, day-type colors, etc.).
- [ ] Operations sub-nav at top with Routing active.
- [ ] "Last edit" line shows real audit data.
- [ ] Real-time updates work: edit in one tab appears in another.
- [ ] Permissions enforced: readonly users without grant see "no access" view; readonly users with read-only grant see the page but can't edit; write-grant or admin/manager can edit.
- [ ] Lint + typecheck clean.

### 6.4 Quote in report

- Mockup sign-off timestamp.
- The new page file.
- Operations sub-nav component.
- Permission gating in the page.

### 6.5 Commit

`feat(operations): Routing page real implementation (Sprint 9 §5)`

---

## 7. Phase 6 — Operations: Personnel page (~5 hr)

### 7.1 Goal

The page that fixes Adam's content-creator pain point. Two views:

- **Manager/admin view**: list of personnel assigned to the tour, add/remove from individual shows, set status (confirmed/tentative/etc), assign tags.
- **Crew read-only view**: when a crew member logs in, they see only their own assignments and a "my schedule" view.

Plus: assignment workflow with conflict detection (within and across workspaces).

### 7.2 Mockup required (post to chat for sign-off)

**Manager view:**

```
┌─────────────────────────────────────────────────────────────────────────┐
│ PERSONNEL                                  [+ Add personnel]            │
│ Last edit: 1h ago by Joe                                                 │
├─────────────────────────────────────────────────────────────────────────┤
│ Filter: [All] [Confirmed] [Tentative] [Cancelled]   Tag: [Any ▾]       │
├─────────────────────────────────────────────────────────────────────────┤
│ NAME              ROLE       TAGS         CONFIRMED SHOWS  STATUS       │
│ ────────────────────────────────────────────────────────────────────── │
│ John Smith        Sound Eng  crew, sound  12 of 14       confirmed    │
│ Jane Doe          Lights     crew, lx     8 of 14        tentative    │
│ Adam Photog       Content    crew         5 of 14        confirmed    │
│   ⚠ Conflict: also assigned to Tour-X on 14 Mar                       │
│ ...                                                                      │
└─────────────────────────────────────────────────────────────────────────┘

Click a person → slide-over with show-by-show assignment grid:

┌──────────────────────────────────────────────────┐
│ JOHN SMITH · SOUND ENGINEER                  [×] │
├──────────────────────────────────────────────────┤
│ TAGS  [crew] [sound] [+]                          │
│ STATUS  ( ) Confirmed (•) Tentative ( ) Cancelled │
├──────────────────────────────────────────────────┤
│ SHOW SCHEDULE                                     │
│ ┌──────────────────────────────────────────────┐ │
│ │ DATE         VENUE          ASSIGNED         │ │
│ │ 21 Mar       Tabernacle ATL  [✓] confirmed   │ │
│ │ 22 Mar       Hangout FL      [✓] confirmed   │ │
│ │ 23 Mar       Travel day      [ ]              │ │
│ │ 24 Mar       The Factory     [✓] tentative   │ │
│ │ ...                                            │ │
│ └──────────────────────────────────────────────┘ │
│                                                   │
│ NOTES                                             │
│ [textarea]                                        │
├──────────────────────────────────────────────────┤
│              [Remove from tour]  [Cancel] [Save]  │
└──────────────────────────────────────────────────┘
```

**Crew read-only view (when user has 'crew' tag and read-only access):**

```
┌─────────────────────────────────────────────────────────────────────────┐
│ MY SCHEDULE — Adam Photog                                                │
├─────────────────────────────────────────────────────────────────────────┤
│ Tour: Dandelion Tour '26                                                 │
│                                                                          │
│ UPCOMING                                                                 │
│  21 Mar  Tabernacle ATL          confirmed                              │
│  22 Mar  Hangout Fest FL          confirmed                              │
│  23 Mar  Travel day               (off)                                  │
│  24 Mar  The Factory               confirmed                              │
│ ...                                                                      │
│                                                                          │
│ FLIGHTS                                                                  │
│  20 Mar  LAX → ATL  AA1234  09:30 → 17:15  Confirmed                    │
│  ...                                                                      │
│                                                                          │
│ HOTELS                                                                   │
│  21 Mar  Hilton Atlanta Downtown  Booked                                 │
│  ...                                                                      │
│                                                                          │
│ PAY                                                                      │
│  Daily rate  £450                                                        │
│  Period: 20 Mar - 5 Apr                                                  │
│  Total expected: £6,300 (14 days × £450)                                │
└─────────────────────────────────────────────────────────────────────────┘
```

(The crew view is a stripped-down, person-filtered version. They see ONLY their own data.)

### 7.3 Conflict detection — full canonical-registry version

When admin assigns a person to a show:
- Query: any other tour assignment for this person on the same date?
- **Within workspace**: query `personnel_tour_assignments` joined to `routing` on date.
- **Across workspaces**: uses Phase 1 §E2's canonical `persons` table. Conflict-detection logic resolves the personnel's `person_id`, then queries assignments across ALL workspaces where that `person_id` is referenced.

**RLS-safe cross-workspace query — use a SECURITY DEFINER RPC keyed on canonical_person_id:**

Don't expand RLS broadly to let users SELECT other workspaces' assignment rows. Use a SECURITY DEFINER function that runs with elevated permissions but returns minimal data:

```sql
CREATE OR REPLACE FUNCTION public.check_personnel_conflicts(
  p_canonical_person_id UUID,
  p_start_date DATE,
  p_end_date DATE,
  p_excluding_tour_id UUID  -- exclude the current tour the user is assigning to
) RETURNS TABLE (
  conflict_workspace_id UUID,
  conflict_workspace_name TEXT,
  conflict_tour_id UUID,
  conflict_tour_name TEXT,
  conflict_date DATE,
  conflict_status TEXT
) 
SECURITY DEFINER
LANGUAGE sql
AS $$
  SELECT 
    w.id AS conflict_workspace_id,
    w.name AS conflict_workspace_name,
    t.id AS conflict_tour_id,
    t.name AS conflict_tour_name,
    r.date AS conflict_date,
    pta.status AS conflict_status
  FROM public.personnel_tour_assignments pta
  JOIN public.personnel pn ON pn.id = pta.personnel_id
  JOIN public.persons p ON p.id = pn.person_id
  JOIN public.tours t ON t.id = pta.tour_id
  JOIN public.workspaces w ON w.id = t.workspace_id
  JOIN public.routing r ON r.tour_id = t.id
  WHERE p.canonical_person_id = p_canonical_person_id
    AND r.date BETWEEN p_start_date AND p_end_date
    AND t.id != p_excluding_tour_id
    AND pta.status IN ('confirmed', 'tentative', 'awaiting_contract')
$$;
```

**Fallback path — email match for unlinked persons:**

For persons whose `canonical_person_id` is still NULL (existing rows pre-backfill, or persons without email at link time), the assignment flow runs a fallback check by email:

```sql
CREATE OR REPLACE FUNCTION public.check_personnel_conflicts_by_email(
  p_email TEXT,
  p_start_date DATE,
  p_end_date DATE,
  p_excluding_tour_id UUID
) RETURNS TABLE (
  conflict_workspace_id UUID,
  conflict_workspace_name TEXT,
  conflict_tour_id UUID,
  conflict_tour_name TEXT,
  conflict_date DATE,
  conflict_status TEXT
)
SECURITY DEFINER
LANGUAGE sql
AS $$
  -- Same query but joining via persons.email match instead of canonical_id
  -- ...
$$;
```

The assignment UI calls one or the other based on whether `canonical_person_id` is set. Eventually the email-fallback path becomes redundant once backfill runs.

**Permission gating inside both RPCs:**

- Caller must be authenticated.
- Caller must have at least ONE workspace membership where they have a personnel record referencing the same canonical_person_id (or matching email).
- Otherwise: return empty.

This preserves data isolation: cross-workspace exposes only minimal scheduling info, only to users who already have a linked relationship to this person.

**UI on conflict found:**
- Inline warning above the assignment confirmation: "⚠ **John Smith** is also assigned to **Tour X** in **Workspace Y** on **14 Mar** (status: confirmed)."
- Manager can override (proceed anyway) or cancel.
- The conflict is informational — doesn't prevent assignment. Both managers eventually negotiate offline.

### 7.4 Assignment workflow

- Auto-confirmed by default per Adam's spec.
- Status enum: `'confirmed' | 'tentative' | 'awaiting_contract' | 'cancelled' | 'fired'`.
- When status changes from confirmed → cancelled, AND the personnel record has a user_id, fire an email notification (defer the email infra to Sprint 10 — for now, just log the intent).

### 7.5 Crew read-only view

- When current user has 'crew' tag (or any read-only role), Personnel page filters to ONLY their own assignments.
- View shows: shows they're assigned to, flights, hotels, daily rate, total pay (current).
- Hides: other people's assignments, budget line items, internal notes.
- Sensitive-info warnings apply if admin grants additional access.

### 7.6 Acceptance

- [ ] Manager view at `/operations/[tourId]/personnel`: list of assigned personnel with status badges, tags, conflict warnings.
- [ ] Click person → manage slide-over with show-by-show assignment grid.
- [ ] Add person from `+ Add personnel` button (search existing persons OR create new).
- [ ] Status changes update audit_log.
- [ ] Conflict detection within workspace AND across workspaces.
- [ ] Crew read-only view: when `useRole() === 'readonly'` and user has 'crew' tag, page renders the simplified my-schedule layout.
- [ ] Permissions enforced: readonly users without 'crew' tag and without explicit grant see no-access view.
- [ ] Real-time updates: assignment changes appear in other tabs.
- [ ] Lint + typecheck clean.

### 7.7 Quote in report

- Mockup sign-off timestamp.
- Manager view page file.
- Crew read-only view component.
- Conflict detection query.
- Status enum + audit log integration.

### 7.8 Commit

`feat(operations,permissions): Personnel page with conflict detection + crew read-only view (Sprint 9 §6)`

---

## V. Verify

CC: cannot run live multi-user tests. Static + single-user checks only:

1. Lint baseline 75/120 held.
2. Typecheck zero.
3. Build succeeds.
4. All migrations applied cleanly via `npm run db:migrate` (Adam runs).
5. RLS helpers callable via Supabase RPC (test in SQL Editor).
6. Quote post-fix file:line per phase.

Adam runs the multi-user smoke tomorrow:
- Create test users with different roles + tags.
- Verify each role sees what they should.
- Test invite flow end-to-end.
- Test conflict detection by manually assigning across tours.

---

## When done — report exactly this format

```
Sprint 9 done. Branch: feat/sprint-9-foundation-operations
Vercel preview: <URL>

Commits in order:
- 1: <hash> feat(db): permissions foundation schema
- 2: <hash> feat(db): permissions RLS helpers + policy updates
- 3: <hash> feat(settings,api): workspace members management + invite + workspace switcher
- 4: <hash> feat(realtime): Supabase Realtime hook + RoutingGrid integration
- 5: <hash> feat(operations): Routing page real implementation
- 6: <hash> feat(operations,permissions): Personnel page with conflict detection + crew read-only view

Diagnoses signed off:
[Phase 1 schema] at <ts>
[Phase 2 RLS] at <ts>
[Phase 3 mockup] at <ts>
[Phase 5 mockup] at <ts>
[Phase 6 mockup] at <ts>

Quoted post-fix lines:
[Phase 1] migration file
[Phase 2] helper functions + sample policy update + multi-workspace switching
[Phase 3] members page + slide-overs + workspace switcher
[Phase 4] hook + RoutingGrid integration + README
[Phase 5] Routing page + permission gating
[Phase 6] manager view + crew view + conflict detection

V.1-6 results:
1. Lint: <X errors / Y warnings>
2. Typecheck: zero
3. Build: OK
4. Migrations applied: yes/no
5. RLS helpers callable: yes/no
6. Quoted

Out of scope, deferred:
[list]
```

---

## Out of scope this sprint (DO NOT touch)

1. **Email/SMS notification infrastructure** — Sprint 10. For now, status changes log intent but don't send emails.
2. **Stripe billing integration** — separate sprint when Adam ready to commercialize.
3. **Mobile PWA** — `/m/*` routes pending Sprint 11+.
4. **Operations sub-pages: Channel List, Payroll, Rooming, Files, Riders** — Sprint 10 picks these up after Routing + Personnel land.
5. **Audit log surfaced UI** — table populates, but the inline "edited by X, Yh ago" labels and dedicated audit page are Sprint 10.
6. **TourWizard retirement** — separate sprint.
7. **Spotify search → genre extension** — separate sprint.
8. **Image cropping for upload** — Sprint 8.5 deferred if not shipped.
9. **Image processing/compression** — raw upload only.
10. **Person dedupe sophistication** — v1 dedupes by email match on personnel creation; fuzzy name matching, multi-email-per-person, manual person merge UI all deferred to a follow-up sprint.
11. **Long-deferred lint baseline errors** — leave alone.
12. **5b/c bucket cleanup (budget-files / advance-files)** — Sprint 10.

If you find another bug — note in deferred. Don't fix.
