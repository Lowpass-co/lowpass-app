# Lowpass UX Overhaul Roadmap

> Source of truth for the visual + UX redesign cycle.
> Companion to `RIDER_PACK_ROADMAP.md` (which scopes pack/channel/stage features).
> This doc scopes navigation, page archetypes, components, relational data model, and the sequence of Cursor prompts that will land the rebuild.

---

## 1. Why this exists

The current app has grown page-by-page. Cursor has improvised layouts because there are no canonical page types or component contracts. Result: every page looks slightly different, the budget feels worse than a spreadsheet, the nav is heavy, and cross-cutting data (flights, rooms, people) is entered in multiple places that drift.

This roadmap fixes that with **rules first, pages second**. Once the rules exist, every page becomes predictable.

---

## 2. Design principles (the canon)

| # | Principle | Why |
|---|-----------|-----|
| 1 | Two modes: pre-tour build, on-tour consume | The user does fundamentally different things in each. Don't optimise one at the cost of the other. |
| 2 | Daysheets handles day-of ops; we don't | Frees us to be the planning + advance + budget tool. |
| 3 | Aesthetic: Daysheets × Notion | Grid-feel for entry; clean, consumable for reading. |
| 4 | Functional + light orange | `--lp-orange` = brand accent only, not a primary fill on every surface. |
| 5 | Tables are the default list/data view | Comfortable density (~44px rows) on most pages; compact mode only for power-grids (Budget, Channel List). |
| 6 | Slide-over = context only | Notes, files, receipts, comments, math. **Never** the primary edit surface. |
| 7 | Single record, multiple views | One Flight / Person / Room / Gear record, surfaced everywhere relevant. No double entry. |
| 8 | Predictable page archetypes | Every page conforms to one of four shapes. New page → pick an archetype. |
| 9 | Top-bar nav + archetype-driven left rail | Top-bar is global (Tours/Library/Templates/account). Left rail's contents are determined by the archetype of the page you're on. |
| 10 | Mobile is PWA-only, scoped to receipts + reading | No native app. No mobile editing flows beyond receipts. |
| 11 | Read-only external sharing limited to Advance | TM/Mgmt internal everywhere else. |
| 12 | Foundation first, pages second | Tokens + components + archetypes ship before any page redesign begins. |

---

## 3. Information architecture

### 3.1 Top-bar (always present)

```
[Lowpass logo]  [Tours ▾]  [Library]  [Templates]                   [⌘K search]  [account ▾]
```

- **Tours** — switcher dropdown listing recent tours; active tour highlighted.
- **Library** — global views: deal memos, all files, mic library, gear, people directory.
- **Templates** — pack templates, budget templates, advance templates.
- **⌘K** — "Spotlight for Lowpass": pop-up search across the entire database (shows, people, flights, rooms, gear, expenses, files, deal memos, budget lines). Fuzzy match, type-grouped results, keyboard-only navigation, hit Enter to open the slide-over for that record. First-class feature, not deferred.
- **Account** — settings, billing, sign out. Settings live here (not in left rail).

### 3.2 Left rail — archetype-driven

The left rail's contents are determined by the archetype of the page you're on:

| Archetype | Left rail contents |
|-----------|-------------------|
| **Spreadsheet** | Section tabs of the sheet (e.g. Budget: Income / Expenses / Hotels / Travel / Payroll). |
| **Document/Builder** with day dimension (Advance, Routing) | Scrollable day list covering the full tour duration, **focused on today** (today is highlighted and scrolled into view by default). User can scroll backwards/forwards across the whole routed tour. |
| **Document/Builder** without day dimension (Pack editor, Stage plot) | Section/page list of the document. |
| **List** | Filters + saved views. |
| **Dashboard** | Tour structure (links to Advance, Budget, Rooming, Files, etc). |

**Behaviour:** rail is always visible at desktop widths. Collapses to icon strip below ~1280px. Hidden on mobile.

### 3.3 Slide-over panel — context only

Triggered by: clicking a row in a List, or clicking a contextual line item in a Spreadsheet (e.g. a budget line called "Britannia Row Audio Rental").

