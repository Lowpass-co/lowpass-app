# CC Sprint — Rider Architecture Mirror (match Advance pattern)

**Goal in one sentence:** Rebuild the Rider editor surface to mirror the Advance architecture — three-pane builder-first layout, URL-param mode toggle, section library drag palette, field properties panel, hashed builder-mode background, and section status tracking — using the existing `rider_packs` + `rider_sections` data model as the substrate.

**Reference:** This sprint mirrors `src/components/advance/AdvanceBuilderShellClient.tsx` + `AdvanceShowHeader.tsx` + `AdvanceSectionLibrary.tsx` + `AdvanceFieldPropertiesPanel.tsx` + `TemplateMetaBar.tsx` + `AdvanceUpcomingSidebar.tsx`. Read those files in full before writing any Rider equivalent. The Advance patterns are the source of truth.

**Why:** The current Rider editor (`src/components/rider-pack/PackEditor.tsx`, ~5300 LOC) has accumulated tech debt. The Advance pattern is the better architecture: clear separation between show data and template structure, builder-mode visual indicator, library-based composition, field-level editing in a dedicated panel. Adam has explicitly asked for the Advance chrome to be applied to Riders.

**Branch:** `feat/rider-architecture-mirror` off main.

---

## Hard rules

1. **One feature commit per sub-phase.** Halt-and-report at ~400 LOC.
2. **Lint baseline does not regress.** `tsc --noEmit` zero. `next build --webpack` green.
3. **Token discipline.** All visual values via `var(--lp-…)`. Hashed background uses `color-mix(in srgb, var(--color-lp-orange) ...)`.
4. **No new deps.** dnd-kit already in deps. lucide-react already in deps.
5. **Verify before claiming.** File:line precision in every report.
6. **Use the UI/UX skill aggressively.** Builder-mode visual treatment, hashed background pattern, library palette aesthetic, field properties panel layout — every visual decision goes through the skill.
7. **Read Advance source first.** Do NOT write any Rider equivalent component without first reading and quoting the Advance component you're mirroring. Surface the file:line reference in the commit body.
8. **Existing PackEditor stays for back-compat.** Do not delete `src/components/rider-pack/PackEditor.tsx` in this sprint. Build the new architecture alongside it; switch the route to use the new one in the final sub-phase.

---

## Architecture overview

### Layout (per-pack page)

```
<ProductShell active="home" or "operations">
  <TourHeader or ArtistHeader />       ← from existing chrome
  
  <div className="flex min-h-0 flex-1">
    <RiderPackSidebar />                ← 280px left
                                          (lists all rider packs for this tour OR artist scope)
                                          mirrors AdvanceUpcomingSidebar
    
    {mode === 'edit' ? (
      /* BUILDER MODE — hashed background */
      <main className="flex flex-1 flex-col bg-rider-builder">
        <RiderTemplateMetaBar />        ← sticky top
                                          Show/Builder tabs, template name input, actions
        <div className="flex min-h-0 flex-1">
          <RiderSectionLibrary />        ← 280px left of canvas
                                          drag palette of section templates
          <RiderSectionBuilder />        ← canvas with hashed background
                                          accordion of sections + fields
          <RiderFieldPropertiesPanel />  ← 300px right
                                          properties for selected field
        </div>
      </main>
    ) : (
      /* SHOW MODE — clean background */
      <main className="flex flex-1 flex-col">
        <RiderPackHeader />              ← glass hero with progress ring
        <RiderShowReadView />            ← form display
                                          existing rider_sections rendered as filled cards
      </main>
      <RiderShowRightRail />             ← 300px right
                                          metadata: scope, parent template, channel list link,
                                          stage plot link, advance packet link
    )}
  </div>
</ProductShell>
```

### Mode toggle

URL param `?mode=edit` (matches Advance). Default = show mode (read/fill data). `?mode=edit` = builder mode (edit template structure).

Tab switching via the `RiderTemplateMetaBar` tabs (mirrors `TemplateMetaBar` from Advance — bottom orange underline on active).

### The hashed background (KEY VISUAL FEATURE)

Per Adam: builder mode needs a hashed/striped background as an explicit visual indicator that "you are editing the template, not the data."

CSS pattern in `globals.css`:

