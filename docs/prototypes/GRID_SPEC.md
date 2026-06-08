# Lowpass Canonical Grid — spec

> The reference implementation is `docs/prototypes/grid-playbox.html` (open it,
> drive it). This doc is the written contract for porting it into the app as
> **one** shared grid component used by **every** tabular surface — Expenses,
> Income, Payroll, Rooming, Channel list, and any future list. "For everything."

## 1. Why one grid

Today each surface has a bespoke table. The goal is a single `<Grid>` +
`<GridSlideOver>` pair that every product imports, so look and behaviour are
defined once and can't drift. Matching the look is the easy half; the grid must
**behave like a spreadsheet** (that's what we compete with) — keyboard
navigation, type-to-edit, range select, copy/paste, undo. The playbox proves the
behaviour end-to-end with no backend.

## 2. Visual contract

- Raised panel wrapper; each **section is its own card** with a stable accent
  colour (colour belongs to the section, not its position).
- Section kinds: `normal`, `derived` (badge "🔗 from Payroll/Rooming", tinted,
  rows pull from another module), `formula` (auto-calculated, e.g. Commissions /
  Insurance / Contingency).
- Density: Compact / Comfortable / Spacious (app-wide token).
- Columns: fixed-width, drag-resize with a ghost line + clamp, drag-reorder by
  the header, double-click header to rename. Item column is wide; numbers
  right-aligned, tabular.
- All conversion / non-native-currency values render in **red** with a note.

## 3. Behaviour contract (the spreadsheet half)

- Arrow-key cell navigation; Shift+arrows / Shift+click extend a **range**.
- Drag to select a block (no text selection).
- Type-to-edit, Enter (commit + down), Tab (commit + right), Esc (cancel).
- **⌘C / ⌘V** copy/paste a block; **⌫** clears the selected cells.
- **⌘Z / ⌘⇧Z** undo/redo (snapshot stack).
- Row reorder (drag the `#` handle, counter stays sequential), section reorder
  (drag header), all animated (FLIP).
- Status + dropdown cells open a styled menu (never native chrome).
- Custom columns: add Text / Number / Checkbox / Dropdown (coloured options) /
  number **Formula** (col A ±×÷ col B); delete with confirm.

## 4. Column / row data model

```
Column = { id, label, type, width, min, resize, hidden?, options?, optColors?, formula? }
  type ∈ idx | text | money | number | check | dropdown | status | variance | formula | receipts
Row    = { [colId]: value, cur, status, transactions[], docs[], links[], notes,
           _uid, /* per-kind extras: */ rates[] (person), hotel{} (rooming) }
```

- **Status set (canonical): `budgeted · paid · reconciled · refunded`.**
- **Currency**: each row has `cur`; values are stored in `cur` and **converted
  to the tour display currency** for the grid + all totals (FX table; live).
  Converted values show red + the source amount. (UK crew on a USD tour, EUR
  hotels, etc.)
- **receipts** column: 📎 + count; click = toaster listing the line's documents +
  transaction receipts, with "open line".

## 5. Slide-over

One slide, three variants chosen by section source:

- **Line** (normal/formula): title, Estimate/Actual (currency-prefixed inputs;
  est locked for formula), currency selector, vendor, status, **Linked to**,
  **Transactions**, **Documents**, notes.
- **Person** (`source = Payroll`): est/act + currency, editable **rate card**
  (show / off-travel / per diem / advance / custom — "Add rate"), status,
  linked expenses, transactions, "Open in Personnel".
- **Hotel** (`source = Rooming`): budget first, then confirmation # / nights /
  contact, "Open in Rooming", **"Link to Advance"** (pull contact/conf/notes),
  transactions, documents.

**Transactions**: name · date (date picker) · amount · receipt · 🔗 Link.
Attaching a receipt picks an existing **document** on the line or uploads a new
one (which lands in the Documents pile **and** links to that transaction).

**Documents**: line-level Receipt / Quote / Contract / Invoice / Other, editable
name (auto-focused on add).

## 6. The relational layer (the "make it smart" part — real architecture)

The playbox captures relationships in the UI; the intelligence is a data-model
build:

- **`transaction_links`** (or `line_links`) join: `(source_id, entity_type,
  entity_id)` where `entity_type ∈ person | show` (Gear deliberately excluded —
  it's logistics, not budget; vendor stays a column, not a link).
- This is what powers "click a person → every expense attached to them",
  cost-per-show rollups, and AI reports that traverse the graph.
- Link targets are the app's existing canonical entities (person, show) from the
  personnel-unification work — the tables already exist.
- Derived sections write-back rules: Payroll/Rooming own the source; the budget
  shows them read-only (estimate locked), Actuals editable here.
- Hotel ↔ Advance link: pulls hotel contact / confirmation / notes from the
  advance into the rooming line.

## 7. Income & settlement (researched — drives the Income table + settlement slide)

Income is the **same grid** with a different column set and a **settlement
slide-out**. Columns for Guarantees read like routing (Show · Date · Capacity ·
Deal · Guarantee · Settled · Docs). Guarantees are **contracted** — no estimate,
only the guarantee + the settled actual. They carry a **deal memo** + **deal
terms** doc (this is why Income can absorb part of Operations).

### Deal types + formulas (from Adam's AGR settle sheets — US Plus, UK Versus)

Let `GBO` = gross box office (Σ ticket price × sold per tier, incl/excl VIP),
`NET` = box office after per-ticket charity, facility fee and tax,
`G` = guarantee, `EXP` = approved show expenses (fixed actuals + variable:
insurance per-head, venue rent as % of net BO, PRO licenses ASCAP/BMI/PRS/etc.,
credit-card %).

- **Flat guarantee** — artist walkout = `G`. No upside.
- **Plus deal (promoter-profit, e.g. "Plus 80/20")** — guarantee is itself an
  expense line. `AdjustedExpenses = EXP + G`. `Overage = NET − AdjustedExpenses`
  (if > 0). Split the overage: **artist gets its split %** (80) of overage.
  `ArtistWalkout = G + 0.80 × max(0, Overage)`. Promoter keeps `G`-recoup +
  20% of overage.
- **Versus deal ("vs 80")** — artist gets the **greater of** guarantee or X% of
  net. `VsAmount = 0.80 × NET`. `SplitPoint = G / 0.80`.
  `ArtistWalkout = max(G, VsAmount)`. `ShowOverage = max(0, VsAmount − G)`.
- **Door split** — no/low guarantee; `ArtistWalkout = split% × NET`.

**Settlement tail (both deals):** `TotalShowIncome = G + overageToArtist`;
`+ production reimbursement = TotalEarnings`; `− deposit − cash pickup =
BalanceDue`. Withholding tax (**WH TAX**) is deducted at source on foreign
income (a % off the artist walkout). The settlement slide reproduces this:
ticket tiers → GBO → deductions → NET → expenses (budget vs actual) → deal calc
→ artist walkout → balance due, with the deal-type formula switched on the
`deal` field.

### Merch + VIP projection (Income lines that are estimates, not contracts)

- **Merch**: tour-level `projected = tourCapacity × sellThrough% × perHead`
  (defaults 80% / £1). **Actuals are per show** (the routing rows carry Merch £ +
  drop count → £/head). The **merch deal is not one split** — it differs by
  product class: **soft goods** (shirts/hoodies), **hard goods** (vinyl/CD),
  **trinkets**, and whether it's a **venue sell** (venue staff sell + take a
  bigger cut) vs self-sell. Each class has its own venue/band split %, and many
  are also subject to WH tax. This detail lives in the **merch advance** and
  should **auto-link** into the income slide (it's already generated there), not
  be re-keyed.
- **VIP**: `passes × sell% × price × (1 − fee%)` — predict how many of the
  available passes actually sell rather than assuming a sell-out; fees cover
  platform / CC / Live-Nation. (Per-tier {price, available, sell%} when needed.)

These are the only Income lines with an estimate (the projection); Guarantees
are contract-only.

### Build order for Income/settlement (next focused piece)

1. Income column set + relabelled KPIs — DONE in the playbox.
2. `deal` dropdown with the five deal types — DONE.
3. Settlement slide-out: ticket tiers + expenses + deal-switch formula → walkout
   + balance due (model on the two AGR sheets). DONE in playbox (open a Show
   row in Income) — v1; expand ticket-tier deductions + variable-expense
   breakdown to full AGR parity when porting.
4. Merch/VIP projection inputs — DONE (editable formulas: merch = cap × sell% ×
   £/head − venue split; VIP = passes × price − fee%). Per-show actuals on the
   routing rows.
5. Deal-memo (multiple) + deal-terms columns on guarantees — DONE (memo column
   holds a list).

### Settlement expense classification

Every settlement expense line is tagged **Show** or **Artist**:
- **Show cost** → sits *inside the deal* (part of `EXP` for the Plus-deal overage
  calc); it is NOT deducted from the artist's balance.
- **Artist cost** → deducted from the artist's final **balance due** after the
  walkout (tour bus, crew the artist carries, etc.).

### Note on the projections panel

In the playbox the per-tour projections render as a bespoke panel. In the app
they must be **the same canonical Grid component** (column resize, keyboard nav,
the lot) — every tabular surface is one component, no exceptions.

## 8. Open decisions before implementation

1. FX rate source + refresh cadence (manual table vs live feed) and which field
   is the tour's display currency.
2. `transaction_links` schema + the report queries that traverse it.
3. Whether Income reuses the exact column set (Estimate=Projected, Actual=
   Received) or relabels per view (playbox reuses it).
4. Multi-rate person model → ties to migration 208 (`personnel_rate_lines`).
