# Lowpass Budget Redesign — V2

**Author:** Claude (for Adam Rowley)
**Date:** 16 March 2026
**Status:** V2 — Incorporates feedback on artist-first nav, day-by-day building, Notion-style nesting

---

## The Vision

Lowpass should feel like **Notion meets Google Sheets, built for touring**. Three core principles:

1. **Artist-first navigation.** You log in, pick an artist, everything is scoped to them. No clicking through menus to find the right tour.
2. **Day-by-day budget building** alongside a traditional spreadsheet view — equal weight, switch freely between them depending on what you're doing.
3. **Every line item is a rich object.** Click "Audio Hire" and it expands Notion-style to show quote PDFs, approval status, related line items, notes, links. A budget cell isn't just a number — it's a container for context.

---

## Part 1: App-Wide Navigation Redesign

### Current: Sidebar → Tours → Budget (buried)
### Proposed: Artist-first, routing-spine

**Step 1 — Artist selector (persistent)**

When you log in, you see your artists. Pick one (or land on your last-used). The selected artist stays as a **persistent header bar** across the entire app:

```
┌──────────────────────────────────────────────────────────────┐
│  LOWPASS    [Good Neighbours ▾]     Dashboard │ Tours │ ...  │
└──────────────────────────────────────────────────────────────┘
```

The artist dropdown lets you switch anytime. Everything below filters to that artist.

**Step 2 — Tour selector**

Under an artist, you see their tours. Active tour is prominent. The tour becomes your working context:

```
┌──────────────────────────────────────────────────────────────┐
│  GOOD NEIGHBOURS                                             │
│  ┌──────────────────┐  ┌──────────────────┐                  │
│  │ Bottlerock & Miami│  │ IOW + Pinkpop '26│  + New Tour     │
│  │ May '26 ● Active  │  │ Jun '26 ● Active │                  │
│  └──────────────────┘  └──────────────────┘                  │
└──────────────────────────────────────────────────────────────┘
```

**Step 3 — Inside a tour: Routing is the spine**

Once inside a tour, the primary view is the **day-by-day timeline**. This replaces the current tab-first layout. The routing (dates, cities, day types) is the skeleton that everything else hangs off.

