# Rider Pack — Master Roadmap

This is the action plan for everything we've spec'd in conversation. It's organised as a sequence of Cursor prompts (one prompt = one focused commit-set). Each row in the roadmap will be expanded into its own `CURSOR_PROMPT_R{n}_*.md` file when it's time to ship it.

---

## 1. Decisions captured

The 10 alignment questions, your answers, and what they mean for the build.

| # | Question | Your answer | Implication |
|---|----------|-------------|-------------|
| 1 | Drag renumber | Channel #s are fixed 1-2-3-4-5 | The `#` column is a row-index label. Drag reorders the *content* into fixed slots. Channel # is never editable. |
| 2 | Routing hierarchy | Channel → Sub-snake → Stage box | Sub-snake is the primary routing target. The sub-snake itself maps to a stage box. Channels reference a sub-snake. |
| 3 | Output list shape | Split: Stage outs vs FOH outs | Two separate sub-sections / tables, each with its own columns. |
| 4 | Provider per channel | Refers to mic/DI only, not stand/cable | Single Provider field per channel, with explicit UI note "applies to mic/DI only". |
| 5 | Phantom power | Auto-suggest from mic, override-able | Mic library has a `default_phantom` flag. Picking the mic pre-fills +48V. User can flip it. |
| 6 | Sub-snake colour | Auto from palette, manual override | New sub-snake gets next palette colour. User can recolour. Shown as 4px left-edge stripe. |
| 7 | Templates | Snapshot by default, opt-in "Stay linked" | Apply = copy. Per-pack toggle "Stay linked to template". Linked packs receive future template changes. |
| 8 | Share tracking | Per-open log + section view duration (if not expensive) | Log timestamp + city per open. Track which section was viewed and for how long. Lightweight viewer-side beacon. |
| 9 | Attachments | Free-form, with suggestions | Any file, any label. UI shows a row of suggested attachment types (Stage Plot, Fire Cert, Insurance, Tour Schedule) that pre-fill the label on click. |
| 10 | Share visibility | Whole pack always visible | No per-section visibility toggles. Simpler model. |

---

## 2. What's already done / in flight

| Prompt | Status | Notes |
|--------|--------|-------|
| R7 — Pack token swap | In progress (Cursor mid-execution) | Token mappings confirmed: `text-neutral-400` → `text-lp-text-tertiary`, `border-neutral-100` → `border-lp-border-light`, `text-red-600` → `text-lp-error`, file inputs → `file:bg-lp-bg-secondary` / `hover:file:bg-lp-surface-hover`. Let Cursor finish. |
| R8 — Pack save fix + visual rebuild | Drafted but **needs revision** | Original R8 spec is good on the save freeze fix, but the visual spec needs to absorb this round's feedback (slim 3-card strip, Share=primary orange, Type column dropped, attachments suggestion strip). I'll rewrite it as R8 v2 before you run it. |
| R9 — Bulk bug export | Drafted, ready to ship | Independent of pack work. Can ship any time. |

---

## 3. The roadmap

Each row below is a self-contained Cursor prompt I'll expand into a full `.md` file when you're ready for it. Order matters — earlier prompts establish data structures that later prompts depend on.

### R8 v2 — Pack editor: save freeze fix + visual rebuild

**Goal:** Make the editor usable (no keystroke freezes) and visually match Bug Reports / Commissions baselines.

**Scope:**
- Remove `await refresh()` from per-field save paths in `PackEditor.tsx`. Keep refresh only on structural actions (add/delete/reorder section).
- Add `useDebouncedSave` hook (no new deps; plain `setTimeout` + `useRef`). 400ms debounce on field changes.
- Local draft state in field editors so server round-trips don't overwrite typing.
- Top bar: two rows. Row 1 = title + scope pill. Row 2 = action buttons right-aligned.
- **Share = primary (orange `var(--lp-orange)`)**, Export = secondary outline button. Reasoning: keep ecosystem in-app.
- Stat strip slimmed from 5 cards to 3: **Last edit · Sections · Share links** (with view count). Drop Fields and Doc cards.
- Field rows in Commissions-style table: `rounded-xl border border-lp-border bg-lp-surface overflow-hidden`. Two-column layout (Label / Value). Type column dropped from at-rest view; type only shown in the "Add field" dropdown using human language ("Short text", "Long text", "Yes/No", "Number", "Date", "Choice").
- Fix latent CSS bug from R7: pill backgrounds using `'var(--lp-orange)' + '1a'` produce invalid CSS. Replace with hex (`#FF45001a`).
- NewSectionDialog: full-screen backdrop blur (`backdrop-blur-md bg-black/40`).

**Acceptance:** typing in any field never freezes the UI. Section reorder still triggers a refresh and re-renders correctly. Looks visually consistent with Bug Reports / Commissions.

**Touches:** `src/components/rider-pack/PackEditor.tsx`, `src/components/rider-pack/FieldEditors.tsx`, new `src/hooks/useDebouncedSave.ts`, new `src/components/rider-pack/PackStatCards.tsx`, `src/components/rider-pack/NewSectionDialog.tsx`.

