# Grid surfaces — design notes (Payroll · Rooming · Channel list · shared Export)

Captured from the 2026-06-08 visual review. These are the surfaces that adopt
the canonical `<Grid>` after Budget (Phase 5+). One grid engine, per-surface
column sets + adapters, plus a shared export tool. Build for real (Chrome-verified),
not in the sandbox — the playbox's job is done; rooming is the only surface that
warranted visual design iteration first (this doc records its outcome).

## Rooming — ONE dataset, THREE views (Adam: "all of those ideas")
The card view alone isn't data-dense enough to scan a whole tour. Rooming gets a
view switcher (like sheet tabs), all reading/writing the same rooming lines
(which already roll into the budget Accommodation section):

1. **Tour matrix** (default for scanning) — people down the side, **every night
   across the top** (date + city), each cell = room no. + type, **shared rooms
   colour-grouped** (roommates share a colour), travel/off nights blanked. A
   footer "Rooms per night" count. This is the Google-Sheets rooming-list view.
2. **Nights overview** — one row per hotel stay: hotel · city · in–out · nights ·
   S/D/T room-type counts · pax · cost; footer totals (rooms, pax, spend). The
   "how many rooms am I paying for, where" scan.
3. **Cards** (assignment/edit) — per hotel-night room cards with occupant chips +
   an unassigned pool; drag a person into a room. Best for building a single
   night.

### App orientation decision (2026-06-08) — days ALWAYS on the left
Adam's sheet is people-left / nights-across, but in the **app the matrix is
FLIPPED**: **nights down the shared routing rail on the left**, **people across
the top**. Rationale (Adam): the routing rail (date · city · day-type) is the
app's spine everywhere (Advance, Payroll) — rooming must not invert it for one
screen. All three rooming views share the **same left routing rail**; only the
right panel differs (matrix = people grid · nights = per-stay table · cards =
room cards for the selected night). Long crews scroll the people columns
horizontally; the rail stays fixed. See "Shared routing rail" below — it's a
hard consistency rule, not just rooming.

### Conventions to match (from the GN Rooming List sheet)
- Each person carries **Role · Forename · Surname**.
- Each night has **City · Day-type · Date**.
- **Day-type** row per night: `Off` (pink) / `Show` (green) — drives which nights
  have rooms.
- Each cell = a **room-type code with a group letter**: `SGL`, `DBL (A)`,
  `DBL (B)`, `DBL (C)` … The **letter is the shared-room identity** — two people
  with `DBL (A)` share room A. Colour-keyed by type/group (SGL green, DBL A
  light green, DBL B orange, DBL C blue — his legend, reproduced).
- `-` = no room that night (travel/home/checkout).
- **Cell editor** = pick room type + group letter (existing codes or add new),
  not free text — so the grouping stays consistent and roommates auto-link.
- His sheet sums to a single **EST TOTAL** → one `hotels` budget line. **The app
  already improves on this**: rooming generates **per-room/per-stay derived
  Accommodation lines** in the budget (seen live: "Unassigned Hotel — DBL (A)"
  etc. FROM ROOMING). Adam wants night-by-night — the derived-lines model is the
  path to it (and the Nights-overview view surfaces it). Sell this as an upgrade,
  not a regression.

## Payroll — parity mapped from the real sheet (GN | Payroll | Bottlerock & Miami, 2026-06-09)
Two linked views on the **shared routing rail**, plus a summary, mirroring his
sheet's SUMMARY + weekly W/C tabs:

### A. Rates / totals table (the SUMMARY tab) — one row per person, fixed order
Columns: **Role · Forename · Surname · Show rate · Travel rate · Per-diem rate ·
Show days · Off/Travel days · Total fee · Total per diem · Advance · Notes**.

### B. Day-type matrix (the weekly W/C tab) — **rail (days) × people**
The week's days down the routing rail (date · city · day-type), people across the
top, each cell a **day type**: `SHOW DAY` · `OFF/TRAVEL DAY` · `NO TOUR`. This
matrix **drives the day counts** that feed the fee math. (Same rail+matrix shape
as rooming — consistent.) Festivals = multiple shows/cities in one week.

### Formulas — VERIFIED against the sheet (high confidence)
- `total_fee = show_rate × show_days + travel_rate × off_travel_days + advance`
  - Richie: 635.95×2 + 635.95×4 + 794.93 = **$4,611** ✓ · Duncan: 401.65×2 +
    200.83×4 = **$1,607** ✓ · Jake: 450×2 + 450×3 = **$2,250** ✓
- `total_per_diem = pd_rate × (show_days + off_travel_days)` (on-tour days only)
  - Adam: 33.47 × 5 = **$167** ✓
- **`NO TOUR` days pay nothing and earn no per diem** (excluded from both counts).

### Nuances that MUST be preserved (the current app gets these wrong → OPS-17)
- **Travel rate is independent of show rate.** Crew (TM/PM/tech/content) travel at
  full rate; **band members travel at ~half** (Duncan/James/Teresa show 401.65 /
  334.71 but travel 200.83). Never assume travel = show.