A control bar on the left (coming out of the main sidebar, per Ben's design direction) gives access to different views:

```
┌──────┬───────────────────────────────────────────────────────┐
│      │  BOTTLEROCK & MIAMI — MAY 2026                        │
│ VIEW │                                                       │
│      │  [Day View]  [Spreadsheet View]  [Summary]            │
│ Day  │                                                       │
│ Sheet│  ┌─ 21 May ─────────────────────────────────────────┐ │
│ P&L  │  │ OFF — TRAVEL → MIAMI                             │ │
│      │  │ ...                                               │ │
│──────│  ├─ 22 May ─────────────────────────────────────────┤ │
│ TOOLS│  │ SHOW — ZEYZEY MIAMI                              │ │
│      │  │ ...                                               │ │
│Payroll  ├─ 23 May ─────────────────────────────────────────┤ │
│Rooming  │ OFF — TRAVEL → CALI                              │ │
│Settle│  │ ...                                               │ │
│      │  └──────────────────────────────────────────────────┘ │
└──────┴───────────────────────────────────────────────────────┘
```

---

## Part 2: The Day View (Primary Budget Building Mode)

This is the new thing. Your workflow: look at a day, think "what do we need?", add items, move on.

### What you see when you expand a day

Each day in the timeline is a collapsible card. When expanded, it shows **two panels side by side**:

```
┌─ 22 MAY — SHOW — ZEYZEY MIAMI ──────────────────────────────┐
│                                                               │
│  ┌─ ADVANCE ──────────────┐  ┌─ BUDGET ───────────────────┐  │
│  │                        │  │                             │  │
│  │  Venue: ZeyZey Miami   │  │  + Add line item            │  │
│  │  Cap: 5,000            │  │                             │  │
│  │  Load-in: 14:00        │  │  FLIGHTS                    │  │
│  │  Soundcheck: 16:00     │  │  ├ Adam BNA→MIA    £333     │  │
│  │  Doors: 19:00          │  │  ├ Ben LHR→MIA     £400     │  │
│  │  Show: 21:00           │  │  ├ Owen DCA→MIA    £550     │  │
│  │                        │  │  └ 4 more...       £2,949   │  │
│  │  Production Contact:   │  │                             │  │
│  │  Sarah @ ZeyZey        │  │  HOTEL                      │  │
│  │  +1 305 555 1234       │  │  └ 7 rooms × £250  £1,750  │  │
│  │                        │  │                             │  │
│  │  WiFi: backstage2026   │  │  TRANSPORT                  │  │
│  │  Parking: Lot C        │  │  ├ Airport transfer  £350   │  │
│  │                        │  │  └ Ubers            £30     │  │
│  │  [View full advance →] │  │                             │  │
│  │                        │  │  PER DIEM                   │  │
│  └────────────────────────┘  │  └ 7 crew × £25     £175   │  │
│                              │                             │  │
│                              │  DAY TOTAL          £5,654  │  │
│                              └─────────────────────────────┘  │
│                                                               │
│  INCOME: £25,000 guarantee (0% withholding) = £25,000 net     │
│  DAY P&L: +£19,346                                            │
└───────────────────────────────────────────────────────────────┘
```

### Key behaviours

**Adding items:** The "+ Add line item" button at the top of the budget panel. Type a description, pick a category (flight/hotel/transport/production/misc), enter the amount. It's attached to this day.

**Notion-style expansion:** Click any line item and it opens a **detail toaster/panel** — a slide-out or inline expansion showing rich context:

```
┌─ AUDIO HIRE ─────────────────────────────────────────────────┐
│                                                               │
│  Category: Production > Audio + Backline                      │
│  Proposed: £2,500         Actual: £0                          │
│  Applies to: Whole tour                                       │
│                                                               │
│  ─── Quotes ──────────────────────────────────────────────── │
│  📄 ProAudio_Quote_May26.pdf          ← approved              │
│  📄 SoundDesign_Quote_May26.pdf       ← rejected (too high)  │
│                                                               │
│  ─── Notes ───────────────────────────────────────────────── │
│  Using ProAudio again — same rig as last tour. Ben confirmed  │
│  they can do the IEM split we need. Need to check if the      │
│  Napa show has a house PA or if we're bringing everything.    │
│                                                               │
│  ─── Linked Items ────────────────────────────────────────── │
│  → Freight + Baggage: Return Bags (12 fly cases) — £2,000    │
│  → Transport: Cargo Van Hire — £300                           │
│                                                               │
│  ─── History ─────────────────────────────────────────────── │
│  14 Mar — Created by Adam                                     │
│  15 Mar — Quote from ProAudio attached                        │
│  16 Mar — Approved by Adam                                    │
└───────────────────────────────────────────────────────────────┘
```

This is the superpower. A touring budget isn't just numbers — it's decisions, quotes, context, and relationships between costs. No spreadsheet can do this.

### Tour-wide items

Items that aren't day-specific (audio hire, insurance, carnet, travel agent fees) live in a **"Tour-Wide Costs" section** — a dedicated area accessible from the left control bar, separate from the day timeline. These still show up in the P&L summary and category totals, they just aren't pinned to a specific date.

```
┌─ TOUR-WIDE COSTS ────────────────────────────────────────────┐
│                                                               │
│  PRODUCTION                                                   │
│  ├ Audio Hire              £2,500     [click to expand →]     │
│  ├ Carnet (12 month)       £1,200     [click to expand →]     │
│  └ Misc Expenses           £500       [click to expand →]     │
│                                                               │
│  OVERHEADS                                                    │
│  ├ Insurance (3%)          £1,308     [auto-calculated]       │
│  ├ Contingency (2%)        £996       [auto-calculated]       │
│  └ Accountancy (0%)        £0         [auto-calculated]       │
│                                                               │
│  COMMISSIONS                                                  │
│  ├ Agency (10% of Gross)   £4,360                             │
│  ├ Management (0%)         £0                                 │
│  └ Legal (0%)              £0                                 │
│                                                               │
│  TOTAL TOUR-WIDE:          £10,864                            │
└───────────────────────────────────────────────────────────────┘
```

---

## Part 3: The Spreadsheet View (Equal-Weight Alternative)

Some things are easier in a flat grid. Reviewing all flights at once. Comparing hotel costs across cities. Bulk-entering transport costs. The spreadsheet view shows the same data, organised by **category** instead of by day.

### Toggle between views

At the top of the tour content area:

```
[Day View]  [Spreadsheet View]  [Summary]
```

These are three equal views of the same underlying data. Change something in Day View → it's immediately reflected in Spreadsheet View and vice versa.

### Spreadsheet View layout

This is essentially V1 of the proposal — category tabs with inline-editable grids:

**Horizontal tabs:**
| Routing & Income | Hotels | Flights | Transport | Production | Receipts |

Each tab shows a flat, editable grid matching the Google Sheets column layout. All the inline editing behaviour from V1 applies here: click cell → type → Tab → auto-save.

The key difference from V1: this is now one of three equal views, not the only way to interact with the budget.

### When to use which view

The Day View is best for: building a budget from scratch, reviewing what's happening on a specific day, adding context and quotes to line items, checking advance + budget together.

The Spreadsheet View is best for: reviewing all costs in a category, bulk data entry, comparing proposed vs actual across the whole tour, quick number-crunching.

The Summary is best for: seeing the P&L at a glance, checking if the tour is profitable, sharing with management.

---

## Part 4: The Summary (P&L View)

Same as V1 proposal — a single-page P&L matching your Google Sheets summary layout. Proposed vs Actual columns, colour-coded, with salary table, commission table, and show/off day counts. This is read-only and auto-calculated from all the line items.

One addition: at the top of the Summary, a **health bar** showing:

```
┌─────────────────────────────────────────────────────────────┐
│  INCOME  ████████████████████████████████████  £43,600      │
│  EXPENSES  ██████████████████████████████████████  £50,809  │
│  NET P&L   ▓▓▓▓▓ -£7,209                                   │
└─────────────────────────────────────────────────────────────┘
```

Simple, visual, immediate.

---

## Part 5: Payroll

Payroll sits in the left control bar as its own section (not nested under budget tabs).

### Summary view
Same personnel table as V1: Role | Name | Show Rate | Travel Rate | Per Diem | Show Days | Off Days | Total Fee | Total PD.

### Weekly sheets
Auto-generated from routing dates. Each week shows a person × day grid with day-type dropdowns (SHOW / OFF/TRAVEL / NO TOUR) and city names. Colour-coded. Fees calculate live.

### Integration with Day View
When you're on a day in the Day View, the payroll for that day is visible in the advance/budget panel — you can see who's working, what they're being paid, and what day type they're on.

---

## Part 6: Rooming

Rooming also sits in the left control bar as its own section.

### Master grid
Person × date matrix with room type dropdowns (SGL, DBL A/B/C/D, —). City headers from routing. Day type indicators.

### Per-hotel sheets
Auto-generated when hotels are booked. Matching your BLANK HOTEL SHEET template with check-in/out, nights, room type, room number, conf number, rate, notes.

### Cross-linking
Room counts × assumed rate → auto-feeds the Hotels budget line. Hotel bookings in budget → auto-generate per-hotel rooming sheets.

---

## Part 7: Notion-Style Rich Line Items

This is the biggest differentiator from a spreadsheet. Every budget line item is a **rich object**, not just a row of numbers.

### Data model addition

Each budget line item (across all categories) gains:

```
budget_line_item_details:
  - notes: text (rich text / markdown)
  - attachments: file[] (quotes, PDFs, invoices, photos)
  - linked_items: line_item_id[] (related costs)
  - status: draft | quoted | approved | paid | disputed
  - approval_history: {date, user, action}[]
  - tags: string[] (custom labels)
```

### UI behaviour

**Collapsed (in grid):** Shows the line item as a normal row — description, proposed, actual. But with a small indicator showing it has attachments/notes/links.

**Expanded (Notion-style toaster):** Click the row or a dedicated expand icon → a panel slides in from the right (or expands inline) showing all the rich context: notes with formatting, attached files with preview thumbnails, linked items as clickable references, status badge with approval trail, edit history.

### What this enables

- Attach the three hotel quotes you received, mark which one was approved, add a note explaining why
- Link "Audio Hire" to "Freight + Baggage" and "Cargo Van Hire" so you can see the full cost of bringing your own PA
- Track which costs have been paid vs still outstanding
- Keep vendor contact details and booking references right next to the cost
- Build an audit trail without a separate document

---

## Part 8: AI / LLM Integration

Same four features from V1, with one addition:

### 8.1 — Smart Budget Templates
AI pre-fills costs from historical data when creating a new tour budget.

### 8.2 — Receipt OCR
Photo/upload → Claude Vision extracts vendor, amount, date, category → creates receipt row.

### 8.3 — Budget Variance Alerts
AI monitors proposed vs actual and flags anomalies with natural language explanations.

### 8.4 — Manager Quick-Budget
Simplified chat interface for managers to mock up rough P&Ls without filling every field.

### 8.5 — AI Line Item Assistant (NEW)
When adding a line item, AI can suggest:
- "You usually budget £250/night for hotels in London — is that still right?"
- "Last time you flew BNA→LHR it was £400. Current prices are around £450."
- "You've added audio hire but no freight — do you need to budget for transporting the rig?"
- "This tour has 3 shows in the EU — do you need a carnet?"

This hooks into the Notion-style detail panel. The AI suggestions appear as gentle prompts within the line item context, not as pop-ups.

---

## Part 9: Implementation Priority

### Phase 1 — Navigation & Day View
1. Artist-first navigation (persistent artist selector, tour cards)
2. Routing timeline as the primary tour view
3. Day View with collapsible day cards (advance + budget panels)
4. Basic line item adding/editing against days
5. Tour-wide costs section

### Phase 2 — Spreadsheet View
6. Category-tabbed inline grids (matching V1 proposal)
7. Bidirectional sync between Day View and Spreadsheet View
8. Keyboard navigation in grids

### Phase 3 — Rich Line Items
9. Notion-style detail panel (notes, attachments, links)
10. Line item status tracking
11. File upload in detail panel
12. Inter-item linking

### Phase 4 — Payroll & Rooming
13. Weekly payroll sheets with auto-generation
14. Rooming master grid
15. Per-hotel sheets
16. Cross-linking between rooming/hotels/budget

### Phase 5 — Summary & P&L
17. Summary P&L view matching Sheets layout
18. Health bar visualisation
19. Export to Excel

### Phase 6 — AI Features
20. Receipt OCR
21. Smart budget templates
22. Variance alerts
23. Manager quick-budget
24. AI line item assistant

---

## Part 10: Technical Approach

### New DB tables needed

```sql
-- Rich line item details (extends existing budget_line_items)
ALTER TABLE budget_line_items ADD COLUMN status TEXT DEFAULT 'draft';
ALTER TABLE budget_line_items ADD COLUMN tags TEXT[];
ALTER TABLE budget_line_items ADD COLUMN linked_item_ids UUID[];

-- Line item attachments
CREATE TABLE budget_line_item_attachments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  line_item_id UUID REFERENCES budget_line_items(id) ON DELETE CASCADE,
  file_url TEXT NOT NULL,
  file_name TEXT NOT NULL,
  file_type TEXT,
  uploaded_by UUID REFERENCES auth.users(id),
  uploaded_at TIMESTAMPTZ DEFAULT now(),
  notes TEXT
);

-- Line item notes / activity log
CREATE TABLE budget_line_item_notes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  line_item_id UUID REFERENCES budget_line_items(id) ON DELETE CASCADE,
  content TEXT NOT NULL,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ DEFAULT now(),
  note_type TEXT DEFAULT 'note' -- 'note', 'status_change', 'approval'
);

-- Day-scoped budget items (links line items to routing dates)
CREATE TABLE budget_day_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tour_id UUID REFERENCES tours(id) ON DELETE CASCADE,
  routing_id UUID REFERENCES tour_routing(id),
  line_item_id UUID REFERENCES budget_line_items(id) ON DELETE CASCADE,
  is_tour_wide BOOLEAN DEFAULT false,
  display_order INTEGER DEFAULT 0
);
```

### Frontend architecture

The three views (Day, Spreadsheet, Summary) share the same data layer:
- Single Supabase query fetches all budget data for a tour
- React context provides the data to all three views
- Mutations in any view update the shared state
- Optimistic UI with rollback on error

### Grid component
TanStack Table with custom inline-edit cell renderers. Lightweight, composable, no heavy spreadsheet engine.

### Detail panel
A slide-over panel (like Notion's page peek) that renders when you click a line item. Uses the existing `lp-dashboard-glass` styling. Tabbed content: Overview | Files | Links | History.

### Design tokens
All existing `lp-*` tokens apply. Ben's glass-morphic card style used throughout. The gradient backgrounds from the dashboard extend to the budget views.

---

## What This Means for the Existing Code

The existing 11 budget tab components and their APIs are **not wasted**. They become the Spreadsheet View almost as-is — they just need the inline editing improvements from V1. The Day View is new frontend built on top of the same API layer. The Summary stays mostly the same.

The biggest new work is:
1. Artist-first navigation (restructuring the app shell)
2. Day View UI (new component tree)
3. Rich line item detail panel (new components + DB tables)
4. Bidirectional data sync between views

The backend APIs barely change. The math spec stays the same. The Supabase schema gets a few new tables but existing tables are untouched.