```css
.lp-rider-builder-canvas {
  background-image: repeating-linear-gradient(
    45deg,
    transparent,
    transparent 14px,
    color-mix(in srgb, var(--color-lp-orange) 3%, transparent) 14px,
    color-mix(in srgb, var(--color-lp-orange) 3%, transparent) 28px
  );
}
```

Subtle (3% orange tint), 45° diagonal stripes, 14px spacing. Visible enough to signal "this is meta", subtle enough not to obstruct content. Applied to the builder canvas main element ONLY (not the meta bar, not the library, not the properties panel — those keep solid backgrounds).

Use the UI/UX skill to compare 3 stripe treatments before locking: 45° / 90° / dot pattern. Pick the one that reads "template/meta" most clearly without distraction.

### Component mapping (Advance → Rider)

| Advance | Rider equivalent (new) | Purpose |
|---|---|---|
| `AdvanceShowHeader` | `RiderPackHeader` | Glass hero with title, progress ring, last-edited |
| `AdvanceUpcomingSidebar` | `RiderPackSidebar` | List of all rider packs for tour/artist context, active highlight |
| `AdvanceBuilderShellClient` | `RiderBuilderShellClient` | Three-pane wrapper, CustomEvent loop |
| `AdvanceSectionLibrary` | `RiderSectionLibrary` | Draggable section template palette |
| `AdvanceSectionBuilder` | `RiderSectionBuilder` | Canvas with hashed bg, accordion of sections + fields |
| `AdvanceFieldPropertiesPanel` | `RiderFieldPropertiesPanel` | Right pane for selected field properties |
| `TemplateMetaBar` | `RiderTemplateMetaBar` | Sticky Show/Builder tabs + template name + actions |
| `AdvanceShowReadView` | `RiderShowReadView` | Filled-cards display of existing rider data |
| `AdvanceShowRightRail` | `RiderShowRightRail` | Specs, contacts, lineage, cross-product links |
| `CircularProgressRing` | (reuse as-is) | Progress visualization, no rebuild needed |
| `CustomEvent('advance:field-selected')` | `CustomEvent('rider:field-selected')` | Field selection event loop |
| `CustomEvent('advance:section-drop')` | `CustomEvent('rider:section-drop')` | Drop event loop |

### Data model deltas (migration ~115+)

