# Sprint 10 — Final smoke checklist

Branch: `feat/sprint-10-ia-and-polish`
Commits: `556bc30` → `e2e73e9` → `89dd6cc` → `591782d` → `149d190`
Migrations to apply (sequential): **088, 089** via `npm run db:migrate`

Run each test, mark PASS / FAIL / N/A. Note any defects under "Notes". Same format as the Sprint 9 smoke doc.

---

## §1 — Chrome unification across all pages

### 1.1 Workspace scope chrome (`/personnel`)
- **PASS criteria:** UnifiedTopBar shows logo + workspace switcher (no breadcrumb pill). ScopeNavStrip below: `Home · Personnel · Equipment · Settings · Admin`. Personnel link is orange-underlined. Right cluster: Search ⌘K + Admin pill (when site admin) + user pill with avatar+name. ConnectionIndicator is HIDDEN (workspace scope).
- Notes:

### 1.2 Artist scope chrome (`/artists/[id]`)
- **PASS criteria:** UnifiedTopBar shows logo + workspace switcher + breadcrumb pill `[● avatar] {Artist Name}` (no `›`). ScopeNavStrip: `Overview · Tours · Contracts · Earnings · Files`. Overview is active. Click the avatar in breadcrumb → existing artist+tour switcher dropdown opens. ConnectionIndicator HIDDEN.
- Notes:

### 1.3 Artist sub-page stubs
- **PASS criteria:** `/artists/[id]/tours`, `/artists/[id]/contracts`, `/artists/[id]/earnings`, `/artists/[id]/files` each render a "Coming soon" panel with a one-line description. Sub-nav strip stays visible so user can navigate sideways.
- Notes:

### 1.4 Tour scope chrome (`/operations/[tourId]/personnel`)
- **PASS criteria:** UnifiedTopBar shows logo + workspace switcher + breadcrumb pill `[● avatar] {Artist} › {Tour}`. ScopeNavStrip: `Operations · Budget · Advance`, Operations active. SubNavStrip below: `Summary · Personnel · Routing · Channel List · Payroll · Rooming · Files · Riders`, Personnel active. ConnectionIndicator VISIBLE in right cluster.
- Notes:

### 1.5 Breadcrumb tour segment links to summary
- **PASS criteria:** From `/operations/[tourId]/personnel`, clicking the tour name in the breadcrumb pill navigates to `/operations/[tourId]` (Operations summary). Clicking the artist name navigates to `/artists/[id]`.
- Notes:

### 1.6 Placeholder operations pages keep sub-nav
- **PASS criteria:** `/operations/[tourId]/channel-list` (Phase Scaffold placeholder) shows ScopeNavStrip + SubNavStrip + the "Coming soon" body. No vanishing chrome (regression check on Sprint 9 §13.C2b).
- Notes:

### 1.7 Settings sub-nav has 4 entries
- **PASS criteria:** `/settings` shows sub-nav: `General · Members · Billing · Integrations`. `/settings/billing` and `/settings/integrations` render "Coming soon" panels.
- Notes:

### 1.8 Workspace switcher single-workspace label
- **PASS criteria:** Workspace name displays title-cased in workspace switcher (`Adam's Workspace`, not `adam's Workspace`). Same for the dropdown items when there are multiple workspaces.
- Notes:

### 1.9 Avatar trigger in breadcrumb opens combined picker
- **PASS criteria:** From any artist or tour scope page, clicking the avatar in the breadcrumb pill opens the existing `<ArtistTourSwitcher>` dropdown (artists pane → tours pane). Picking a different artist + tour navigates accordingly.
- Notes:

### 1.10 No double TopBar / ProductHeader
- **PASS criteria:** No duplicate header strip on any page. The old `<TopBar>` (shell-v1) and `<ProductHeader>` (shell-v2) mounts are retired — only `<UnifiedTopBar>` from `(app)/layout.tsx` renders.
- Notes:

---

## §2 — Personnel + Equipment grid styling, intake form

### 2.1 Personnel grid Bug-Reports-style chrome
- **PASS criteria:** `/personnel` shows the new div-grid (not DataTable). Sticky header row with "Select all" checkbox + columns: Name / Groups / Email / Phone / Profile / actions. Each row shows a 36px avatar with a green/grey status dot, two-line name (display name semibold + role/job-title in lp-text-tertiary), group chips, email truncated, phone, ring, kebab.
- Notes:

