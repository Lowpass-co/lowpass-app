# CC Sprint 9 Extension — Phases 7–12

Single prompt covering bug fixes + 4 new features + polish. All confirmed by Adam.

---

## Context

Sprint 9 Phases 1–6 shipped. Adam smoked and surfaced bugs + feature gaps. Rather than splitting to Sprint 10, all of it lands in this extension because the personnel + admin foundations are too coupled to defer.

Two architectural decisions Adam confirmed before this prompt:
1. **TopBar legacy nav (Dashboard / Personnel / Calendar / Equipment) is being ripped out and rebuilt.** Workspace-level surfaces (Personnel, Equipment, Calendar, Settings) stay nav-able, just via modern chrome.
2. **New `personnel-documents` Supabase storage bucket** with workspace-scoped RLS for passport / visa scans. Must be very secure — RLS gates reads/writes to workspace members only, with admin/manager-only write for sensitive document types.

Six new phases. Phase 7 ships continuously. Phases 8–10 require mockup sign-off (post mockup, Adam approves, then code). Phases 11–12 ship continuously.

Required reading:
- `CLAUDE.md`
- `docs/handover/CC_SPRINT_09_FOUNDATION_OPERATIONS.md` for architectural context
- `docs/handover/CC_SPRINT_09_EXTENSION.md` (this file) for diagnoses + decisions
- `database/migrations/078`–`083` for the schema state Sprint 9 has built

---

## Hard rules (whole extension)

1. No new dependencies.
2. No `any`, no `// @ts-ignore`.
3. Lint baseline 75 errors / 120 warnings. Strict hold across all phases.
4. Typecheck zero.
5. Build via `next build --webpack` only.
6. One commit per phase, in order.
7. Verify before claiming. Quote post-fix file:line in each phase report.
8. Don't merge to main. Push to `feat/sprint-9-foundation-operations`.
9. Use existing primitives — `<SlideOver>`, `<DataTable>`, `<DeleteConfirmationModal>`, `<ProductShell>`, `<TopBar>` (post-redesign). Don't invent.
10. Tokens only — no hardcoded hex/spacing/typography. `var(--lp-*)` per `docs/design-tokens.md`.
11. Hex+alpha for transparent orange — `#FF45001a` or `color-mix(in srgb, var(--color-lp-orange) X%, transparent)`. Never JS string concatenation of CSS vars.
12. Halt criteria: data corruption, build break, lint exceeded, structural assumption wrong with no graceful fallback.

---

## Phase 7 — Critical bug fixes + TopBar redesign (no sign-off, ships first)

Six items. All in one commit.

### 7.1 Realtime hook flickering (Bug 1)

`src/lib/realtime/useRealtimeRows.ts:69` defaults `events = ['INSERT', 'UPDATE', 'DELETE']` — a fresh array literal every render. Line 136 includes `events` in the effect deps, so React sees a new reference each render, tears down + re-establishes the channel, and the Live pill bounces. Updates never land cleanly.

Fix:

```ts
// Just inside the function body, before the useEffect:
const eventsKey = events.join(',');

// And the dep array on line 136:
}, [table, filterColumn, filterValue, enabled, eventsKey]);
```

Five-line change. No callsite changes.

### 7.2 PersonnelManageSlideOver date inputs (Bug 2)

`src/components/operations/personnel/PersonnelManageSlideOver.tsx:220-288` defines two `<input type="date">` in a `gridTemplateColumns: '1fr 1fr'` grid. Adam reports only one renders.

Take a screenshot of the slide-over at its actual rendered width with both `member.starts_on` and `member.ends_on` populated with test ISO dates (e.g. `'2026-03-21'` and `'2026-04-14'`). Three failure modes to check:

- Slide-over width too narrow → grid wraps. Fix: change to `gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr)'` and add `min-width: 0` to the wrapping `<div>`s at lines 228 and 258.
- One input clipped by overflow on a parent. Inspect parent of the grid; add `overflow: visible` if needed.
- Both inputs render correctly in your screenshot → post the screenshot to chat and ask Adam for his end's screenshot.

