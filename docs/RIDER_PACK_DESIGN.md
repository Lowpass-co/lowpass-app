# Rider / Pack Builder — Design

Status: draft v1, 2026-04-21. Review before turning into a Cursor build prompt.

---

## 1. Purpose

Eliminate the "copy old rider → update → send the wrong version" failure mode. Every rider/pack Lowpass exports is assembled from structured data, not a duplicated Word doc. One source of truth per artist, overridable per tour, overridable per show.

Target: replace the current workflow of maintaining packs manually in Google Drive (e.g. the two reference folders you shared). Output parity first, workflow improvement second.

---

## 2. Scope

**In scope (v1):**
- Rider / advance pack builder (artist → tour → show inheritance).
- **Primary: in-app viewing inside Lowpass** — workspace members open a pack and see a polished read-only render.
- **Secondary: public web link** for venues (optional password, rotatable URL) — same render, served behind a token.
- **Tertiary: Export to Google Doc** button — one-click, in-place updates on a bound doc, for when Drive is needed.
- Asset library (logos, stage plots, input lists as files).
- Contact pulls from tour personnel + wider contacts.
- Edit history, 90 days rolling.

**Out of scope (v1):**
- Daysheets (handled by external Daysheets app).
- Flight Grid / Rooming List (stay as budget-only for now).
- Per-email authenticated access to web link (public + password is the max).
- Band/crew visibility layer (no viewer-only mode, no role filtering — TM + team + venue only for now).
- Nav/IA restructure — that's a separate top-down pass, flagged but not solved here.

---

## 3. Mental model — the "Advance" umbrella

"Advance" is a workflow concept, not a nav item. It contains:

1. **Rider/Pack** (this feature) — artist → tour → show, what you send to the venue.
2. **Per-show advance Q&A** (existing `advance_form_configs`) — what the venue fills in back to you.
3. **Ops docs** (Daysheets / Rooming / Flights) — future, currently external.

The Rider/Pack is the artist/TM-authored side. The Q&A is the venue-authored side. Exports combine them where useful.

---

## 4. Three-layer inheritance

Every field in a pack resolves through:

1. **Artist baseline** — the canonical "what we always do". Lives on the artist record.
2. **Tour override** — set at tour start. Differs from artist baseline because of this specific tour (different production, different crew size, specific sponsor requirements).
3. **Show override** — rare escape hatch. One show is different (festival slot, private event, reduced production). Section-level override: each section on a show is either *inherited from tour* or *overridden for this show*. Not field-level (too fiddly), not full-fork (wastes the tour baseline).

Resolution: `show override ?? tour override ?? artist baseline`.

**Baseline sync behaviour:** when artist baseline changes, tours are **not** auto-updated. When opening a tour, Lowpass asks "artist baseline changed since this tour was created — apply changes?" Per-tour opt-in.

**Show override persistence when tour baseline changes:** if a show has a section-level override and the tour baseline for that section later changes, Lowpass prompts on next open: *"This section was manually overridden for [show name]. Tour default just changed — update this show too, or keep your override?"* Per-section choice. Defaults to "keep override" if dismissed.

**Who can edit the artist baseline:** admin roles only — TM, PM, TM Assistants. Non-admin workspace members can view the artist baseline and edit tour/show layers but not the baseline itself. (Hooks into the existing workspace role system.)

---

## 5. Data model

### 5.1 Entities

- `rider_packs` — one row per (artist | tour | show) scope. Stores section ordering + section-level override status.
- `rider_sections` — one row per section within a pack. JSONB content. Flexible shape.
- `rider_assets` — files (logos, stage plots, input list PDFs, photos). Scoped artist | tour | show.
- `rider_pack_exports` — snapshot table. One row per Google Doc export or web link generation. Preserves what was sent.
- `rider_pack_history` — 90-day rolling audit log. Field changes, section add/remove, asset swaps.
- `rider_web_links` — public web link state (URL token, password hash, rotation history).

Ties into existing:
- `tours` (for tour scope)
- `routing` (for show scope — a show = a routing row)
- `contacts` + `tour_personnel` (for contact picker resolution)

### 5.2 Section schema

Each section is a JSONB document with this shape:

```
{
  section_type: 'cover' | 'contacts' | 'technical' | 'hospitality' | ... | 'custom',
  title: string,              // user-editable display title
  order: number,
  inherited_from: 'artist' | 'tour' | null,  // null = overridden here
  fields: Field[]
}
```

### 5.3 Field primitives

Eight types, all shipping v1 (confirmed: "any info in my advance pack needs a space").

1. **Rich text block** — prose, bold/italic/lists/links. Policy text, descriptions, notes.
2. **Structured table** — user-defined columns. Backline (item / qty / notes), catering (meal / time / count), etc.
3. **Contact picker** — pulls tour personnel first, then wider contacts, then lets you add an external ad-hoc contact (flagged as "not in tour"). User picks which contact fields render (name / role / phone / email).
4. **Asset reference** — points at a `rider_assets` row. Renders as embedded image (stage plot, logo) or link (input list sheet URL).
5. **Time field** — HH:MM, timezone-aware. Load-in, soundcheck, doors, set times.
6. **Currency / number** — guarantees, merch rates, crew headcount. Currency formatted per tour.
7. **Checkbox list** — user-defined items, yes/no per item. For standardised asks (coffee / water / fresh fruit).
8. **External URL** — link out. Input list Google Sheet lives here, not uploaded.

### 5.4 Default sections (AdvanceWithMe-inspired 14)

New pack seeds with:

1. Cover Page
2. Key Contacts
3. Venue Info
4. Production Schedule
5. Technical — Audio
6. Technical — Lighting
7. Technical — Video
8. Backline & Stage
9. Hospitality
10. Catering & Dressing Rooms
11. Security & Access
12. Guest List & Tickets
13. Merch
14. Settlement & Accounting

User can add/remove/rename/reorder. Deleted defaults don't come back; library of re-addable section templates available.

---

## 6. Assets

### 6.1 Scoping

Default scope at upload = **tour**. Toggle on the asset promotes to **artist-wide** (applies to all tours for this artist). Show-scoped uploads happen by uploading from inside a show's override view.

### 6.2 Resolution

Same as field resolution: `show asset ?? tour asset ?? artist asset`. Named references (e.g. "stage plot") pick the most specific one available.

### 6.3 Types

- Images (logos, stage plots, photos) — rendered inline.
- Files (input list PDFs, spec sheets) — linked in exports.
- External links (Google Sheet for input list) — handled as URL field, no upload.

---

## 7. Contacts

Contact picker in a rider section resolves in order:

1. **Tour personnel** — this tour's named roles (TM, FOH, LD, monitor eng, etc.). Shown first, labelled "On tour".
2. **Wider contacts** — your full contact book. Shown next, labelled by source (venue / rep / other).
3. **Ad-hoc external** — inline "add contact not in system" option. Creates a lightweight contact flagged `not_in_tour`, optionally promotable to a full contact later.

User picks which fields render per line: name / role / phone / email / company / notes — configurable per contact in the pack.

---

## 8. Edit history

- **Granularity:** field-level changes + asset swaps + section add/remove/rename.
- **Retention:** 90 days rolling.
- **What's tracked:** who, when, what changed, old → new value.
- **UI:** per-pack history panel. Filter by section.

Implementation: `rider_pack_history` table, cleanup job drops rows > 90 days.

---

## 9. Rendering & export

### 9.0 Primary surface — Lowpass in-app view

Lowpass itself is the primary way to view a pack. Workspace members open the pack inside the app and see a polished, read-only render (same data, no edit chrome). This is the canonical view — not just the editor preview.

Implementation note: the editor and the read-only view share the same rendering components. The read-only view just hides edit affordances and swaps in clean typography.

### 9.1 Public web link (venue-facing)

Venues don't have Lowpass accounts. The web link is the public version of the same in-app view.