```sql
-- 1. Section template library (mirrors advance_templates)
CREATE TABLE IF NOT EXISTS public.rider_section_templates (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id    uuid REFERENCES public.workspaces(id) ON DELETE CASCADE,
  -- NULL workspace_id = platform template, visible to all workspaces
  template_type   text NOT NULL,        -- 'contacts' | 'technical' | 'hospitality' | etc.
  name            text NOT NULL,
  description     text,
  icon            text,                  -- lucide icon name
  fields          jsonb NOT NULL DEFAULT '[]'::jsonb,
                  -- array of {id, label, type, required?, help?, ...}
  suggested_for   text[],                -- which contexts this fits (e.g. 'festival', 'club')
  forked_from_id  uuid REFERENCES public.rider_section_templates(id) ON DELETE SET NULL,
                  -- workspace fork of a platform template
  sort_order      integer NOT NULL DEFAULT 100,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX rst_workspace_idx ON public.rider_section_templates(workspace_id);
CREATE INDEX rst_type_idx ON public.rider_section_templates(template_type, sort_order);
CREATE INDEX rst_forked_from_idx ON public.rider_section_templates(forked_from_id) WHERE forked_from_id IS NOT NULL;

ALTER TABLE public.rider_section_templates ENABLE ROW LEVEL SECURITY;
CREATE POLICY rst_select ON public.rider_section_templates FOR SELECT
  USING (workspace_id IS NULL OR workspace_id = public.get_my_workspace_id());
CREATE POLICY rst_insert ON public.rider_section_templates FOR INSERT
  WITH CHECK (workspace_id = public.get_my_workspace_id());
CREATE POLICY rst_update ON public.rider_section_templates FOR UPDATE
  USING (workspace_id = public.get_my_workspace_id())
  WITH CHECK (workspace_id = public.get_my_workspace_id());
CREATE POLICY rst_delete ON public.rider_section_templates FOR DELETE
  USING (workspace_id = public.get_my_workspace_id() AND public.is_workspace_admin());

-- 2. Section status tracking (mirrors section_statuses JSONB in advance_instances)
-- Already exists implicitly in rider_sections — verify section status column.
-- If not present, add:
ALTER TABLE public.rider_sections
  ADD COLUMN IF NOT EXISTS status text DEFAULT 'not_started'
    CHECK (status IN ('not_started','in_progress','complete','needs_review'));

ALTER TABLE public.rider_sections
  ADD COLUMN IF NOT EXISTS last_updated_by_id uuid REFERENCES auth.users(id) ON DELETE SET NULL;

-- 3. Seed platform-level section templates (the canonical sections every rider needs)
-- Order matters: Contacts FIRST per Adam's explicit lock.
INSERT INTO public.rider_section_templates
  (workspace_id, template_type, name, description, icon, fields, sort_order)
VALUES
  (NULL, 'contacts', 'Contacts', 'Key contacts: TM, PM, FOH, Mons, Management', 'users',
   '[
     {"id":"tm","label":"Tour Manager","type":"contact","required":true},
     {"id":"pm","label":"Production Manager","type":"contact"},
     {"id":"foh","label":"FOH Engineer","type":"contact"},
     {"id":"mons","label":"Monitor Engineer","type":"contact"},
     {"id":"management","label":"Management","type":"contact"}
   ]'::jsonb, 10),
  
  (NULL, 'schedule', 'Schedule', 'Load-in, soundcheck, doors, set times, curfew', 'clock',
   '[
     {"id":"load_in","label":"Load-in","type":"time"},
     {"id":"soundcheck","label":"Soundcheck","type":"time"},
     {"id":"doors","label":"Doors","type":"time"},
     {"id":"set_time","label":"Set time","type":"time"},
     {"id":"curfew","label":"Curfew","type":"time"}
   ]'::jsonb, 20),

  (NULL, 'audio', 'Audio / FOH', 'Audio system, mic count, console requirements', 'mic',
   '[
     {"id":"pa","label":"PA system","type":"textarea"},
     {"id":"foh_console","label":"FOH console","type":"text"},
     {"id":"monitor_console","label":"Monitor console","type":"text"},
     {"id":"channel_count","label":"Channel count","type":"number"}
   ]'::jsonb, 30),

  (NULL, 'monitoring', 'Monitors / IEMs', 'IEM packs, wedge count, RF spectrum', 'headphones',
   '[
     {"id":"iem_pack_count","label":"IEM packs","type":"number"},
     {"id":"wedge_count","label":"Wedge count","type":"number"},
     {"id":"rf_notes","label":"RF coordination","type":"textarea"}
   ]'::jsonb, 40),

  (NULL, 'lighting', 'Lighting', 'Console, fixture types, backdrop', 'lightbulb',
   '[
     {"id":"console","label":"Console","type":"text"},
     {"id":"fixtures","label":"Fixtures","type":"textarea"},
     {"id":"backdrop","label":"Backdrop","type":"textarea"}
   ]'::jsonb, 50),

  (NULL, 'backline', 'Backline', 'Drums, amps, keyboards needed from venue', 'guitar',
   '[
     {"id":"drums","label":"Drum kit","type":"textarea"},
     {"id":"guitar_amps","label":"Guitar amps","type":"textarea"},
     {"id":"bass_amps","label":"Bass amps","type":"textarea"},
     {"id":"keys","label":"Keys / pianos","type":"textarea"}
   ]'::jsonb, 60),

  (NULL, 'risers', 'Risers / Stage', 'Riser dimensions, stage size, special needs', 'square',
   '[
     {"id":"riser_sizes","label":"Risers required","type":"textarea"},
     {"id":"stage_minimum","label":"Minimum stage size","type":"text"}
   ]'::jsonb, 70),

  (NULL, 'security', 'Security', 'Bag policy, metal detection, walkthrough', 'shield',
   '[
     {"id":"metal_detection","label":"Metal detection","type":"boolean"},
     {"id":"bag_policy","label":"Bag policy","type":"textarea"},
     {"id":"walkthrough_required","label":"Walkthrough required","type":"boolean"}
   ]'::jsonb, 80),

  (NULL, 'hospitality', 'Hospitality', 'Dressing rooms, towels, snacks, water', 'coffee',
   '[
     {"id":"dressing_rooms","label":"Dressing rooms","type":"textarea"},
     {"id":"towels_shower","label":"Shower towels","type":"number"},
     {"id":"towels_stage","label":"Stage towels","type":"number"},
     {"id":"snacks","label":"Snacks","type":"textarea"}
   ]'::jsonb, 90),

  (NULL, 'catering', 'Catering', 'Meals, dietary needs, alcohol policy', 'utensils',
   '[
     {"id":"meal_count","label":"Meal count","type":"number"},
     {"id":"dietary","label":"Dietary requirements","type":"textarea"},
     {"id":"alcohol","label":"Alcohol policy","type":"textarea"}
   ]'::jsonb, 100),

  (NULL, 'transport', 'Transportation', 'Vehicles, parking, load-in details', 'truck',
   '[
     {"id":"vehicles","label":"Vehicles","type":"text"},
     {"id":"parking","label":"Parking instructions","type":"textarea"},
     {"id":"load_in_notes","label":"Load-in notes","type":"textarea"}
   ]'::jsonb, 110),

  (NULL, 'labour', 'Labour / Crew', 'Stagehands, FOH, lighting, monitor tech', 'users-2',
   '[
     {"id":"stagehands","label":"Stagehands","type":"number"},
     {"id":"all_day","label":"All-day crew","type":"number"},
     {"id":"foh_tech","label":"FOH tech","type":"boolean"},
     {"id":"lx_tech","label":"Lighting tech","type":"boolean"},
     {"id":"mon_tech","label":"Monitor / stage tech","type":"boolean"}
   ]'::jsonb, 120),

  (NULL, 'merch', 'Merchandise', 'Merch company, location, splits', 'shopping-bag',
   '[
     {"id":"merch_company","label":"Merch company","type":"text"},
     {"id":"location","label":"Location","type":"text"},
     {"id":"split","label":"Split %","type":"number"}
   ]'::jsonb, 130);

-- Tracking insert
INSERT INTO public._lp_migrations (filename, checksum, applied_by)
VALUES ('NNN_rider_architecture_mirror.sql', 'backfill', 'manual-supabase-editor')
ON CONFLICT (filename) DO NOTHING;
```