### 2.2 Avatar status dot + image fallback
- **PASS criteria:** Personnel rows updated within the last 7 days show a GREEN status dot (bottom-right of avatar). Older rows show GREY. When a head shot has been uploaded, the avatar image renders; otherwise initials fall back.
- Notes:

### 2.3 Group badges render with tone-coded colors
- **PASS criteria:** A row tagged with `admin` shows an orange ADMIN chip. `artist` → purple, `band` → blue, `crew` → yellow, `mgmt` → green, `tour_manager` → teal, `production` → pink. Multiple groups stack as multiple chips.
- Notes:

### 2.4 Group filter chips
- **PASS criteria:** Filter chip strip above the grid has the existing `All · Conflicts · Issues · Recently updated · Untouched` plus seven new group chips (`Admin · Artist · Band · Crew · Mgmt · TM · Prod`) each with a per-group count. Clicking a group chip filters the grid to rows tagged with that group.
- Notes:

### 2.5 Groups multi-select editor in slide-over
- **PASS criteria:** Open a personnel detail slide-over → new "Groups" section near the top (default open). Toggle group chips → save → row's badges in the grid update to match.
- Notes:

### 2.6 Intake link generation
- **PASS criteria:** Personnel detail slide-over header has a `[Generate intake link]` button (visible only in edit mode). Click → URL appears in a chip with a Copy button. URL auto-copies on first generation when supported.
- Notes:

### 2.7 Public intake form happy path
- **PASS criteria:** Open the generated `/intake/[token]` URL in incognito. Form renders with workspace + personnel name. Fill passport (country/number/given/surname/dates), emergency contact, dietary, t-shirt size. Submit. "Thanks" panel shows. Reopen the personnel detail slide-over → submitted data lands in the v2 sections (passports_v2[0], emergency_contacts[0], dietary[0], merch_sizes[0]).
- Notes:

### 2.8 Intake link expiry / re-use protection
- **PASS criteria:** Submitting the form a second time on the same token shows the "Thanks — your details are in" panel, NOT the form (token is single-use; submitted_at stamped server-side prevents replay). Visiting an unknown / made-up token → "This intake link isn't valid" panel.
- Notes:

### 2.9 Intake link RLS gate
- **PASS criteria:** Logged in as a readonly workspace member (no `operations.personnel.write` grant), open a personnel detail slide-over → the `[Generate intake link]` button POST returns 403 / RLS error. Admin / manager flows succeed.
- Notes:

### 2.10 Equipment grid (DEFERRED)
- **N/A — deferred to Sprint 11 follow-up.** Equipment grid keeps existing DataTable chrome until a focused commit applies the same rework. Note in Phase 2 commit body.

---

## §3 — Auto-save semantics

### 3.1 useAutoSave + SaveStatus primitives compile + ship
- **PASS criteria:** `src/lib/forms/useAutoSave.ts` and `src/components/forms/SaveStatus.tsx` exist and typecheck. No adoption in slide-overs is shipped in this sprint — that's an incremental follow-up per phase commit body.
- Notes:

### 3.2 Adoption in slide-overs (DEFERRED)
- **N/A — deferred.** Adopting useAutoSave in PersonnelDetailSlideOver / PersonnelManageSlideOver / EditTourSlideOver / MemberManageSlideOver is multi-day per slide-over (each carries bespoke validation gates / confirmation modals / permission flows). Per Phase 3 commit body, follow-up commits will adopt one slide-over at a time.

---

## §4 — Notification dispatch

### 4.1 Migration 089 applies cleanly
- **PASS criteria:** `npm run db:migrate` against staging applies migration 089 cleanly. `audit_log.notification_dispatched_at` column exists. Partial index `audit_log_pending_notifications_idx` exists.
- Notes:

### 4.2 Manual test send (admin)
- **PASS criteria:** Logged in as site admin, POST `/api/admin/notifications/test-send` from a browser console or Postman → returns `{ ok: true, attempted: N, sent: M, failed: K, failedReasons: [...] }`. No errors.
- Notes:

### 4.3 Cron dispatch (production)
- **PASS criteria:** Vercel deploy carries the new `vercel.json` with the `*/5 * * * *` cron. Within 5 minutes of cancelling a `confirmed` tour personnel assignment, the affected person receives an email "Your assignment for {tour} has been cancelled." Check Resend dashboard for delivery confirmation.
- Notes:

### 4.4 audit_log row stamped after dispatch
- **PASS criteria:** After a successful dispatch, the corresponding `audit_log` row's `notification_dispatched_at` is set (verifiable via Supabase SQL Editor). Row does NOT re-process on the next cron pass.
- Notes:

### 4.5 Failed dispatch retries
- **PASS criteria:** With `RESEND_API_KEY` temporarily unset OR a bad recipient address, the cron returns `failed > 0`. The audit_log row is NOT stamped — leaves it for retry. After fixing the env / recipient, the next cron pass attempts again and succeeds.
- Notes:

### 4.6 Cron auth
- **PASS criteria:** GET `/api/cron/dispatch-notifications` without a Bearer token (or with the wrong one when `CRON_SECRET` is set) returns 401. With the right token, it dispatches.
- Notes:

---

## §5 — Polish + auth callback

### 5.1 Tooltip darkness
- **PASS criteria:** Hover the completeness ring on a personnel row. The tooltip panel reads BLACK (or near-black) — clearly darker than the v1 `var(--lp-text)` value. Text on the panel is white. Closes Adam's smoke 13bG2.
- Notes:

### 5.2 File upload preview thumbs
- **PASS criteria:** A passport scan that's an image (jpeg / png / webp) shows a 32×32 thumbnail in the scan list. A PDF shows a styled file-icon chip instead of the thumbnail.
- Notes:

### 5.3 Drag-and-drop file upload
- **PASS criteria:** Drag a file from Finder / desktop / browser tab onto the head-shot empty-state button (or the passport-scan add-button). The button shows a dashed orange outline + "Drop to upload" overlay. Releasing fires the upload (same as click-to-pick path).
- Notes:

### 5.4 Auth callback `next` preservation (login)
- **PASS criteria:** Visit a fresh invite link in incognito. Click "Sign in to accept". Login form's URL has `?next=<encoded invite URL>`. After login, redirected back to the invite page (NOT /dashboard).
- Notes:

### 5.5 Auth callback `next` preservation (signup)
- **PASS criteria:** Visit a fresh invite link in incognito. Click "Create account to accept". Signup form's URL has `?next=<encoded invite URL>`. After confirming via email, redirect lands on the invite page.
- Notes:

### 5.6 OAuth callback `next` preservation
- **PASS criteria:** Visit a fresh invite link in incognito. Click "Sign in to accept". Use Google OAuth. After Google's callback, redirect lands on the invite page.
- Notes:

### 5.7 Open-redirect guard
- **PASS criteria:** Manually visit `/login?next=//evil.com/path` or `/login?next=https://evil.com` → after login, redirect lands on `/dashboard` (the safe fallback), NOT on evil.com. Same on `/auth/callback`.
- Notes:

### 5.8 ConnectionIndicator scope-aware
- **PASS criteria:** ConnectionIndicator is VISIBLE on `/operations/[tourId]/*`, `/budget/[tourId]/*`, `/advance/[tourId]/*`. HIDDEN on workspace pages (`/personnel`, `/equipment`, `/settings`) and artist pages (`/artists/[id]`).
- Notes:

### 5.9 Workspace name title-case audit
- **PASS criteria:** Search for `workspace.name` / `workspaceName` references — every display point passes through `toTitleCase`. No raw `{workspace.name}` text leaks lowercase.
- Notes:

---

## Smoke summary

- Total tests: 30+ items above
- PASS:
- FAIL:
- N/A (intentional):
- Notes / defects:

After Adam's pass, deferred items:
- Sprint 10 §2.3 Equipment grid Bug-Reports rework
- Sprint 10 §3.2 useAutoSave adoption in 4 slide-overs
- Sprint 10 §4 invite_accepted / intake_submitted / conflict_detected templates wiring (Sprint 11 with email_sent_at columns)
- Sprint 10 §5.2 PDF page-1 thumbnails (Sprint 11 polish)
- Per Sprint 10 spec "Out of scope": Stripe billing, mobile PWA, audit log advanced filtering, etc.
