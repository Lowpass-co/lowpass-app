# CC Sprint 10 — Workspace IA + Personnel rework + collaboration polish

Sprint 9 closed last night. Sprint 10 picks up the deferred items plus the IA decision Adam made this morning. Five phases, each substantial. Adam will run a long smoke pass after the full sprint lands.

Branch off `main` (which now has all of Sprint 9 + 8.5/8.6 fixes merged via the Sprint 9 wrap-up). New branch: `feat/sprint-10-ia-and-polish`.

---

## Hard rules (whole sprint)

1. No new dependencies. (Stripe is one exception — Phase 5 introduces `@stripe/stripe-js` + `stripe`. Other phases stay deps-clean.)
2. No `any`. No `// @ts-ignore`.
3. Lint baseline 75/120 strict hold.
4. Typecheck zero. Build via `next build --webpack`.
5. One commit per phase. Five commits total.
6. Verify before claiming. Quote post-fix file:line in every report.
7. Use existing primitives — `<SlideOver>`, `<DataTable>`, `<DeleteConfirmationModal>`, `<Tooltip>`, `toTitleCase`. Don't invent.
8. Project root: `/Users/lowpass/Documents/lowpass-app`. Drive copy is deleted.
9. Halt criteria: anything that requires a schema decision Adam hasn't approved → STOP and ask, don't speculate.

---

## Phase 1 — Workspace IA + chrome unification (mockup sign-off required)

The biggest phase. Three levels of context (workspace / artist / tour), one unified TopBar component, breadcrumb-as-switcher, scope-aware nav strip. Replaces the current dual-shell mess (shell-v1 listAppPageShell vs shell-v2 ProductShell) with a single chrome.

### 1.1 The three-level context model

Every authenticated page operates at one of:

- **Workspace** (no artist, no tour) — `/`, `/personnel`, `/equipment`, `/calendar`, `/settings/*`, `/admin/*`, `/bugs`
- **Artist** (artist scope, no tour) — `/artists/[id]`, `/artists/[id]/tours`, `/artists/[id]/contracts`, `/artists/[id]/earnings`, `/artists/[id]/files`
- **Tour** (tour scope) — `/operations/[tourId]/*`, `/budget/[tourId]/*`, `/advance/[tourId]/*`

Page detects level from URL pattern. Chrome adapts.

### 1.2 New unified TopBar

Single component `<UnifiedTopBar>` replaces both shell-v1's `<TopBar>` and shell-v2's `<ProductHeader>`. Renders:

```
[Lowpass-logo] [Workspace ▾] [Breadcrumb pill]    ━━━━━    [Search] [Admin] [User pill ▾]
                                       ↓ scope-aware nav strip
```

**Left section:**
- Lowpass logo → links to `/` (workspace home — currently `/artists` artist hub)
- Workspace switcher (existing component, dropdown)
- Breadcrumb pill (NEW component) — see §1.3

**Right section:**
- Search trigger (⌘K)
- ADMIN pill (sibling, left of user pill, only when `isSiteAdmin`)
- User pill — avatar + full name + dropdown (matches the current `/settings` user pill style — Adam wants this everywhere)

**Below TopBar, scope-aware nav strip** — see §1.4

### 1.3 Breadcrumb pill component

`<BreadcrumbPill>` reads URL + context, renders as a pill that shows the current scope path. Click segments to navigate up:

| URL | Pill content |
|---|---|
| `/` or `/personnel` or `/equipment` or `/settings/*` | (empty — no breadcrumb at workspace level) |
| `/artists/[id]` | `[● Avatar] Ella Langley` |
| `/operations/[tourId]/*` | `[● Avatar] Ella Langley › Dandelion '26` |
| `/budget/[tourId]/*` | `[● Avatar] Ella Langley › Dandelion '26` |
| `/advance/[tourId]/*` | `[● Avatar] Ella Langley › Dandelion '26` |

Click "Ella Langley" → routes to `/artists/[id]`. Click "Dandelion '26" → routes to `/operations/[tourId]` (the summary). Click the avatar → opens artist switcher dropdown.

Visual: rounded pill with subtle border + avatar + segments separated by `›`. Active segment (last one) bolder.

### 1.4 Scope-aware nav strip

Below the TopBar, render a nav strip whose contents depend on scope:

**Workspace scope:**
```
Home · Personnel · Equipment · Calendar · Settings · Admin
```
Same as today's TopBar nav (post-Phase-7).

**Artist scope:**
```
Overview · Tours · Contracts · Earnings · Files
```
NEW for Sprint 10. The artist hub at `/artists/[id]` becomes "Overview". The other items are stubs initially — most will be Sprint 11+ pages. Render the nav, link to the routes, but accept that several lead to placeholder pages.

**Tour scope:**
```
Operations · Budget · Advance
```
Then a SECOND-LEVEL strip below for sub-products (existing OperationsSubNav etc., but conditional on which top-level tour tab is active):

When Operations active:
```
Personnel · Routing · Channel List · Payroll · Rooming · Files · Riders
```

When Budget active:
```
Line items · Receipts · Payroll · Deal memos · Commissions · Summary
```

When Advance active:
```
Setup · Fill (per-show navigation)
```

Active tab in each strip gets the orange-underline treatment from the existing OperationsSubNav.

### 1.5 Mockup spec (post for sign-off before code)

Post a 3-screenshot mockup showing the chrome at each level. Workspace level on `/personnel`. Artist level on `/artists/[id]`. Tour level on `/operations/[tourId]/personnel` (showing all three nav strips: Tour > Operations > sub-page).

### 1.6 Implementation (after mockup sign-off)

New files:
- `src/components/shell/UnifiedTopBar.tsx` — replaces TopBar.tsx + ProductHeader.tsx
- `src/components/shell/BreadcrumbPill.tsx` — the scope path pill
- `src/components/shell/ScopeNavStrip.tsx` — context-aware nav strip
- `src/lib/shell/scope.ts` — pure function deriving `{ level, artistId, tourId }` from a pathname

Files to modify:
- `src/app/(app)/layout.tsx` — mount `<UnifiedTopBar>` at the layout level so every (app) page inherits it. Drop the per-shell wrappers (listAppPageShell / ProductShell) — they collapse into pass-through components or get deleted.
- Every page.tsx under `/operations/`, `/budget/`, `/advance/`, `/artists/`, `/personnel/`, `/equipment/`, `/settings/`, `/admin/`, `/bugs` — drop their custom shell wrappers, render their content directly.

Backward compat: keep `<PageShell>` / `<ProductShell>` exports as aliases of pass-through `<>{children}</>` for any third-party callers. They become no-ops.

### 1.7 Settings becomes a sub-page

Currently `/settings` has only the SiteAdminsCard. Adam's right that it's underweight. Move it to `/workspace/settings` (within the workspace-scope nav). The workspace TopBar gets:

```
Home · Personnel · Equipment · Calendar · Settings · Admin
```

Settings is just a sub-page. Within Settings, render a small list: General · Members · Billing (coming) · Integrations (coming).

### 1.8 Phase 1 commit

```
feat(shell): unified context-aware TopBar + breadcrumb scope model (Sprint 10 §1)
```

---

## Phase 2 — Personnel rework + Equipment library + Survey generator

Adam's `/personnel` page is functional but underwhelming. Reference design: tighter list with avatar + status dot + name + role on two lines + group badges + email + phone + completeness ring + "Connected" pill. See Adam's reference screenshot in `docs/handover/CC_SPRINT_09_PHASE_14.md` §2 (personnel reference under Sprint 10 §2).

### 2.1 Personnel grid rework

In `src/components/personnel/PersonnelLibraryClient.tsx`:

**Drop the existing `<DataTable>`** — replace with a custom div-grid styled like Bug Reports. Reasons:
- Need finer control over row chrome (avatar + status dot, two-line name, badges)
- DataTable's column widths are fighting us
- Need to add row-level features that DataTable doesn't expose cleanly

New row layout (pixel order, left to right):

```
[avatar w/ status dot] Name              [Group badges]  email          phone        [ring]  [⋯]
                       Role/job-title
```

- Avatar: 36px circle, photo if uploaded else initials, with a small green/grey dot in the bottom-right indicating recent activity (green = signed in last 7d, grey otherwise)
- Name: text-sm semibold, lp-text. `toTitleCase` applied.
- Role: text-xs lp-text-tertiary, on the line below name
- Group badges: ADMIN (orange) / ARTIST (purple) / BAND (blue) / CREW (yellow) — rounded chips with white text. Source: extended_profile.groups[] (new — see §2.2)
- Email: text-xs lp-text-tertiary, truncate at column width
- Phone: text-xs lp-text-secondary
- Completeness ring: existing `<CompletenessRing>` (Phase 13.B work)
- Action menu: existing `[⋯]` kebab