Confirm migration number before writing — verify what's currently at the top of `database/migrations/`.

---

## Sub-phase delivery

| Phase | Scope | Est LOC |
|---|---|---|
| §RA1 | Migration + section template seed + paste-ready SQL | ~250 |
| §RA2 | `RiderPackHeader` (glass hero, progress ring, ports `AdvanceShowHeader` pattern) | ~350 |
| §RA3 | `RiderPackSidebar` (lists rider packs for tour/artist context, mirrors `AdvanceUpcomingSidebar`) | ~300 |
| §RA4 | `RiderTemplateMetaBar` (Show/Builder tabs, template name, actions — mirrors `TemplateMetaBar`) | ~300 |
| §RA5 | `RiderSectionLibrary` (drag palette, fetches from rider_section_templates, expandable cards — mirrors `AdvanceSectionLibrary`) | ~400 |
| §RA6 | `RiderBuilderShellClient` (three-pane wrapper, CustomEvent loop — mirrors `AdvanceBuilderShellClient`) + hashed background CSS | ~350 |
| §RA7 | `RiderSectionBuilder` (accordion canvas with drag-reorder, field type picker — mirrors `AdvanceSectionBuilder` but slimmer — target <2000 LOC, not the 5300 of the original PackEditor) | ~1500 (will split into §RA7a/§RA7b/§RA7c) |
| §RA8 | `RiderFieldPropertiesPanel` (right pane for selected field — mirrors `AdvanceFieldPropertiesPanel`) | ~300 |
| §RA9 | `RiderShowReadView` (filled cards display for show mode — mirrors `AdvanceShowReadView`) | ~500 |
| §RA10 | `RiderShowRightRail` (specs, lineage, cross-product links — mirrors `AdvanceShowRightRail`) | ~300 |
| §RA11 | Section completion tracking (status field, computeRiderProgress helper, plumbing into header + sidebar) | ~250 |
| §RA12 | URL mode toggle (`?mode=edit`) + route the existing `/rider-packs/[id]` page to mount the new shell | ~150 |
| §RA13 | Mount in `/operations/[tourId]/riders` — **DECISION LOCKED:** keep the existing list-of-cards page as-is (glass hero + card grid, already shipped). Click a card → `/rider-packs/[id]` which now mounts the new shell from §RA12. No structural change to the operations list page. | ~150 |
| §RA14 | Mount in `/artists/[id]/(library)/riders` — same chrome treatment | ~200 |
| §RA15 | Data migration — back-port existing `rider_packs` content to use the new section template system. Read every existing rider_pack, identify which platform template each section maps to, write the linkage. | ~300 |

