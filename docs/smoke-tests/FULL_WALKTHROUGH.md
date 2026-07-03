# Lowpass — Full real-use walkthrough smoke

Work top-to-bottom **as if running a real tour on a real deploy**. Mark each line ✓ / ✗ (+ a note on ✗).
**🔗 = carry-over check** — the "I entered it here, does it show/agree there?" class (your salary-rates problem).
Those are the priority. After every stage there's a **🗒️ free-notes** box for anything the checks missed.

**Before you start:** confirm you're on the current deploy (main `28ad177`+) and migrations 226–229 have run —
half of "unusable" is often stale code / unapplied schema.

---

## STAGE 0 — Login & land
- [ ] Log in → land somewhere sensible (workspace roster, not an error/blank)
- [ ] Top bar shows: workspace name, product nav, search, avatar — nothing duplicated or overlapping
- [ ] One "Live" indicator only (top-right) — no duplicate Live pills anywhere

🗒️ **Stage 0 free notes:**
> 
> 

## STAGE 1 — Workspace / roster
- [ ] Artists / Personnel / Equipment tabs all load
- [ ] Artists roster is scannable — you can tell who's active at a glance
- [ ] Clicking an artist enters their home cleanly
- 🔗 [ ] An artist's tours/personnel shown here match what's actually inside them

🗒️ **Stage 1 free notes:**
> 
> 

## STAGE 2 — Create a tour (the modal)
- [ ] "New Tour" opens the **modal** from every entry point you'd use (tours list, top bar, switcher, dashboard) — none 404
- [ ] Details: artist, name, dates, region, currency all enter cleanly (typing, date pickers, dropdowns)
- [ ] "Skip & create" with just name + dates works
- [ ] Routing step seeds one row per date; you can add/edit rows here
- [ ] Create → the tour actually opens
- 🔗 [ ] The name / dates / currency / region you typed all appear correctly on the tour once created
- 🔗 [ ] The routing you entered in the modal is there when you open the Routing tab

🗒️ **Stage 2 free notes:**
> 
> 