Contains:

- Notes (rich text)
- Attached files
- Linked receipts / expenses
- Team comments thread
- Math scratchpad (running calculator tied to the item)
- Activity log

**Never contains** the primary editable fields of the record itself. Those live on the page (table row inline edit, document body, etc) so the page remains printable and self-sufficient.

Width: ~480px on desktop. Full sheet on mobile.

### 3.4 Page archetypes (the four shapes)

Every page in the app must conform to one of these. New page idea → pick one. No bespoke layouts.

| Archetype | Layout contract | Used for |
|-----------|----------------|----------|
| **List** | Top filter bar → table → row click opens slide-over | Shows, personnel, expenses, files, bug reports, deal memos, gear inventory |
| **Spreadsheet** | Top section tabs (in left rail) → frozen-header grid with keyboard nav, bulk edit, frozen first col. **Visual aesthetic must match the Bug Reports page**, not the current budget page (which is the worst-looking surface in the app). | Budget, Payroll, Channel List, Routing |
| **Dashboard** | Header summary → scrollable rolling timeline → cards/stats | Tour overview, Today screen |
| **Document/Builder** | Section/day rail → main canvas (prose for documents, drag-drop for builders) | Advance, Pack editor, Stage plot, Deal memo viewer |

---

## 4. Relational data model

### 4.1 Canonical entities

Each of these is a single record with multiple views. Editing in any view writes to the same row.

| Entity | Owns | Surfaces in |
|--------|------|-------------|
| **Show** | date, venue, city, capacity, doors, set times | Routing, Advance, Budget rows, Dashboard |
| **Person** | name, role, contact, rate, dietary | Personnel, Rooming, Payroll, Channel inputs, Advance contacts |
| **Flight** | times, PNR, airline, route, $ cost | Advance flights tab, Budget travel section, Personnel "their flights" |
| **Room** | hotel, check-in/out, room type, $ cost | Rooming list, Budget hotels section, Personnel "their room" |
| **Gear** | item, **ownership status (owned / sub-hired / hired-to-client)**, $ hire cost, supplier, channel routing | Channel list, Stage plot, Budget hire section (only `hired-to-client` items surface here), Advance backline |

### 4.2 Implementation rule

A line item in the Budget that represents a flight is **a derived row**, not a duplicate. It reads `flight.cost` from the Flight record. Editing the cost in either place writes to the same field. The Budget shows the linked-flight icon next to the row to indicate "this is a derived row, click to open the source."

### 4.3 What this prevents

- Flight cost in Advance ≠ flight cost in Budget (current bug).
- Adding a person to Rooming and forgetting they need a payroll line.
- Channel list referencing gear that has no hire cost recorded.

### 4.4 Gear ownership rule

Gear has three ownership states:

| State | Meaning | Surfaces in Budget? |
|-------|---------|--------------------|
| `owned` | Band/artist owns it. No hire cost. | No |
| `sub-hired` | Someone else's gear we're using; cost handled outside our hire ledger (e.g. supplier directly bills the artist). | No (or optional info row) |
| `hired-to-client` | We're hiring it and billing it through to the client/production budget. | Yes — derived row in Budget hire section |

Channel List references the Gear record regardless of ownership; only the ownership state determines whether the item produces a budget row.

---

## 5. Component library (what gets built in Foundation phase)

These are the only components page archetypes are allowed to compose from. Everything else is illegal — Cursor must not invent new layout primitives.