Don't guess — ground the fix in what you actually see.

### 7.3 Conflict banner missing role + name capitalisation (Bug 3)

Three changes:

**(a) New migration** `database/migrations/084_conflict_role_column.sql`. Drop and re-create both `check_personnel_conflicts_batch` and `check_personnel_conflicts_by_email_batch` from 083. Add `conflict_role TEXT` to the RETURNS TABLE and `tp.role AS conflict_role` to the SELECT. Keep all other columns + permission gating identical. Idempotent via CREATE OR REPLACE.

**(b) Update** `ConflictRow` type in `src/lib/personnel/types.ts` to include `role: string`. Update the API route at `src/app/api/tours/[id]/personnel/conflicts/route.ts` to map `conflict_role` → `role` in its response shape.

**(c) Update** `src/components/operations/personnel/ConflictBanner.tsx` line 73-77 to render role inline:

```tsx
<strong>{personName}</strong> is also assigned to{' '}
<strong>{c.tour_name}</strong> as <strong>{c.role}</strong> in{' '}
<strong>{c.workspace_name}</strong>
{formatRange(c.start_date, c.end_date)
  ? ` on ${formatRange(c.start_date, c.end_date)}`
  : ''}
```

**(d) Smart-case helper** `src/lib/text/toTitleCase.ts`:

```ts
/**
 * Title-case names for display. Preserves all-caps acronyms ≤3 chars
 * (BH, NYC, USA), preserves internal capitals (O'Brien, McDonald,
 * MacKenzie). Doesn't lowercase what looks intentionally cased.
 */
export function toTitleCase(input: string | null | undefined): string {
  if (!input) return '';
  return input
    .split(/\s+/)
    .map((word) => {
      if (word.length === 0) return word;
      // Preserve all-caps short acronyms
      if (word.length <= 3 && word === word.toUpperCase() && /^[A-Z]+$/.test(word)) return word;
      // Preserve words with internal capitals (O'Brien, McDonald)
      if (/[a-z][A-Z]/.test(word) || /^[A-Z][a-z]+'[A-Z]/.test(word)) return word;
      // Standard: capitalize first letter, lowercase rest
      return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
    })
    .join(' ');
}
```

Apply at name display points in:
- `src/components/settings/members/MembersListClient.tsx` — wrap displayed names
- `src/components/operations/personnel/PersonnelManagerClient.tsx` — wrap displayed names
- `src/components/operations/personnel/ConflictBanner.tsx` — caller passes already-cased `personName` so wrap at the upstream call site, not inside the banner

Don't mutate stored `profiles.name` or `persons.full_name` data — display-time only.

### 7.4 TopBar redesign (Bug 4 — confirmed direction)

**Adam's confirmed direction:** rip out the legacy nav links (Dashboard / Personnel / Calendar / Equipment) and replace with a modernised TopBar. Workspace-level surfaces stay nav-able via the new chrome.

New TopBar layout, left-to-right:

```
[Logo] [WorkspaceSwitcher ▾] | [Home · Personnel · Equipment · Calendar · Settings] | [Search] [User Pill]
```

Where the middle nav strip uses the **same visual style as OperationsSubNav** (subtle text links, hover, active orange underline). NOT the old block-style links.

Specifically:
- "Home" → `/artists` (the artist hub; replaces the "Dashboard" link). Active when pathname starts with `/artists` OR is exactly `/`.
- "Personnel" → `/personnel` (workspace-wide Personnel page — Phase 9 reworks this; for now keep linking to existing route).
- "Equipment" → `/equipment` (existing route).
- "Calendar" → `/calendar` if it exists; if route doesn't exist yet, hide the link (don't ship dead links).
- "Settings" → `/settings`. Active when pathname starts with `/settings`.