Total estimated ~5,100 LOC across ~15 sub-phases (§RA7 splits into 3). ~3-4 weeks of CC time.

### §RA13 decision lock (asked + answered)

Adam picked: **keep the existing operations riders list page**. The list-of-cards layout shipped recently (glass hero + card grid linking to `/rider-packs/[id]`) stays in place. The new architecture lives behind the per-pack route — when a user clicks a card, they enter the new shell. No structural change to `/operations/[tourId]/riders` itself.

Same applies to `/artists/[id]/(library)/riders` — the existing `ArtistTemplateList` stays; clicking a template enters the new shell with `?mode=edit` to land in builder mode by default (artist-scope templates are the source-of-truth for structure, so opening one should feel like opening a template editor).

§RA14 therefore reduces to: when constructing the link from `ArtistTemplateList` to `/rider-packs/[id]`, append `?mode=edit` for artist-scope rows. Tour-scope rows from the operations list link without the param (defaults to show mode).

---

## §RA1 — Migration + seed (start here)

Recon first:
- Read `database/migrations/077_advance_template_forking.sql` (or similar) — the Advance template forking pattern is the canonical reference for fork support
- Read `database/migrations/*.sql` to find advance_templates definition
- Verify current rider_sections schema (does `status` column exist? `last_updated_by_id`?)
- Find the highest migration number and use the next sequential

Then write:
- `database/migrations/NNN_rider_architecture_mirror.sql` with:
  - `rider_section_templates` table (per above)
  - `rider_sections.status` + `rider_sections.last_updated_by_id` columns if missing
  - Platform-level section template seeds (per above, Contacts FIRST)
  - Canonical workspace RLS
- `database/migrations/_apply_NNN_supabase.sql` paste-ready block

Halt-and-report criteria:
- If `rider_sections.status` already exists, skip that part and report
- If `rider_section_templates` clashes with an existing table name, propose alternative
- If the seed JSONB shape needs adjustment for the field types currently supported by rider_sections, surface and fix

---

## §RA2 — RiderPackHeader (port AdvanceShowHeader)

Recon first:
- READ `src/components/advance/AdvanceShowHeader.tsx` in full
- READ `src/components/advance/CircularProgressRing.tsx` in full (reuse as-is for the ring)
- Read the existing `RiderPackHeader` (if exists) or wherever the rider editor currently shows its title

Build:
- `src/components/rider-pack/RiderPackHeader.tsx`
- Glass hero with brand glow (rounded-2xl, border + soft orange glow top-right via blur-3xl)
- Pack title (h1), scope chip (Artist / Tour / Show), template chip (if inherits_from), last-edited line
- Circular progress ring on the right (use the existing CircularProgressRing — pass sectionsComplete, sectionsTotal, etc.)
- "Edit template" button (when in show mode) + "Open public preview" button (when share token exists)
- Match the visual language of AdvanceShowHeader exactly — same paddings, same border tokens, same blur effect, same tab toggle behavior

UI/UX skill consultation: compare the AdvanceShowHeader layout with the rider-specific data (no venue, no date — just scope + template lineage). Decide what fills the chip slots that Advance uses for date/venue. Probably: scope label + parent template name + section count.

---

## §RA3 through §RA10 — port each Advance component

Each sub-phase:
1. Read the Advance source file in full
2. Quote the file:line references in the commit body
3. Build the Rider equivalent at `src/components/rider-pack/`
4. Match visual treatment + data flow + state management 1:1 where possible
5. Document any Rider-specific adaptations explicitly

UI/UX skill consultation: present at least 1 alternative for any Rider-specific adaptation that differs from Advance. The default is "mirror Advance exactly" — deviations are justified by Rider data shape differences, not aesthetic preference.

---

