# Permissions audit — November 2026 (before the invite-only beta)

Read-only audit. Nothing was changed. Code findings were verified by reading
the code; database findings come from the migration files and must be
confirmed live with `database/migrations/_PROBE_permissions_audit_2026_11.sql`
(read-only, returns one table: check · HOLE/OK/INFO · detail). The probe was
tested against a database built with each hole and with each fix: every hole
reads HOLE, every fix reads OK.

## The model, as built

- Three roles: **admin**, **manager** (both: everything), **readonly** (only
  what `permission_grants` names — page ids in `src/lib/permissions/resources.ts`).
- **Writes** through the API: guarded. Every mutating route calls `requireWrite`
  or is a stated exemption; the ratchet test keeps it that way. One pending
  (`/bug-reports` POST — a product call).
- **Reads**: the browser holds a Supabase key, so the DATABASE is the real gate.
  It checks grants only on the money tables (budget lines, income, settlements,
  receipts, payroll, rates, deal memos, commissions). Everything else is
  "same workspace" — for reading AND writing, when called directly.
- **Pages**: only Crew, Dates & routing and Tour settings check access. The
  menu hides the rest (P-1), which `visibleResources.ts` itself says is
  discoverability, not access.

## Two threat models

1. **Beta testers.** Each tester who signs up owns their own workspace and is
   its admin. The risk is one tester reaching ANOTHER workspace (yours), or
   running up your bills. → Findings A1–A6. These block the beta.
2. **People you invite into your workspace as read-only crew.** The risk is
   them seeing or changing what their role should hide. → Findings B1–B6.
   These block inviting crew, not the beta.

## A — Cross-workspace and cost (fix before the beta)

| # | Finding | Evidence | Confidence |
|---|---|---|---|
| A1 | **`rider-assets` storage is open to every signed-in user of every workspace** — list, open, overwrite, delete every rider image. Migration 264 fixed three buckets with this pattern and missed this one. | 034_rider_pack_system.sql policies: `auth.uid() IS NOT NULL` only | High per migrations; probe check 2 confirms live |
| A2 | **A user can point their own profile at any workspace.** Policy "Users can update own profile" (001) has no WITH CHECK, so `profiles.workspace_id` is self-editable. The database helpers still require membership, so **no data is readable** this way — but 13 routes and the Google guard take the workspace from the profile, so a tester can charge their AI and Google usage to YOUR workspace and exhaust your $25 AI budget / 5,000 daily Google calls. Your workspace id is the first folder of every file link you send. | 001 policy; `requireUserAndWorkspace`, `guardGoogleCall`, `ai/preferences`, `ai/rag/ask` read `profiles.workspace_id` | High per migrations; probe check 1 |
| A3 | **Each workspace admin can raise their own AI spending cap** (Settings › AI limits, or the table directly). Every tester is an admin → unbounded spend on your Anthropic key. Caps themselves work: all 13 AI call sites go through `withAiUsage`. | `ai_usage_limits` INSERT/UPDATE policies use `is_workspace_admin()` | High; probe check 9 |
| A4 | **Any workspace's admin can edit any venue in the shared library** (name, address, city, country, capacity). A tester could rename/re-address Co-op Live and your advance pages, venue emails and driver directions would show it. Integrity, not privacy (the table holds only public venue facts). Documented as deliberate when every user was you. | `PATCH /api/venues/canonical/[id]` → `requireWrite()` then service-role update | High (code) |
| A5 | `advance-files` bucket: per migrations public, and any signed-in user may upload/delete. Migration 264 says it "probed clean" live; the app no longer uses it. | 016_advance_files_storage.sql | Low that it is live; probe check 3 |
| A6 | Map tiles and 3D tiles use the browser key — not metered by the app. Testers' parking maps bill your Google account. | `NEXT_PUBLIC_GOOGLE_MAP_TILES_KEY` | High; fix is a Google Cloud quota |

## B — Inside your workspace (fix before inviting read-only crew)

| # | Finding | Evidence |
|---|---|---|
| B1 | **Page grants are mostly cosmetic.** A read-only member can open Files, Advance, Parking, Riders, Channel list, Stage plot, Hotels, Travel, Gear, Payroll and Income by URL, and read the data behind them (except money). Called directly, they can also edit and delete those rows. Your example: yes — parking → files works, but they don't need parking: the Files page and the files themselves are open to every member. | Pages: only 3 call `canAccess`. Tables: `file_references`, `parking_maps`, `advance_instances`, `tours`, `artists`, `routing`, `personnel`, hotels, flights → "same workspace" for SELECT/INSERT/UPDATE/DELETE |
| B2 | **Crew passports (number, expiry, nationality), date of birth and emergency contacts are stored as plain JSON** on `personnel` and readable by every member. (Your own profile passport is encrypted; the crew copy isn't.) | `personnel.passport_info`, 285_people_one_record.sql; probe check 8 counts rows |
| B3 | **The AI "Ask" index holds deal memos and budget lines** and is readable by every member — around the money grants 264 put in. | `src/lib/ai/rag/reindex.ts` indexes `deal_memos`, `budget_line_items`; `rag_chunks_select` is workspace-only; probe check 7 |
| B4 | A read-only member can **delete any tour file** straight from the browser — the storage delete rule checks workspace, not role. | 241_tour_files_bucket.sql; probe check 5 |
| B5 | A read-only member can **mint public links** (file share links, driver links) by inserting rows directly — tables allow INSERT to any member. The API path is role-checked; the table isn't. | `file_share_links`, `parking_share_links` INSERT policies |
| B6 | New areas have **no permission id at all** (Parking, Gear, Travel, Venues, Templates, Overview, Income), so they can't be restricted even if you want to. | `RESOURCE_CATALOG` vs `ia.ts` |

## Checked and sound

- All mutating API routes role-checked (ratchet test), bar `/bug-reports`.
- Public link tokens: 24–32 random bytes; packet, show, rider, calendar, file-share
  and driver links each serve only what their token names; driver links hash the
  token and cap 3D opens.
- Service-role routes that take an id (advance packs, files, import, rider PDF,
  calendar) verify the tour through the signed-in client before bypassing RLS.
- AI Ask retrieval runs as the caller (`SECURITY INVOKER`) — no cross-workspace read.
- `tour-files`: isolated per workspace (path's first folder = workspace id).
- `personnel-files`: private, admin-only since 085.
- Money tables grant-gated (pending probe check 6 on live).
- ⌘K search goes through RLS — money results respect grants.
- Server-side Google calls rate-limited per user and workspace (env-set, not
  editable by testers). Invites are bound to the invited email.

## Recommended order

**Before the beta**
1. A2 — a trigger on `profiles`: refuse a `workspace_id` change unless the user
   is a member of the target (workspace switch and invite-accept already check
   membership first, so they keep working). Switch `requireUserAndWorkspace` and
   `guardGoogleCall` to the membership-checked workspace.
2. A1 — `rider-assets` rules scoped to the workspace folder (uploads already use
   `{workspace_id}/…`, so no files move). Check older cover-logo paths first.
3. A3 — workspace admins can lower their caps but not raise them past a ceiling
   only a site admin can lift.
4. A4 — shared-venue edits: site admin only during the beta (or per-workspace overrides — a design call).
5. A6 — Google Cloud daily quotas on Map Tiles (2D + 3D).
6. Then the invite codes, with public sign-up switched off in Supabase.

**Before inviting read-only crew** — first a decision (B1): either enforce page
grants in the database for every area (large: each table needs a grant check
like the money tables) or simplify the model — read-only sees everything
except money and personal data — and fix only B2–B5. B2, B3 and B4 are worth
fixing either way.