Active link: `color: var(--color-lp-orange)` + 2px orange `border-bottom`. Inactive: `color: var(--lp-text-secondary)`, no border, hover to `var(--lp-text)`.

Drop "Dashboard" entirely — the Product Split moved Home to `/artists/[id]`. Drop any other dead links found in the existing TopBar.

Files to modify:
- `src/components/shell/TopBar.tsx` — replace the legacy nav block with the new sub-nav-styled strip
- Any tests / snapshots referencing the old nav links — update or remove

Verify: navigate to `/settings/members` and confirm the new TopBar matches Operations chrome aesthetic. Visually consistent across `/operations/*`, `/budget/*`, `/advance/*`, `/settings/*`, `/personnel`, `/equipment`.

### 7.5 Settings slow load (Bug 5)

`src/app/(app)/settings/members/page.tsx:35-60` runs three sequential awaits (profile → membership → workspace name). All depend on user.id which is already known. Parallelize:

```ts
const [
  { data: profile },
  // ... etc
] = await Promise.all([
  supabase.from('profiles').select('workspace_id').eq('id', user.id).maybeSingle(),
  // ...
]);
```

Note: workspace name fetch depends on workspaceId from profile, so that one stays sequential after the Promise.all. Membership fetch uses workspaceId too. Restructure: first Promise.all gets profile, second await gets membership + workspace_name in parallel.

### 7.6 Status pills (polish)

In `src/components/operations/personnel/PersonnelManageSlideOver.tsx`, replace the status radio dots with coloured pills. One pill per status (Confirmed / Tentative / Awaiting contract / Cancelled / Fired). Click selects.

Active pill: `var(--color-lp-orange)` background, white text, slight shadow.
Inactive pill: `var(--lp-bg-tertiary)` background, `var(--lp-text-secondary)` text.
Cancelled / Fired (destructive states): when active, use a red-tinted background instead of orange — `color-mix(in srgb, var(--lp-danger) 80%, transparent)` or similar from existing tokens. Check `docs/design-tokens.md` for the canonical danger token.

Use `<button type="button" role="radio">` for accessibility (mimics radio group semantics with custom visuals).

### Phase 7 commit

```
fix(realtime,personnel,topbar,settings): Sprint 9 extension Phase 7 bugfixes
```

Apply migration 084 manually via Supabase SQL Editor + tracking insert (same drill as 080–083).

Verify: tsc --noEmit zero, eslint under 75/120 baseline, next build --webpack green.

Adam smokes Phase 7 before Phase 8 starts.

---

## Phase 8 — Operations summary page (mockup sign-off required)

Currently `/operations/[tourId]` is a placeholder. Adam manually URL-edits to reach Routing/Personnel sub-pages. Replace with a real summary + management dashboard.

### Mockup spec (post for Adam's sign-off before code)

```
┌─────────────────────────────────────────────────────────────────┐
│ TopBar (post-Phase-7-redesign)                                  │
├─────────────────────────────────────────────────────────────────┤
│ TourHeader (existing)                                            │
├─────────────────────────────────────────────────────────────────┤
│ OperationsSubNav (Personnel · Routing · Channel List · ...)     │
│                                  ^^ none active — this is /tour │
├─────────────────────────────────────────────────────────────────┤
│  OPERATIONS                                              [Live] │
│  Last edit: 1h ago by Joe                                       │
│                                                                  │
│  ┌─ Summary cards (4-col grid) ──────────────────────────────┐  │
│  │ ┌────────────┬────────────┬────────────┬────────────┐   │  │
│  │ │ 14 shows   │ 12 crew    │ 0 conflicts│ 3 pending  │   │  │
│  │ │ next 21 Mar│ 21 Mar–14  │     —      │   tasks    │   │  │
│  │ │ → Routing  │ → Personnel│ → review   │ → review   │   │  │
│  │ └────────────┴────────────┴────────────┴────────────┘   │  │
│  └───────────────────────────────────────────────────────────┘  │
│                                                                  │
│  ┌─ Quick actions ──────────────────────────────────────────┐   │
│  │ [+ Add personnel] [+ Add show] [Export schedule] [Print] │   │
│  └──────────────────────────────────────────────────────────┘   │
│                                                                  │
│  ┌─ Recent activity (last 7 days, max 5) ──────────────────┐    │
│  │ ● 2h ago  Adam updated Tabernacle ATL routing            │    │
│  │ ● 1d ago  Joe assigned John Smith as Sound Eng           │    │
│  │ ● 2d ago  Adam confirmed Jane Doe                        │    │
│  │ [View all in audit log →]                                 │    │
│  └──────────────────────────────────────────────────────────┘   │
│                                                                  │
│  ┌─ Upcoming shows (next 5) ────────────────────────────────┐   │
│  │ 21 Mar  Tabernacle, Atlanta US        2,500 cap          │   │
│  │ 22 Mar  Hangout Fest, FL              —                  │   │
│  │ 24 Mar  The Factory                    —                 │   │
│  │ ...                                                        │   │
│  └──────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────┘
```