- **Advance fee**: a one-off added to total for advancing roles (TM/PM here).
- **Day types**: Show / Off-Travel / No-Tour — per day, on the matrix.
- Multi-week: weekly tabs each compute; a **summary aggregates across weeks**.
- Currency is **per tour** (this run USD; rooming was GBP).
- Personnel order is fixed; payroll **feeds the budget Salary section** (links to
  the budget — migration 208 now lets the derived lines persist). The OPS-17
  fee-math fix = implement exactly the formula above.
- Slide = editable **rate card** per person (show/travel/per-diem/advance).

### Design decisions (confirmed 2026-06-09)
- **Default landing view = Rates & totals**; jump to Days matrix to edit the
  schedule; click a person → rate-card.
- **Three views** (one dataset): Rates & totals · Days matrix (rail × people) ·
  Person rate-card. Mirrors rooming.
- **Travel rate is per-person, full stop.** Band-at-half-rate was just this run's
  data — NOT a rule. Do not group or compute by Crew/Band; every person owns an
  independent show rate + travel rate + per-diem rate + advance.
- **Roster grouping** is display-only (by role/section), never tied to rate
  logic. Default flat ordered list (his sheet order); grouping optional.
- **Every column separate and explicit** — show rate · travel rate · per-diem
  rate · show days · off/travel days · total fee · total per diem · advance ·
  notes. Don't merge columns.

### Build: Stage-A map the real personnel/rate tables first, then build, Chrome-verify.
- **Export** (see shared tool below).