## §RA6 — Hashed builder-mode background (CRITICAL VISUAL)

In `src/app/globals.css`, add:

```css
/* Rider Architecture Mirror — builder-mode canvas background.
   Subtle diagonal stripes signal "you are editing the template structure,
   not the data." Tinted with brand orange at 3% opacity, 14px stripe
   width, 45° angle. Token-driven so light/dark mode both work. */
.lp-rider-builder-canvas {
  background-image: repeating-linear-gradient(
    45deg,
    transparent,
    transparent 14px,
    color-mix(in srgb, var(--color-lp-orange) 3%, transparent) 14px,
    color-mix(in srgb, var(--color-lp-orange) 3%, transparent) 28px
  );
}

/* When builder canvas is scrollable, the pattern repeats correctly via
   background-attachment: local (vs fixed which would tile against viewport). */
.lp-rider-builder-canvas {
  background-attachment: local;
}
```

UI/UX skill consultation: compare 3 hashed treatments before locking:
1. 45° diagonal stripes (above)
2. 90° horizontal stripes
3. Dot pattern via radial-gradient

Pick the one that signals "template/meta" most clearly without visual noise. Show all three side-by-side in the commit report.

Apply ONLY to the builder canvas main element. NOT to:
- The TemplateMetaBar (solid)
- The SectionLibrary (solid panel)
- The FieldPropertiesPanel (solid panel)

---

## §RA7 — RiderSectionBuilder (the big one, splits into 7a/7b/7c)

This is the largest sub-phase because the section builder is functionally rich:
- Drag-reorder sections
- Drag-reorder fields within sections
- Field type picker (text, textarea, table, contact, asset, time, currency, number, checkbox_list, url, rich_text, channel_list)
- Add custom field per section (creates workspace fork of platform template if needed)
- Add blank custom section
- Delete section / delete field
- Auto-save on field-def change with snapshot for cancel

**Target: <2000 LOC** (NOT the 5300 of the original PackEditor). Use the Advance pattern as the guide for what to leave OUT. Many features in the original PackEditor are bloat.

Split:
- §RA7a — section list rendering, accordion expand/collapse, drag-reorder of sections
- §RA7b — field list within section, drag-reorder of fields, field type picker
- §RA7c — custom field handling, workspace fork creation, auto-save plumbing

UI/UX skill consultation: for the section accordion treatment, the field type picker modal, and the drag-handles, compare to Advance's existing patterns. Deviate only when Rider has a real reason (e.g. the existing `rider_sections.fields` JSONB shape may differ from advance_form_configs.sections — adapt).

---

## §RA9 — RiderShowReadView (port AdvanceShowReadView)

Recon `src/components/advance/AdvanceShowReadView.tsx` in full.

