# Lowpass — Build Plan: Full Parity with advancewithme.live

**Author:** Claude (Cowork) for Adam
**Date:** 17 April 2026
**Source research:**
- `outputs/awm-research.md` (competitor recon — 31KB, ~40 API endpoints catalogued)
- `outputs/lowpass-map.md` (Lowpass architecture map — 315 lines)
- `CURSOR_PROMPTS.md` (existing 4-phase visual overhaul — DONE)
- `DESIGN_SYSTEM.md` (design tokens)

**Cadence (approved by Adam):** Plan → approve → ship **PR by PR**. Each PR self-contained; passes `npx tsc --noEmit --skipLibCheck`; respects RLS workspace-scoping; uses `Dynamic.tsx` wrappers where needed.

---

## 0. Ground rules baked into every PR

1. **Workspace scoping** — every new Supabase table gets RLS policies routed through `get_my_workspace_id()` (or through the `routing → tour → workspace` chain where the row isn't directly workspace-owned).
2. **TypeScript strict** — zero `// @ts-ignore`, zero `any`, explicit function param typing. `npx tsc --noEmit --skipLibCheck` must pass before commit.
3. **SSR-unsafe components** live in `*Dynamic.tsx` `'use client'` wrappers (pattern: `AdvanceSectionBuilderDynamic.tsx`, `TourBudgetAccordionDynamic.tsx`).
4. **Design tokens only** — `#FF4500` orange accent, `var(--lp-*)` CSS vars, Heroui components, Lucide icons, `cn` from `@/lib/utils`. No new design accents.
5. **No new top-level routes** unless the plan names them. Feature URLs slot into `(app)/tours/[id]/…` or new `(share)/…` group.
6. **Storage — Supabase only.** All app data (DB + file uploads) lives in Supabase. The `STORAGE_PROVIDER=google_drive` flag in `.env.example` is vestigial (Drive only stores the codebase for Cursor/VS Code access). I'll verify this with a grep in PR A1 and flag anything still writing to Drive. New buckets created as needed (`advance-pdfs` in PR A2, `tech-packs` in Phase I, etc.). No storage-abstraction wrapper needed.
7. **Migrations numbered sequentially** continuing from `032_*`. Each migration file self-contained, idempotent where possible (`CREATE TABLE IF NOT EXISTS`, `DROP POLICY IF EXISTS`).

---

## 1. Assumptions — status

- **A1.** ✅ **CONFIRMED** — PDF runtime: `puppeteer-core` + `@sparticuz/chromium` on Vercel's Node runtime (`maxDuration: 60`). Self-hosted, no external service. Fallback to PDFShift only if function size blows up.
- **A2.** Realtime provider: Supabase Realtime (already part of the project — just enable table publication in dashboard). Will confirm in PR B4.
- **A3.** External collaborator model: **token-first, optional account**. Share link with `permission='edit'` lets anon venues edit without signing up. If they want comments/notifications, they claim the link via magic-link (Resend). Will confirm in Phase C.
- **A4.** Venue directory: extend `venues` with `google_place_id` UNIQUE. Places API already integrated. Will confirm in Phase G.
- **A5.** ✅ **CONFIRMED** — Billing deferred to Phase K.
- **A6.** AI autofill UX: **review-before-apply** (not silent autopopulation). Will confirm in Phase I.
- **A7.** ✅ **CONFIRMED** — Delivery: **patch file per PR**, written to `outputs/patches/`. Adam applies via `git apply` in Cursor. No direct commits to working tree.
- **A8.** ✅ **CONFIRMED** — Nav rework is **Phase A0** (before PDF work). Adds 2–3 days upfront; everything else ships into the new shell.
- **A9.** ✅ **CONFIRMED** — Custom fields stay. The competitor's "four template types" (whole-advance / schedule / rider / labor-call) become **semantic tags** on Lowpass's existing flexible `advance_form_configs` JSONB sections, *not* a rigid replacement. Best of both: full per-tour/venue customisation + battle-tested starter templates.
- **A10.** ✅ **CONFIRMED** — Creds-first workflow: Adam signs up, shares creds, I do the authed walkthrough, *then* PR A0.1 starts.

---

## 1.5 Authed walkthrough refinements (2026-04-19)

Adam authed into advancewithme.live as `adamgrowley@gmail.com`. Event creation was paywalled at Solo $120/mo, but the free tier exposed enough surface (templates, invites inbox, dashboard activity feed, account shell) to refine 5 points in the plan. Full raw capture in `awm-authed-walkthrough.md`. Adam chose **not** to buy Solo; we ship on this evidence.

**R1. Typed field metadata on advance sections.** Competitor tags every advance field with one of `Short text | Long text | Multiple choice | File`. Lowpass keeps the flexible untyped JSONB sections *as the default*, but Phase E adds an optional `field_type` key per field so starter templates can declare types (needed later for autofill validation, PDF formatting, and multiple-choice rendering). Existing custom fields keep working as untyped `short_text` — zero migration required. → **new PR E0**.

**R2. Rider is a distinct entity, not an advance section.** Competitor has four template *kinds*, not four template *tags* of the same entity. Rider uses a different schema: draggable `{label, value, attachment?}` items, per-section file attachment, document-level title + subtitle, reverse information flow (tour → venue). Phase E splits Rider into its own table + page rather than forcing it into `advance_form_configs`. Daysheets and Labor Call also get their own minimal entities. → **Phase E expands from 3 → 6 PRs**.

**R3. Daysheet is derived, not templated.** Competitor's Daysheets & Schedules tab ships zero defaults — empty state reads "Save a daysheet from an advance, or create one from scratch." Daysheets are built from completed advance data (schedule rows + labor call times + venue contacts), not from blank templates. Phase E's daysheet PR is a generator, not a CRUD. → folded into Phase E.

**R4. Invites are a first-class inbox with 4 states.** `/invites` page has tabs `All Upcoming | New Requests | Active | Archive` plus a search-by-artist/event/venue bar and a date-range filter. Not just a flag on events — a dedicated inbox view. → **new PR C4** (Invites inbox page).

**R5. Cross-entity Recent Activity feed.** Dashboard has a "Recent Activity" panel with grouped timeline (Last Week / This Week / etc.) — activity logged across *all* entities in the workspace, not per-advance. Observed entry: "You created labor call template 'Standard Show Day' — 2 days ago". Phase H's activity log was scoped per-advance; widen it to workspace-scoped and surface it on the dashboard. → **Phase H PR H2 rewritten + new PR H4** (dashboard widget).

---

## 2. Phase / PR sequence

Order is **highest leverage first**, per Adam's direction. Phases A and B are the two features most visible to a venue receiving an advance — they turn Lowpass from "internal TM tool" into "thing you send to a venue".

| Phase | Feature | PRs | Est. days |
|---|---|---|---|
| **A0** | **Nav rework (pill-slider top bar)** | **4** | **2–3** |
| A | Server-side PDF generation | 3 | 3–4 |
| B | Live-link share + realtime | 5 | 5–6 |
| C | External collaborators + invites (inbox with 4 states) | 4 | 3–4 |
| D | Versioning + restore | 3 | 2–3 |
| E | Templates: Advance (typed) + Rider + Labor Call + Daysheet | 6 | 5–6 |
| F | Precision scheduling with dependencies | 3 | 3–4 |
| G | Venue directory (Google Places) | 3 | 2 |
| H | Chat + notes + **workspace** activity log + dashboard feed | 4 | 3–4 |
| I | AI autofill from venue tech-pack upload | 3 | 3 |
| J | Push notifications | 2 | 2 |
| K | Billing / tier gating (Stripe) | 2 | 3 |
| **Total** | | **42 PRs** | **~40 days** solo dev |

---

## PHASE A0 — Nav rework (pill-slider top bar)

**Why it goes first.** Every feature from Phase A onward ships UI — PDF buttons, Share buttons, template pickers, version history panels. If the nav skeleton shifts mid-build, we churn each feature's header placements. Doing A0 first means every later PR slots into the new shell with zero rework.

**Design direction (confirmed with Adam).** The two-axis model:
- **Horizontal axis (top bar)** = mode switching. `Artist / Tour` breadcrumb + `Advance | Budget` pill slider + user/notifications on the right. "Tablet OS" feel — floating, rounded, light chrome.
- **Vertical axis (sidebar)** = show picking. The `TourRoutingList` (chronological show list) stays in the sidebar; that's the only thing it does now. Secondary nav (Rooming, Payroll, Personnel, Venues, Equipment, Calendar, Settings) moves to a collapsed "Workspace" group below the routing list, or to a kebab menu in the top bar — decided in PR A0.3.

**What gets removed.**
- The in-sidebar `[Advance | Budget]` segmented toggle (promoted to the top pill).
- The old `HeaderArtistTourPicker` dropdown-on-click behaviour (replaced by the new top-bar breadcrumb component).
- The custom LP SVG active-state path in the sidebar (already flagged in CURSOR_PROMPTS Phase 4 as inconsistent).

**What stays.**
- All routes, all existing pages, all API endpoints — A0 is chrome only.
- `ArtistTourContext` hydration behaviour, `lp-sidebar-mode` localStorage key (repurposed to persist active top-bar pill).
- Collapse/expand sidebar toggle.
- Phase 1 navigation model (DashboardArtistGate states, `/tours/{id}/advance/{routingId}` canonical URL).

---

### PR A0.1 — Top bar: `AppTopBar` component
**Goal.** Replace the existing header with the new pill-slider top bar.

**New files.**
- `src/components/layout/AppTopBar.tsx` — the new header. Structure (left → right):
  - `AppTopBarBreadcrumb` — 32px artist image, Artist Name / Tour Name, each clickable to switch inline (reuses existing switch logic from `HeaderArtistTourPicker`).
  - `AppTopBarModePill` — the `[Advance | Budget]` pill slider, 40px tall, `rounded-full`, white surface with subtle shadow, orange active pill with animated `translateX`. Active state persisted to `lp-sidebar-mode` localStorage key (same key as current toggle so behaviour survives the rename).
  - `AppTopBarActions` — right-aligned icon buttons for notifications (placeholder for Phase J), help, user menu (existing). Overflow kebab for Rooming/Payroll/etc. if we land on the kebab option in A0.3.
- `src/components/layout/AppTopBarDynamic.tsx` — `'use client'` wrapper for the parts that need client interactivity; keeps server-rendered shell fast.

**Changed files.**
- `src/components/layout/AppShell.tsx` — replace `<HeaderArtistTourPicker />` with `<AppTopBarDynamic />`. Adjust main content top padding to accommodate new floating pill bar height (~64px vs current ~56px).
- `src/components/layout/HeaderArtistTourPicker.tsx` — mark deprecated; delete in PR A0.4.

**Acceptance.**
- Visible on every `(app)/*` route.
- Pill click navigates: Advance → `/tours/${tourId}/advance` (or `/tours/${tourId}/advance/${lastRoutingId}` if persisted); Budget → `/budget?tour_id=${tourId}`.
- URL sync useEffect: if pathname starts with `/budget`, pill shows Budget active; if `/tours/.../advance`, Advance active.
- `aria-pressed` on the pill buttons, focus ring visible on keyboard tab.
- Animated pill transition uses CSS `transform` + `transition-transform` only (no framer-motion per CURSOR_PROMPTS rule).
- `npx tsc --noEmit --skipLibCheck` clean.

---

### PR A0.2 — Sidebar simplification
**Goal.** Remove the in-sidebar `[Advance | Budget]` mode toggle. `TourRoutingList` keeps prime real estate; the existing `tourSecondaryItems` (Tour Summary / Tour personnel / Settlement / Rooming / Payroll) stay **always-visible** below the routing list when a tour is selected. Collapsible "Workspace" group deferred (decision per Adam 2026-04-19: "just keep them for now, can adapt later").

**Changed files.**
- `src/components/layout/Sidebar.tsx`:
  - Remove constants `SIDEBAR_MODE_KEY` and type `SidebarNavMode`.
  - Remove state `navMode` + its `setNavMode` usages.
  - Remove the localStorage persist effect for nav mode.
  - Remove the pathname→navMode sync effect.
  - Remove the `[Advance | Budget]` button block (lines ~388–429 pre-edit).
  - Hardcode `mode="advance"` on the `<TourRoutingList>` invocation.
  - Leave everything else untouched (overview items, tour management items, base groups, user footer, Artist Overview heading, Change tour control, collapsed/expand, etc.).
- `src/components/layout/TourRoutingList.tsx` — no change. Component still accepts `mode` prop (used for href + active detection); we just always pass 'advance'.
- No changes to `AppTopBarModePill.tsx` — the top-bar pill keeps the `lp-sidebar-mode` localStorage key as its own (rename deferred to A0.4).

**Acceptance.**
- Sidebar renders without the toggle row; no visual gap left behind.
- Clicking a show in `TourRoutingList` still navigates to `/tours/<tourId>/advance/<routingId>`.
- Clicking Budget in the top-bar pill still navigates to `/budget?tour_id=<tourId>` — and the sidebar itself doesn't react (no re-render churn).
- Secondary nav items (Tour Summary / Tour personnel / Settlement / Rooming / Payroll) all resolve to existing routes when clicked.
- `npx tsc --noEmit --skipLibCheck` clean.
- No residue: `git grep SIDEBAR_MODE_KEY` / `git grep SidebarNavMode` / `git grep "navMode"` inside `src/components/layout/Sidebar.tsx` returns zero matches.
- Collapsed sidebar (72px) still renders routing list + tour-secondary icons correctly.

---

### PR A0.3 — Secondary-nav home decision + mobile collapse
**Goal.** Decide where the less-used nav items live long-term, and make the top bar usable under 768px.

**Decisions to lock in during PR (I'll recommend in PR description):**
- Option α: Kebab menu in the top bar (`⋯` icon opens a dropdown). Pros: clean sidebar, dead space in top-right filled. Cons: hides things deeper.
- Option β: Keep in the sidebar under "Workspace" collapsible (from A0.2). Pros: discoverable, uses existing vertical space. Cons: two layers of collapse.
- Option γ: Both (show key ones in kebab, all in sidebar). Pros: best discoverability. Cons: duplicated surfaces.

**Default recommendation: β** — it's what A0.2 already ships. Only move to α/γ if Adam requests.

**Mobile changes.**
- Under 768px: top bar collapses — breadcrumb truncates, pill slider stays full-width, actions collapse into a single menu icon. Sidebar becomes a drawer behind a hamburger.
- `src/hooks/useIsMobile.ts` (new if not already present) — simple `window.matchMedia('(max-width: 767px)')` hook.

**Acceptance.**
- Resize from 1920 → 375px: no overflow, no cut-off controls, pill slider always tappable with 44×44px minimum touch target.

---

### PR A0.4 — Cleanup + remove deprecated code
**Goal.** Delete the old header component and any orphaned styles/utilities.

**Changed files.**
- Delete `src/components/layout/HeaderArtistTourPicker.tsx`.
- Delete any old sidebar toggle CSS classes in `globals.css` that are no longer referenced.
- Search for stale `lp-mode-toggle` or similar classnames and remove.

**Acceptance.**
- `npx tsc --noEmit --skipLibCheck` clean.
- `npm run build` succeeds.
- No `git grep HeaderArtistTourPicker` hits remain.
- Visual diff against pre-A0 on main routes: top bar is new, sidebar is simpler, everything else unchanged.

---

## PHASE A — Server-side PDF generation

### PR A1 — PDF infra
**Goal.** Add the dependency + serverless config. No UI changes.

**Deps.**
- `puppeteer-core@^23` (bundled chromium excluded — we use Sparticuz's)
- `@sparticuz/chromium@^127`

**New files.**
- `src/lib/pdf.ts` — `renderPdf({ url, authCookie }): Promise<Buffer>`. Spins up chromium, loads URL with auth cookie set, waits for `networkidle0`, calls `page.pdf({ format: 'A4', printBackground: true, margin: ... })`. Closes browser.
- `database/migrations/033_advance_pdfs_bucket.sql` — creates private Supabase Storage bucket `advance-pdfs` (or instruction note if storage must be created in dashboard).
- **Pre-flight grep:** I'll confirm no code is still writing to Google Drive. If anything is (`STORAGE_PROVIDER` checks, Drive SDK imports), I'll flag in the PR description — not necessarily block the PR, but flag for follow-up.

**Changed files.**
- `next.config.ts` — add `serverExternalPackages: ['@sparticuz/chromium', 'puppeteer-core']` so Next doesn't try to bundle them.
- `package.json` / lockfile.

**Acceptance criteria.**
- `npm run build` succeeds.
- `npx tsc --noEmit --skipLibCheck` clean.
- New `/api/_debug/pdf-smoke` route (dev-only, gated on `NODE_ENV !== 'production'`) renders `example.com` to PDF and writes it to `advance-pdfs/_smoke.pdf`; manual curl returns 200.
- Deployed to Vercel preview successfully (function size under 50MB — Sparticuz is ~40MB gzip; verify).

**Risks.**
- Vercel function size / cold start. If close to limit, cut Sparticuz fonts or move to Vercel's `edge-runtime: 'nodejs'` explicit. Fallback: swap for an external PDF service (PDFShift) behind the same `src/lib/pdf.ts` interface — API unchanged.

---

### PR A2 — PDF render route + print-optimised view
**Goal.** Generate a polished advance PDF for any routing instance.

**New files.**
- `src/app/(print)/advance/[routingId]/pdf-view/page.tsx` — a standalone route group `(print)` with no sidebar, no header, just the advance content rendered for A4 paper. Pulls same data as `AdvanceShowReadView` via a server component. Page-break-before on each section, print CSS rules, Lowpass letterhead on page 1.
- `src/app/api/advance/[instanceId]/pdf/route.ts` — `GET` handler. Auth → check permissions → resolve routingId → call `renderPdf({ url: '${NEXT_PUBLIC_APP_URL}/advance/${routingId}/pdf-view?token=<internal>' })` → `putObject` → return `{ url: signedUrl, filename }`. Internal token is a short-lived JWT so the headless browser can authenticate into the print view.
- `src/lib/internal-jwt.ts` — mint/verify short-lived JWT for internal cross-calls (headless browser → app). Secret from env.

**Changed files.**
- `.env.example` — add `INTERNAL_JWT_SECRET`.

**Acceptance.**
- Open any show, hit `/api/advance/${instanceId}/pdf` → receive signed URL → opening URL shows clean A4 PDF with Key Info block on page 1, section cards following.
- Empty advance renders gracefully ("No advance data — complete sections in Lowpass").
- PDF filename format: `Lowpass – {Artist} – {Tour} – {City} {DD MMM}.pdf`.
- Total request time under 10s on Vercel cold start.

**Risks.**
- Headless chromium can't see our auth cookie on first load. Mitigated by JWT-in-URL pattern. Validated by matching JWT audience to "internal-pdf-render".

---

### PR A3 — "Download PDF" UI
**Goal.** Surface the PDF generation to the TM.

**Changed files.**
- `src/components/advance/AdvanceShowReadView.tsx` — add a "Download PDF" button next to the existing "Print" button in the sticky header. Shows spinner while generating; `window.open(url, '_blank')` on success; toast on error. Keep `window.print()` as an option behind a kebab menu (for users who still want browser-native print).
- `src/components/advance/AdvanceOverview.tsx` — add a "Generate PDF" action on each row's overflow menu (tour-wide "download all advances as zip" deferred to PR A3.5 / later).

**Acceptance.**
- Button works end-to-end.
- Disabled state + spinner during generation.
- Error toast if API returns non-200.
- Accessible: `aria-label`, keyboard focus.

---

## PHASE B — Live-link share + realtime

### PR B1 — Share-token schema
**New migration `033_advance_share_tokens.sql`:**
```sql
CREATE TABLE advance_share_tokens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  advance_instance_id uuid NOT NULL REFERENCES advance_instances(id) ON DELETE CASCADE,
  token uuid NOT NULL UNIQUE DEFAULT gen_random_uuid(),
  label text,                                    -- "Venue copy", "Artist copy" etc.
  permission text NOT NULL CHECK (permission IN ('view', 'comment', 'edit')),
  created_by uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz,                        -- null = no expiry
  revoked_at timestamptz,
  last_viewed_at timestamptz,
  view_count int NOT NULL DEFAULT 0
);

CREATE INDEX idx_advance_share_tokens_token ON advance_share_tokens(token) WHERE revoked_at IS NULL;
CREATE INDEX idx_advance_share_tokens_instance ON advance_share_tokens(advance_instance_id);

-- RLS: owners of the workspace can CRUD; anon can read a single row by token.
ALTER TABLE advance_share_tokens ENABLE ROW LEVEL SECURITY;

CREATE POLICY "workspace_members_select" ON advance_share_tokens FOR SELECT
  USING (advance_instance_id IN (
    SELECT ai.id FROM advance_instances ai
    JOIN routing r ON r.id = ai.routing_id
    JOIN tours t ON t.id = r.tour_id
    WHERE t.workspace_id = get_my_workspace_id()
  ));
-- (workspace_members_insert/update/delete follow the same pattern)

-- Public read by token (used by anon client on /share/ page)
CREATE POLICY "anon_read_single_by_token" ON advance_share_tokens FOR SELECT
  TO anon
  USING (revoked_at IS NULL AND (expires_at IS NULL OR expires_at > now()));
```
Also: add helper SQL function `public.get_advance_for_share_token(p_token uuid) RETURNS jsonb` that returns the full advance bundle — serves as the single anon-accessible read path.

### PR B2 — Token management API
- `POST /api/advance/[instanceId]/share` — creates token `{ permission, label, expiresAt? }`
- `GET /api/advance/[instanceId]/share` — lists tokens for an instance
- `DELETE /api/share/tokens/[id]` — revokes (soft delete)
- `PATCH /api/share/tokens/[id]` — change permission / label / expiry

### PR B3 — Public share view
- New route group `src/app/(share)/share/advance/[token]/page.tsx` — reads with anon Supabase client via `get_advance_for_share_token`. No sidebar. Lowpass letterhead, "Prepared by {artist} · tour manager contact" footer.
- Permission enforced: `view` = read-only render; `comment` = adds comment input; `edit` = drops into a simplified editor for fields marked venue-editable.

### PR B4 — Realtime subscription
- In `src/app/(share)/share/advance/[token]/RealtimeSubscriber.tsx` (`'use client'`) use `@supabase/supabase-js` realtime: subscribe to `advance_instances:id=eq.${instanceId}` row changes. On change, re-fetch via the RPC and hot-swap props. Includes a "Live" indicator (pulsing green dot) so the viewer sees they're on a live link.
- Supabase dashboard action (note in PR description): enable Realtime publication on `advance_instances` and `advance_share_tokens`.

### PR B5 — Share UI in advance read view
- `ShareAdvanceModal.tsx` (new) — permission picker, expiry picker, label, generate button. Existing tokens list with revoke + copy actions. Copy-to-clipboard via `navigator.clipboard.writeText`.
- Button in `AdvanceShowReadView` sticky header.
- Analytics: increment `view_count` + `last_viewed_at` on each public load (via RPC).

---

## PHASE C — External collaborators + invite

**Refinement (R4, 2026-04-19):** Competitor's `/invites` is a dedicated inbox page with 4 tab states (`All Upcoming | New Requests | Active | Archive`), a search-by-artist/event/venue bar, and a date-range filter. We mirror this as PR C4.

### PR C1 — Collaborators schema
Migration `034_advance_collaborators.sql`:
- `advance_collaborators` (advance_instance_id, email CITEXT, role ENUM('venue','promoter','production','other'), permission, invited_by, invited_at, accepted_at, user_id nullable)
- `collaborator_invitations` (token, email, advance_instance_id, expires_at, accepted_at)
- RLS mirrors share token pattern; additionally allow the authenticated user whose `auth.users.email = email` to select their own collaborator row.

### PR C2 — Invite flow (magic-link via Resend)
- `POST /api/advance/[instanceId]/collaborators` — creates collaborator + invitation, sends Resend email
- Email template: `email-templates/collaborator-invite.html`
- `POST /api/collaborator-invitations/[token]/accept` — validates + claims

### PR C3 — Collaborator UI
- `CollaboratorsPanel` in advance edit view — list, invite modal, revoke, permission edit.
- External-user view of the app: stripped header, only shows advances they're a collaborator on. Route `(app)/collab/[instanceId]/page.tsx` gated by collaborator check.

### PR C4 — Invites inbox page
- New route `src/app/(app)/invites/page.tsx`.
- Server component lists all `advance_collaborators` rows where `email = current_user.email` OR `user_id = current_user.id`, joined to `advance_instances` + `tours` + `routing` + `artists` for display metadata.
- State derivation (client-side, no schema change needed):
  - `new_request` = `accepted_at IS NULL AND invited_at > NOW() - INTERVAL '30 days'`
  - `active` = `accepted_at IS NOT NULL AND show_date >= NOW()`
  - `archive` = `accepted_at IS NOT NULL AND show_date < NOW()` OR `declined_at IS NOT NULL`
  - `all_upcoming` = union of `new_request` + `active` (filter, not a fourth state)
- Tabs with counts: `All Upcoming | New Requests (n) | Active (n) | Archive (n)`.
- Search input filters across artist_name, tour_name, venue_name, city.
- Date filter dropdown: All Upcoming / Next 7 days / Next 30 days / Past.
- Empty state per tab.
- Accept / Decline actions on `new_request` cards inline.

---

## PHASE D — Versioning + restore

### PR D1 — Schema
Migration `035_advance_versions.sql`:
- `advance_versions` (id, advance_instance_id, version_number, label, data JSONB, section_statuses JSONB, created_by, created_at, is_checkpoint BOOLEAN)
- Trigger: every UPDATE on `advance_instances.data` creates a snapshot (or only on explicit checkpoint — decision in A1 follow-up).

### PR D2 — Version API
- `GET /api/advance/[instanceId]/versions` — list
- `POST /api/advance/[instanceId]/versions/checkpoint` — label a checkpoint
- `POST /api/advance/[instanceId]/versions/[versionId]/restore` — restores; creates an auto-checkpoint of current state first

### PR D3 — Version history UI
- Sidebar panel on advance edit — version list with label, author, timestamp, restore button.
- Optional diff view (text-level JSONB diff) — **deferred to future PR** unless Adam prioritises it.

---

## PHASE E — Templates: Advance (typed) + Rider + Labor Call + Daysheet

**Framing (updated 2026-04-19 per R1, R2, R3).** Competitor has four distinct template *kinds* with different schemas — not four tags on one entity. Lowpass adopts the same split but keeps the flexible untyped JSONB model as the default for Advance. Rider, Labor Call, and Daysheet become separate small entities with their own schemas.

- **Advance template** = existing `advance_form_configs` — flexible JSONB sections, untyped by default, **optionally** typed per field for starter templates (R1).
- **Rider template** = new entity; sectioned list of `{label, value}` items with per-section file attachment + document-level title/subtitle. Reverse information flow (tour → venue).
- **Labor Call template** = new entity; flat list of `{label, time_of_day}` rows (e.g. Chalk 07:00 / Load In 08:00 / Show Call 18:30).
- **Daysheet** = **derived**, not templated (R3). Generator reads existing advance schedule + labor call + venue contacts and composes a daysheet. User can save a daysheet as a custom template for reuse.

Power-user freedom preserved: you can still build arbitrary custom advance sections per tour/venue. The typed-field additions are optional metadata — existing untyped JSONB sections keep working.

### PR E0 — Typed field metadata (advance)
Migration `036_advance_field_types.sql`:
- No schema change to `advance_form_configs` itself. Extend the JSONB shape of each section's `fields[]` entry with an optional `field_type` key: `'short_text' | 'long_text' | 'multiple_choice' | 'file'`.
- Default behaviour when `field_type` is missing: treat as `short_text`. Existing sections work unchanged.
- For `multiple_choice`, add `options: string[]` alongside.
- Update TypeScript types in `src/types/advance.ts` to reflect the optional field.
- Update `AdvanceShowReadView` + edit view to render different inputs per type (textarea for `long_text`, radio group for `multiple_choice`, file-upload component for `file`). Fallback to existing text input for untyped.

### PR E1 — Tag column + seed starter advance templates
Migration `037_advance_template_tags.sql`:
- Add `template_tag TEXT` to `advance_form_configs` (nullable — existing custom templates stay untagged, which is a valid state).
- CHECK constraint: `template_tag IS NULL OR template_tag IN ('general_advance','club_theater','festival','amphitheater','arena','custom')` — matches competitor's observed defaults plus `'custom'`.
- Seed 5 default workspace-scoped advance templates (General Advance, Club + Theater, Artist Festival, Amphitheater, Arena) with typed fields from PR E0, mirroring observed competitor structure (General Advance = 8 sections / 104 fields). Seeded via trigger on `workspaces` INSERT. Editable after seed.

### PR E2 — Rider template entity
Migration `038_rider_templates.sql`:
- `rider_templates` (id, workspace_id, name, is_default, document_title TEXT, document_subtitle TEXT, sections JSONB, created_at, updated_at)
  - `sections` shape: `Array<{id, name, items: Array<{id, label, value, sort_order}>, attachment_path, sort_order}>`
- `rider_instances` (id, tour_id, routing_id nullable, rider_template_id nullable, data JSONB, created_at, updated_at)
- RLS via `get_my_workspace_id()`, same pattern as `advance_instances`.
- Seed one "Standard Rider" default (7 sections, 72 items) from the competitor's observed structure.

### PR E3 — Labor Call template entity
Migration `039_labor_call_templates.sql`:
- `labor_call_templates` (id, workspace_id, name, is_default, rows JSONB, created_at, updated_at)
  - `rows` shape: `Array<{id, label, time_of_day HH:MM, sort_order}>`
- `labor_call_instances` (id, tour_id, routing_id, labor_call_template_id nullable, date, rows JSONB, created_at, updated_at)
- Seed one "Standard Show Day" default (Chalk 07:00, Load In 08:00, Show Call 18:30, Early Call Back 21:00, Load Out 22:00).

### PR E4 — Daysheet generator (derived)
- No new template entity. `daysheet_instances` table stores the *composed* result so it can be edited + PDF'd.
- Migration `040_daysheet_instances.sql`: (id, routing_id, date, composed_data JSONB, generated_at, edited_at, pdf_path nullable)
- Generator API: `POST /api/daysheet/generate` with body `{ routing_id }` — reads advance data + labor call rows + venue contacts + schedule items, composes a daysheet JSON, upserts to `daysheet_instances`.
- Optional "Save this daysheet as a template" action that copies the composed shape into a lightweight `daysheet_templates` table (same schema as `daysheet_instances` minus the routing-specific fields). Keep thin — daysheets are primarily derived.

### PR E5 — Bulk apply API (advance + rider + labor call)
- `POST /api/advance/templates/[id]/apply-to-tour` — body `{ tour_id, routing_ids[], overwrite: 'never' | 'empty_only' | 'all' }`. Idempotent, per-show result report.
- Mirror routes for `rider/templates/[id]/apply-to-tour` and `labor-call/templates/[id]/apply-to-tour`.
- `overwrite='empty_only'` is the safe default.

### PR E6 — Template library UI (4 kinds)
- New page `/tours/[id]/templates` with 4 tabs: `Advance | Labor Call | Rider & Info Sheet | Daysheets & Schedules` (same IA as competitor — that shape is proven UX).
- Each tab lists templates for that kind with `Create New Template` + `Restore Defaults` buttons.
- Advance cards: name, tag badge, "n sections / m fields", edit / duplicate / apply / preview actions.
- Rider cards: name, "n sections / m items", same actions.
- Labor Call cards: name, "n rows", preview shows the time list inline.
- Daysheets tab: empty by default, "Save a daysheet from an advance, or create from scratch" empty state; list of saved daysheet templates once any exist.
- "Apply to tour shows" modal: multi-select routing rows with day-type filter chips + overwrite-mode picker + per-show preview of affected sections/rows.
- Custom-field creation flow (existing) untouched.

---

## PHASE F — Precision scheduling with dependencies

### PR F1 — Schema
Migration `037_advance_schedule_items.sql`:
- `advance_schedule_items` (id, advance_instance_id, label, start_time, end_time, depends_on_id FK self-referential, offset_minutes, sort_order)
- Computed view for resolved times (simple transitive closure, limited depth).

### PR F2 — Schedule API
- CRUD with dependency resolution (if soundcheck depends on load-in +60, updating load-in auto-shifts soundcheck).

### PR F3 — Timeline UI
- `AdvanceScheduleTimeline` component — horizontal timeline, drag to move, dependency lines.
- Dependencies enforced visually + in logic.

---

## PHASE G — Venue directory (Google Places)

### PR G1 — Schema
Migration `038_venues_google_place.sql`:
- Add `google_place_id TEXT UNIQUE` to `venues`.
- Backfill from existing `places_id` if column exists.

### PR G2 — Places-backed venue picker
- `src/app/api/venues/search/route.ts` — calls existing Google Places, upserts result into `venues`, returns venue row.
- `VenuePickerAutocomplete.tsx` — reusable in advance editor, routing editor, anywhere a venue is needed.

### PR G3 — Venue profile pages
- `/venues/[id]` page — tech specs, contacts, address, past shows at this venue (joined from routing).
- Deduping tool for admins (merge venues that differ only in capitalisation).

---

## PHASE H — Chat + notes + workspace activity log + dashboard feed

**Refinement (R5, 2026-04-19):** Competitor's Recent Activity is workspace-scoped (all entities) and surfaces on the dashboard with grouped timeline (Last Week / This Week / etc.). Rescoping PR H2 to workspace-wide, adding PR H4 for the dashboard feed widget.

### PR H1 — Chat (extends advance_comments)
- Add `parent_id` to `advance_comments` for threaded chat.
- Realtime subscription for live chat.

### PR H2 — Workspace activity log
- Migration `041_workspace_activity_log.sql`: `workspace_activity_log` (id, workspace_id, actor_id, verb, target_type, target_id, target_label, diff JSONB, created_at).
  - `verb` enum: `created | updated | deleted | invited | accepted | commented | applied_template | generated_daysheet | published_share | restored_version`.
  - `target_type` enum: `advance_instance | advance_template | rider_template | rider_instance | labor_call_template | labor_call_instance | daysheet_instance | tour | routing | collaborator | share_token | version`.
  - `target_label` is a denormalised display string ("Standard Show Day", "Berlin 2026-06-14") so the feed renders without joining.
- DB triggers on: `advance_instances`, `advance_form_configs`, `rider_templates`, `rider_instances`, `labor_call_templates`, `labor_call_instances`, `daysheet_instances`, `advance_collaborators`, `share_tokens`, `advance_versions`, `advance_comments`.
- RLS: `workspace_id = get_my_workspace_id()`.

### PR H3 — Per-advance drawer UI
- Right-hand drawer in advance edit with tabs: Chat | Notes | Activity (filtered to this `advance_instance_id`).

### PR H4 — Dashboard Recent Activity feed widget
- New component `DashboardRecentActivity.tsx`: fetches last 50 workspace activity rows, groups by relative week (`Today | Yesterday | This Week | Last Week | 2 Weeks Ago | Older`).
- Each row: actor avatar + formatted verb sentence ("You created labor call template 'Standard Show Day'") + relative timestamp.
- "View All Activity" button → `/activity` full-log page (paginated, filterable by target_type).
- Slots into existing dashboard route (not currently a rich dashboard — reuses the layout we build in Phase A0).

---

## PHASE I — AI autofill from venue tech-pack upload

### PR I1 — Public tech-pack upload page
- `/share/advance/[token]/tech-pack` — venue uploads PDFs. Stored via `src/lib/storage.ts`.

### PR I2 — Background extraction job
- `POST /api/advance/[instanceId]/autofill` — reads uploaded tech pack, calls existing Claude vision endpoint, writes to `advance_autofill_suggestions` table (JSONB, per-section).

### PR I3 — Review + apply UI
- `AutofillReviewPanel` in editor — per-section "Accept / Edit / Reject" workflow. Applied fields are marked with a small AI badge for auditability.

---

## PHASE J — Push notifications

### PR J1 — Web Push infra
- VAPID keys, service worker at `public/sw.js`, subscription stored in `user_push_subscriptions`.

### PR J2 — Trigger + preferences
- Notification preferences page.
- Fire on: collaborator invites, advance section completed, chat mention.

---

## PHASE K — Billing / tier gating

### PR K1 — Stripe + plans
- `stripe`, `@stripe/stripe-js`. Products: Free, Pro, Enterprise.
- Webhooks at `/api/webhooks/stripe`.

### PR K2 — Feature gates
- `src/lib/plan-gates.ts` — `canUse('share_links', user)` etc.
- UI treatment for locked features (upgrade CTA).

---

## 3. Risks & open questions

1. **PDF function size on Vercel.** If Sparticuz chromium pushes us over the limit once other deps are bundled, we swap to PDFShift behind the same interface. Pre-flight: I'll measure the Vercel function bundle in PR A1 before adding anything else.
2. **Supabase Realtime row-level subscriptions for anon.** Need to double-check RLS-aware Realtime works for anon reading via share-token RPC. Plan B: short-poll the RPC every 5s from the public page — boring but bulletproof.
3. **External editors (Phase C).** Anonymous `edit` permission is powerful — do we require email verification even for token-edit? Recommend: optional on share-link creation, off by default.
4. **Storage — all Supabase.** Confirmed. Will grep in PR A1 for any lingering Drive-write code paths and flag them.
5. **Versioning triggers.** Auto-version on every update will balloon the table. Recommend: explicit checkpoints + session-scoped auto-save (one row per editing session, not per keystroke). Final decision in Phase D.

---

## 4. Current status — what's next

**Decided (see §1):** PDF runtime (self-hosted puppeteer + Sparticuz), delivery mode (patch files to `outputs/patches/`), nav rework (Phase A0, first), authed walkthrough (creds-first), custom-fields (preserved), storage (Supabase only).

**In flight:**
- Authed walkthrough of advancewithme.live (creds received; walkthrough in progress).

**Blocking PR A0.1:**
1. Adam finishes reading this plan and flags any phase-order or scope changes.
2. Authed walkthrough complete — so A0 top-bar design absorbs any nav patterns worth borrowing from the competitor.

**Blocking PR A1 (first PDF PR):**
1. All of Phase A0 merged.
2. `INTERNAL_JWT_SECRET` env var set in Vercel + local (PR A2 follow-up).

**Per-phase confirmations will surface in each PR description** (A2–A6 outstanding decisions get resolved then, not now).
