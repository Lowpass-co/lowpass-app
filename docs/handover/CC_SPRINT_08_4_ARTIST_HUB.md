# CC Sprint 8.4 — Artist hub completeness (overnight ship)

Four features that complete the artist-side surface area: logo/banner upload, edit profile slide-over, delete artist, workspace activity feed. Continuous ship — Adam is asleep. All design decisions are baked in. Halt only on hard blockers.

**Branch off `fix/sprint-8.3-architectural`** (NOT main — 8.1/8.2/8.3 not yet merged; this stacks on top). Four commits + V verify.

---

## 0. Required reading

- `CLAUDE.md`
- `docs/handover/CC_SPRINT_08_1_FIXES_PLUS.md` — pattern reference for delete tour (mirror for delete artist)
- `docs/handover/CC_SPRINT_08_3_ARCHITECTURAL.md` — context for SwitcherStateContext (delete artist UI consumes it)
- `src/components/shell-v2/TourDeleteConfirmationModal.tsx` — pattern reference for ArtistDeleteConfirmationModal
- `src/components/shell-v2/TourCreateSlideOver.tsx` — pattern reference for slide-over forms
- `src/components/shell-v2/ArtistCreateSlideOver.tsx` — pattern reference for artist forms with Spotify search
- `src/app/api/tours/[id]/route.ts` DELETE handler — pattern reference for cascade + storage cleanup
- `src/app/(app)/artists/page.tsx` — workspace landing where activity feed lives + delete artist UI mounts on cards
- `src/app/(app)/artists/[id]/(home)/page.tsx` — artist detail page where Edit profile button lives
- `src/components/artists/ArtistsGrid.tsx` (or wherever workspace artist cards render)
- `src/lib/spotify/server.ts` — Spotify token + cache pattern, reused for any Spotify needs
- `database/migrations/` — find existing artist FKs and storage bucket names (artist-assets confirmed in Sprint 7 audit; verify)

---

## 1. Hard rules

1. No new dependencies.
2. No `any`, no `// @ts-ignore`.
3. Lint baseline 75 errors / 120 warnings — strict hold.
4. Typecheck zero errors.
5. Build via `next build --webpack` only.
6. Four commits in numeric order: 1 → 2 → 3 → 4. One per phase.
7. Verify before claiming. Quote post-fix file:line for every acceptance criterion.
8. Visual fidelity: tokens-only, three-elevation surface system, dot-separator typography, mono numerics, uppercase tracked-wider micro-labels, orange-as-functional-accent. No raw hex except orange transparency variants.
9. Smooth animations: Web Animations API for all non-trivial transitions; `prefers-reduced-motion` honored.
10. **Continuous ship authorized.** Adam is asleep. Make all sub-decisions yourself. Document each decision in the report.
11. **HALT criteria** (very narrow):
    - Migration would conflict with existing data non-recoverably.
    - Build doesn't compile after a phase.
    - Lint baseline would be exceeded.
    - You discover a structural assumption is wrong (e.g. expected table doesn't exist, expected bucket doesn't exist) AND no graceful fallback is obvious.
    - You discover that completing a phase would require a user-facing decision Adam hasn't authorized (e.g. naming conventions, visible color choices outside the palette).

---

## 2. Phase 1 — Logo + banner upload component (~2.5 hr)

### 2.1 Goal

Build a reusable `<ArtistImageUploader>` component that handles file selection, validation, upload to Supabase Storage, and writes the resulting URL to `artists.branding.logo_url` or `artists.branding.banner_url`. Used by Phase 2 (edit profile slide-over) and potentially Phase 3 surfaces.

### 2.2 Decisions made (no halt)

- **Bucket**: `artist-assets` (created in Sprint 7 §2; verify it exists in `database/migrations/`. If not, add a migration creating it as part of this phase).
- **Path format**: `{workspace_id}/{artist_id}/{kind}.{ext}` where `kind` is `logo` or `banner`. Stable path = upload overwrites cleanly without orphans.
- **Allowed file types**: `image/jpeg`, `image/png`, `image/webp`. Reject others client-side.
- **Max size**: 5MB. Reject larger files client-side with a clear error message.
- **Storage policy**: public-read (these are display-facing images, no privacy concerns). If the existing `artist-assets` bucket isn't already public-read, surface that as a halt-able finding (RLS migration would need user input).
- **DB write**: store the public URL in `branding.logo_url` (JSONB field). NOT a path — the URL works directly in `<img src={...}>`.
- **Removal**: delete the storage object AND clear the URL from `branding` JSONB. Confirmation modal NOT required (low-stakes — user can re-upload).
- **No image cropping/processing**: ship raw upload. Cropping is its own future feature.

