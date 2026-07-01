# CC — Tour create/edit modal + venue-library-aware routing + advance auto-fill. BUILD. Off `main`.

Supersedes `CC_TOUR_CREATE_MODAL.md` and Part 3 of `CC_TOUR_BUILDER_ROUTING.md` — those are folded in here
with the venue-library work added. Everything below is decided and grounded against the real code (file:line
cited). Branch Part 1 off current `main`; stack 2→3→4 on the prior branch. Work **1→2→3→4 in order**.

> ## 🔒 SCOPE (Adam signed off — confirm you're building THIS, not more)
> **In scope now (Direction A):** the create/edit modal; venue-first routing that searches the EXISTING
> app-wide `canonical_venues` library; an `address` column on that library; auto-fill of the advance
> venue-info section FROM the venue facts (facts flowing INTO a private advance).
> **Explicitly OUT of scope (Direction B — a separate future design):** sharing advance *data* (deal terms,
> guarantees, promoter contacts) across workspaces. Do NOT expose any `advance_instances` data cross-workspace.
> Advance stays workspace-private. If any step seems to require crossing that line, STOP and flag.

> ## ⚙️ PER-PART PROTOCOL (all five, every part)
> 1. **CHECK FIRST** — open the cited files, confirm shapes, cite file:line. Grep before repointing/deleting.
> 2. **BUILD.**
> 3. **PROVE IT** — a functional reproduction (node harness on the real path / DOM check), not just
>    `tsc` 0 · `eslint` 0 · `next build --webpack` green. Write smoke IDs into `docs/smoke-tests/`.
> 4. **PUSH + REPORT** — commit, push, confirm `git log origin/<branch>`; report hash + smoke evidence.
> 5. **CONTINUE.** Stop + flag only on a real blocker / invariant risk.
>
> ## INVARIANTS
> - Workspace-RLS unchanged on routing/advance/tours (`get_my_workspace_id()`). `canonical_venues` stays
>   world-readable facts-only, service-role writes only (migration 214) — never add workspace data to it.
> - Reuse primitives: `<Modal>` (`src/components/ui/Modal.tsx`), the existing find-or-create
>   (`src/lib/venues/canonical.ts`), the context-provider pattern in `src/contexts/`. Don't roll new chrome.
> - Tokens only (`var(--lp-*)`, hex+alpha / `color-mix`, never JS-concat a CSS var).
> - Advance auto-fill is NON-DESTRUCTIVE — only seed empty fields, never overwrite user entries, respect
>   `locked` advances.
> - Don't regress the merged work already on `main`: the UUID redirect fix (`next.config.ts:187`), the
>   routing restyle, the branded map pins.

---

## PART 1 — Enrich the venue library. Branch `feat/venue-lib-address` off `main`.
`canonical_venues` (migration 214) is app-wide + world-readable but thin: it has `name/city/country/capacity/
lat/lng` — **`capacity` exists but is NULL, and there is NO `address` column.** Address currently lives only
denormalised on the routing row (from Google). To make address auto-populate FROM the library:
1. **Migration `226_canonical_venues_address.sql`** (confirm 226 is free on `main` + active branches first):
   `ALTER TABLE public.canonical_venues ADD COLUMN IF NOT EXISTS address text;` — idempotent, with a
   down-block. No RLS change (stays world-readable, service-role write).
2. **`src/lib/venues/canonical.ts` `findOrCreateCanonicalVenue()` (32–68):** when creating/refreshing a
   canonical venue from a Google Place, populate `address` (formatted_address) AND `capacity` if available.
   Backfill address on find if the row exists but `address IS NULL`. Service-role write path unchanged.
Smoke `VEN-LIB-01..`: creating a venue from a Place stores address+capacity; an existing address-less row
gets backfilled; RLS still world-read / no client write.

## PART 2 — Venue-first, tabbable, library-aware routing grid. Branch `feat/routing-venue-search` off Part 1.
Upgrade the restyled `RoutingGrid` (already on `main` from `feat/routing-revamp`) — this same grid is embedded
in the modal (Part 3), so build it once here. Check: `RoutingGrid.tsx`, `RoutingEditor.tsx`, the routing APIs
`POST /api/tours/[id]/routing` (bulk canonical resolution, 119–153) + `PATCH …/[routingId]` (95–108), the
denormalised routing columns (`canonical_venue_id` FK from 214, `venue_name/address/latitude/longitude/
venue_capacity/venue_phone/venue_website`).
1. **Column headers** (the restyle dropped them): **Date · Venue · City · Country · Address · Day**. Venue is
   the first typed field; City/Country/Address follow. Address is an **editable column** (see 3).
2. **Tabbable fast entry:** Tab moves across cells left→right then to the next row; type-to-search in Venue;
   Enter accepts the highlighted autocomplete item; arrow keys move the autocomplete selection. Real keyboard
   flow — Adam wants to fly across it.
3. **Venue autocomplete against the library:** typing Venue searches `canonical_venues` (world-readable —
   a simple `ilike` on name, optionally city). Dropdown shows `name — city, country · cap`. Selecting a match:
   - links `canonical_venue_id`, and **auto-fills City, Country, Address, lat/lng, capacity** from the venue
     (Address editable after — manual override allowed, and a manual edit does NOT unlink the canonical id).
   - marks the row as library-linked (a small `ti-library` / link marker in orange, per the mock).
4. **No match → create:** last dropdown row "Create '<typed>' as a new venue" → uses the existing Google
   Places integration to geocode → `findOrCreateCanonicalVenue` (Part 1, now stores address+capacity) → links
   the new global venue. The library grows itself; no free-text-only orphan venues.