---

### R9 — Bulk bug export

**Status:** drafted, ready. Independent of pack work. Ship whenever.

---

### R10 — Channel list section type (inputs)

**Goal:** Add a structurally distinct `channel_list` section type, modelled on your real spreadsheet.

**Scope:**
- Migration: extend `section_type` enum with `'channel_list'`. New tables:
  - `sub_snakes` — `id, pack_id, section_id, label, colour, created_at`.
  - `channel_list_rows` — `id, pack_id, section_id, row_index (NOT NULL), channel_name, sub_snake_id (nullable), stage_box, position, mic, mic_substitute, di, stand, phantom_power (boolean, nullable), provider ENUM('band','venue','hire'), notes`.
  - `mic_library` — small reference table: `id, name, type ('dynamic'|'condenser'|'ribbon'|'di_active'|'di_passive'), default_phantom (boolean)`. Seeded from your channel list.
- Renderer: dedicated `ChannelListEditor` component (not generic field renderer).
- **Drag-to-reorder:** `dnd-kit` (already in repo? check first; if not, plain HTML5 drag is fine for v1). Drag swaps `row_index` values. Channel `#` column shows `row_index` and is never editable.
- Sub-snake column: pill showing `{label}` with 4px coloured left stripe on the row. Pill click → manage sub-snakes dialog (add / rename / recolour / delete with reassignment).
- Mic column: combobox over `mic_library`. On select, auto-fill `phantom_power` from `default_phantom`. User can override.
- Provider: dropdown with note text "applies to mic/DI only".
- Position: free text input with autocomplete suggestions (USR/USL/USC/DSC/DSL/DSR/OSR/OSL/DLS/FOH).
- Add Row / Delete Row controls. Add Row appends with next `row_index`.

**Acceptance:** can add a channel_list section, add/edit/reorder rows, manage sub-snakes, see colour stripes, get phantom auto-suggest. Saves debounced. Loads correctly on refresh.

**Touches:** new migration `xxx_channel_list.sql`, new `src/components/rider-pack/ChannelListEditor.tsx`, new `src/components/rider-pack/SubSnakeDialog.tsx`, new `src/lib/rider-packs/channel-list.ts` (CRUD), updates to `src/components/rider-pack/PackEditor.tsx` to dispatch by `section_type`, updates to `resolvePack` and the export builders.

---

### R11 — Output lists (stage outs + FOH outs)

**Goal:** Two split output tables.

**Scope:**
- Migration: add `'stage_outputs'` and `'foh_outputs'` to section_type enum. New table `output_rows` with `id, pack_id, section_id, output_kind ENUM('stage','foh'), row_index, name, position_or_target, notes`.
- Stage outs columns: # / Name (e.g. "Oli IEM") / Position (e.g. "USC") / Notes.
- FOH outs columns: # / Name (e.g. "PA L") / Feed (e.g. "House L") / Notes.
- Same drag-to-reorder behaviour as R10. Same `#` semantics (fixed row index).
- "Add output" appends with next index.

**Acceptance:** can add either output section type, edit rows, reorder. Visually consistent with channel list editor.

**Touches:** migration, new `src/components/rider-pack/OutputListEditor.tsx`, dispatch update in `PackEditor.tsx`.

---

### R12 — Derived inventory (audio pull list + cable + stand counts)

**Goal:** Auto-aggregated read-only summaries that update live as channels/outputs change.

**Scope:**
- Pure client-side derivation function `deriveInventory(channels, outputs)` returning:
  - `mics: { name, qty }[]`
  - `di: { name, qty }[]`
  - `stands: { type, qty }[]` (counted from mic_stand inferred from mic position rules — needs a small lookup; for v1, just count distinct stand strings)
  - `cables: { type, length, qty }[]` (for v1: derived only from explicitly entered cable strings; smart cable inference is R12.5)
- Side panel next to channel list editor showing these aggregates. Collapsible.
- Same panel exposed read-only in viewer/share view.

**Acceptance:** adding/removing/changing a channel updates the inventory panel without saving. Counts match expected.

**Touches:** new `src/lib/rider-packs/inventory.ts`, new `src/components/rider-pack/InventoryPanel.tsx`, integration in `ChannelListEditor.tsx`.

---

### R13 — Backline hire list section

**Goal:** Hire-list editor that can be populated from channels.

