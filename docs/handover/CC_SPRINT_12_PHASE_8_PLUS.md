# CC Sprint 12 — Phases 8–11 (Rider + Channel List Redesign)

Adam's actual workflow for an advance packet (from his Drive folder, "Global Festivals '26"):

- **Riders/** — Technical & Production Rider (Google Doc, structured prose with cover/TOC/contacts/advance-summary/body sections) + Backstage Rider
- **Technical Docs + Hire List/** — Hire List (rental house) + Input List (channel list as a 46-channel sheet with inputs/outputs/mic-inventory/stands/cables/stage-boxes/snakes/pre-amp mapping)
- **Logos/** — brand assets (text wordmark, not headshot)
- **Admin Docs/** — contracts/finance (out of scope this sprint)

Two big things drive this work:

1. **The rider editor today is a 9-field-types form.** Adam writes structured prose with sections, bullets, and at-a-glance summaries — a form doesn't fit. We're rebuilding to be an actual document editor.
2. **The channel list today only models inputs.** Adam's actual sheet has 5 cross-cutting inventory tables (outputs/mics/stands/cables/stage-boxes/snakes) that the app doesn't surface. Plus the editor is ugly, half-tabbable, and doesn't match the rest of the app's design language.

The four streams in this spec rebuild both editors to match Adam's workflow, add PDF export, and bow it all up in an Advance Packet view at `/advance/[tourId]/[routingId]`.

Phase order: §8 → §9 → §10 → §11. Each is its own commit. Halt-and-report at ~400 LOC. Split a phase into `Xa/Xb` if the spec's escape-hatch is needed (Sprint 11 §4 precedent).

---

## Hard rules (all four phases)

1. **One feature commit per phase.** No fragmentation.
2. **Lint baseline:** do not regress beyond Sprint 12 §7's number. `tsc --noEmit` zero. `next build --webpack` green.
3. **Project root** `/Users/lowpass/Documents/lowpass-app`.
4. **Branch:** continue on the Sprint 12 branch. Do NOT branch off main.
5. **Verify before claiming.** Name specific files/lines that changed in each report. Adam diffs before merge.
6. **Token discipline.** All visual values via `var(--lp-…)`. No hardcoded hex outside `color-mix` / hex+alpha for orange tints.
7. **Scope creep escape hatch.** Any subtask balloons past ~400 LOC of additions or tempts a refactor into adjacent code → STOP and report.

## New deps allowed (with phase pinning)

- **Tiptap** (`@tiptap/react`, `@tiptap/starter-kit`, `@tiptap/extension-placeholder`) — §9 only, for the rider rich-text editor.
- **Puppeteer-core + @sparticuz/chromium** — §10 only, for serverless PDF rendering.
- **@anthropic-ai/sdk** — §9 only, for the AI advance summary endpoint.

No other new deps. Anything else surfaces as halt-and-report.

## Pre-flight (CC reads before §8)

- `npm run db:migrate` is now functional but Adam still applies migrations manually via Supabase SQL Editor when `DATABASE_URL` isn't in `.env.local`. Write migrations idempotently and Adam will paste. Each migration adds a tracking row in `public._lp_migrations` with `checksum='backfill'` after manual apply.
- Migration 097 is the last one before this sprint. Numbers start at 098.
- The rider_packs table now has `kind` column (`'rider'|'channel_list'`), `linked_rider_pack_id` self-FK, `propagated_from_template_at` timestamp — all from §7. Build on top.

---

# §8 — Channel list editor rebuild + mic library expansion

## Goal

A channel list editor that matches Adam's actual sheet structure (inputs + outputs + 5 inventory aggregate tables), looks like the rest of the app, and is fully keyboard-navigable.

## Data model changes (migration 098)

The channel list currently models inputs only via `channel_list_rows`. Add output support via a discriminator column (cleaner than a parallel table — same RLS, same workspace_id, single document):

```sql
ALTER TABLE public.channel_list_rows
  ADD COLUMN IF NOT EXISTS row_kind TEXT NOT NULL DEFAULT 'input'
    CHECK (row_kind IN ('input', 'output')),
  ADD COLUMN IF NOT EXISTS output_item TEXT,        -- "PSM1000 w/p10r" / "OLI IEM"
  ADD COLUMN IF NOT EXISTS output_destination TEXT, -- "SL MON" / "DRIVE LOOM"
  ADD COLUMN IF NOT EXISTS output_qty INTEGER,
  ADD COLUMN IF NOT EXISTS output_notes TEXT;
```

Input rows: existing 15 columns drive the UI. Output rows: `output_item`, `output_destination`, `output_qty`, `output_notes`, `position`, `notes` only (NULL out input-only columns).

The 5 inventory tables (mics-by-count, stands-by-count, cables-by-length, stage_boxes, snakes) are **computed from existing rows** at render time. No new tables.

## Mic library expansion (migration 099)

Existing `mic_library` table presumed schema: `id, workspace_id, name, kind, phantom_default, created_at` (verify; if column is named differently, adapt).

```sql
-- Ensure the column exists for phantom auto-fill
ALTER TABLE public.mic_library
  ADD COLUMN IF NOT EXISTS phantom_required BOOLEAN DEFAULT FALSE;

-- Backfill from any existing phantom_default column
UPDATE public.mic_library
  SET phantom_required = COALESCE(phantom_default, FALSE)
  WHERE phantom_required IS NULL;

-- Seed ~100 top touring mics + DIs as global rows (workspace_id NULL = global seed).
-- Reference list — CC sources from public touring inventory; not exhaustive, sanity-check before commit:
--   Shure: SM58, SM57, Beta 52A, Beta 56A, Beta 91A, Beta 87A, Beta 98H, SM7B, KSM8/9/137, ULXD2-D, ULXD2-N, MX392, Axient AD2/AD4Q, Nexadyne NX8
--   Sennheiser: e904, e906, e914, e935, e945, e835, e609, MD421, MD441, MD46, MKH416, EW20/EW SR20SP/EW DM6
--   AKG: D112, D5, D7, C414, C451, C535, C518/C519
--   Audio-Technica: AT4050, AT4053, AT4081, AT2020, AE2300, ATM450
--   Beyerdynamic: M88, M201, M160, TG-X 50
--   Neumann: KM184, KMS105, U87, TLM103
--   Heil: PR40, PR30, PR22, RC35/RC22
--   Earthworks: SR20/SR40, SR314
--   DPA: 4099 (drum/string/wind), 4011, 4061
--   sE Electronics: V7, V7 Black, V7 Switch, V3, sE2200, X1
--   Telefunken: M80, M81, M82
--   Royer: R-121, R-122
--   Audix: D6, i5, OM6, SCX1, ADX51
--   Crown: PCC160, PZM30D
--   Countryman: B3, B6, E6, E7, Type 85, JDS
--   Radial DI: J48, JDI, JDI Stereo, JCR, Reamp, ProD2, ProDI, USB-Pro, EXTC, BT-Pro
--   Whirlwind: IMP-2, IMP-Pro, pcDI, MultiDI
--   BSS: AR-133
--   Avalon: U5
INSERT INTO public.mic_library (workspace_id, name, kind, phantom_required)
VALUES
  (NULL, 'Shure SM58',          'dynamic',    FALSE),
  (NULL, 'Shure SM57',          'dynamic',    FALSE),
  (NULL, 'Shure Beta 52A',      'dynamic',    FALSE),
  -- … expand to ~100 entries spanning the brands above
  -- DIs (always include both active and passive variants)
  (NULL, 'Radial J48',          'di_active',  TRUE),
  (NULL, 'Radial JDI',          'di_passive', FALSE),
  (NULL, 'Radial JDI Stereo',   'di_passive', FALSE)
ON CONFLICT (workspace_id, name) DO NOTHING;
```

Confirm the existing unique constraint shape before writing the ON CONFLICT clause — there should be `(workspace_id, name)` uniqueness; if not, add it.

## UI work

**Editor location:** rebuild `src/components/channel-list/ChannelListEditor.tsx` (or wherever the existing live editor lives — see CLAUDE.md). Keep the existing API surface (props in, save callbacks out) so the rider-pack section host doesn't break.

**Visual rebuild:**

- Match design tokens. Same row density as `<SpreadsheetGrid>` rows in Budget — use that as the visual reference.
- Sticky column 1 (channel #) on horizontal scroll.
- Section headers between input rows / output rows / inventory aggregates.
- Add/remove row affordances inline (no separate add modal).
- Empty state for outputs: "No outputs yet — add IEM mixes, drive lines, etc."

**Keyboard navigation — every cell:**

- `Tab` moves to next cell right; wraps to next row's leftmost cell at end of row.
- `Shift+Tab` reverse.
- `Enter` moves down one cell in the same column.
- `Esc` cancels current cell edit (reverts to pre-edit value).
- Inside a select cell: `↑/↓` moves through options, `Enter` selects, type-ahead filters.
- Inside a numeric cell: digits + decimal accepted, other keys rejected.

**Cell types (finite menus become selects, not free text):**

| Column | Type | Source |
|---|---|---|
| Channel # | numeric | sequential auto, editable |
| Name | text | free |
| Position | select | hardcoded enum: USL/USR/USC/DSC/DSL/DSR/OSL/OSR/SL/SR/C |
| Stage Box | select | `stage_boxes` rows for this list |
| Loom (sub-snake) | select | `sub_snakes` rows for this list |
| Cable Length | select | hardcoded: `6'` / `10'` / `15'` / `25'` / `50'` / `100'` / `150'` / `300'` |
| **Mic/DI** (rename column) | select | `mic_library` autocomplete (workspace + global), shows kind badge inline (Mic vs DI) |
| Stand | select | hardcoded: LP CLAW / Short Boom / Tall Boom / Clip / Talk Stand / None |
| Phantom | boolean | auto-fills from selected mic's `phantom_required`; user can override |
| Provider | select | Band / Venue / Hire |
| Notes | text | free |

**Mic/DI rename:** column header changes from "Mic" to "Mic/DI". Same dropdown lists both kinds. When user selects a mic with `phantom_required=true`, the Phantom column auto-fills `true` (visible feedback — Phantom cell flashes / animates).

**Inventory aggregates (computed at render):**

Render five sub-tables below the input + output grids:

1. **Microphones / DIs inventory** — group by `mic_library.name` × `provider`, count. Columns: QTY | ITEM | Provider | Notes (notes free-form per aggregate row, stored as JSONB on the channel_list section's metadata).
2. **Mic stands inventory** — group by `stand` column, count. Columns: QTY | ITEM.
3. **Cables inventory** — group by `cable_length` column, count. Columns: QTY | LENGTH.
4. **Stage boxes** — pulled from `stage_boxes` table for this list. Columns: NAME | CABLE | NOTES.
5. **Snakes / Looms** — pulled from `sub_snakes` table for this list. Columns: LABEL | COLOR | CAPACITY.

The aggregates render-only in the editor. Adam doesn't edit them directly (except free-text notes on the mic inventory rows) — they re-compute as he edits input/output rows.

**Save behaviour:** identical to existing pattern. Auto-save on cell blur with 600ms debounce (use the existing `useAutoSave` primitive from Sprint 11 §4). `<SaveStatus>` pill in the editor toolbar.

## Halt-and-report criteria — §8

Stop and ping Adam if:

- `mic_library` doesn't have a `phantom_default` or equivalent column — clarify before backfill.
- The existing `channel_list_rows` table has columns that conflict with the new output_* names — propose alternatives.
- The 5-aggregate render approach causes layout instability (e.g. computed values cause infinite resave loops) — flag.
- Sub-snake / stage-box editing UX requires changes to the existing `SubSnakeDialog` / `StageBoxDialog` beyond cosmetic — flag, this becomes §8.1.

## §8 reporting

```
Phase 8 done. Commit: <hash>
Migrations added: 098, 099
Files changed: [path:line per file]
Mic library seed count: <N>
Verify: tsc zero, lint X/Y (baseline Z), build green
Keyboard test: rendered editor, tabbed through 5 rows × 11 columns without dropping focus — confirm
Blockers: [empty if clean]
```

---

# §9 — Rider editor rebuild

## Goal

A rider editor that produces Adam's actual document structure: cover page, table of contents, key contacts table, advance summary (with AI autofill), body sections (rich text with headings / bullets / paragraphs). Variable substitution across sections. Per-rider logo override on a per-artist cascade.

## Data model changes (migration 100)

The rider_pack data model already supports most of this via existing field types. The deltas:

```sql
-- Per-artist default logo URL (cascade source for rider cover pages)
ALTER TABLE public.artists
  ADD COLUMN IF NOT EXISTS default_logo_url TEXT;

-- Per-rider cover-page logo override + cover-page settings
ALTER TABLE public.rider_packs
  ADD COLUMN IF NOT EXISTS cover_logo_url TEXT,          -- NULL = falls back to artist.default_logo_url
  ADD COLUMN IF NOT EXISTS cover_disclaimer TEXT,        -- per-rider disclaimer override
  ADD COLUMN IF NOT EXISTS cover_subtitle TEXT;          -- "Global Festivals — Summer '26" style subtitle
```

Add a new section type:

```sql
-- rider_sections.section_type already supports: text, table, contact, asset, time, currency, number, checkbox_list, url
-- Add: advance_summary, rich_text
-- These are not enforced at schema level (section_type is TEXT not enum), but document in the relevant TS types
```

In `src/lib/types/rider-packs.ts` (or wherever the section type union lives), extend the enum:

```ts
type SectionType =
  | 'text'           // legacy plain text — keep for back-compat
  | 'rich_text'      // NEW: Tiptap-backed
  | 'table'
  | 'contact'
  | 'asset'
  | 'time'
  | 'currency'
  | 'number'
  | 'checkbox_list'
  | 'url'
  | 'advance_summary' // NEW: AI-summarisable bullet list
  | 'channel_list'    // existing
```

Existing `text` sections stay rendered as plain text. When a user converts a section to `rich_text`, the existing plain text is migrated to a single paragraph block.

## Rich text editor (Tiptap)

**New dep:** `@tiptap/react`, `@tiptap/starter-kit`, `@tiptap/extension-placeholder`.

**Constrained block set:**

- `paragraph` (default body)
- `heading` (levels 2 + 3 only — h1 is reserved for the rider title; h2 = "Schedule", h3 = sub-section)
- `bulletList` + `listItem`

**No inline formatting** unless explicitly requested later. No bold/italic/code/links in the initial spec — Adam said riders are scanned, so structure (heading + bullet) carries the weight, not inline emphasis.

**Component:** `src/components/rider/RichTextEditor.tsx`. Toolbar with three buttons (H2, H3, Bullet List) + the variable inserter (see below).

**Data shape:** Tiptap's default JSON output stored as JSONB on `rider_sections.fields` (existing column). On render, parse JSONB and emit clean HTML.

## Cover page generation

A rider's cover page is auto-rendered from these fields:

| Field | Source |
|---|---|
| Logo | `rider_packs.cover_logo_url` ?? `artists.default_logo_url` ?? null |
| Artist name | `artists.name` |
| Rider title | `rider_packs.title` |
| Subtitle | `rider_packs.cover_subtitle` |
| Date | `rider_packs.updated_at` formatted as "Rider Updated — 23rd Mar '26" |
| Disclaimer | `rider_packs.cover_disclaimer` ?? artist-level default ?? hardcoded fallback |

Cover page is its own page in the web reader and the PDF. It's not stored as a section — it's computed.

**Editor UI:** a "Cover Page" panel at the top of the rider editor with: logo upload (or "Use artist default" toggle), title field, subtitle field, disclaimer textarea. Save behaviour same as section fields (auto-save on blur).

## Table of contents generation

Auto-built from sections. Renders as page 2 of the rider (after cover) in both web reader and PDF.

Section rendering rule:

- Each section gets one TOC entry: `<section title> — page N`
- Multiple sections may share a page (depends on PDF pagination from §10)
- Numbered pages on the TOC are the section's first-page number in the rendered PDF

**Computed at render time.** Stored nowhere.

## Variable substitution

A variable token is a string like `{artist}` or `{contact.tm.phone}` embedded in any rich text or text field.

**Token registry (resolved server-side at render):**

| Token | Resolves to |
|---|---|
| `{artist}` | `artists.name` |
| `{tour}` | `tours.name` (for tour-scope packs) |
| `{rider_type}` | `rider_packs.title` |
| `{today}` | server-rendered current date (when the doc is being viewed/exported) |
| `{party_size}` | count of confirmed `tour_personnel` for the tour |
| `{contact.tm.name}` | name of the personnel row tagged `role='TM'` |
| `{contact.tm.phone}` | phone of same |
| `{contact.tm.email}` | email of same |
| `{contact.pm.*}`, `{contact.foh.*}`, `{contact.mons.*}`, `{contact.management.*}` | same shape per role |

**Override behaviour:** the token is a *smart default* — when the user types `{contact.tm.name}` in a section, the editor resolves it inline (shows "Adam Rowley") but stores the token. To break the binding, the user types over the resolved value — that converts the field to a static literal at save time. Subsequent edits to the personnel row don't propagate to the overridden field.

**Insertion UI:** typing `{` in the rich text editor (or any text field) opens an autocomplete menu listing available variables for the current rider's scope. Click or arrow-key selects.

## Advance summary section + AI autofill

**Section type:** `advance_summary`.

**Default structure on creation:** 9 pre-filled subject lines:

```
Schedule — <body>
Transport — <body>
Dressing Rooms — <body>
Merch — <body>
Towels — <body>
Labour — <body>
Security — <body>
Power — <body>
Audio — <body>
```

**Editor UI:** each line is a row with a subject (text input) + body (single-line rich text — bold subject is auto-rendered). Add/remove buttons inline. Drag-reorder via dnd-kit (consistent with rest of app).

**AI autofill button:** "Generate from rider content" button at the top of the section. On click:

1. Client POSTs to `/api/rider-packs/[id]/advance-summary/generate`.
2. Server pulls all non-summary sections of this rider, concatenates the text.
3. Server calls Claude API with the prompt template below.
4. Returns N one-line summaries, one per subject the rider currently has in its advance_summary section. If the response shape doesn't match, retry once with `temperature=0` else error.
5. Client populates each row's body field with the returned summary. User edits as needed before saving.

**Claude API endpoint (server-side):**

- Model: `claude-haiku-4-5-20251001` (fast + cheap for summarisation; cost should be <$0.01 per call).
- Max output tokens: 500.
- Prompt template:

```
You are summarising a music tour rider for a busy promoter who only has 30 seconds to scan it.

The rider's body content is below. For each subject listed at the end, write ONE clear, scannable line that captures the most important fact about that subject from the body content. Keep each line under 90 characters.

If a subject isn't covered in the body content, return "Not specified in rider" for that subject.

---

RIDER BODY:
{rider_body_text}

---

SUBJECTS:
{subject_list_one_per_line}

---

RESPONSE FORMAT:
Return one line per subject, in the same order, prefixed with the subject and a hyphen. Example:
Schedule — Access 1p, Load 2p, Soundcheck 4p, Doors 7p, Curfew 12a
Transport — 3 SUVs or 2 vans; parking must be confirmed 1hr pre/post

Now produce the response.
```

Parse response by splitting on newlines, then on " — " (em-dash). Map back to the rider's subject rows by position. If the model returns the wrong number of lines, error and surface to the user.

**Env var:** `ANTHROPIC_API_KEY` must be set in Vercel. Adam already has Anthropic API access via the same account that powers Cowork. He'll add the env var.

**Rate limiting:** trivial implementation OK — one call per rider per minute server-side check via in-memory map (single Vercel function instance). Don't over-engineer.

## Halt-and-report criteria — §9

Stop and ping Adam if:

- Tiptap JSON shape forces breaking changes to existing `rider_sections.fields` consumers (legacy `text` rendering, exports, etc.).
- Cover page logo upload requires a storage bucket that doesn't exist (`rider-assets` should be the canonical bucket — verify).
- Variable substitution breaks an existing rider section's stored data (back-compat for the 4 existing artist packs is mandatory).
- The Claude API endpoint cannot be implemented without leaking the API key to the client.
- AI integration tempts a refactor of error handling beyond §9's scope.

## §9 reporting

```
Phase 9 done. Commit: <hash>
Migrations added: 100
New deps: @tiptap/react, @tiptap/starter-kit, @tiptap/extension-placeholder, @anthropic-ai/sdk
Files changed: [path:line per file]
Variable registry: <list resolved tokens>
AI test: generated summary for test rider — paste the output Claude returned
Verify: tsc zero, lint X/Y (baseline Z), build green
Blockers: [empty if clean]
```

---

# §10 — PDF export

## Goal

Server-side PDF rendering for individual rider packs, individual channel lists, and bundled advance packets. Fidelity matches the web reader 1:1.

## Approach

Puppeteer headless Chromium renders the web reader URL to PDF.

**New deps:** `puppeteer-core` (small) + `@sparticuz/chromium` (the serverless-friendly Chromium binary).

## Endpoints

- `GET /api/rider-packs/[id]/pdf` — auth-gated (workspace member). Returns single rider as PDF.
- `GET /api/rider-packs/[id]/pdf?token=<token>` — token-gated (for recipient downloads). Token must match a `rider_web_links.token` for this pack.
- `GET /api/advance-packets/[tourId]/[routingId]/pdf` — auth-gated bundle. Returns concatenated PDF.
- `GET /api/advance-packets/[tourId]/[routingId]/pdf?token=<token>` — token-gated bundle download (token from advance packet share link in §11).

Each endpoint:

1. Resolves the auth context (workspace or token).
2. Launches Puppeteer with `@sparticuz/chromium`.
3. Navigates to a print-styled internal URL (`/r/[token]?print=1` for single, or a new `/a/[token]?print=1` for bundle).
4. Calls `page.pdf()` with format A4, margins 20mm, printBackground true.
5. Streams the buffer back.

## Print-styled web reader

Add `?print=1` mode to the existing `/r/[token]` route (rider) and the new `/a/[token]` route (packet, §11). When `print=1`:

- Hide all navigation chrome.
- Reset margins/padding to print defaults.
- Force page breaks before each section (`page-break-before: always`).
- Render the cover page as standalone page 1.
- Render the TOC as page 2 (or 2–3 if it overflows).
- Body sections start page 3+.
- Page footer (Adam's choice): "Page N of M — {artist} {rider_type}" — auto-rendered.

CSS lives in a print-only stylesheet co-located with the page component.

## Bundled packet PDF

For the bundle: render each document (tech rider, channel list, etc.) individually, concatenate with `pdf-lib` (verify if already a dep — if yes, use; if no, add it as a §10 exception).

Order in the bundle:

1. Tech rider (kind='rider', whichever is tagged primary)
2. Other riders (kind='rider', secondary order = updated_at desc)
3. Channel list(s) (kind='channel_list')
4. Hire list (rental_jobs from Sprint 12) — render via existing Sprint 12 §5 PDF if available; else skip with a flag
5. Asset documents (rider_assets with kind='document') — appended as-is if they're already PDFs, skipped if they're images

## Performance

- Cold start cost: ~3–5s for `@sparticuz/chromium` to spin up. Warm: ~1–2s per render.
- Vercel function timeout limit: 60s on Pro plan. Should be plenty for single rider; bundle PDF for a 5-doc packet should fit too.
- If a single render exceeds 30s in practice, flag — we'll need a queue.

## Halt-and-report criteria — §10

Stop and ping Adam if:

- `@sparticuz/chromium` doesn't deploy cleanly on Vercel (size limit, build error).
- The print-styled web reader requires structural changes to the rider editor beyond CSS.
- Bundle PDF concatenation exceeds Vercel's 50MB function bundle size limit.
- A single rider render exceeds 10s on warm starts (suggests SSR issues that need diagnosing).

## §10 reporting

```
Phase 10 done. Commit: <hash>
New deps: puppeteer-core, @sparticuz/chromium [, pdf-lib if added]
Files changed: [path:line per file]
Render test: rendered single rider — N pages, X seconds warm
Render test: rendered bundle packet — Y pages total, Z seconds warm
Verify: tsc zero, lint X/Y, build green
Blockers: [empty if clean]
```

---

# §11 — Advance packet view

## Goal

A single page at `/advance/[tourId]/[routingId]` that lists every document in the advance packet, generates a shareable public URL, and offers a bundled PDF download.

## Page structure

```
ADVANCE PACKET — {tour} — {routing.name or "All shows"}     [Share ▾] [Download bundled PDF]

DOCUMENTS
  📄 Technical Rider (tech rider)                  [Edit] [View web] [PDF]
  📄 Backstage Rider                               [Edit] [View web] [PDF]
  📊 Channel List — Global Festivals '26           [Edit] [View web] [PDF]
  📦 Hire List (24 items)                          [Edit] [View web] [PDF]

ASSETS
  🖼  Good Neighbours wordmark logo
  📎 Fire Cert (PDF)

PUBLIC SHARE
  https://lowpass.co/a/{token}                     [Copy] [Regenerate]
  Optional password: ●●●●●●●●                       [Set] [Remove]
  Last viewed: 2026-05-10 by recipient
```

## Data wiring

- Tech/backstage riders: `rider_packs WHERE tour_id=$tourId AND kind='rider'`
- Channel list: `rider_packs WHERE tour_id=$tourId AND kind='channel_list'`
- Hire list: `rental_jobs WHERE tour_id=$tourId` (or routing-scoped if routing_id present)
- Assets: `rider_assets` linked to the above packs, plus any file uploads at the tour/routing scope
- Share link: new `advance_packet_links` table — migration 101

```sql
CREATE TABLE IF NOT EXISTS public.advance_packet_links (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  tour_id UUID NOT NULL REFERENCES public.tours(id) ON DELETE CASCADE,
  routing_id UUID REFERENCES public.tour_routing(id) ON DELETE SET NULL,
  token TEXT NOT NULL UNIQUE,
  password_hash TEXT,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_viewed_at TIMESTAMPTZ,
  last_viewer_ip TEXT
);

CREATE INDEX idx_advance_packet_links_token ON public.advance_packet_links(token);
CREATE INDEX idx_advance_packet_links_tour ON public.advance_packet_links(tour_id, routing_id);

ALTER TABLE public.advance_packet_links ENABLE ROW LEVEL SECURITY;

-- Canonical workspace RLS
CREATE POLICY advance_packet_links_select ON public.advance_packet_links
  FOR SELECT USING (workspace_id = public.get_my_workspace_id());
CREATE POLICY advance_packet_links_insert ON public.advance_packet_links
  FOR INSERT WITH CHECK (workspace_id = public.get_my_workspace_id());
CREATE POLICY advance_packet_links_update ON public.advance_packet_links
  FOR UPDATE USING (workspace_id = public.get_my_workspace_id())
    WITH CHECK (workspace_id = public.get_my_workspace_id());
CREATE POLICY advance_packet_links_delete ON public.advance_packet_links
  FOR DELETE USING (workspace_id = public.get_my_workspace_id() AND public.is_workspace_admin());
```

## Public reader at `/a/[token]`

A new public route that mirrors `/r/[token]` for riders but renders the full packet:

- Auth: token resolves a `advance_packet_links` row. Password gate if `password_hash` set.
- Layout: each document rendered in sequence with section dividers. Cover page → TOC → tech rider → channel list → hire list (rendered as a styled table) → assets (image previews / file download links).
- Top of page: download buttons for each individual doc PLUS a "Download whole packet as PDF" button.
- Same `?print=1` mode supported (used by §10 for PDF rendering).

## Halt-and-report criteria — §11

Stop and ping Adam if:

- The `tour_routing` table doesn't have the expected shape for routing-scoped packets — flag the schema mismatch.
- Public packet view requires restructuring the existing rider public-reader code beyond cosmetic changes.
- Bundled PDF download fails for any packet larger than ~10MB (suggests a streaming issue).

## §11 reporting

```
Phase 11 done. Commit: <hash>
Migrations added: 101
Files changed: [path:line per file]
Test packet: tour <name>, routing <name>, N docs
Public URL test: opened in incognito — render OK, password gate OK if set
Bundled PDF test: <pages>, <MB>, <seconds warm>
Verify: tsc zero, lint X/Y, build green
Blockers: [empty if clean]
```

---

## Cross-phase notes

- **Smoke tests:** Adam will smoke each phase incrementally rather than at end-of-sprint. Don't bundle smoke into the spec — leave it to Adam.
- **Existing data:** the 4 existing artist-scope rider_packs must continue to render via the new editor without manual data migration. Verify by opening each in the rebuilt editor as your first acceptance check on §9.
- **Naming:** Adam refers to "advance packet" as the umbrella, not "rider pack". The UI in §11 uses "Advance Packet" as the page title and section header. Internal table names stay as-is (rider_packs etc.) — no rename migration.
- **Order of operations:** if §10 (PDF) is harder than estimated and slips, §11 can still ship without the bundled-PDF download button — just hide that button until §10 is in. Per-doc web links + share link work without §10.

## Final commit messages

```
feat(channel-list,mic-library): Sprint 12 §8 — editor rebuild + keyboard nav + mic seed
feat(rider): Sprint 12 §9 — rich-text editor + variables + cover + TOC + AI advance summary
feat(pdf): Sprint 12 §10 — Puppeteer export for riders, channel lists, packets
feat(advance): Sprint 12 §11 — advance packet view + public share + bundled PDF
```

If any phase splits per the >400 LOC escape hatch, suffix with `a/b/c` like Sprint 11.