### Implementation (after sign-off)

New file: `src/app/(app)/operations/[tourId]/page.tsx` — replaces the existing placeholder.

Server component. Fetches in parallel:
- `tours` row
- `routing` rows for tour
- `tour_personnel` rows for tour
- `audit_log` rows where `entity_type IN ('routing', 'tour_personnel', 'tour')` AND scoped to tour, last 7 days, ordered DESC LIMIT 5
- Conflict count via `check_personnel_conflicts_batch` (call once with all assigned personnel's canonical_person_ids; count > 0 conflicts)
- Pending tasks count: tour_personnel with status='awaiting_contract' OR routing rows with day_type='show' but missing venue_name (loose definition; refine if Adam has a clearer one)

Cards in summary grid: each clickable, navigates to relevant sub-page.

"Recent activity" reads audit_log joined to `profiles.name` (use `toTitleCase` from Phase 7) for actor display.

"Upcoming shows" filters routing rows to dates >= today, takes next 5.

Quick actions: "+ Add personnel" opens existing AddPersonnelSlideOver. "+ Add show" — note: routing is date-range driven, so "Add show" really means "extend tour". Render as `[Extend tour]` button → opens a small slide-over with start/end date adjustment for the tour. Or defer — your call, but document the choice.

Wraps in existing `<ProductShell>` per Operations migration pattern.

Phase 8 commit:
```
feat(operations): Operations summary page replaces placeholder (Sprint 9 §7)
```

---

## Phase 9 — Workspace-wide Personnel rework (mockup sign-off required)

Adam's spec: looks like Bug Reports (chrome match), houses passport scans / visa info / dietary / emergency contact / etc., with three actions (Add new / Assign to tour / Import).

### Mockup spec (post for Adam's sign-off before code)

```
┌─────────────────────────────────────────────────────────────────┐
│ TopBar (post-Phase-7)                                           │
├─────────────────────────────────────────────────────────────────┤
│  PERSONNEL                          [+ Add new] [Import] [Assign to tour]
│  N people · 0 active issues                                     │
│                                                                  │
│  Filter: [All▾] [Role: Any▾] [Tag: Any▾] [Search]              │
│                                                                  │
│  ┌─────────────────────────────────────────────────────────┐    │
│  │ NAME            ROLE          TOURS    LAST UPDATED     │    │
│  │ ─────────────────────────────────────────────────────── │    │
│  │ Adam Rowley     Tour Manager    8        2h ago         │    │
│  │ John Smith      Sound Eng       3        5d ago         │    │
│  │ Jane Doe        Lights          5        1w ago         │    │
│  │ ⚠ Adam Photog   Content         2        — (passport    │    │
│  │                                            expires soon) │    │
│  └─────────────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────────┘
```

Click row → Detail slide-over (~640px wide, wider than usual to fit sections):

```
┌────────────────────────────────────────────────┐
│  ADAM ROWLEY                              [×]  │
│  Tour Manager · adam@lowpass.co                │
├────────────────────────────────────────────────┤
│  ▸ PERSONAL                                    │
│    Full name, preferred, pronouns, DOB         │
│    Dietary, allergies, food prefs, merch size  │
│                                                 │
│  ▸ CONTACT                                      │
│    Email, phone, emergency contact             │
│                                                 │
│  ▸ TRAVEL                                       │
│    Home airport                                 │
│    Passport: number, expiry, country, scan↑    │
│    Visa info: free-text + scan↑                │
│                                                 │
│  ▸ PAY  (admin/manager only — gated)            │
│    Standard rates: show / travel / off /        │
│      rehearsal / per diem                       │
│    Commission: territory → percentage           │
│                                                 │
│  ▸ FILES                                        │
│    [Upload document]                            │
│    Passport_2024.pdf (1.2 MB) — uploaded 3d ago │
│    UK_Visa_2026.jpg (0.8 MB) — uploaded 1w ago  │
│                                                 │
│  ▸ TOURS (read-only summary)                    │
│    Dandelion '26 — Tour Manager — confirmed    │
│    Iron Branch '25 — Tour Manager — completed  │
├────────────────────────────────────────────────┤
│ [Delete personnel]    [Cancel]    [Save]       │
└────────────────────────────────────────────────┘
```

### Implementation (after sign-off)

#### Schema additions

New migration `085_personnel_extended_fields.sql`:

```sql
ALTER TABLE public.personnel
  ADD COLUMN IF NOT EXISTS emergency_contact_name TEXT,
  ADD COLUMN IF NOT EXISTS emergency_contact_phone TEXT,
  ADD COLUMN IF NOT EXISTS emergency_contact_relationship TEXT,
  ADD COLUMN IF NOT EXISTS allergies TEXT,
  ADD COLUMN IF NOT EXISTS visa_info JSONB DEFAULT '{}'::jsonb;

-- Index for "passport expiring soon" alerts (Phase 8's pending tasks card)
CREATE INDEX IF NOT EXISTS personnel_passport_expiry_idx 
  ON public.personnel ((passport_info->>'expiry')) 
  WHERE passport_info ? 'expiry';
```

#### Storage bucket

Migration `086_personnel_documents_bucket.sql`:

```sql
-- Create the bucket if it doesn't exist
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'personnel-documents',
  'personnel-documents',
  false,  -- NOT public — RLS-gated
  10485760,  -- 10 MB max per file
  ARRAY['image/jpeg', 'image/png', 'image/webp', 'application/pdf']
) ON CONFLICT (id) DO NOTHING;

-- RLS on storage.objects for this bucket
-- Path convention: personnel-documents/{workspace_id}/{personnel_id}/{filename}

DROP POLICY IF EXISTS personnel_docs_select ON storage.objects;
CREATE POLICY personnel_docs_select ON storage.objects
  FOR SELECT USING (
    bucket_id = 'personnel-documents'
    AND (storage.foldername(name))[1] IN (
      SELECT m.workspace_id::text FROM public.workspace_members m
      WHERE m.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS personnel_docs_insert ON storage.objects;
CREATE POLICY personnel_docs_insert ON storage.objects
  FOR INSERT WITH CHECK (
    bucket_id = 'personnel-documents'
    AND (storage.foldername(name))[1] = public.get_my_workspace_id()::text
    AND public.can_access('page', 'operations.personnel', 'write')
  );

DROP POLICY IF EXISTS personnel_docs_update ON storage.objects;
CREATE POLICY personnel_docs_update ON storage.objects
  FOR UPDATE USING (
    bucket_id = 'personnel-documents'
    AND (storage.foldername(name))[1] = public.get_my_workspace_id()::text
    AND public.can_access('page', 'operations.personnel', 'write')
  );

DROP POLICY IF EXISTS personnel_docs_delete ON storage.objects;
CREATE POLICY personnel_docs_delete ON storage.objects
  FOR DELETE USING (
    bucket_id = 'personnel-documents'
    AND (storage.foldername(name))[1] = public.get_my_workspace_id()::text
    AND public.is_workspace_admin()  -- admin-only delete
  );
```

#### Pages + components

- `src/app/(app)/personnel/page.tsx` — replaces existing if any; modern `listAppPageShell` chrome + post-Phase-7 TopBar.
- `src/components/personnel/PersonnelLibraryClient.tsx` — list + filter + 3 action buttons.
- `src/components/personnel/PersonnelDetailSlideOver.tsx` — wide (640px) slide-over with collapsible sections (use details/summary or custom). Sections collapse independently.
- `src/components/personnel/AddPersonnelSlideOver.tsx` (new — different from existing `operations/personnel/AddPersonnelSlideOver`; this one is for workspace-wide add, the existing one is for tour assignment) — opens same shell as detail with all fields blank.
- `src/components/personnel/AssignToTourSlideOver.tsx` — picks tour (dropdown of workspace's tours), opens `<AddPersonnelSlideOver>` (the operations one) with the person preselected.
- `src/components/personnel/ImportPersonnelSlideOver.tsx` — file upload (CSV / XLSX), parse with existing `xlsx` library, column mapping UI (`Email → email`, `Name → name`, etc., remembered in localStorage between uses), preview table with row-level error highlighting (e.g. "duplicate email — will skip"), `[Cancel]` `[Import N rows]` button.
- File upload handler: `src/app/api/personnel/[id]/documents/route.ts` — POST uploads to `personnel-documents` bucket via Supabase server client. Path: `{workspaceId}/{personnelId}/{timestamp}_{originalName}`.

#### Sub-nav rename

`src/components/operations/OperationsSubNav.tsx` — change "Personnel" label to "Tour Personnel" (the workspace-wide /personnel is the canonical "Personnel"; the tour-scoped one is "Tour Personnel"). The slug stays "personnel" for URL stability.

Phase 9 commit:
```
feat(personnel,db,storage): workspace-wide Personnel rework + import + docs bucket (Sprint 9 §8)
```

---

## Phase 10 — Site admin area (mockup sign-off required)

New route `/admin` gated by `profiles.is_site_admin`. Cross-workspace user + workspace management.

### Mockup spec (post for Adam's sign-off before code)

```
┌─────────────────────────────────────────────────────────────────┐
│ TopBar (post-Phase-7) — Site admin badge in user pill           │
├─────────────────────────────────────────────────────────────────┤
│  SITE ADMIN                                                     │
│  Cross-workspace user + workspace management. Audit-logged.     │
│                                                                  │
│  [ Users  |  Workspaces  |  Audit log ]                         │
│   ^^^^^                                                          │
│   active                                                         │
├─────────────────────────────────────────────────────────────────┤
│  Search [                  ] Filter: [All ▾]                    │
│                                                                  │
│  ┌─────────────────────────────────────────────────────────┐    │
│  │ NAME           EMAIL              WORKSPACES   ACTIONS  │    │
│  │ ─────────────────────────────────────────────────────── │    │
│  │ Adam Rowley    adam@lowpass.co    2            [⋯]     │    │
│  │ Joe Manager    joe@lowpass.co     1            [⋯]     │    │
│  │ ...                                                       │    │
│  └─────────────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────────┘
```

Click `[⋯]` on a row → action menu:
- View memberships (slide-over with full cross-workspace breakdown)
- Reset password (triggers Supabase Auth admin recovery link; confirmation modal)
- Suspend (soft-delete; user can't sign in but data preserved)
- Delete user (confirmation modal with cascade explanation)

### Implementation (after sign-off)

Auth admin operations require service_role key — server-side only, never client.

Files:
- `src/app/(app)/admin/page.tsx` — gated by `getUserAndAdminStatus().isSiteAdmin`. Non-site-admins → 403.
- `src/app/(app)/admin/layout.tsx` — wraps children in admin chrome with the three-tab nav.
- `src/app/(app)/admin/users/page.tsx` — Users tab.
- `src/app/(app)/admin/workspaces/page.tsx` — Workspaces tab.
- `src/app/(app)/admin/audit/page.tsx` — Audit log tab.
- `src/app/api/admin/users/route.ts` — GET (list), POST (create — for support flows; optional v1).
- `src/app/api/admin/users/[id]/route.ts` — DELETE (cascade-delete user).
- `src/app/api/admin/users/[id]/reset-password/route.ts` — POST (generates Supabase Auth recovery link).
- `src/app/api/admin/users/[id]/suspend/route.ts` — POST (toggles `auth.users.banned_until`).
- `src/lib/supabase-admin.ts` — server-side admin client using `SUPABASE_SERVICE_ROLE_KEY`. Helper: `requireSiteAdmin(supabase, userId)` throws if not admin.

Every admin endpoint:
1. Verify `profiles.is_site_admin = true` for `auth.uid()`. 403 if false.
2. Log action to `audit_log` with `action`, `entity_type='user'` or `'workspace'`, `entity_id`, `field_changes` containing before/after.
3. Use `createServerSupabaseAdminClient()` (service_role) for the actual auth operation.

Cross-workspace user list query: SECURITY DEFINER RPC `list_all_users()` that returns auth.users + profiles + count of workspace_members. Restricted to site admins.

Phase 10 commit:
```
feat(admin): site admin area — users, workspaces, audit log (Sprint 9 §9)
```

Migrations: `087_admin_rpcs.sql` for the cross-workspace listing RPCs.

---

## Phase 11 — Per-tour personnel polish (no sign-off, ships continuously)

Smaller scope. Four items:

### 11.1 Auto-populate dates in AddPersonnelSlideOver

`src/components/operations/personnel/AddPersonnelSlideOver.tsx` — when the slide-over opens, if `start_date`/`end_date` are blank, default them to the tour's `start_date`/`end_date`. User can edit. Fetch tour dates via the page-level prop or an inline query.

### 11.2 Inline new-person creation

Same slide-over. Below the "no results" state of the search, add a small footer panel:

```
Person not in this workspace?
[+ Create new person]  ← inline form: name + email
```

Click → expands to a tiny form (just name + email, no other fields). Submit:
1. POST `/api/personnel` (workspace-wide) with `{ name, email, role: assignmentRole }`.
2. POST `/api/tours/[id]/personnel` with the new person's id + the assignment fields.
3. Closes slide-over, refreshes list.

Both calls happen sequentially with proper error handling (if step 2 fails, the person still exists in workspace personnel — that's OK, admin can assign manually).

### 11.3 Multi-rate UI in PersonnelManageSlideOver

Replace the single `rate_amount/rate_currency/rate_period` field set with a Rates section:

```
RATES                              [Use standard rates ↻]
─────────────────────────────────────
Show day      [   £450 ]
Travel day    [   £225 ]
Off day       [   £150 ]
Rehearsal day [   £400 ]
Per diem      [   £30  ]
Currency      [GBP ▾]
─────────────────────────────────────
COMMISSION  (admin/manager view only)
[Add territory rate]
UK            [   10  %]   [✕]
US            [   12.5%]   [✕]
```

Schema add via migration `088_personnel_per_tour_rates.sql`:

```sql
ALTER TABLE public.tour_personnel
  ADD COLUMN IF NOT EXISTS rates_override JSONB DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS commission_rates_override JSONB DEFAULT '{}'::jsonb;
```

UI: defaults pulled from `personnel.standard_rates` + `personnel.commission_rates`. Edited values stored in `tour_personnel.rates_override` / `commission_rates_override`. "Use standard rates ↻" button clears the override JSONB to empty.

Commission section gated by `can_access('page', 'operations.personnel.compensation', 'read')` — readonly users without that grant see the rates section but NOT commission.

### 11.4 "Tour Personnel" relabel

Already in Phase 9 (OperationsSubNav). Sanity-check it landed in Phase 9; if missed, add here.

Phase 11 commit:
```
feat(operations,personnel): multi-rate + commission + inline create + autopop dates (Sprint 9 §10)
```

---

## Phase 12 — Polish (no sign-off, ships continuously)

Three items:

### 12.1 SlideOver enter/exit animations

`src/components/shell/SlideOver.tsx` — add CSS transitions for enter/exit. 200ms slide-from-right + fade.

```css
.lp-slide-over {
  transform: translateX(100%);
  opacity: 0;
  transition: transform 200ms ease-out, opacity 200ms ease-out;
}
.lp-slide-over.is-open {
  transform: translateX(0);
  opacity: 1;
}
```

Apply at the SlideOver primitive level so all slide-overs inherit. Don't touch individual slide-over consumers — they get the animation for free.

Test: open and close any slide-over (Manage member, Manage personnel, Add personnel, etc.) and verify the slide animation fires.

### 12.2 Apply name capitalisation app-wide

Audit name display points beyond Phase 7's three components. At minimum:
- TopBar user pill (display name)
- Any tour-personnel rows
- Conflict banner caller chain
- WorkspaceSwitcher items
- Audit log activity feed (Phase 8's "Recent activity")

Wrap displayed names in `toTitleCase()` from Phase 7.

### 12.3 Final Sprint 9 verification

Run the full smoke checklist Adam used post-Phase 6 (in chat). Every item should PASS now, except the legitimate skips (no second user available for testing). Document any remaining issues for Sprint 10.

Phase 12 commit:
```
chore(ui): slide-over animations + name casing polish + Sprint 9 verification (Sprint 9 §11)
```

---

## Reporting expectations

Per phase, post to chat:

```
Phase N done. Commit: <hash>
Files added/modified: [list with file:line for load-bearing logic]
Migration apply note: [if any new migration; provide the SQL block ready for Adam to paste]
Verify: tsc zero, lint X/Y under baseline, build green
Smoke: [list specific things Adam should test]
Blockers: [empty if clean; specific question if stuck]
Out of scope deferred: [empty unless intentional]
```

After Phase 12, post the final Sprint 9 wrap-up:

```
Sprint 9 complete. Branch: feat/sprint-9-foundation-operations
Commits in order:
- <hash>: Phase 1 (df5efac)
- <hash>: Phase 2 (565fe2c)
- <hash>: Phase 3 (225a46d)
- <hash>: Phase 4 (a61a3eb)
- <hash>: Phase 5 (fe410fc)
- <hash>: Phase 6 (8ef6fc2)
- <hash>: Phase 7
- <hash>: Phase 8
- <hash>: Phase 9
- <hash>: Phase 10
- <hash>: Phase 11
- <hash>: Phase 12

Migrations applied (manually via SQL Editor + tracking insert):
078, 079, 080, 081, 082, 083, 084, 085, 086, 087, 088

Smoke: ALL items pass except [list]
Ready for Adam's final smoke + merge to main.
```

---

## What stays out of scope (Sprint 10+)

Don't touch even if discovered:

- Email/SMS notification dispatcher (audit_log rows are written; Sprint 10 reads them)
- Stripe billing integration
- Mobile PWA (`/m/*` routes)
- Per-show personnel assignment grid (refinement #3 from Phase 6)
- Audit log UI surface beyond the basic admin tab (rich filtering, etc.)
- Rental-inventory route fix per `CC_RENTAL_DENORMALISE.md`
- "No Key Contacts section" investigation (Sprint 8.6 carry-over)
- Spotify search → genre extension
- Image cropping / processing for uploaded files (raw upload only)
- Workspace creation UI ("+ Create workspace" hidden v1)
- Per-personnel `tour_personnel.tags` column (deferred from Phase 6)

If you find another bug — note in deferred. Don't fix.