**Scope:**
- Migration: add `'hire_list'` to section_type enum. New table `hire_list_rows` with `id, pack_id, section_id, row_index, channel_ref_id (nullable FK to channel_list_rows), channel_name, choice_1, choice_2, choice_3, preferred_mic, musician_position, notes`.
- Editor with same drag-and-row-index semantics as R10/R11.
- "Pull from channels" button: imports rows from a chosen channel_list section, pre-filling `channel_name`, `musician_position`, `preferred_mic`. Pulled rows keep a soft FK so name changes in the channel list propagate (with a "synced" indicator).
- Free rows can be added too (for gear that isn't channel-aligned: kick pedal, drum mat, etc.).

**Acceptance:** can pull from channel list, edit choices, add free rows. Channel renames propagate to synced rows.

**Touches:** migration, new `src/components/rider-pack/HireListEditor.tsx`, new `src/lib/rider-packs/hire-list.ts`, dispatch update.

---

### R14 — Templates system

**Goal:** Save a pack as a reusable template; new packs can apply a template (snapshot or live-linked).

**Scope:**
- Migration: new tables.
  - `pack_templates` — `id, workspace_id, name, description, created_by, created_at, updated_at`.
  - `pack_template_sections` — `id, template_id, section_type, title, position, config (jsonb)`.
  - `rider_packs.template_id` (nullable FK), `rider_packs.template_linked` (boolean default false).
- "Save as template" action on packs.
- "From template" option in new-pack flow. Default = snapshot. Per-pack toggle "Stay linked to this template".
- When a template is updated, linked packs get a banner "Template was updated. Apply changes?" with diff preview before applying. (Auto-apply is too risky.)

**Acceptance:** can save/apply templates, can stay linked, gets the banner when template changes.

**Touches:** migration, `src/app/templates/*` (new routes), updates to new-pack flow, `src/lib/rider-packs/templates.ts`.

---

### R15 — Share link tracking

**Goal:** Per-open log + per-section view duration on shared pack views.

**Scope:**
- Migration: extend `pack_share_links` (or create) with: `id, pack_id, slug, created_by, created_at, expires_at`. New table `pack_share_views` with `id, share_link_id, opened_at, ip_city, country, user_agent_summary, section_key (nullable), view_duration_seconds (nullable)`.
- IP→city via a lightweight free service (e.g. ipapi.co free tier) called server-side once per open; never store raw IP.
- Viewer page: lightweight `IntersectionObserver` per section + `beforeunload` beacon to report `{share_link_id, section_key, view_duration_seconds}` to a small endpoint.
- Pack editor "Share" panel: list of links with open count, last open, "View activity" expand → per-open log + per-section bars.

**Acceptance:** opening a share link in incognito records an entry. Scrolling through sections records reasonable durations. No raw IPs stored.

**Touches:** migration, `src/app/api/share-views/route.ts` (POST beacon), updates to viewer route, new `src/components/rider-pack/ShareActivity.tsx`.

---

### R16 — Attachments (free-form + suggestions)

**Goal:** Upload free-form supporting documents per pack.

**Scope:**
- Migration: new table `pack_attachments` — `id, pack_id, label, file_path (Supabase storage key), mime_type, size_bytes, uploaded_by, uploaded_at`. New Supabase storage bucket `pack-attachments` with RLS keyed by pack ownership.
- Attachments section in editor with:
  - Suggestion strip at top: "Common attachments: Stage Plot · Fire Cert · Insurance · Tour Schedule". Click → file picker pre-labelled.
  - Manual "Add attachment" button for free-form upload.
  - Per-file: rename label, replace, delete.
- Visible in viewer / share view.

**Acceptance:** can upload, label, replace, delete. Suggestion clicks pre-fill label. RLS prevents cross-tenant access.

**Touches:** migration, storage bucket setup, `src/components/rider-pack/AttachmentsEditor.tsx`, viewer integration.

---

### R17 (future) — Stage plot builder

**Goal:** Visual stage plot editor — drag musicians/gear onto a canvas, save as a structured object that exports to PNG/SVG.

**Status:** explicitly deferred. Out of scope for the rider pack rebuild round. Will get its own roadmap when we're ready.

---

## 4. Order of operations + dependencies

```
R7  ─────► R8 v2  ─────► R10 (channel list)  ─────► R11 (outputs)
                                │                        │
                                │                        ▼
                                │                    R12 (inventory — depends on R10 + R11 data shapes)
                                │                        │
                                │                        ▼
                                ▼                    R13 (hire list — depends on R10)
                            R9 (bulk bug export — independent, ship anytime)

After R13, parallelise:
    R14 (templates)
    R15 (share tracking)
    R16 (attachments)

R17 stage plot builder — future round.
```

**Hard dependencies:** R10 → R11 → R12, R10 → R13.
**Soft dependencies:** R8 v2 should ship before R10 so the visual baseline is set when building the channel list.
**Independent:** R9 (bulk bug export), R14, R15, R16 — can be reordered or parallelised.

---

## 5. What I'll write next

When you're ready, tell me which to expand to a full `CURSOR_PROMPT_R{n}_*.md`. My recommended next move:

1. **R8 v2 first** — rewrite the existing R8 with the new visual spec (slim stat strip, Share=primary, dropped Type column, attachments suggestion strip preview). Ship it. Pack editor becomes usable + on-brand.
2. **R10 next** — channel list is the biggest single piece of work and unlocks R11/R12/R13. Spec it carefully.
3. **R9 ship in parallel** whenever you have a Cursor session free — it's independent.

Tell me "write R8 v2" or "write R10" (or both, or any other) and I'll produce the prompt files.