## STAGE 3 — Enter the tour / nav
- [ ] The two-bar nav (Home/Operations/Budget/Advance + sub-tabs) is clear about where you are
- [ ] Artist switcher + tour switcher work and don't lose your place
- [ ] Every sub-tab (Summary, Personnel, Routing, Channel list, Stage plot, Payroll, Rooming, Files, Riders) loads
- [ ] Back/forward and refresh keep you where you were (don't dump you to a landing)

🗒️ **Stage 3 free notes:**
> 
> 

## STAGE 4 — Routing
- [ ] Grid sits flat on the page; add / edit / delete a row works
- [ ] Venue field: type → library matches; pick → City/Country/Address/cap auto-fill
- [ ] Tab across cells / Enter to accept / type-to-search all behave (no lost focus, no eaten keystrokes)
- [ ] Cities are English + not blank on shows; manual address edit sticks and doesn't unlink
- [ ] Map view: branded pins, locked on zoom; Calendar view loads
- [ ] Save → reload → everything persisted
- 🔗 [ ] A venue you set here shows in the Advance (venue specs) and the Budget (city column) for that show

🗒️ **Stage 4 free notes:**
> 
> 

## STAGE 5 — Personnel / crew  ⚠️ RATES LIVE HERE — check EVERY entry point
- [ ] Add a person to the tour; set role, **role tag (incl. BAND)**, dates, status
- [ ] Manage slide-over: **list every field where you can type a rate/amount** (there should be ONE, not several)
- [ ] Swap works
- 🔗 [ ] **THE BIG ONE — write down every place a salary/rate can be entered** (slide-over simple Rate? Show/Travel/Per-diem block? "Copy from previous tour"? Payroll grid?) and whether a rate typed in ONE shows up in the others:
  - Entry point 1: __________________ → carries to: __________________
  - Entry point 2: __________________ → carries to: __________________
  - Entry point 3: __________________ → carries to: __________________
  - Entry point 4: __________________ → carries to: __________________
- 🔗 [ ] A person added here appears in Payroll, Rooming, and Advance rosters (same name/role, not duplicated)

🗒️ **Stage 5 free notes:**
> 
> 

## STAGE 6 — Payroll
- [ ] "Rates & Summary": rates grid is obviously editable; totals grid reads below
- [ ] Days matrix: day types come through from routing; editing a day updates totals
- [ ] Grid sits on the page (not a boxed window); headers formatted right
- 🔗 [ ] **A rate you set in Personnel shows here unchanged** (and vice-versa) — or note exactly where it diverges
- 🔗 [ ] Show/off/travel day counts here match the Routing day types
- 🔗 [ ] Payroll totals feed the Budget salary section (same numbers)

🗒️ **Stage 6 free notes:**
> 
> 

## STAGE 7 — Rooming
- [ ] Matrix / Nights / Cards all load; assign rooms works
- [ ] Nights: Single/Double/Triple spelled out; in→out = consecutive days; unassigned hotel shows city
- [ ] Room count is right (two singles = 2)
- 🔗 [ ] The roster here matches Personnel; the dates match the tour window / routing

🗒️ **Stage 7 free notes:**
> 
> 

## STAGE 8 — Budget: Income
- [ ] Each show row enters cleanly: cap (a count, no £), sell%, face, deal type/%, guarantee, fee%, FX
- [ ] Currency symbol only on locked cells; Projected vs Actual toggle works
- 🔗 [ ] Shows here match Routing (same venues/dates/cities); Guarantee carries Projected→Actual
- 🔗 [ ] FX: is it live or are you still typing rates manually? Note which

🗒️ **Stage 8 free notes:**
> 
> 

## STAGE 9 — Budget: Expenses
- [ ] Add / edit line items; assign to sections; collapse sections
- [ ] Section reorder saves (no error); Approve & lock works without a refresh
- [ ] Receipt drop / attach — does it exist / work?
- 🔗 [ ] Salary/payroll and per-diems here match Payroll; totals roll into Summary

🗒️ **Stage 9 free notes:**
> 
> 

## STAGE 10 — Budget: Summary + Settings
- [ ] Summary cards render (Net, expenses-by-section, per-show income, burn, overheads); Customize/Add card works
- [ ] Net matches the detailed P&L
- [ ] Settings: overheads, commissions, FX, projection defaults, sections all enter + save
- 🔗 [ ] Numbers on the Summary cards match Income + Expenses + Settings inputs

🗒️ **Stage 10 free notes:**
> 
> 

## STAGE 11 — Channel list
- [ ] Editable in place (dropdowns: mic/DI, phantom, position, stand, stage-box); Manage Stage I/O (patch grid) opens
- [ ] Artist-inherited list → "Override to edit here" behaves
- 🔗 [ ] A channel list added in a Rider and one on the tour tab reference the same data (no divergence)

🗒️ **Stage 11 free notes:**
> 
> 

## STAGE 12 — Stage plot
- [ ] Place / move / rotate items; new items default labels OFF; tick-boxes branded
- [ ] Icons look right + scale ft-true (v2 suite); export matches the canvas
- 🔗 [ ] The input list on the plot matches the Channel list

🗒️ **Stage 12 free notes:**
> 
> 

## STAGE 13 — Riders
- [ ] Create / open a rider pack; manage (rename/status/recipient/send/delete) from the click-open detail
- [ ] The builder canvas + sections work
- 🔗 [ ] Rider pulls the tour's stage plot / channel list / personnel correctly

🗒️ **Stage 13 free notes:**
> 
> 

## STAGE 14 — Advance
- [ ] Per-show advance form loads; fields enter + save
- [ ] Complete/Pending/Overdue tiles reflect real state; Send packet works
- [ ] Venue specs panel formatted right (no weird mono); left routing list usable
- 🔗 [ ] Venue info pre-fills from the linked venue; the show list matches Routing

🗒️ **Stage 14 free notes:**
> 
> 

## STAGE 15 — Files
- [ ] What's here today — does it do anything useful, or placeholder? Note what you'd need

🗒️ **Stage 15 free notes:**
> 
> 

## STAGE 16 — Exports (do each)
- [ ] Routing, Rooming, Payroll, Channel list, Stage plot, Budget → each exports a clean PDF
- 🔗 [ ] Each export matches what's on screen (city, venues, rates, totals, the plot image)

🗒️ **Stage 16 free notes:**
> 
> 

---

# CROSS-CUTTING (do these last — they catch the systemic stuff)

## A — Navigation, end to end
- [ ] Move Workspace → Artist → Tour → back, repeatedly — never get lost or dumped
- [ ] Every dropdown (product nav, switchers, settings) opens/closes cleanly, big enough target, doesn't snap shut
- [ ] No duplicated chrome (same nav/action showing 2–3×), no dead links, no 404s
- [ ] ⌘K search finds things and jumps correctly

🗒️ **Nav free notes:**
> 
> 

## B — SINGLE SOURCE OF TRUTH / carry-over audit  ⭐ THE PRIORITY
For each datum, list **every** place it's entered/shown and whether they agree. This is where "4 places for
rates" lives — repeat the pattern for anything else that feels duplicated.

| Datum | Every place it appears | Do they agree? | Where it diverges |
|---|---|---|---|
| Salary / rates | | | |
| Personnel (who's on tour) | | | |
| Venue / city | | | |
| Tour dates | | | |
| Currency | | | |
| Show / day types | | | |
| (add your own) | | | |

🗒️ **Carry-over free notes:**
> 
> 

## C — Data-entry mechanics (across all grids)
- [ ] Tab / arrow / Enter move predictably; typing never gets eaten or lost
- [ ] Copy/paste works; edits persist on reload (no silent loss)
- [ ] Focus doesn't jump; no double-save / stale-value flashes

🗒️ **Entry-mechanics free notes:**
> 
> 

---

**When you've walked it:** hand this back filled in. I'll turn the ✗s + free notes into a prioritized fix
plan — carry-over/data-integrity bugs first (they're the "unusable" ones), then entry, then nav polish —
and we fix in batches, re-driving the affected stages after each. No new features until this reads clean.
