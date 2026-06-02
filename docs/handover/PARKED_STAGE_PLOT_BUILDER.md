# PARKED — Stage Plot Builder

**Status:** Parked. Substantial product build — full design decisions locked, ready to spec on resume.

**Goal in one sentence:** A drag-and-drop top-down stage plot editor inside Lowpass with a comprehensive icon library, brand-color tinting, channel-list integration, AI-generated icons for custom gear, named version history, and branded PDF export — replacing every standalone stage plot tool the user might reach for today.

**Why parked:** Two reasons. (1) The rider editor rebuild (palette + smart-fields model) is the natural architectural prototype for this — once that pattern ships, the stage plot builder is essentially the same pattern applied to a 2D canvas. Building both in parallel risks divergent solutions. (2) Adam's currently-shipping work (Payroll → Rooming → Rider rebuild) all have higher daily-workflow ROI than this.

---

## Reference tools

**Functional reference: "StagePlot v2" (3D Preview)** — described as "shitty but basic." Functional features to match or exceed:

- Three-pane layout: Item Library (left) · Stage canvas (center) · Properties panel (right)
- Stage canvas with grid, configurable dimensions (24x16 ft example)
- Drag-drop items from library
- Per-item: label, label size, input/mix routing, notes, width/depth, scale, rotation, color, shape variants
- Multi-select (shift/cmd/ctrl click)
- Auto-generated lists from items (input lists, mix lists)
- Export: JSON, Print/PDF
- One-page show info: band/show name, show notes
- 3D preview from 2D positions (decided OUT for v1)

**Aesthetic + content reference: Adam's actual Saint Motel plot.** Header format:
```
STAGE PLOT          Saint Motel logo (centered)
Updated Aug '25
Adam Rowley
TM/FoH
+1 (615) 372 4802
adam@lowpass.co
                                                Page 8 of 10
```
Body: top-down gear (drum kit on riser labeled "8ftX4ftX12in", keys, guitar amp, DI, pedalboard, mics) plus power drops labeled "120V" running down stage right.

---

## Locked decisions

These are settled. Resume work does not re-litigate.

### Visual style & icons

| Decision | Locked |
|---|---|
| **Icon style** | Mid-realistic (recognizable, flat-shaded — Apple "tabletop" iconography), leaning schematic where mid-realistic adds noise. Library = outline-only, on-canvas = filled with brand tint. |
| **Library labels** | Toggleable. Library defaults to icon-only; user can toggle "show labels" globally. |
| **Per-category color schemes** | Yes — color matches channel-list sub-snake colors where possible. Multi-input instruments (drums, playback) get a single category color, not per-channel colors (would be too noisy). |
| **Brand variants for amps/gear** | Yes — visual representation reflects physical size. Marshall full stack is large rectangle; Kemper rack is small rectangle. Icon library carries multiple amp variants based on physical footprint. |
| **Drum kit drop behavior** | Option C — user picks at drop time: composite kit OR atomic components. Composite kit has a "split into individual components" button (non-reversible action). Include **left-handed variant** of every composite kit. |
| **Rotation indicator** | Rotated icon only. No rotation handle/arrow visible after rotation commits. |

### Stage canvas

| Decision | Locked |
|---|---|
| **Stage shape v1** | Rectangle as the default. Allow adding polygons / extending shape for custom stages (thrust, festival side-wing extensions). Not free-draw — additive polygon snap. |
| **Grid style** | Dotted grid. Snap-to-grid by default. |
| **Audience marker** | "AUDIENCE" label only at downstage edge. No silhouettes, no gradient. |
| **Cardinal labels** | Short form: US / DS / SL / SR — subtle, in muted text. |
| **Riser annotation** | Risers labeled with **WxDxH** in current units. Format: `8x8x1` or `8x4x3` (numeric, with unit suffix at end). |
| **Reference markers** | All toggleable: center line (vertical), downstage center cross, lateral distance markers from center. |
| **Units** | Switchable ft ↔ m. Default ft. Saved per-tour preference. |

### Item-level customization