## ⭐ Core principle — EVERYTHING RELATES (Adam, 2026-06-09)
The surfaces are **one interconnected model**, and the UI must make the
connections visible. Not separate spreadsheets that happen to share names.
- **Days are shared.** Payroll days, rooming nights, advance days, and the budget
  all index off the **same `routing`** (the rail's source). "**Add a week**" in
  payroll must **extend the routing** — and that change shows up on rooming,
  advance, the rail, everywhere.
- **Per-person days exist** beyond the tour-uniform schedule: a guitar tech's
  **de-prep day** next week, the TM's **business meeting day** — extra working
  days for ONE person that still **count for pay and create a budget line**. So
  the day model must support **per-person day-types layered over the tour
  routing**, not just one day-type per day for everyone.
- **Money flows automatically.** A person-day or an added week ripples into the
  **budget** (Salary / per-diem lines) — never re-keyed.
- **Surface the ripple.** When the user adds a week / a person-day / changes a
  rate, the app tells them what else just changed ("this added 5 routing days +
  a $X budget line"). Blast-radius made visible — the user is never surprised by
  a downstream effect.
- Implication for the build: the routing/day model is the **anchor**; payroll,
  rooming, advance, budget are **bridges** off it. Design the day model to carry
  per-person overrides + drive budget lines before piling surface features on top.

## Channel list — RE-SKIN the existing editor (Option A, confirmed 2026-06-09)
Channel list is **not a fresh build** — it's a mature rider-pack feature with
specialised cells. **Do NOT rebuild it on the basic `<Grid>`.** Decision:
**re-skin the existing editor to the canonical grid look + adopt missing
spreadsheet behaviours + wire the shared export. Keep all the smart cells.**
- **Per rider/show, NOT per day** — no routing rail here (the one surface that
  doesn't need it).
- Real columns (`src/lib/channel-list/columns.ts`): base **# · Name** always on;
  opt-in: **Pos · Stage Box · Loom (sub-snake) · Cable · Mic/DI · Stand · +48 ·
  Prov · Notes** (enabled set persisted in `rider_sections.metadata.enabled_columns`).
- Smart cells to **preserve** (already built — verified): **Mic/DI combobox with
  type-to-search + mic library** (`MicDiSelectCell` / `AddMicModal`), stage-box &
  loom pickers, cable inventory, phantom toggle, provider, `AddManyChannels`,
  column picker, section bands. Plus the separate **Outputs** block and the linked
  **Stage plot** (companion views — the rider's technical package).
- Scope of the re-skin pass: tokens/raised-panel/section-band styling to match
  the canonical grid, keyboard-nav/reorder parity where missing, and the shared
  `<GridExport>`. Light touch — the editor's guts are good.
- Adam confirmed the prior mic-search/combobox fix (§CL-FIX-6) is in place.

## Shared ROUTING RAIL (hard consistency rule)
The **days-on-left rail** (date · city · day-type pill) must be **one shared
component** rendered identically wherever days are indexed — Advance, Payroll,
Rooming (all 3 views), Daysheets. Extract the existing Advance/Payroll rail
implementations into a single `<RoutingRail>` (props: entries
[{date, city, dayType, …}], `selected`, `onSelect`, `grouping: 'night' | 'week'`).
Days never move to the top for one screen. This is the first foundational build
after Budget (see `CC_ROUTING_RAIL.md`).

## `<GridExport>` — table export for PAYROLL · ROOMING · CHANNEL LIST only
**Scope correction (Adam, 2026-06-09):** this shared export is for the
**payroll, rooming, and channel-list** tables. **Budget is NOT here** — budget
needs its own, more involved **Reports tool** (P&L, summaries, variance — a
separate, richer build; see below). Don't wire budget into `<GridExport>`.

Daysheets was the reference but the skin must be **Lowpass, not a Daysheets
clone**:
- **Light/dark — adapts to the app theme** (like the **quotes in Jobs**
  documents). Not hardcoded dark. Chrome uses the app surface/text tokens;
  orange is the accent; the print "paper" is white in both modes.
- **Tone down the colour controls** — the per-line font-colour/highlight swatch
  rows read too Daysheets and too busy. Keep per-line styling minimal: **bold ·
  one subtle highlight · text size · move up/down · hide**. Drop the rainbow
  font-colour picker.

Builder (one `<GridExport>`, fed the grid's columns + rows + grouping; each
surface supplies a preset; **Save as Template** per surface):
- Pop-out, live WYSIWYG preview, toolbar = template · filter · zoom · email ·
  share · **download PDF** · close.
- **Header**: **logo auto-pulls through from the artist's branding** (override
  optional) — not a manual upload each time. Title + date. Optional background.
- **Header notes**: a free-text notes block in the header (e.g. "Patch to FOH
  SL, 48v as marked").
- **Contact info block**: add contacts (name · role · phone/email) to the
  document — like Daysheets' Contacts section.
- **Table format**: font-size slider, row-spacing slider, zebra stripes, column
  show/hide + reorder. Carries the grid's **coloured section-dot bands** into the
  doc (Lowpass identity).
- **Filter by group / day type** to scope rows. Output: print-ready **PDF** +
  email/share.
- Build it first on **channel list or rooming** (NOT budget), reuse on the others.

## Budget Reports tool (separate, later — NOT `<GridExport>`)
Budget export is a richer **reports** surface: P&L summary, category roll-ups,
estimate-vs-actual variance, commissions/contingency, per-show/derived breakdowns
— not a single styled table. Its own design + build pass, after the table
surfaces. Flagged here so `<GridExport>` stays scoped to the simple table export.

### v3 additions (Adam, 2026-06-09)
- **Header stays on top.** The letterhead (logo, title, date, header notes,
  contacts) is a top band — unchanged.
- **Sections move to a LEFT GUTTER** (clarified: this is what "beside, not part
  of the grid" meant). Section labels (Drums/Bass/Vocals) sit as vertical tabs in
  a narrow left gutter beside their row group, colour-accented — **not** as
  full-width band rows interrupting the table. Applies to the **in-app grid too**
  (section label in the gutter, not a band row). Grid-wide change to the canonical
  section rendering.
- **Resizable columns** in the export (drag column edges), carried from the grid.
- **Zebra colour is pickable** (swatch set), not a fixed grey.
- **Export light/dark toggle** — matches the app theme by default, but a ☀/☾
  button forces a light or dark PDF independent of the app theme.
- **Include stage plot** option — export the channel list + its **stage plot**
  together (page 2). Channel-list export specific.
- **Production summary at the bottom** (richer than a totals bar — Adam: must
  show WHAT, not just counts). Auto-derived from the data:
  - Totals (inputs · outputs · 48v count).
  - **Supplied-by**: Band / Venue / Rental, each with the **item list** of what
    they supply (e.g. Band: Beta 91A, Beta 52, SM57, KM184…), not just a count.
  - **Stand-type counts** (tall boom ×N · short boom ×N · none ×N).
  - **Cable-length counts** (5m ×N · 10m ×N · 15m ×N).
  - Each surface gets its own summary (rooming: rooms/nights/cost + room-type
    counts; payroll: fee + per-diem totals; channel: the above).
  - **Rendered as a GRID** (stat cells + a supplier table + stand/cable count
    tables) — aligned, not flowing text. Consistent with the everything-is-a-grid
    ethos.
- **Section manager** (the right panel): every document block — header, table,
  each summary block (Totals / Supplied / Stands / Cables), Contacts, Notes,
  Stage plot — is **show/hide-able**, set **full- or half-width**, and **drag-to-
  reorder**. The preview re-flows: consecutive half-width blocks pair side by
  side. This is how "customisation on how they're shown / if they're shown" works.
- **Movable Notes blocks** — "Add notes section" inserts a free-text Notes block
  that's also reorderable / width-settable like any other section (multiple
  allowed).
- Build gate: mock done + iterated to **v5** 2026-06-09 (header-top · section
  gutter · light/dark toggle · resizable cols · zebra colour · stage-plot
  co-export · gridded production summary) — pending final sign-off.

## Sequence (recommended)
Finish Budget Expenses (finalise prompt) → **Payroll** (real; quick, reuses
everything) → **Rooming** (after Adam confirms the workflow; 3 views) →
**Channel list** (mechanical) → **shared Export** folded in alongside whichever
surface needs it first (likely Channel list / Rooming, which are the most
export-driven). Each surface: map its real schema first (Stage-A discipline),
build, Chrome-verify, smoke.