| Component | Purpose | Notes |
|-----------|---------|-------|
| `<TopBar>` | Global nav | Single instance, always rendered |
| `<LeftRail>` | Archetype-driven side nav | Variant prop: `spreadsheet \| docDays \| docSections \| list \| dashboard` |
| `<PageShell>` | Wraps any page; applies top-bar + rail + main slot | Enforces archetype layout |
| `<SlideOver>` | Right-edge context panel | Universal trigger API |
| `<DataTable>` | List archetype's table | Sort, filter, row-click → slide-over, comfortable + compact density |
| `<SpreadsheetGrid>` | Spreadsheet archetype's grid | Keyboard nav (Tab/Enter/arrows), frozen first col + header row, multi-cell select + bulk edit |
| `<TimelineDashboard>` | Dashboard archetype's main element | Today-anchored, horizontal scroll forward |
| `<DocumentCanvas>` | Document/Builder main slot | Section anchors, prose blocks, attachments |
| `<EntityChip>` | Inline reference to a canonical entity | Click → opens slide-over for that Person/Flight/Room/Gear |
| `<CommandPalette>` | ⌘K Spotlight-for-Lowpass | Cross-entity fuzzy search; type-grouped results; opens slide-over on Enter |
| `<Pill>`, `<Button>`, `<Input>`, `<Select>` | Atoms | Existing tokens; standardised props |

---

## 6. Mobile (PWA)

Two flows only:

### 6.1 Receipt capture (creation)
- Camera capture of receipt → photo attached
- Amount + currency (currency defaults to current city/country)
- Category picker (tied to budget categories — auto-routes the line)
- Show date auto-detected from today's tour calendar; user can override
- Submit → creates expense, links to budget category, attaches photo

### 6.2 Document reading (consumption)
- Advance for current/next show (large readable type)
- Contracts / received files for current/next show
- Read-only. No editing on mobile.

### 6.3 Out of scope on mobile
- Budget editing
- Pack editor
- Stage plot
- Personnel / rooming management
- Anything Spreadsheet-archetype

---

## 7. Rollout phases

Foundation must land before any page redesign begins. Each phase is a deployable milestone.

### Phase A — Tokens + shell (no page changes yet)
1. Audit + extend `--lp-*` tokens (spacing, radii, z-layers, typography scale)
2. Build `<TopBar>` + `<LeftRail>` + `<PageShell>` with archetype variants
3. Build `<SlideOver>` and adopt it everywhere Bug Reports already uses one
4. Migrate existing pages onto `<PageShell>` (no visual change to page bodies; just slotted into the new shell)

### Phase B — Component library
5. Build `<DataTable>` (replaces all current table implementations)
6. Build `<SpreadsheetGrid>` (greenfield — does not exist yet)
7. Build `<TimelineDashboard>`, `<DocumentCanvas>`
8. Build `<EntityChip>` + the entity-link routing

### Phase C — Relational refactor
9. Migrate Flight to canonical entity + derived rows in Budget
10. Migrate Person, Room, Gear similarly
11. Remove all duplicate-entry surfaces

### Phase D — Page redesigns (per archetype)
12. **List archetype rollout**: Personnel, Files, Deal Memos, Gear, Bug Reports → `<DataTable>` + slide-over
13. **Spreadsheet archetype rollout**: Budget (priority — worst current page), Payroll, Channel List, Routing
14. **Dashboard archetype rollout**: Tour Overview, Today screen
15. **Document/Builder rollout**: Advance, Pack editor (already in flight via R8/R10/R11), Stage plot

### Phase E — Mobile PWA
16. Add PWA manifest + service worker
17. Build mobile layouts for the two flows (receipt capture, document read)
18. Wire receipt capture to canonical Expense entity

---

## 8. Cursor prompt sequence

Each phase becomes one or more `CURSOR_PROMPT_*` files following the same pattern as the rider pack prompts. Numbering uses `UX##` to distinguish from `R##` (rider pack).