| Decision | Locked |
|---|---|
| **Label control** | Full — position (top / bottom / left / right / inside / hidden), independent rotation, background style (transparent / pill / bordered box), bold/italic toggle. |
| **Grouping** | Full — select-multi to group, save groups as reusable templates, nested groups allowed. |
| **Linked items** | Only when both selected — no implicit linking, no auto-following. Keep it explicit. |
| **Z-stacking** | Layer panel as a popup/sidebar. Right-click bring-to-front / send-to-back also available. |
| **Shape variants** | All — rectangle, circle, diamond, triangle, hexagon, octagon, rounded rectangle. Custom polygons via the canvas polygon tool. |
| **Per-item opacity** | NO. Don't ship. |
| **Custom item saving** | Workspace-level save (shared across artists). Plus: **AI-generated icons.** When user uploads a custom item (e.g. "Charlotte's wireless rack"), call Claude API with the item label + optional photo → generate a front-panel iconographic SVG drawing. Reference: rack-building software does this for rack pieces. This is a v1 feature. |

### Power & technical annotations

| Decision | Locked |
|---|---|
| **Power detail per item** | Amperage (15A/20A/30A) + voltage (110V/220V/240V) tracked per item. Plug type deferred. |
| **Power drops** | Yes — separate "power drop" items with their own properties (amperage, voltage). Match the visual style from Adam's reference plot (labeled "120V" or similar). |
| **Power runs / cable paths** | NO in v1. Defer to a future "Pro tier" feature for working to scale. |
| **DI labeling** | Channel number badge + source instrument name (auto from channel list link). |
| **Stage box visualization** | Channel range label + usage indicator + color tint by sub-snake. No "stripes coming out" — too messy. |
| **Network drops** | First-class concept in v1. Dante / MADI / Cat5 stage boxes get their own icon + linking. |

### Output / PDF / Print

| Decision | Locked |
|---|---|
| **Paper config** | Fully configurable print settings (paper size, orientation, margins). User chooses per export. |
| **Multi-page output** | Page 1 = plot only. Optional Page 2 = input list. User toggles per export. |
| **Cover page** | NO separate cover. The plot page has a header at top-left: STAGE PLOT title + last-updated timestamp + TM/PM name + role + phone + email. Artist logo separately positioned (centered or top-right per template). Match Adam's reference plot's header pattern. |
| **Color vs B&W** | Generate both versions on every export. Promoter chooses which to print. |
| **QR code** | Yes — small QR in corner linking to public web reader. Default ON, user can hide per export. |
| **Watermarking** | Version number + last-update date/time printed in footer or subtle background. |
| **Vector vs raster** | Vector. |

### Sharing / collaboration / version control

| Decision | Locked |
|---|---|
| **Public sharing** | Tokenized URL `/p/[token]` + view-only by default + track who/when viewed. Password protection NOT v1 (defer if requested). |
| **Comments on plot** | NO. Plots are write-only, not collaborative annotation surfaces. |
| **Version history** | Named versions — user creates "v1 — MSG" style names. App prompts to save a named version on close if changes made. Version description field for what changed. |
| **Co-editing** | Multi-user editing allowed. Last-write-wins (no CRDT). Simple optimistic UI; if a conflict happens, last save reflects. Operationally identical to single-editor for Adam's use case. |
| **Sign-off workflow** | NO. Skip. |

### Templates & presets

| Decision | Locked |
|---|---|
| **Starter templates** | Yes — ship a library of starters. Adam will collaborate on building them and they get applied to all users. Initial set: jazz trio, rock 4-piece, electronic act, singer-songwriter, comedy, orchestra, festival main, club show. |
| **User-saved templates** | Both artist-scope AND workspace-scope. User picks at save time. Mirrors the rider_packs.scope pattern. |
| **Cluster sub-templates** | Yes — "Kemper rig", "Acoustic guitar setup", "Bass rig", etc. Drop the whole cluster, decompose after. |

### Touch / mobile / iPad

| Decision | Locked |
|---|---|
| **iPad support level** | iPad-friendly responsive layout. Not iPad-optimized native, not separate app. |
| **Apple Pencil** | NO. Touch only. |
| **Touch gestures** | Pinch zoom (canvas), long-press for context menu, tap to select, tap-and-hold for multi-select. |
| **Offline mode** | YES — PWA with service worker. Works during load-in without internet. Sync on reconnect. |

### Channel list integration