5. Keep the three views (grid/calendar/map) consistent; this changes the grid's editing, not the toggle.
Smoke `ROUTE-VEN-01..`: type→library matches appear; pick→city/country/address/cap fill + `canonical_venue_id`
set; manual address edit persists without unlinking; no-match create writes a global venue + links it;
Tab/Enter keyboard flow works; save round-trips.

## PART 3 — The tour create/edit modal; retire the wizard. Branch `feat/tour-editor-modal` off Part 2.
**Decided:** ONE modal is the single **create AND edit** surface (Adam: "edit in this window, the drawer
doesn't make sense"); retire the full-page wizard. Reuse `TourCreateSlideOver`'s 2-step logic; embed the
Part-2 grid on step 2. Check: `TourCreateSlideOver.tsx`, `src/components/ui/Modal.tsx`, `EditTourSlideOver`,
`src/contexts/` (DetailPanelContext / EntityRoutingProvider / ProductContext pattern),
`ArtistTourSwitcherClientWrapper.tsx:58,234`.

**Pinned visual spec (the approved mock — build to this intent with `var(--lp-*)` tokens; match
`ExportTemplateEditor.tsx` chrome, NOT the old wizard look):**
- `<Modal>` at a **wide size on BOTH pages** (add an `xl`/wide size to `Modal.tsx` if `lg` is too narrow for
  the routing grid). Title = "New tour" / "Edit tour" + one muted one-line subtitle.
- **Tabbed header: "Details | Routing"** — active tab underlined in `var(--lp-orange)`, inactive muted.
- **Quiet sentence-case field labels** (secondary/muted, ~13px) — NOT uppercase letter-spaced (that's the
  "old lowpass" tell to avoid). Soft inset fields, hairline borders, ~10px radius, generous padding.
- **Accent restraint:** orange ONLY on the primary CTA + the active tab underline (+ focus ring). The
  artist Existing/New toggle active state = a subtle raised surface, not an orange fill.
- **Step 1 (Details):** Artist (Existing / New segmented + picker) · Tour name · Dates (start/end) · Region ·
  Currency. **NO party-size counts** (Principal/Band/Crew removed — staffing comes from personnel later).
- **Step 2 (Routing):** the Part-2 grid, one row per date seeded across the tour range.
- **Footer:** left = Back / "Skip & create"; right = Skip + primary CTA ("Create tour · N days" / "Save
  changes"). **Minimum to create = artist + name + dates** (routing fully skippable).

**Build order (safe):**
1. **Shared host:** add `TourEditorProvider` + `useTourEditor()` (mounted once, next to the existing
   providers) exposing `openCreateTour()` / `openEditTour(id)`, rendering the modal at root. Mirror how
   `DetailPanelContext`/`EntityRoutingProvider` mount — not per-page state.
2. **Build the modal** (Modal + TourCreateSlideOver's 2-step logic + step-2 = Part-2 grid + edit mode folding
   in `EditTourSlideOver`'s fields; confirm field parity, flag any gap — don't silently drop a field).
3. **Repoint the switcher** to `openCreateTour()`; verify open + create.
4. **Repoint the other entry points** (grep `/tours/create` — CC enumerated: tours-list "New Tour" +
   empty-state `app/(app)/tours/page.tsx`, `AppTopBar`, `ShellTopBarClient`, `DashboardArtistGate`,
   `DashboardTourList`, `TourPicker`, `JobModal`). `DashboardTourCard`'s `?edit=` → `openEditTour(id)`.
5. **Delete the wizard — GATED:** only after `grep -r "tours/create"` and a `TourWizard` importer grep both
   return zero, delete `src/app/(app)/tours/create/page.tsx` + `TourWizard` + retire `TourCreateSlideOver`/
   `EditTourSlideOver` (or keep as the modal's inner body if cleaner — one creator only).
Smoke `TOUR-MODAL-01..`: modal opens from switcher + tours-list + topbar (+ rest); create round-trips (artist+
name+dates minimum); routing step seeds a row per date + venue search works; **edit opens the same modal
pre-filled**; grep shows zero `/tours/create` links; wizard deleted, build green.
**Live create is Adam's step** (headless can't auth-INSERT) — build it, list the entry points to test, don't
claim a live create you didn't run.

## PART 4 — Auto-fill the advance venue section from the linked venue (Direction A). Branch `feat/advance-venue-autofill` off Part 3.
Advance does NOT read venue facts today. Check: `GET /api/tours/[id]/advance/[routingId]` (28–52 — loads the
routing venue fields but doesn't seed the advance), `advance_instances` (JSONB `data`), the advance venue-info
section (seed template `003_seed_advance_templates.sql`).
- On advance load, **seed the venue-info section defaults** (venue name, address, city, capacity, phone,
  website, coords) from the routing row's denormalised fields + the linked `canonical_venue`. **Non-destructive:
  only fill blank fields, never overwrite a value the user entered, and skip `locked` advances.** This is
  facts flowing INTO a private, workspace-scoped advance — no cross-workspace exposure.
Smoke `ADV-VEN-01..`: an advance for a library-linked routing row pre-fills venue facts; a user-edited field
is NOT overwritten on reload; a locked advance is untouched; nothing reads another workspace's data.

---

## Final
- Each part its own branch, stacked; commit + PUSH; report hash + smoke evidence + entry-point list (Part 3) +
  any edit-field-parity gap. One migration (226, Part 1) — confirm the number is free first; idempotent +
  down-block. No other schema. If anything seems to need crossing the workspace/advance-sharing line, STOP.