| Prompt | Phase | Scope | Depends on |
|--------|-------|-------|-----------|
| UX01 — Tokens audit + extension | A | Catalogue all current `--lp-*` use, fill gaps (spacing, type scale, z-layers, motion), document in `docs/design-tokens.md` | – |
| UX02 — Shell components | A | `<TopBar>`, `<LeftRail>` (5 variants), `<PageShell>`. No page wired up yet. | UX01 |
| UX03 — SlideOver universalisation | A | Build `<SlideOver>`, port Bug Reports onto it, document the contract | UX02 |
| UX04 — Migrate existing pages onto PageShell | A | All pages now render via `<PageShell>`. Body content unchanged. Visual diff = nav only. | UX03 |
| UX05 — DataTable component | B | Build `<DataTable>` against design contract. Storybook-style playground page for QA. | UX04 |
| UX06 — SpreadsheetGrid component | B | Greenfield grid with keyboard nav, frozen panes, bulk edit. Playground page. | UX04 |
| UX07 — TimelineDashboard + DocumentCanvas | B | Remaining archetype primitives | UX04 |
| UX08 — EntityChip + entity routing | B | Click any chip → slide-over for that entity | UX03 |
| UX08b — ⌘K Command Palette ("Spotlight for Lowpass") | B | Cross-entity fuzzy search popover. Indexes shows, people, flights, rooms, gear, expenses, files, deal memos, budget lines. Opens slide-over on Enter. | UX08 |
| UX09 — Flight as canonical entity | C | Schema migration + UI: Advance flights + Budget travel both edit the same row | UX08 |
| UX10 — Person canonical | C | Same shape as UX09 for Person | UX09 |
| UX11 — Room canonical | C | Same for Room | UX09 |
| UX12 — Gear canonical | C | Same for Gear | UX09 |
| UX13 — List pages re-skin | D | Personnel, Files, Deal Memos, Gear, Bug Reports onto `<DataTable>` | UX05, UX08 |
| UX14 — Budget rebuild | D | New Spreadsheet archetype. **Highest impact prompt.** | UX06, UX09–UX12 |
| UX15 — Payroll, Channel List, Routing onto SpreadsheetGrid | D | Channel List ties into the R-series rider pack work | UX06, UX10 |
| UX16 — Dashboard rebuild | D | Tour Overview + Today onto `<TimelineDashboard>` | UX07 |
| UX17 — Advance + Document pages | D | Advance onto `<DocumentCanvas>` with day rail | UX07 |
| UX18 — PWA shell + manifest | E | Service worker, install prompt, offline shell | UX04 |
| UX19 — Mobile receipt capture | E | New canonical Expense entity surfaced via mobile flow | UX18, UX09 |
| UX20 — Mobile document read | E | Read-only mobile views of Advance + show files | UX18, UX17 |

---

## 9. Open questions / deferred decisions

| Item | Status |
|------|--------|
| ⌘K command palette | **In scope, Phase B** (UX08b). User-confirmed first-class feature. |
| Density toggle (comfortable ↔ compact) per-page or global? | Default: per-table prop, no user toggle in v1. Revisit if asked. |
| Formulas in `<SpreadsheetGrid>` cells | Out of scope for v1. System computes totals. |
| Native iOS/Android app | Out of scope. PWA only. |
| Read-only external advance share UI | Existing R-series scope; integrate with Document archetype in UX17. |

---

## 10. Sequencing relative to the rider pack roadmap

The rider pack work (`R7` → `R17`) is currently in flight. It must not block the UX overhaul foundation, and the UX overhaul must not break in-flight rider pack work.

Rule: **the rider pack roadmap finishes its current sprint (R8 v2 + R10 + R11) before UX01 starts.** Once foundation lands (UX01–UX04), subsequent rider pack prompts (R12+) consume the new components instead of building bespoke layouts. Specifically R12 (output lists), R15 (templates), R16 (share tracking) should target `<DataTable>` and `<DocumentCanvas>`.

`R14` (hire list) is a strong candidate to be folded into UX12 (Gear canonical entity) since they overlap — defer R14 until UX12 lands.

`R17` (stage plot builder) targets `<DocumentCanvas>` builder mode — depends on UX07.

---

## 11. Definition of done for the overhaul

Cycle is complete when:

1. Every page in the app renders inside `<PageShell>` with the correct archetype.
2. No page contains a bespoke table, side panel, or grid implementation. Components only.
3. Flight, Person, Room, Gear each exist as a single record edited from multiple views.
4. The Budget feels at least as fast as the user's existing spreadsheets for data entry (measured: time-to-enter 20 expense rows).
5. Mobile receipt capture and advance reading work as PWA flows.
6. New page added by Cursor without an explicit visual brief still feels native, because there are only four shapes to pick from.