| Decision | Locked |
|---|---|
| **Link direction** | Item → Channel only. The channel list reads stage position from the linked item's plot location. Plot is the source of truth for position. |
| **Stage position derivation** | When item is placed on stage, app auto-derives position label (USL / USR / USC / DSL / DSC / DSR / OSL / OSR) from canvas coordinates. Channel list's "Position" column updates automatically. |
| **Visual link indication** | Color-code icon by sub-snake (from channel list's existing sub_snakes table) + "Unlinked" warning badge on canvas items not yet routed. NO channel number badges — too visually noisy. |
| **Sync operations** | Drag item on plot → channel row's position auto-updates. (Yes.) Other directions (add row → unplaced item appears, delete item → row warns) NO — keep one-way for clarity. |
| **Channel list overlay** | Toggle to show channel numbers overlaid on the plot for verification / FOH handoff. Default OFF. |

### Festival / multi-act scenarios

| Decision | Locked |
|---|---|
| **Multi-act on same stage** | **House infrastructure layer + per-act customization layer.** Brilliant idea per Adam. House = shared (drum riser, PA wedges, monitor world). Act layers stack on top. Each act exports their own combined view. |
| **Side stages / B-stage** | Two plots (one per stage). |
| **Outdoor considerations** | None — just notes field for sun direction, weather, etc. |

### Branding / theming

| Decision | Locked |
|---|---|
| **Brand color cascade** | Plot color pulls from `plot.color` (override) → `tour.brand_color` (override) → `artist.brand_color` (default) → workspace default. All four layers settable. Note: Charlotte Sands is BLUE (correction to my earlier orange assumption). |
| **Style preset options** | Modern minimal only in v1 — BUT **with rulers showing scale**. Scale accuracy is critical. Every icon represents its real-world footprint. Rulers visible along stage edges (toggleable). |
| **Logos** | Artist logo + tour logo + sponsor logos + production company logo — all settable, all renderable on output. Per-plot positioning. |

### Custom items & extensibility

| Decision | Locked |
|---|---|
| **User-uploaded custom icons** | SVG + PNG accepted. Auto-converted to a workspace-library entry. Plus AI-generated icons (above). |
| **Drawing tools** | Simple polygons + labels + lines. No free-draw, no curves. |
| **Text annotations** | First-class — floating text labels on canvas, not attached to an item. Important per Adam. |
| **Sticker / callout annotations** | Yes — arrows, callouts, exclamation marks. Annotation library distinct from item library. |

### Decisions explicitly DEFERRED or KILLED

| Item | Status |
|---|---|
| Lighting plot fully built out (LD-oriented, intensity, color, focus) | Later — but yes, eventually a v2 |
| 3D preview | Killed — unnecessary |
| AI-powered plot suggestions ("you might want a wedge here") | Deferred — nice idea, not v1 |
| CRDT / real-time multi-cursor collaboration | Killed — last-write-wins is fine |
| Native iOS/Android app | Deferred — PWA covers iPad |
| Stage position labels for non-standard stages (e.g. thrust) | Pencilled-in: need to extend USL/USR/etc. for non-rectangular stages |
| Password protection on public links | Deferred — add when first promoter asks |
| Approval / sign-off workflow | Killed |

---

## Where it fits in Lowpass

**Standalone document type inside rider_packs (same pattern as channel_list).**

Per Sprint 12 §7, `rider_packs.kind` discriminator already supports 'rider' | 'channel_list'. Adding 'stage_plot' as a third kind is a one-column CHECK constraint update. Then:

- Stage plots live alongside riders and channel lists at the artist library tier (`/artists/[id]/(library)/stage-plots`)
- Tour-scoped copies via the existing snapshot-copy assign-to-tour pattern
- Same `linked_rider_pack_id` relationship — stage plot pairs with rider + channel list as a triplet (the "Charlotte Sands rider" + "Charlotte Sands channel list" + "Charlotte Sands stage plot" all linked)
- Appears in the Advance Packet view (Sprint 12 §11) as a document
- Public web reader at `/p/[token]` renders the plot like a static image

This makes stage plot a sibling concept to channel list. Clean.

---

## Sequencing constraints

Do not start until all are merged:

1. **Rider editor v2 rebuild** — palette+smart-fields prototype
2. **§11 Advance Packet view** — shipped (Sprint 12)
3. **§B5 density propagation** — shipped
4. **`pdf-lib` + Puppeteer pipeline** — shipped (Sprint 12 §10)
5. **`artists.brand_color`** — shipped (Payroll §P1)
6. **`artists.default_logo_url`** — shipped (Sprint 12 §9)

---

## Icon catalog — comprehensive (must ship v1)

Categories with example items. Full catalog in `docs/handover/STAGE_PLOT_ICON_CATALOG.md` to be written at resume time. v1 target: ~120-140 unique icons.

### Aesthetic guidelines (locked)

- **Style:** Mid-realistic flat-shaded. Top-down accurate. Recognizable at 16/32/80px.
- **Library state:** Outline-only, 1.5px stroke, rounded line caps, monochrome (uses `currentColor`).
- **Canvas state:** Filled with brand-color tint (10-15% opacity), stroke in stronger contrast.
- **Scale:** Icons drawn to their real-world footprint at 100% scale. A Marshall full-stack is visibly larger than a Kemper.
- **Color encoding:** Per-category color tints layered on top of brand tint (drums = neutral, mics = blue, amps = amber, monitors = teal, etc.). Matches channel-list sub-snake conventions where possible.
- **Dark-mode native:** Via `currentColor` and theme tokens.

### Categories

1. **Musicians / people** (12 icons) — lead vocalist, backing vocalist, guitarist, bassist, drummer, keyboardist, DJ, conductor, brass, wind, strings, percussion
2. **Microphones** (18 icons) — full vocal/instrument/clip/condenser/lavalier/headset/boundary range
3. **Drum kit components** (22 icons) — all kit pieces + **left-handed variants** for composites
4. **Stringed instruments** (17 icons)
5. **Keyboards** (12 icons) — grand, upright, stage piano, synths at different key counts, Hammond+Leslie, etc.
6. **Amplifiers + cabinets** (17 icons) — physical-footprint-accurate variants (Twin vs Marshall stack vs Kemper)
7. **Monitors + IEM** (7 icons)
8. **Signal + I/O** (11 icons) — DIs, pedalboards, wireless racks, **network/digital snake distinct from analog**
9. **Stage infrastructure** (16 icons) — risers (4x4, 4x8, 8x8, 8x4, custom WxDxH), stage boxes (analog + digital), **power drops with voltage labels**, distros
10. **Lighting** (basic v1, 9 icons) — moving head, strobe, par, truss, hazer, backdrop. Full LD-oriented features deferred.
11. **Stands + supports** (12 icons)
12. **Utility + annotations** (10 icons) — generic shapes, text annotation, arrow, callout, exclamation, custom polygon tool entry

**Total v1: ~140 icons** (includes left-handed drum variants, multiple amp brands by footprint, digital + analog stage boxes as distinct categories).

### AI-generated icons (NEW REQUIREMENT)

When user uploads a custom item or pastes a photo of gear:

1. User uploads photo OR types item label
2. App calls Claude API: "Generate a top-down iconographic SVG representation of this {item}: front-panel view, outline style, 1.5px stroke, recognizable at 32px. Include essential controls/features. Match the visual style of {reference SVG snippet}."
3. Returns SVG paths
4. App saves to workspace library with user's label
5. Available in palette like any other icon

Reference: rack-building software (RackMonkey, etc.) generates rack-piece front-panel art from photos. Same pattern.

This is a **v1 feature**, not a stretch goal. Adam wants this.

Cost projection: Sonnet 4 (better at structured graphic generation than Haiku for this kind of task). ~$0.10 per icon generated. Cached forever once created. ~50 custom items per workspace lifetime = $5 total per workspace. Trivial.

### Icon delivery strategy

- **Hand-author:** specialty items (drum kit components, specific guitar shapes, brand-recognizable amps)
- **Tabler reuse:** generic items where outline icons exist (mic stand, music stand)
- **AI-generated:** workspace customs (and Adam's collaboration to build the starter templates)

---

## Architectural approach

### Stack

- React + Next.js
- `dnd-kit` for drag-drop
- SVG-based canvas (not Konva / Fabric / WebGL)
- Service worker for offline mode (PWA)
- `pdf-lib` + Puppeteer for PDF export (Sprint 12 §10)
- Supabase Storage: `stage-plot-assets` bucket for user uploads, reference images, AI-generated SVGs
- Claude API for custom icon generation

### Canvas tech rationale

SVG over Canvas/Konva:
- Stage plots are mostly static. SVG renders cleanly at any zoom.
- Hit testing is free (event handlers per element).
- Accessibility (labels, ARIA per item).
- PDF export trivially renders the same SVG.
- Smaller bundle.
- Service-worker caching simpler with SVG strings.

### Offline mode (NEW REQUIREMENT)

- PWA manifest + service worker
- IndexedDB cache of stage plot state
- Optimistic UI on every edit; sync queue persists across page closes
- Conflict resolution: last-write-wins on sync (per locked decision)
- Visual indicator: "offline mode active" pill in header when disconnected

---

## Data model (migration ~115+)

```sql
-- Stage plot CHECK constraint addition
ALTER TABLE public.rider_packs
  DROP CONSTRAINT IF EXISTS rider_packs_kind_check;
ALTER TABLE public.rider_packs
  ADD CONSTRAINT rider_packs_kind_check
  CHECK (kind IN ('rider', 'channel_list', 'stage_plot'));

-- Stage plot config (1:1 with rider_pack where kind='stage_plot')
CREATE TABLE IF NOT EXISTS public.stage_plots (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id     uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  rider_pack_id    uuid NOT NULL UNIQUE REFERENCES public.rider_packs(id) ON DELETE CASCADE,
  stage_width_ft   NUMERIC(5, 2) NOT NULL DEFAULT 24,
  stage_depth_ft   NUMERIC(5, 2) NOT NULL DEFAULT 16,
  stage_shape      jsonb NOT NULL DEFAULT '{"type":"rect"}',  -- supports rect + polygon extensions
  units            text NOT NULL DEFAULT 'ft' CHECK (units IN ('ft', 'm')),
  show_grid        boolean NOT NULL DEFAULT true,
  grid_size_ft     NUMERIC(4, 2) NOT NULL DEFAULT 1,
  show_center_line boolean NOT NULL DEFAULT false,
  show_ds_cross    boolean NOT NULL DEFAULT false,
  show_lateral_markers boolean NOT NULL DEFAULT false,
  show_rulers      boolean NOT NULL DEFAULT true,
  notes            text,
  -- Output header fields
  show_tm_name     text,
  show_tm_role     text,
  show_tm_phone    text,
  show_tm_email    text,
  show_logo_position text DEFAULT 'top-right',  -- top-left | top-right | top-center
  show_qr_on_print boolean NOT NULL DEFAULT true,
  -- Color cascade
  color_override   text,  -- hex override; null = use tour/artist/workspace
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now()
);

-- Item placements
CREATE TABLE IF NOT EXISTS public.stage_plot_items (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id        uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  stage_plot_id       uuid NOT NULL REFERENCES public.stage_plots(id) ON DELETE CASCADE,
  layer               text NOT NULL DEFAULT 'main' CHECK (layer IN ('house','main','annotations')),  -- house infra layer for festival mode
  icon_name           text NOT NULL,  -- registry key OR custom_<uuid>
  label               text,
  label_position      text DEFAULT 'bottom' CHECK (label_position IN ('top','bottom','left','right','inside','hidden')),
  label_rotation_deg  NUMERIC(5, 2) DEFAULT 0,
  label_style         jsonb DEFAULT '{}',  -- bg, bold/italic, etc.
  position_x_ft       NUMERIC(6, 2) NOT NULL,
  position_y_ft       NUMERIC(6, 2) NOT NULL,
  width_ft            NUMERIC(5, 2),
  depth_ft            NUMERIC(5, 2),
  height_ft           NUMERIC(4, 2),  -- for risers + stacked items
  rotation_deg        NUMERIC(5, 2) NOT NULL DEFAULT 0,
  scale               NUMERIC(4, 2) NOT NULL DEFAULT 1.0,
  color_tint          text,
  shape_variant       text CHECK (shape_variant IN ('natural','rectangle','circle','diamond','triangle','hexagon','octagon','rounded-rect','custom-polygon')),
  custom_polygon      jsonb,  -- vertices when shape_variant='custom-polygon'
  notes               text,
  power_required      boolean NOT NULL DEFAULT false,
  power_amperage      INTEGER,
  power_voltage       INTEGER,
  channel_list_row_id uuid REFERENCES public.channel_list_rows(id) ON DELETE SET NULL,
  auto_position_label text,  -- derived: USL/USR/USC/DSL/DSC/DSR/OSL/OSR
  z_index             INTEGER NOT NULL DEFAULT 0,
  locked              boolean NOT NULL DEFAULT false,
  group_id            uuid,  -- for grouped items
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX spi_plot_layer_z ON public.stage_plot_items(stage_plot_id, layer, z_index);
CREATE INDEX spi_channel ON public.stage_plot_items(channel_list_row_id) WHERE channel_list_row_id IS NOT NULL;
CREATE INDEX spi_group ON public.stage_plot_items(group_id) WHERE group_id IS NOT NULL;

-- Named version history
CREATE TABLE IF NOT EXISTS public.stage_plot_versions (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id    uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  stage_plot_id   uuid NOT NULL REFERENCES public.stage_plots(id) ON DELETE CASCADE,
  version_name    text NOT NULL,
  version_description text,
  snapshot        jsonb NOT NULL,  -- full plot + items state at this version
  created_by      uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX spv_plot_created ON public.stage_plot_versions(stage_plot_id, created_at DESC);

-- Workspace custom item library
CREATE TABLE IF NOT EXISTS public.stage_plot_custom_items (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id    uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  label           text NOT NULL,
  category        text,
  svg_content     text NOT NULL,  -- the actual SVG paths
  source          text NOT NULL CHECK (source IN ('uploaded','ai-generated')),
  ai_prompt       text,  -- if AI-generated, the prompt used
  default_width_ft  NUMERIC(4, 2),
  default_depth_ft  NUMERIC(4, 2),
  created_by      uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at      timestamptz NOT NULL DEFAULT now(),
  UNIQUE (workspace_id, label)
);

-- Public share tokens
CREATE TABLE IF NOT EXISTS public.stage_plot_share_links (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id    uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  stage_plot_id   uuid NOT NULL REFERENCES public.stage_plots(id) ON DELETE CASCADE,
  token           text NOT NULL UNIQUE,
  view_count      INTEGER NOT NULL DEFAULT 0,
  last_viewed_at  timestamptz,
  last_viewer_ip  text,
  created_by      uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX spsl_token ON public.stage_plot_share_links(token);

-- Storage bucket
INSERT INTO storage.buckets (id, name, public)
VALUES ('stage-plot-assets', 'stage-plot-assets', false)
ON CONFLICT (id) DO NOTHING;

-- All tables get canonical 4-policy workspace RLS
```

---

## Phased delivery (REVISED with all locked decisions)

| Phase | Scope | Est LOC |
|---|---|---|
| §SP0 | Data model + RLS + storage bucket + migration paste-ready SQL | ~350 |
| §SP1a | Icon catalog part 1 — drum kit components (all 22, including left-handed variants), mics (18), musicians (12) | ~800 |
| §SP1b | Icon catalog part 2 — amps (17, physical-footprint-accurate), keys (12), strings (17) | ~700 |
| §SP1c | Icon catalog part 3 — monitors/IEM (7), signal/I/O (11), infrastructure (16, including power drops + digital snakes), lighting basic (9), stands (12), utility/annotations (10) | ~700 |
| §SP2 | Canvas core — SVG render, pan/zoom, selection, drag-drop, snap-to-grid, dotted grid, rulers, stage shape (rect + polygon extensions), cardinal labels | ~900 |
| §SP3 | Properties panel — full label control, grouping, shape variants, opacity, layer panel | ~600 |
| §SP4 | Channel list integration — item→channel linking, auto position label derivation (USL/USR/etc.), sub-snake color tinting, unlinked warning, overlay toggle | ~400 |
| §SP5 | Auto-derived views — input list, power list (with voltage), item count, footprint check | ~300 |
| §SP6 | Document metadata + header fields (TM name/role/phone/email, show notes, logo positioning) + brand color cascade | ~250 |
| §SP7 | PDF export — Puppeteer pipeline reuse, configurable print settings, color + B&W variants, QR code, version + timestamp footer, optional Page 2 input list | ~600 |
| §SP8 | Public web reader at `/p/[token]` + view tracking + tokenized URL | ~350 |
| §SP9 | Cluster patterns — predefined drum kit (with split-into-individual button), Kemper rig, bass rig, acoustic guitar setup, ~10 in v1 | ~400 |
| §SP10 | Custom item uploads — SVG/PNG accepted, workspace library, label-only fallback | ~350 |
| §SP11 | **AI-generated icons** — Claude API integration, prompt template, SVG output validation, workspace library save | ~400 |
| §SP12 | Festival house-infrastructure layer — separate layer concept, per-act overlay, shared editing | ~500 |
| §SP13 | Named version history — auto-prompt on close, named save flow, restore-from-version | ~400 |
| §SP14 | Starter templates library — 8 starter templates (jazz, rock, electronic, singer-songwriter, comedy, orchestra, festival main, club show) | ~300 |
| §SP15 | Offline mode (PWA) — service worker, IndexedDB cache, sync queue, offline indicator | ~600 |
| §SP16 | Touch / iPad polish — pinch zoom, long-press context, tap-and-hold multi-select, hit-area sizing | ~300 |
| §SP17 | Annotations layer — text labels, callouts, arrows, exclamation marks, custom polygons | ~400 |
| §SP18 | Final polish — undo/redo (Cmd+Z), keyboard shortcuts, snap alignment guides, mass-apply UI for multi-select | ~400 |

**Total estimated ~10,000 LOC across 19 sub-phases. ~5-6 weeks of CC time.**

This is the largest single product build planned. v1 ships with everything locked above. Phase numbering is intentionally large because each sub-phase is a discrete halt point.

MVP cut (if Adam wants to ship in stages):
- **Core MVP (Phases 0-8):** Data model + icons + canvas + properties + channel integration + PDF + share link. ~4500 LOC, ~3 weeks.
- **Productivity layer (9-13):** Clusters + custom items + AI icons + festival layer + versions. ~2050 LOC, ~1.5 weeks.
- **Polish (14-18):** Templates + offline + touch + annotations + final polish. ~3000 LOC, ~2 weeks.

---

## Open questions (very short list — almost everything locked)

1. **Starter template content.** Adam said he'll help. When resume happens: schedule a 30-min session to define what's in each starter (jazz trio, rock 4-piece, etc.). Defer to resume time.
2. **AI icon prompt template.** Need a real prompt + reference SVG to seed Claude with style consistency. Build iteratively when §SP11 starts.
3. **Stage shape polygon authoring UX.** "Allow adding polygons for custom stages" needs a UI flow. Sketch options at §SP2 spec time.
4. **Festival house layer permissions.** Who edits the house layer vs the act layer? Workspace admin only for house? Surface at §SP12 spec time.
5. **Migration number.** Will be ~115-120+ by the time this ships. Verify at start.

---

## Resume instructions (PROFESSIONAL grade)

When picking this up:

1. **Confirm rider editor v2 has shipped.** Architectural prototype.
2. **Re-verify all locked decisions** with Adam — 6+ months may have passed, opinions may evolve. Print this doc, walk through the "Locked decisions" tables, ask "still good?" for each.
3. **Schedule starter template session with Adam** — he committed to helping define them.
4. **Set up `INTEGRATION_ENCRYPTION_KEY` if not already** — used elsewhere by then, just verify.
5. **Set up Claude API for icon generation** — verify model availability, cost projection, rate limits per §SAFE pattern.
6. **Verify storage bucket pattern still matches** — `stage-plot-assets` bucket creation.
7. **Verify migration number** — current expected ~115-120.
8. **Recon current channel list code** — sub_snakes table, stage_box concept, channel_list_rows.id stability.
9. **Write the full CC spec** (`docs/handover/CC_STAGE_PLOT_BUILDER.md`) following the same pattern as `CC_PAYROLL_PRODUCT_BUILD.md`. Use the phased delivery table above as the structure. This parking doc is the source of truth for decisions, the CC spec is the implementation guide.
10. **Decide MVP cut vs full build** with Adam — does he want phased ship or all-at-once?
11. **Set up PWA infrastructure** before §SP15 — service worker registration in `(app)/layout.tsx`, manifest in `public/`.

---

## Why parked

Order of priority ahead:

1. Phase B Budget (finishing — B5 redux + channel list small fixes)
2. IA Tour Flow Fix (queued small sprint)
3. Advance Builder Fixes (queued small sprint)
4. Payroll (in flight, biggest current pain)
5. Rooming (half-built workflow)
6. Rider editor v2 rebuild (architectural prototype for this)
7. Phase B.5 / B5 redux follow-ups
8. Phase C data frontloading
9. Flight Email Tracker (parked)
10. **THIS — Stage Plot Builder.** Biggest single build remaining.

Total ahead: ~10-12 weeks of CC work at current pace.

---

## File path

`/Users/lowpass/Documents/lowpass-app/docs/handover/PARKED_STAGE_PLOT_BUILDER.md`
