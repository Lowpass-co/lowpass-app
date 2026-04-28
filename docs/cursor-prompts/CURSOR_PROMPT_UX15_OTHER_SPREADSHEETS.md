# UX15 — Payroll, Channel List, Routing onto SpreadsheetGrid

> Three remaining Spreadsheet-archetype pages. Same component (`<SpreadsheetGrid>`), same aesthetic baseline (Bug Reports), same canonical-entity-derived-rows rule. Smaller scope than UX14 because each page has fewer sections and less FX/multi-currency logic.

---

## 0. Context for Cursor

Read first:

1. `docs/cursor-prompts/UX_OVERHAUL_ROADMAP.md`.
2. `docs/components/SPREADSHEET_GRID_CONTRACT.md` (UX06).
3. `docs/cursor-prompts/CURSOR_PROMPT_UX14_BUDGET_REBUILD.md` — same patterns, simpler scope here.
4. R-series prompts (rider pack roadmap) — Channel List has been built across R8/R10/R11 and may already use SpreadsheetGrid-shaped UI; this prompt unifies it.
5. UX02–UX14 (must be merged).

---

## 1. Pages in scope

| Route | Sections | Derived from |
|-------|----------|--------------|
| `/tours/[id]/payroll` | per Person, or one flat sheet — TBD by audit | tour_personnel rates × days/weeks |
| `/tours/[id]/channel-list` | per Show or one flat sheet (existing R-series structure) | gear (mics, DI), persons (input owners) |
| `/tours/[id]/routing` | one sheet with one row per day | shows + day types |

---

## 2. Hard rules

1. Use `<SpreadsheetGrid>` for the data grid. No bespoke tables.
2. Existing schema **stays**. UX15 is UI redesign, not data migration. (R-series already built channel list schema; UX09–UX12 already added FKs.)
3. Channel list and Routing must be **fully visible on screen** (no slide-over needed for primary content). User has explicitly said these are "viewable at once because you need to be able to print it out and read it."
4. Lint + typecheck clean per page.
5. One commit per page.

---

## 3. Step 1 — Payroll

### 3.1 Audit
Inspect current payroll implementation. It may not exist as a dedicated page; it may live inside Budget. If so, this prompt **adds** a dedicated `/tours/[id]/payroll` page that shares data with Budget's payroll section but presents the spreadsheet view.

### 3.2 Columns
- Person (entityRef person — derived: name + role)
- Role (text — derived from tour_personnel)
- Employment type (select)
- Rate amount (currency)
- Rate currency (select)
- Period (select: day / week / flat / hour)
- Starts on (date)
- Ends on (date)
- Days/Units worked (number)
- Total (computed)
- Tax/withholding % (percent, optional)
- Net to pay (computed)
- Notes button

### 3.3 Sections (left rail)
Group by employment type: Crew / Band / Mgmt / Freelance.

### 3.4 Slide-over
Per row → opens `<PersonSlideOver>` (UX10) — that's where personal details live. Row-local context (notes, comments specific to this tour's payroll row) lives in a small additional slide-over `<PayrollLineSlideOver>` accessed via the notes button.

### 3.5 Wire to Budget
Payroll page is **the** primary edit surface for payroll lines. Budget's payroll section (UX14) shows derived rows from this same data. Editing happens in Payroll; Budget just reads.

---

## 4. Step 2 — Channel List

### 4.1 Audit
R-series prompts (R8/R10/R11) have built channel list. Inspect current state; if it already uses SpreadsheetGrid-shaped UI from R-series, this prompt aligns it to the official `<SpreadsheetGrid>` component (UX06).

### 4.2 Columns
- Channel # (number, fixed by row index — never editable, never re-orders with row movement, per user spec from R11)
- Source (text or entityRef gear for mics — uses Gear category=mic filter)
- Provider (text — refers to mic/DI, not stand or cable; helper text reminds the user)
- Stage box position (entityRef stage_box position, from R-series)
- Sub-snake position (entityRef sub_snake position, from R-series)
- I/O (computed from sub-snake / stage box position)
- Insert (text)
- Phantom (checkbox, auto-suggested per R-series rules)
- Notes button

### 4.3 Sections (left rail)
Group per show or one flat sheet — match what the user has been using in R-series.

### 4.4 Capacity / picker rules
Per R11 prompt:
- Sub-snake A has capacity (set on Sub-snake entity — already in schema from R-series). Picker grays out positions when full.
- Stage box A has capacity. Same rule.
- Channel # is fixed = row index. Don't reassign on row reorder.

### 4.5 Layout
Full-width grid, no left rail content beyond section selector. Page must be printable (use print stylesheet to hide non-essential UI).

---

## 5. Step 3 — Routing

### 5.1 Columns
- Day # (number, fixed)
- Date (date, derived from tour start + day #)
- Day type (select: show / off / travel / rehearsal / press / radio / tv / festival)
- City (text)
- Venue (text — for show days)
- Hotel (entityRef hotel)
- Travel (text or entityRef flight)
- Notes button

### 5.2 Sections (left rail)
Routing is one continuous sheet (no sections). LeftRail shows day types as a quick filter or color legend instead of `spreadsheet` sections. Variant: `none` actually fits; the routing page doesn't need a sub-nav. Or use a small `dashboard`-style rail showing "Jump to today" / "Jump to first show".

Pick: rail variant `none` for simplicity, with a sticky toolbar at the top for "Jump to today" + day-type filter chips.

### 5.3 Layout
Full-width grid. Color-strip on the left edge of each row using `--color-lp-day-*` tokens. Today's row highlighted with `--lp-orange-subtle` background.

### 5.4 Pinned today row
On mount: scroll today's row into view (centred). Sticky "Today" jump button when it's scrolled out.

### 5.5 Slide-over
Row click opens `<ShowSlideOver>` for show days, `<HotelSlideOver>` for hotel-related rows where applicable. Off / travel / etc. days don't need slide-overs (context lives in the cells).

---

## 6. Verification

Per page:
1. Renders with PageShell
2. SpreadsheetGrid loads existing data
3. Inline editing + keyboard nav work
4. Derived cells render EntityChip for entityRef columns
5. Visual aesthetic matches Bug Reports
6. Print stylesheet works (try Cmd/Ctrl+P)
7. Lint + typecheck clean
8. No regression in R-series rider pack functionality (Channel List still correctly populates the rider pack output)

---

## 7. Acceptance criteria

- [ ] Payroll page on `<SpreadsheetGrid>` with employment-type sections
- [ ] Channel List on `<SpreadsheetGrid>` with R-series capacity rules preserved
- [ ] Routing on `<SpreadsheetGrid>` with day-type color strips, today anchor, jump button
- [ ] Each page has appropriate slide-over wiring
- [ ] All three pages printable
- [ ] No bespoke spreadsheet implementations remain
- [ ] Lint + typecheck clean
- [ ] No new deps

---

## 8. Out of scope

- ❌ Don't change R-series data model
- ❌ Don't add new payroll calculations beyond rate × period × units
- ❌ Don't add tax engines (just a simple % field for v1)
- ❌ Don't redesign Dashboard / Advance — UX16 / UX17

---

## 9. Commit plan

Three commits — one per page.