- Click "Generate web link" → Lowpass creates a tokenised URL: `lowpass.app/rider/<token>`.
- **Password is per-URL** — each generated URL carries its own password hash. Rotating the URL rotates the password. You pick a new password when rotating (or keep the old one; default is regenerate).
- URL is rotatable — "rotate URL" invalidates the old token immediately, generates new one.
- No per-email auth. Anyone with URL + password gets in.
- Render: the same read-only view as §9.0, just served behind the public token. Mobile-friendly.
- `rider_web_links` stores token history so you can see who you sent which version to (loosely — can't prove who opened it).

This means there's one rendering template for three surfaces (editor, in-app view, public web link) — single source of truth for how a pack looks.

### 9.2 Secondary — Export to Google Doc

For the times you need the pack to live in Drive (email attachments, external contract packs, workflows that aren't moving to Lowpass yet), there's a one-click button.

- "Export to Google Doc" on the pack. One click, not a modal flow.
- **In-place updates.** Each pack has a bound Google Doc. Subsequent exports overwrite the same doc (full body replace). Drive keeps its own version history automatically. Lowpass's `rider_pack_exports` table logs each overwrite (timestamp, user, snapshot of content at time of export).
- On first export, Lowpass creates the doc, stores its ID on the pack, and returns the Drive URL.
- Grouping at export time: single-doc default. Bundle layouts (tech bundle / hospitality bundle / folder-mirroring) available via a "more options" affordance but not the primary path. Each bundle layout binds to its own Google Doc (so "Full pack" and "Tech bundle" coexist without clobbering each other).

Rationale: keeps Lowpass as the single source of truth, keeps Google out of the critical path, but doesn't strand you when external workflows need a Doc.

---

## 10. UX flow — key interactions

### 10.1 Creating a pack for a new tour

1. Open tour → Advance tab → "Open rider pack".
2. If artist baseline changed since tour creation: prompt "Artist baseline updated. Apply changes? [Review diff / Apply all / Keep tour as-is]".
3. Pack opens at tour scope. All sections show "Inherited from artist" badges until edited.
4. Edit any section → badge flips to "Tour override".

### 10.2 Show-level override (rare)

1. On routing day, "Customise rider for this show" button.
2. Opens pack in show scope.
3. Each section has "Inherit from tour ↔ Override" toggle.
4. Toggling to override forks just that section.
5. Saves as show override. Tour and artist untouched.

### 10.3 Export

1. "Export" button → modal with:
   - Layout picker (single doc / bundle groupings).
   - Sections to include (checkboxes).
   - Target: Google Doc / web link / both.
2. Confirm → Lowpass renders + saves snapshot.
3. Google Doc opens in a new tab. Web link URL displayed with copy button.

---

## 11. What this replaces

Currently: you maintain `Rider pack - [Artist] - [Tour]` folders in Drive, copy from a previous tour, edit manually, re-export PDFs per show. Errors compound.

After: one artist baseline. Tour overrides set once. Show overrides rare. Export produces a consistent, versioned doc every time.

---

## 12. Deferred / open items

Parked:

- **Global nav IA.** This feature slots into an "Advance" umbrella once the nav pass happens. For v1, it lives wherever the current advance area lives.
- **Per-email authenticated web access.** Out of scope. Password + URL rotation covers 95%.
- **Band/crew visibility.** Band doesn't see it; crew gets daysheets from external app.
- **Cover page field definitions.** Cover is just another section; default fields = artist logo asset, tour name, show date (autofilled from routing), key contact block. Refine later.
- **"Similar to my folder" export grouping spec.** Need to look at your current Drive folder structure once more to define the default bundle layout. Can do that at implementation time.

Q1–Q4 resolved (2026-04-21):

- **Q1 → per-URL password.** Captured in §9.2.
- **Q2 → admins only (TM/PM/TM Assistants).** Captured in §4.
- **Q3 → prompt per section on tour baseline change.** "This was manually entered — do you want it to change with this update?" Captured in §4.
- **Q4 → in-place updates.** Each pack binds to a Google Doc; subsequent exports overwrite. Drive version history is the audit trail. Captured in §9.1.

---

## 13. Next step

1. You review this doc. Mark Q1–Q4 with your calls (or override any of the locked decisions).
2. I turn this into a Cursor build prompt (likely 2–3 PRs: DB migrations + API + editor UI + export).
3. Build in Cursor overnight.

Separately: `CURSOR_PROMPT_PR_A2.md` (AppTopBarModePill cleanup + useIsMobile wiring + Notes right-rail) is still ready to ship and is independent of this work.
