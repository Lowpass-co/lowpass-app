# Permissions model — decision record + design (2026-07-04)

> **UNSCHEDULED — decision record, not a build order. See `docs/handover/ROADMAP_2026-07.md`. The build (crew links, publish gates) runs when multi-user becomes priority; the `artist_ids` schema reservation may ride along with any earlier 2xx migration.**

Decided by Adam (Cowork session, during the master sprint). Closes the multi-user flag in `DESIGN_DIRECTION_2026-07.md` §13.

## Decisions

1. **Artist scoping: design for it, build later.** `workspace_members` gains a nullable `artist_ids uuid[]` (NULL = all artists). v1 does NOT enforce it — RLS stays workspace-scoped via the existing `get_my_workspace_id()`/`is_workspace_admin()` helpers. When per-artist enforcement is built, policies extend to check `artist_ids IS NULL OR artist_id = ANY(artist_ids)` — additive, not a rewrite, because the column already exists and every table keeps carrying `workspace_id` (+ artist/tour lineage).
2. **Crew see the day-sheet slice**: the `/m/*` experience — today/schedule, own travel + rooming, published files, day sheets. No financials, no editing, no tour-wide browsing.
3. **Crew auth: tokenized links first, accounts later.** Per-person, per-tour revocable links (venue-intake pattern; no signup). Upgrade path to real `role='crew'` accounts when notifications/preferences justify it.
4. **Business vault: owner + managers, fixed.** Role-based via the existing admin/sensitive-grants pattern; no per-member configuration.

## Design sketch

- **Migration (future, 2xx):** `ALTER TABLE workspace_members ADD COLUMN IF NOT EXISTS artist_ids uuid[]` (nullable, unenforced, documented as reserved). New table `crew_access_links (id, workspace_id, tour_id, person_id, token_hash, expires_at, revoked_at, created_by)` — token model mirrors `advance_packet_links` (opaque random token, server-side expiry, revocable), hashed at rest.
- **Crew routes:** `/c/[token]` resolves the link server-side (service role, like share pages — NOT RLS-authenticated), scopes every query to `(tour_id, person_id)`, and renders the existing `/m/*` components with a `crewView` flag (nothing financial; publish-gated files only). No new product surface — reuse.
- **Publish gates:** day sheets/files get an explicit `published` state so crew links never see drafts. One new concept for the TM; surface as a single "Share with crew" toggle per day/file.
- **Vault:** `is_workspace_admin()` (or an `is_workspace_manager()` helper if roles distinguish) gates the artist Business tab + its API routes. UI label: "Visible to managers".
- **Non-goals v1:** per-artist RLS enforcement, crew accounts, per-member vault config, crew editing anything, presence indicators.

## Why this shape
Zero-friction access is the product's competitive spine (venue intake, now crew links). Accounts are friction; links are adoption. The schema reservation costs one nullable column and saves a full RLS rewrite later — the audit flagged that retrofit as the expensive path; this closes the flag without paying the build cost early.