Build `src/components/rider-pack/RiderShowReadView.tsx`:
- Renders each section as a card
- Missing fields: amber-dashed click-to-fill border (matches Advance's UX01 Audit treatment)
- Filled fields: emerald edge
- Auto-save on field value change
- Each field rendered per its type:
  - `text` → inline input
  - `textarea` → multi-line input with expand
  - `contact` → contact card with name/role/phone/email
  - `time` → time picker
  - `currency` → currency input with `budgetCurrencySymbol`
  - `number` → numeric input
  - `boolean` → toggle
  - `table` → spreadsheet-grid embed
  - etc.

Reuse the existing field renderers from the original PackEditor wherever possible (this is the one place lifting code from the 5300-LOC monolith makes sense).

---

## §RA12 — URL mode toggle + route mount

In `src/app/(app)/rider-packs/[id]/page.tsx`:
- Read `searchParams` for `mode` (default 'show')
- Mount the new shell that renders different children based on mode
- Use the same pattern as `src/app/(app)/advance/[tourId]/[routingId]/page.tsx`

After this lands, the existing PackEditor is no longer reached via the default route. Mark it `@deprecated` in a header comment with a 30-day notice.

---

## §RA13/§RA14 — Mount points (locked behaviour)

- `/operations/[tourId]/riders/page.tsx` stays as-is (already glass-hero list, shipped). Each card already links to `/rider-packs/[id]` — that's the only change point: §RA12 routes that destination to the new shell. No edits to the operations list page itself.
- `/artists/[id]/(library)/riders/page.tsx` stays as-is. The component it renders (`ArtistTemplateList`) currently constructs row links to `/rider-packs/[id]`. §RA14 changes that single link constructor to append `?mode=edit` for artist-scope rows so opening a template lands in builder mode by default. Verify with `grep -n 'rider-packs' src/components/artists/library/ArtistTemplateList.tsx` first.

Halt-and-report criteria:
- If `ArtistTemplateList` is used for both rider AND channel-list templates, the `?mode=edit` append must be conditional on `kind === 'rider'` AND scope === 'artist'. Surface and split the prop API if needed.

---

## §RA15 — Data migration

Existing `rider_packs` rows have sections that don't link to `rider_section_templates`. Walk them:

```sql
-- One-time migration script: for each existing rider_section, identify
-- which platform template it most closely matches (by name + field overlap).
-- Set rider_sections.template_id = matching platform template id.
-- If no match, leave NULL (treated as custom section).
```

Write the script as a TS file at `scripts/migrate-rider-section-templates.ts` so it can be run via `npx tsx scripts/migrate-rider-section-templates.ts` after migration NNN lands.

Halt-and-report criteria: if any existing rider_section has a fields JSONB shape that's incompatible with any platform template, surface the rows and ask Adam how to handle.

---

## Halt-and-report criteria (every sub-phase)

Stop and report if:
- Existing rider_sections JSONB shape doesn't match the shape the platform templates assume
- A migration column already exists (skip and report)
- An Advance component you're mirroring has been recently refactored — re-read it
- The hashed background pattern interferes with form field rendering (text becomes hard to read on the striped background)
- LOC for a sub-phase exceeds 400 (split it)
- The auto-save loop fights the CustomEvent dispatch loop (timing issues)

---

## Resume prompt for CC

```
New sprint. Full spec in docs/handover/CC_RIDER_ARCHITECTURE_MIRROR.md.

Goal: rebuild Rider editor to mirror the Advance architecture — three-pane builder, URL-param mode toggle, section library drag palette, field properties panel, HASHED BACKGROUND for builder mode, section status tracking.

Branch: feat/rider-architecture-mirror off main.

Read first (binding):
- docs/handover/CC_RIDER_ARCHITECTURE_MIRROR.md (full spec)
- CLAUDE.md (conventions)
- src/components/advance/AdvanceShowHeader.tsx (port to RiderPackHeader)
- src/components/advance/AdvanceUpcomingSidebar.tsx (port to RiderPackSidebar)
- src/components/advance/AdvanceBuilderShellClient.tsx (port to RiderBuilderShellClient)
- src/components/advance/AdvanceSectionLibrary.tsx (port to RiderSectionLibrary)
- src/components/advance/AdvanceSectionBuilder.tsx (port to RiderSectionBuilder — target <2000 LOC, NOT the 5300 of the original PackEditor)
- src/components/advance/AdvanceFieldPropertiesPanel.tsx (port to RiderFieldPropertiesPanel)
- src/components/advance/TemplateMetaBar.tsx (port to RiderTemplateMetaBar)
- src/components/advance/AdvanceShowReadView.tsx (port to RiderShowReadView)
- src/components/advance/AdvanceShowRightRail.tsx (port to RiderShowRightRail)
- src/components/advance/CircularProgressRing.tsx (REUSE as-is)

Sub-phases §RA1 → §RA15 in order. Halt-and-report at 400 LOC per sub-phase. §RA7 splits into 7a/7b/7c by design.

USE THE UI/UX SKILL on every sub-phase. Required consultations:
- §RA2: header layout adaptation (no date/venue, has scope + template lineage)
- §RA6: hashed background pattern (compare 3 treatments, pick best)
- §RA7: section accordion + field type picker treatment
- §RA9: filled-cards display + missing-field treatment

Start with §RA1 — migration + section template seed. Recon current rider_sections schema first.

Standard report format: hash, files (path:line), verify (tsc/lint/build), UI/UX skill summary, LOC, smoke instructions, blockers.

Existing PackEditor stays in place during this sprint (back-compat). Final sub-phase §RA12 switches the route to mount the new shell. PackEditor becomes @deprecated.
```

---

## File path

`/Users/lowpass/Documents/lowpass-app/docs/handover/CC_RIDER_ARCHITECTURE_MIRROR.md`