**Drop the redundant "Profile incomplete" status pill column entirely.** The ring + tooltip carry that info.

**Swap "Tours" column for "Phone".** Phone is more useful at a glance.

**Filter chips bar above grid** — existing pattern from Phase 13.A.10 (All / Conflicts / Issues / Recently updated / Untouched). Add: filter by group badge (ADMIN / ARTIST / BAND / CREW).

### 2.2 Group badges schema

`personnel.extended_profile.groups` becomes a TEXT[] of group keys. Each value matches one of: `'admin' | 'artist' | 'band' | 'crew' | 'mgmt' | 'tour_manager' | 'production'`. Free-form workspace-defined groups can extend (Sprint 11 if needed).

UI: in the detail slide-over, add a "Groups" multi-select chip editor (existing `<TagEditor>` pattern from Phase 3 members management). Saves to extended_profile.groups.

No migration needed — JSONB extension.

### 2.3 Equipment library (parallel rework)

`/equipment` is a sister surface to `/personnel`. Workspace-wide. Currently a basic grid. Apply the same Bug-Reports-style chrome but with equipment-appropriate columns:

- Image (small thumbnail) + Name (model)
- Category badge (Audio / Lights / Backline / Misc)
- Serial number
- Status (In storage / On tour / Out for repair)
- Last used (date)
- [⋯] menu

Read `src/app/(app)/equipment/page.tsx` and the existing equipment client. Mirror the personnel rework. Same filter chips pattern + group filtering.

### 2.4 Survey/intake form generator

Personnel admin can generate a public-shareable form link for any personnel record. The person clicks the link, fills in their own info (passport, contact, dietary, merch sizes, emergency contacts, etc.), submits, and the data writes back to that personnel record.

Replaces Adam's current Google Forms workflow.

Schema add (migration `088_personnel_intake_tokens.sql`):

```sql
CREATE TABLE IF NOT EXISTS public.personnel_intake_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  personnel_id UUID NOT NULL REFERENCES public.personnel(id) ON DELETE CASCADE,
  workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  token TEXT NOT NULL UNIQUE,
  invited_by_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  expires_at TIMESTAMPTZ NOT NULL DEFAULT (now() + INTERVAL '14 days'),
  submitted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS personnel_intake_tokens_personnel_idx
  ON public.personnel_intake_tokens (personnel_id);

ALTER TABLE public.personnel_intake_tokens ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS personnel_intake_tokens_admin_all ON public.personnel_intake_tokens;
CREATE POLICY personnel_intake_tokens_admin_all ON public.personnel_intake_tokens
  FOR ALL USING (
    workspace_id = public.get_my_workspace_id()
    AND public.can_access('page', 'operations.personnel', 'write')
  ) WITH CHECK (
    workspace_id = public.get_my_workspace_id()
    AND public.can_access('page', 'operations.personnel', 'write')
  );
```

New routes:
- `POST /api/personnel/[id]/intake-token` — admin generates a fresh token, returns the URL
- `GET /api/intake/[token]` — public, returns personnel record + workspace name for the form to display
- `POST /api/intake/[token]/submit` — public, accepts form data, validates token + expiry, writes to personnel.extended_profile, marks `submitted_at`

New page:
- `/intake/[token]/page.tsx` — public, NOT inside `(app)` route group, no auth required. Renders a form with all the v2 personnel fields (passport, visa, emergency contact, dietary, etc.). On submit, shows a "Thanks" confirmation.

In the personnel detail slide-over, add a `[Generate intake link]` button that calls the POST + shows the resulting URL with a Copy button.

### 2.5 Phase 2 commit

```
feat(personnel,equipment): grid rework + group badges + intake form generator (Sprint 10 §2)
```

---

## Phase 3 — Auto-save semantics (no sign-off, ships continuously)

Every multi-field edit slide-over should auto-save on field blur (or after a 600ms debounce). `[Cancel]` reverts ALL changes from the session, including auto-saved ones.