### 2.3 Component spec

`src/components/artists/ArtistImageUploader.tsx`:

```tsx
interface ArtistImageUploaderProps {
  artistId: string;
  workspaceId: string;
  kind: 'logo' | 'banner';
  currentUrl: string | null;
  onChange: (newUrl: string | null) => void;
}
```

Visual layout:
- Drag-drop zone (~120×120 for logo, full-width 240px tall for banner).
- Click to open file picker.
- Preview when image loaded (current OR newly uploaded).
- "Replace" + "Remove" buttons when an image exists.
- Upload progress: simple "Uploading…" state. No progress bar (file is tiny).
- Error state inline below the zone.

Visual: tokens-only. Border `var(--lp-border)`, dashed when empty, solid when filled. Hover `var(--lp-panel-hover)`.

### 2.4 API route

New: `POST /api/artists/[id]/image/[kind]/route.ts` where `kind` is `logo` or `banner`.

- Auth-gate, RLS-scoped (user must have permission on artist).
- Multipart form upload.
- Validate type + size server-side (don't trust client validation alone).
- Upload to `artist-assets/{workspace_id}/{artist_id}/{kind}.{ext}`.
- Update `artists.branding` JSONB: `branding.logo_url` or `branding.banner_url` to the public URL.
- Return `{ url: <new-url> }` on success.

DELETE: `DELETE /api/artists/[id]/image/[kind]/route.ts`:
- Remove storage object.
- Clear the URL from `branding`.
- Return 204.

### 2.5 Acceptance

- [ ] `<ArtistImageUploader>` renders empty state with drag-drop affordance.
- [ ] Click → file picker opens.
- [ ] Drag-drop a valid file → uploads + preview shows.
- [ ] Drag-drop an oversized or wrong-type file → inline error, no upload.
- [ ] After upload, `branding.logo_url` (or banner_url) in DB is the new public URL.
- [ ] Replace replaces; Remove removes.
- [ ] Lint + typecheck clean.

### 2.6 Quote in report

- New `<ArtistImageUploader>` file (full content if ≤200 lines).
- New API route handlers (POST + DELETE).
- Bucket existence verification (or migration if needed).

### 2.7 Commit

`feat(artists,api): ArtistImageUploader component + logo/banner upload routes (Sprint 8.4 §1)`

---

## 3. Phase 2 — Edit profile slide-over (~2.5 hr)

### 3.1 Goal

Replace the legacy `/artists/[id]/edit` page navigation with a slide-over. The "Edit profile" button on `/artists/[id]` opens `<ArtistEditSlideOver>` instead of routing.

### 3.2 Decisions made (no halt)

- **Mount approach**: similar pattern to TourCreate / ArtistCreate slide-overs. Wrapper component owns open state. Triggered from a small client-component button replacing the current `<Link>`.
- **Field set** (what users edit):
  - **Name** (text, required).
  - **Spotify link** (search + pick, similar to ArtistCreate's combined input). Allows re-linking to a different Spotify artist OR unlinking.
  - **Genre** (text, optional). Auto-fills from Spotify when re-linked.
  - **Logo** (`<ArtistImageUploader kind="logo">`).
  - **Banner** (`<ArtistImageUploader kind="banner">`).
- **Save behavior**: PATCH `/api/artists/[id]` (write the route if it doesn't exist; mirror POST shape).
- **On save**: close slide-over, toast "Artist updated," `router.refresh()` to revalidate the page.
- **Legacy edit page**: keep mounted for now (don't delete). If a deep-linked URL hits it, no 404. Sprint 9 retirement.

### 3.3 Component spec

`src/components/artists/ArtistEditSlideOver.tsx`:

```tsx
interface ArtistEditSlideOverProps {
  open: boolean;
  onClose: () => void;
  artist: {
    id: string;
    name: string;
    spotify_id: string | null;
    spotify_image_url: string | null;
    spotify_banner_url: string | null;
    branding: {
      logo_url?: string | null;
      banner_url?: string | null;
      genre?: string | null;
    };
    workspace_id: string;
  };
}
```

Layout (using existing SlideOver primitive, default width 480px or `'wide'` if needed):

```
┌────────────────────────────────────────────────┐
│  EDIT ARTIST                              [×]  │
├────────────────────────────────────────────────┤
│                                                 │
│  NAME *                                         │
│  [text input]                                   │
│                                                 │
│  SPOTIFY                                        │
│  [search/picker — same pattern as Create]      │
│                                                 │
│  GENRE                                          │
│  [text input]                                   │
│                                                 │
│  LOGO                                           │
│  [120×120 ArtistImageUploader]                 │
│                                                 │
│  BANNER                                         │
│  [full-width 240px ArtistImageUploader]        │
│                                                 │
├────────────────────────────────────────────────┤
│                       [Cancel]  [Save changes]  │
└────────────────────────────────────────────────┘
```

### 3.4 API route

If `PATCH /api/artists/[id]/route.ts` doesn't exist, create it. Auth-gated, RLS-scoped, accepts the same payload shape as POST minus immutable fields.

### 3.5 Trigger replacement

In `src/app/(app)/artists/[id]/(home)/page.tsx` (or wherever the "Edit profile" button lives):
- Replace `<Link href="/artists/[id]/edit">Edit profile</Link>` with a client wrapper component that owns the slide-over open state.
- The legacy `/artists/[id]/edit` route stays accessible by direct URL.

### 3.6 Acceptance

- [ ] Click "Edit profile" on `/artists/[id]` → slide-over opens (no navigation).
- [ ] All fields populated with current values.
- [ ] Edit name + save → DB row updated, page refreshes, new name visible everywhere (trigger, landing card, hero).
- [ ] Re-link Spotify → image URLs update, hero banner refreshes.
- [ ] Upload custom logo → overrides Spotify image in trigger + landing.
- [ ] Upload custom banner → overrides Spotify banner in hero.
- [ ] Cancel → no changes persisted.
- [ ] Lint + typecheck clean.

### 3.7 Quote in report

- New `<ArtistEditSlideOver>` file.
- New PATCH route if created.
- The "Edit profile" trigger replacement.

### 3.8 Commit

`feat(artists,api): edit profile slide-over with logo/banner upload (Sprint 8.4 §2)`

---

## 4. Phase 3 — Delete artist (~2.5 hr)

### 4.1 Goal

Symmetric to delete tour (Sprint 8.1 §5). Add overflow `⋮` menus on switcher artist rows AND workspace landing artist cards. Click "Delete artist…" → confirmation modal showing nested cascade scope → type DELETE → cascade fires.

### 4.2 Decisions made (no halt)

- **Cascade scope**: artist → ALL their tours → all tour-scoped data (transitive cascade since tours.artist_id likely already CASCADE; verify and re-assert if needed).
- **Storage cleanup**: enumerate ALL files across ALL tours under the artist (rider-assets, deal-memos, receipts) AND the artist's own logo/banner files (artist-assets bucket). Remove all before DB delete.
- **Confirmation modal**: more aggressive than tour delete since artist deletion is bigger blast radius. Header counts: `<N> TOURS · <N> SHOWS · <N> BUDGET ROWS · <N> FILES`. Bullet list of categories. "This will delete the artist AND every tour under them" warning line. Type DELETE.
- **UI mounts**:
  - Switcher artist row: hover overflow `⋮` → "Delete artist…" item.
  - Workspace landing artist card: hover overflow `⋮` → "Delete artist…" item.
  - On `/artists/[id]` page: also add to a "Danger zone" section at the bottom of the Edit profile slide-over (Phase 2). One unified deletion path is cleaner.
- **On success**: navigate to `/artists` (workspace landing). Toast "Artist deleted." Wrapper's `artists` state removes the artist optimistically.

### 4.3 Cascade scope diagnosis (do this first, document in report)

Before writing the migration, audit:

```bash
grep -rn "REFERENCES artists\|FOREIGN KEY (artist_id)" database/migrations/ | sort
```

For each table referencing `artists.id`:
- **Cascade** (tour-scoped data dies with the artist): tours, any artist-scoped settings.
- **Workspace-shared NOT cascading**: persons, venues, vendors, templates (none of these should reference artists).

If any FK isn't already CASCADE, add a migration to convert it. If audit reveals nothing unexpected, no migration needed (just the API route + UI).

### 4.4 Server route

`DELETE /api/artists/[id]/route.ts`:
1. Auth-gate, RLS-scoped (workspace match).
2. Enumerate all tour IDs under this artist:
   ```sql
   SELECT id FROM tours WHERE artist_id = $1
   ```
3. For each tour, enumerate file paths across the three buckets (rider-assets / deal-memos / receipts) — same logic as `DELETE /api/tours/[id]`. Batch and call `storage.from(...).remove(...)`.
4. Enumerate artist's own files: `{workspace_id}/{artist_id}/logo.*` and `/banner.*` in `artist-assets` bucket. Remove.
5. DELETE the artist row. Cascade fires automatically per the schema.
6. Return `{ ok: true }`.

`GET /api/artists/[id]/delete-preview`:
- Returns `{ artist: {name, ...}, counts: {tours, shows, budgetRows, riderPacks, dealMemos, fileCount} }`.

### 4.5 UI components

`src/components/shell-v2/ArtistDeleteConfirmationModal.tsx` — mirror `TourDeleteConfirmationModal` structure. Different copy, different counts query, navigates to `/artists` on success.

Switcher overflow `⋮` menu — similar to `<SwitcherTourMenu>` from Sprint 8.1 §5. New `<SwitcherArtistMenu>` component if needed.

Workspace landing artist card overflow `⋮` — extend `ArtistsGrid` (or `<ArtistGridCard>`) to add the menu.

### 4.6 Acceptance

- [ ] Switcher artist row → hover → `⋮` menu → "Delete artist…" → modal opens with counts.
- [ ] Workspace landing artist card → hover → `⋮` menu → same flow.
- [ ] Modal shows accurate counts (tours, shows, budget rows, files).
- [ ] Type DELETE → button enables.
- [ ] Click Delete → cascade fires, all tours under artist gone, all tour-scoped data gone, artist files in storage gone.
- [ ] Workspace-shared data preserved (persons, venues, vendors, templates).
- [ ] Toast + navigate to `/artists`.
- [ ] Lint + typecheck clean.

### 4.7 Quote in report

- Cascade scope diagnosis (per-table decisions).
- Migration if needed (idempotent re-assertion).
- DELETE + delete-preview routes.
- New modal component.
- UI mount sites (switcher menu + landing card menu + edit slide-over).

### 4.8 Commit

`feat(artists,api,db): delete artist with cascade + storage cleanup + confirmation modal (Sprint 8.4 §3)`

---

## 5. Phase 4 — Workspace activity feed (~2 hr)

### 5.1 Goal

Currently `/artists` workspace landing has an empty activity placeholder. Populate with workspace-wide recent activity across products.

### 5.2 Decisions made (no halt)

- **Approach**: SQL UNION across existing tables, no new schema. Simpler than building a `workspace_audit_log` table and avoids the cost of dual-writes on every product action.
- **Tables UNION'd**: `tours` (created/updated), `routing` (added/changed), `budget_line_items` (added), `advance_instances` (updated), `deal_memos` (created).
- **Row shape**:
  ```ts
  {
    timestamp: string;     // ISO
    product: 'operations' | 'budget' | 'advance' | 'home';
    actor_id: string | null;
    actor_name: string | null;     // joined from profiles
    action: string;              // e.g. "added line item"
    entity_label: string;        // e.g. "Production: Lighting design"
    entity_href: string;         // navigates to the thing
    tour_name: string | null;    // for context
    artist_name: string | null;
  }
  ```
- **Limit**: 10 entries.
- **Server-side fetch**: in `getWorkspaceLandingData()` (Sprint 7 §6 helper), add the activity query alongside existing fetches.
- **Display**: replace the `[]` placeholder in workspace landing with a compact table (existing `<RecentActivityTable>` or a thin variant).

### 5.3 Query approach

Pseudo-SQL:

```sql
WITH activities AS (
  SELECT
    t.updated_at AS timestamp,
    'home' AS product,
    NULL::uuid AS actor_id,
    'tour updated' AS action,
    t.name AS entity_label,
    '/artists/' || t.artist_id AS entity_href,
    t.name AS tour_name,
    a.name AS artist_name
  FROM tours t
  JOIN artists a ON a.id = t.artist_id
  WHERE t.workspace_id = $1
  
  UNION ALL
  
  SELECT
    bli.updated_at AS timestamp,
    'budget' AS product,
    bli.last_updated_by AS actor_id,
    'budget line updated' AS action,
    bli.description AS entity_label,
    '/budget/' || bli.tour_id AS entity_href,
    t.name AS tour_name,
    a.name AS artist_name
  FROM budget_line_items bli
  JOIN tours t ON t.id = bli.tour_id
  JOIN artists a ON a.id = t.artist_id
  WHERE t.workspace_id = $1
  
  UNION ALL
  -- (similar for routing, advance_instances, deal_memos)
)
SELECT *
FROM activities
ORDER BY timestamp DESC
LIMIT 10
```

If any table lacks `updated_at` or `last_updated_by`, adapt the query OR exclude that source from the UNION. Document any exclusions.

For the `actor_name`, JOIN `profiles ON profiles.id = actor_id` in a wrapper layer; fallback to "—" when null.

### 5.4 Acceptance

- [ ] Workspace landing's activity card populates with up to 10 entries.
- [ ] Entries sorted by timestamp DESC.
- [ ] Each row shows: relative-time, actor, action, entity (with tour + artist context).
- [ ] Click row → navigates to entity.
- [ ] Empty state ("No recent activity") still shows when there's genuinely nothing.
- [ ] Lint + typecheck clean.

### 5.5 Quote in report

- The query implementation.
- The workspace landing activity rendering.

### 5.6 Commit

`feat(home): workspace activity feed via UNION query (Sprint 8.4 §4)`

---

## V. Verify

CC: cannot run live UI tests. Static checks only:

1. Lint baseline 75/120 held.
2. Typecheck zero errors.
3. `next build --webpack` succeeds.
4. Hex grep across all new component files returns zero non-orange-transparent matches:
   ```bash
   grep -rn "#[0-9a-fA-F]\{3,8\}" \
     src/components/artists/ArtistImageUploader.tsx \
     src/components/artists/ArtistEditSlideOver.tsx \
     src/components/shell-v2/ArtistDeleteConfirmationModal.tsx
   ```
5. Quote post-fix file:line for every acceptance criterion across all four phases.

Adam runs the live smoke tomorrow.

---

## When done — report exactly this format

```
Sprint 8.4 done. Branch: feat/sprint-8.4-artist-hub
Vercel preview: <URL placeholder; Adam opens the PR to trigger deploy>

Commits in order:
- 1: <hash> feat(artists,api): ArtistImageUploader + image upload routes
- 2: <hash> feat(artists,api): edit profile slide-over
- 3: <hash> feat(artists,api,db): delete artist with cascade
- 4: <hash> feat(home): workspace activity feed

All decisions made overnight (no sign-off gates):
[Phase 1] bucket: artist-assets, path format, file types/size limits, removal flow
[Phase 2] field set, save behavior, legacy edit page kept
[Phase 3] cascade scope finding, UI mount sites, navigation on success
[Phase 4] tables UNION'd, query shape, fallback for missing columns

Quoted post-fix lines:
[Phase 1] ArtistImageUploader file + POST/DELETE routes + bucket verification
[Phase 2] ArtistEditSlideOver file + PATCH route + trigger replacement
[Phase 3] cascade scope diagnosis + migration if needed + DELETE/preview routes + modal + 3 mount sites
[Phase 4] activity query + landing rendering + actor join

V.1-5 results:
1. Lint: <X errors / Y warnings>
2. Typecheck: zero
3. Build: OK
4. Hex grep: zero non-orange matches
5. Acceptance criteria quoted per phase

Out of scope, deferred:
[list anything found while working]
```

---

## Out of scope this sprint (DO NOT touch)

1. **TourWizard retirement** — separate sprint after slide-overs prove out.
2. **Phase 4 Operations migration** — explicitly excluded by Adam.
3. **Spotify search → genre extension** — known gap; Sprint 9 candidate.
4. **AdvanceOverviewStatsStrip orphan deletion** — cleanup sprint.
5. **`<DangerConfirmModal>` primitive extraction** — refactor opportunity, not a feature.
6. **Per-user `tour_visits` table** — Sprint 8.2 deferred.
7. **Storage cleanup budget-files / advance-files (URL extraction)** — Sprint 8.2 deferred #5b.
8. **Migration 068 proper exemption for rental_jobs** — Sprint 8.2 deferred; bypassed via _lp_migrations row.
9. **Pre-existing baseline lint errors** in ArtistTourContext, RoutingGrid line 137, hotel-rate.ts.
10. **404 page CTAs**, **print button regression**, **status pill autosave**, **custom field plus button** — long-deferred items.
11. **Image cropping/processing for upload** — raw upload only this sprint.
12. **`workspace_audit_log` table** — Phase 4 uses UNION instead; dual-write audit log is a future precision sprint.

If you find another bug — note it in deferred. Don't fix.
