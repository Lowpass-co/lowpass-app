# UX17 — Advance + Document Pages

> Advance onto `<DocumentCanvas>` (UX07) prose mode with a **scrollable full-tour day rail focused on today**. Pack editor onto DocumentCanvas builder mode. Read-only external advance share view integrates here.

---

## 0. Context for Cursor

Read first:

1. `docs/cursor-prompts/UX_OVERHAUL_ROADMAP.md` — sections 3.4 (Document/Builder archetype), 11 (read-only external advance share).
2. UX07 — DocumentCanvas spec (prose + builder modes).
3. UX02 LeftRail `docDays` variant — the rail behaviour for advance.
4. R-series prompts — pack editor existing implementation.
5. UX02–UX16 (must be merged).

---

## 1. Pages in scope

| Route | Mode | Notes |
|-------|------|-------|
| `/tours/[id]/advance` | prose | Index of all show advances |
| `/tours/[id]/advance/[showId]` | prose | Single show advance |
| `/tours/[id]/rider-packs/[packId]` | builder | Pack editor (existing R-series) |
| `/tours/[id]/stage-plot` (if exists) | builder | Stage plot (R17 / future — out of UX17 scope) |
| Public advance read-only view at `/share/advance/[token]` (exists from R-series) | prose | Same rendering as logged-in advance, but read-only |

---

## 2. Hard rules

1. Use `<DocumentCanvas mode="prose">` for advance pages.
2. Day rail (`docDays` variant) covers full tour duration (start → end), focused on today on mount.
3. Advance content is editable inline for users with edit permission. Read-only for the public share view.
4. Use `<DocumentCanvas mode="builder">` for pack editor; preserve R-series functionality.
5. Section anchors per advance: Overview / Travel / Hotel / Venue / Schedule / Tech / Catering / Settlement (or whatever the existing structure is).
6. Lint + typecheck clean.

---

## 3. Step 1 — Migrate `/tours/[id]/advance`

### 3.1 Index page

Page lists show advances. Use `<DataTable>` (UX13 already migrated this if it was a list page; if not, do it here): columns = Show, Date, City, Status (advance complete / in-progress / not-started), Last edited.

Click row → navigate to `/tours/[id]/advance/[showId]`.

### 3.2 Single show advance at `/tours/[id]/advance/[showId]`

PageShell with `archetype: 'document'`, LeftRail variant `docDays`. Day rail is anchored on today (or on the show's date if that's how the user got here).

Main content: `<DocumentCanvas mode="prose">` with sections:

1. **Overview** — show name, date, venue, basic info
2. **Travel** — flights (EntityChip), trains, ground
3. **Hotel** — RoomSlideOver references, check-in/out, addresses
4. **Venue** — address, contact, load-in time, sound check time, doors, set times
5. **Schedule** — minute-by-minute day schedule, can be a small SpreadsheetGrid (read-only or edit per permission)
6. **Tech** — link to channel list, stage plot, tech rider PDF
7. **Catering** — meal times, dietary requirements (auto-pulled from Person records)
8. **Settlement** — financial settlement details, deal terms, payment method

Each section has its own editable content. Use rich-text editing where appropriate (notes, descriptions); use forms for structured fields (address, times).

Inline EntityChip references throughout (flights, hotels, persons).

### 3.3 Header

Show name + date as h1. Status pill (advance % complete). Quick links: "Open Routing", "Open Channel List", "Open Pack Editor".

### 3.4 Print

Advance must be printable. Use a print stylesheet to:
- Hide PageShell chrome (TopBar, LeftRail)
- Render sections sequentially with page breaks where natural
- Preserve EntityChip references as plain text + secondary

### 3.5 Permissions

Editing requires authenticated user with edit role. Read-only view is accessed via the public share (Step 3 below).

---

## 4. Step 2 — Migrate Pack Editor onto DocumentCanvas builder mode

### 4.1 Audit
R-series has built the pack editor across R3/R5/R7/R8/R10/R11. Inspect current state. The editor is a canvas with channel list section, blocks, attachments, etc.

### 4.2 Wrap in DocumentCanvas
Replace whatever wrapping the pack editor currently has with `<DocumentCanvas mode="builder">`. Use the builder mode's canvas + zoom controls.

LeftRail `docSections` lists pack sections (cover page / channel list / stage plot / inputs / outputs / etc).

Preserve all R-series drag-drop, save, share functionality.

### 4.3 Polish
After wrapping, verify visual aesthetic is now consistent with the rest of the redesigned app. Update any inline literals to design tokens.

---

## 5. Step 3 — Public share read-only view

### 5.1 Existing route
R4 / R5 prompt established the public share endpoint (likely `/share/advance/[token]`). Verify it exists and works.

### 5.2 Render
Reuse the same `<DocumentCanvas mode="prose">` rendering as the logged-in advance, but with `editable={false}` and:
- No TopBar's account / Tours dropdown (replace with workspace logo + tour name)
- LeftRail's `docDays` is shown but day click navigates within the share scope only (no slide-overs, no entity routing)
- EntityChip becomes plain text (no slide-over on click) for safety — the public viewer must not be able to query other entities

Print works.

---

## 6. Verification

1. Lint + typecheck clean
2. Advance index page renders as DataTable
3. Single show advance renders with day rail focused on today
4. All sections render
5. Inline editing works for authenticated users
6. EntityChip references work
7. Print: clean output, no chrome, sections paginated
8. Pack editor still functions — drag-drop, save, share, R-series features all work
9. Public share renders advance read-only
10. Public share doesn't leak other workspace data
11. Day rail scrolls today into view on mount; today is highlighted
12. Dark mode parity (admin view); public share defaults to light mode

---

## 7. Acceptance criteria

- [ ] `/tours/[id]/advance` index uses DataTable
- [ ] `/tours/[id]/advance/[showId]` uses PageShell + DocumentCanvas prose + docDays rail
- [ ] All advance sections render with editable inline content
- [ ] Pack editor wrapped in DocumentCanvas builder; R-series functionality preserved
- [ ] Public share view renders read-only advance correctly
- [ ] Print stylesheet works for advance + pack editor
- [ ] Day rail scrolls full tour duration, focuses today
- [ ] Lint + typecheck clean
- [ ] No new deps

---

## 8. Out of scope

- ❌ Stage plot builder (R17 / future)
- ❌ Adding new advance sections beyond what currently exists
- ❌ Major changes to public share auth model (token validation stays as R-series built it)
- ❌ Mobile-specific advance UI (UX20 handles mobile read)

---

## 9. Commit plan

Three commits:
1. `UX17: Advance pages onto DocumentCanvas + day rail`
2. `UX17: Pack editor wrapped in DocumentCanvas builder`
3. `UX17: Public share view onto read-only DocumentCanvas`