### 3.1 Pattern

Each slide-over captures a snapshot of the entity on open. While open, edits write through to the API on blur/debounce. The Cancel button issues a single PATCH that restores the snapshot, then closes.

A small `<SaveStatus>` pill in the footer shows: "Saved 2s ago" / "Saving..." / "Save failed — retry".

### 3.2 Affected slide-overs

- `<PersonnelDetailSlideOver>`
- `<PersonnelManageSlideOver>` (tour personnel)
- `<EditTourSlideOver>`
- `<MemberManageSlideOver>`
- `<AdvanceTourSlideOver>` (if it exists for tour-level advance edit)
- `<AddPersonnelSlideOver>` — exempt (not edit, it's create)

### 3.3 New helper

`src/lib/forms/useAutoSave.ts` — hook that takes `{ initialState, onSave: (state) => Promise<void>, debounceMs }` and returns `{ state, set, status, cancel }`. Wraps the save lifecycle. All slide-overs adopt it.

### 3.4 Phase 3 commit

```
feat(forms): auto-save on blur + cancel-revert across slide-overs (Sprint 10 §3)
```

---

## Phase 4 — Email/SMS notification dispatcher (mockup-light, ships continuously)

Sprint 9 wrote audit_log rows tagged with `would_email_user_id`. Sprint 10 actually sends them.

### 4.1 Triggers

Each fires an email OR an in-app notification (configurable per-user):

| Trigger | Recipient | Message |
|---|---|---|
| `audit_log.action = 'status_changed'` on `tour_personnel` from confirmed→cancelled | personnel.user_id (if linked) | "Your assignment for {tour_name} on {dates} has been cancelled." |
| `workspace_invites` row created | invited_email | Invitation email with the accept link |
| Invite accepted | inviter (workspace_invites.invited_by_user_id) | "{name} accepted your invite to {workspace}" |
| Personnel intake form submitted | invited_by_user_id (token row) | "{personnel.name} has filled in their intake form" |
| Conflict detected on assignment | both managers | "{name} has been assigned to overlapping tours" |

### 4.2 Implementation

Use Supabase Auth's email infrastructure for invite emails (already supported via the auth invite token flow). For status-change / submission / conflict emails, use Resend.

**Resend setup notes** — Adam confirms a Resend API key already exists in his Vercel env (Resend-format `re_...`). Phase 4 needs to:
- Install `resend` npm package (one explicit exception to "no new deps")
- Read the key from `process.env.RESEND_API_KEY` (or whatever name Adam confirms — check before coding)
- Adam will mirror the key into `.env.local` so dev dispatch works

Don't store the key in code, don't echo it in logs, don't commit it to git.

New files:
- `src/lib/notifications/dispatcher.ts` — reads audit_log rows since last run, dispatches via Resend
- `src/lib/notifications/templates.ts` — email templates (subject + HTML body) for each trigger
- `src/app/api/cron/dispatch-notifications/route.ts` — Vercel cron endpoint, runs every 5 minutes
- `vercel.json` — cron config

For dev: a `[Test send]` button in /admin/audit log that fires the dispatcher manually.

### 4.3 Schema add (migration 089)

```sql
ALTER TABLE public.audit_log
  ADD COLUMN IF NOT EXISTS notification_dispatched_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS audit_log_pending_notifications_idx
  ON public.audit_log (created_at)
  WHERE notification_dispatched_at IS NULL
    AND action IN ('status_changed', 'created');
```

The dispatcher query becomes: `SELECT ... FROM audit_log WHERE notification_dispatched_at IS NULL AND ...`. After dispatch, the column is set, so the row isn't re-processed.

### 4.4 Phase 4 commit

```
feat(notifications): email dispatcher + Resend integration + audit_log read pattern (Sprint 10 §4)
```

---

## Phase 5 — Polish + auth callback fixes

Smaller items, single commit. No sign-off.

### 5.1 Auth callback preservation for invite tokens

Sprint 9 §14.3 partially fixed the invite flow but flagged: signup → email confirm → invite-token preservation needs `/auth/callback` plumbing. Same for Google OAuth.

`src/app/auth/callback/route.ts` should accept a `next` param, validate it (open-redirect guard), and redirect there after confirming. Update signup + OAuth flows to pass `next=<encoded invite URL>` through the auth handshake.

### 5.2 Tooltip darkness

`<Tooltip>` primitive — bump background to `var(--lp-bg-strong)` (or whatever is darker than the current value). Adam said "not dark enough" on smoke 13bG2.

### 5.3 File upload preview thumbnails

Personnel detail slide-over Files section — when a file is uploaded, generate or fetch a thumbnail. For images: use the actual image. For PDFs: use the first-page thumbnail (Vercel image optimization or pdf-thumbnail lib). For others: use a generic file icon.

### 5.4 Drag-and-drop on upload zones

Both head shot and passport scan boxes in the upload section — accept dragged files, not just click-to-pick. Use HTML5 drag-and-drop. Visual: dashed border on hover-with-file.

### 5.5 Workspace name lowercase fix (carry-over)

Adam reported "adam's Workspace" still appears lowercase in some surfaces. Audit all workspace name display points and apply `toTitleCase`. Specifically check the OLD workspace switcher and any lingering mounts.

### 5.6 Connection state on Operations summary header (deferred from Sprint 9)

The Live/Connecting/Offline/Save-failed indicator from Phase 13.B should also appear on Operations / Budget / Advance product headers. Currently it's only on sub-pages with realtime subscriptions.

Mount `<ConnectionIndicator>` in `<UnifiedTopBar>` from Phase 1, visible on all tour-scope pages. Hide on workspace + artist scopes (no realtime there).

### 5.7 Phase 5 commit

```
chore(ui,auth): tooltip darkness + file upload preview + drag-drop + auth callback (Sprint 10 §5)
```

---

## Reporting expectations

Per phase, post:

```
Phase N done. Commit: <hash>
Files added/modified: [list with file:line for load-bearing logic]
Migration apply note: [if any]
Verify: tsc / lint / build
Smoke: [specific items Adam should test]
Blockers: [empty if clean]
```

After Phase 5, post the final wrap:

```
Sprint 10 complete. Branch: feat/sprint-10-ia-and-polish
Commits in order:
  - <hash>: Phase 1 — Workspace IA + chrome unification
  - <hash>: Phase 2 — Personnel + Equipment + intake forms
  - <hash>: Phase 3 — Auto-save semantics
  - <hash>: Phase 4 — Notification dispatcher
  - <hash>: Phase 5 — Polish + auth callback

Migrations applied (manual via Supabase SQL Editor + tracking insert):
  088, 089

Smoke: [full smoke checklist saved at docs/handover/SPRINT_10_FINAL_SMOKE.md]
Ready for Adam's pass + merge to main.
```

---

## Out of scope for Sprint 10 (Sprint 11+)

- Stripe billing — Adam can sell via direct invoice during alpha. Sprint 11.
- Workspace creation UI ("+ Create workspace") — Stripe-coupled. Sprint 11.
- Mobile PWA `/m/*` routes — large standalone project. Sprint 11 or 12.
- Per-show personnel assignment grid — refinement #3 from Phase 6. Defer until a real user case demands it.
- Audit log advanced filtering / visualisation in /admin/audit — current basic filters work. Polish-tier.
- Rental-inventory route fix per `CC_RENTAL_DENORMALISE.md` — separate sprint.
- "No Key Contacts section" investigation from Sprint 8.6 — never reproduced after migration 076 was applied. Mark closed unless Adam re-hits it.
- Spotify search → genre extension — separate sprint when artist hub gets fleshed out.
- Image cropping / processing for uploaded files — raw upload only v1. Sprint 11 polish.
- Per-personnel `tour_personnel.tags` column — defer until per-tour tag UI is needed.

---

## Smoke checklist scaffold

Save to `docs/handover/SPRINT_10_FINAL_SMOKE.md` for Adam's testing pass. Include:

- §1 Chrome unification across all pages (workspace / artist / tour scopes — three-screenshot expectation)
- §2 Personnel + Equipment grid styling, intake form generation + public form submission
- §3 Auto-save behaviour on every slide-over + Cancel revert + status pill
- §4 Notification dispatch (manual fire from /admin/audit then check Resend dashboard for delivery)
- §5 Tooltip darkness, file preview, drag-drop, auth callback flow

Format as numbered tests with PASS/FAIL criteria, same pattern as the Sprint 9 smoke doc.
