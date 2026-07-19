# ATOM Interstate — internal renders (walked live, 2026-07-19)

Addendum to `COMPETITIVE_ATOM_2026-07-18.md`, which was written off the marketing flow map. This one is from **inside the running product**.

## The source — go look yourself
`https://demo.atominterstate.app/community-demo.html` — a real read-only account ("Liquid Elvis", Late Summer '26 leg), no login. It lands in Community, but the **module switcher (top-left pill next to the ATOM mark)** moves between Tour, Money and Production, and direct URLs work: `/app/tourbook`, `/app/money`, `/app/production`, plus sub-routes like `/app/money/payroll`, `/app/money/reports`, `/app/production/assets`. Marketing snapshot is dated June 11 2026; the paid tools are gated behind "Request paid-tools access", so this demo is the only way to see them.

There is also a second, fuller wiring diagram at `/atom-interstate-flow.html` distinct from the `atom-flow.html` Adam sent.

## Chrome / IA — how they structure it
Thin top bar: ATOM mark · **module pill** (Money / Tour / Production) · **artist selector** (Liquid Elvis) · **leg selector** (Late Summer '26). Then a narrow per-module left rail. So: module switch on top, sections in the rail — the inverse of where we landed (grouped horizontal row, no rail). Theirs scales to twenty modules; ours reads cleaner at eight. Not obviously better, but worth knowing it's a deliberate fork in the road.

**The leg selector is the thing we don't have.** Every money surface is scoped to a leg, and payroll additionally takes explicit START/END dates. We scope everything to a whole tour.

## Money — rails: Overview · Cash · Per Diem · Cash Requests · Reimbursements · Budget · Expenses · Settlements · Payroll · Tools · Reports · Settings · Import

**Foreign withholding tax panel, pinned above every Money page.** A table of the countries on this tour with withholding rate, a complexity rating, and an application note: United Kingdom 20.0% · MODERATE · "FEU — Foreign Entertainers Unit. Reduced rate possible via advance application"; France 15.0% · FAST · "TVA + retenue à la source — file via promoter"; Germany 15.5% · HIGH · "Notoriously complex — §50a EStG. Reduced rates possible via ETT application (BZSt), file the show." Header line: *"Each foreign country withholds tax on its gross at settlement. Treaty rates, advance filings, and business-management coordination can reduce or eliminate — but only if filed before the show. Plan ahead."*

My earlier audit called withholding "absent" on our side and scored it as an itemized-deductions gap. That undersells it. This is **pre-tour tax planning surfaced as a permanent banner**, not a settlement line item. For a UK-based product selling to artists touring the EU, this is the single most defensible thing on their Money module. Fragile claim, flag it: I have not verified their rates are current or correct — the German §50a and UK FEU references are real mechanisms, but treat the specific percentages as their editorial, not as fact.

**Budget builder** — three columns, **Annual / This Leg / Custom**, each with projected income over actual. Below, a CATEGORY table with **CONTRACTED and SETTLED** columns, and every line carries an **AUTO or Manual provenance chip**. INCOME: Show Guarantees (AUTO, $0.00 → $63,075.00, "45 confirmed shows · itemized"), Merch Projections (Manual), Production Reimbursements (Manual), Sponsorship/Other (Manual). FIXED COSTS: Bus/Ground (AUTO), Trucking (Manual), Flights (AUTO), Insurance.

Above it: a **Travel & Fuel panel marked `AUTO-PULLS FROM TRAVEL`** whose empty state reads *"Nothing to pull yet. Add ground trips on the Travel tab (or save a bus quote on Bus) and the numbers land here automatically. → Open Travel."*

We *have* provenance — it's an 18-check harness — but it's invisible. They turned the same idea into a chip on every row and a named cross-module pull. **Surfacing our provenance as a per-line chip is nearly free and is the clearest way to make the money model's rigour legible to a buyer.**

**Payroll** — the direct comparison to G2-1. LEG selector + START / END date pickers. Toolbar: "16 days · 4 crew", a Day types legend, a count toggle, Save, and **Finalize** as the primary blue action. Grid: crew column showing **name · role · rate inline** ("$150/day", "$500/day"), then narrow uniform day columns (TUE 14, WED 15, …) of em-dash placeholders, TOTAL right-aligned.

Two things they do that we don't: **the rate lives in the matrix's left block**, so you never open the rates table to know what a cell is worth — that is a direct answer to Adam's "the rates needs to be obvious, at the minute it's super flat"; and **Finalize** is an explicit lock/commit step. Their rows are *tighter* than ours (~31px vs our 52px) — our grid is now the more generous of the two, which vindicates G2-2b.

They also run our day-type ruling: a banner reads *"51 days need a type — label them so pay counts are exact"* with Assign types / Later. Same invariant, same nudge. Ruling "A" was right.

**Settlements** — KPI strip (Outstanding balance · Settled · Not settled · Awaiting payment · **Needs payment details** · Unsettled shows 70 of 72), then a **"Catch-up — 32 shows played, not settled"** panel: checkbox list of shows with dates and venues, Select all, Settle. The backlog is rendered as an actionable batch queue rather than a number. Cheap to copy, high perceived competence.

**Per Diem** — not a budget category but a **Per Diem Request object**: daily rate $/day, "14 on tour", a period (FROM/TO), department filter pills (All 18 / C 15 / D 3), and a two-column avatar roster grouped CREW/PRODUCTION and DRIVERS with per-person checkboxes, plus a Bulk Tour action. This is P1 #4 on our list and their shape is a good one to steal wholesale.

**Reports — this is "Atom Docs", and it's mostly XLSX, not PDF.** Cards: Expense Report (Download XLSX) · Settlement Report (Download XLSX) · **Tour Accounting Workbook (XLSX)** with export options (leg, USD-only, checkboxes for Credit Card / Show Settlements / Itinerary / Per Diem / Merch) and a Preview · **Import Tour Accounting Workbook (Upload XLSX)** — *"Already have a workbook from a previous tour, month, or accountant? We'll pull in Income, Cash Expenses, Credit Card Expenses, and Per Diem rows — you select to keep, duplicates flagged"* · Email Expense Summary · Full Tour Report (Preview / Print / Save PDF) · Cash Flow Report (Cash in $21,500.00 / Cash out $0.00 / Net +$21,500.00, exportable).

**The round-trip is the insight.** Export an accounting workbook, hand it to the business manager, take their edited version back in with duplicate flagging. Tour accountants live in Excel and will not stop. We ship eight PDF types and zero XLSX. PDFs are terminal documents; a workbook is a conversation. This is a bigger gap than the settlement PDF I ranked at P1 #2, and we already have the `xlsx` tooling to close it.

## Production — rails: Overview · Advance · Meals · Show Sheet · Assets · Stage Plot · Parking · Driver

Overview is a six-card launcher: Advance · Assets · Stage Plot · Parking · Driver · **Brand & Logos** (*"Tour-approved logo library — crisp, vector, and set the marks that appear on every document"*).

Brand & Logos is small, cheap, and we're already most of the way there — we hold artist-level logos. Making one library that stamps every generated document is a half-day of work for a disproportionate "this is a real product" signal.

**Advance** — a month calendar of shows, each with a status chip (NOT STARTED) and "Tap to advance", with counts per month ("10 shows · 10 to start") and a "Show 32 past dates" toggle. Above it a **PLAN THE RUN** panel: **Market** (*"turn your rider into a real shopping list"*) · **Openers** (opening acts, their contacts and files) · **Crew Brief** (*"send your crew the ready day plan"*).

Rider → shopping list is the kind of feature a working TM invents and a product manager never would. Their advance is a *tracker* over shows; ours is a deeper *builder* per show. We win on depth, they win on run-level overview. A per-tour advance status calendar is a modest add on top of what we have.

**Assets** — KPI strip: Spaces · Containers · Items · **Total weight**. Quick actions: **Bulk Import** (*"Drop a CSV / XLSX gear list, roster, or invoice — AI parses to preset rows for review"*), Add Space, **Export Gear List** (CSV, insured-only, hardened Gear Manifest PDF, or **ATA Carnet PDF for customs**). Empty state is a numbered walkthrough: Create a Space → Add Containers → Add Items → Move + Visualize (*"drag items between spaces, switch to Map or 3D to see the load, ⌘K to find anything by name"*).

**ATA Carnet export** is the serious one — it's the customs document for touring gear across borders, and generating it from inventory you already hold is exactly the kind of thing that closes a sale to a TM doing EU runs. Their AI bulk import also uses the same review-queue grammar we already built for intake.

## Corrections to yesterday's audit
1. **Withholding** is not "a missing deductions field" — it's a pinned per-country planning panel. Upgrade the gap's severity.
2. **"Atom Docs = every input becomes a PDF"** was wrong, taken from marketing. In the product it's **XLSX-first with a round-trip import**. Our PDF-only export story is further behind than I scored it.
3. **Their payroll grid is tighter than ours post-G2-2b**, not looser. We're ahead on grid quality now.
4. Add to the P1 list, above the settlement PDF: **XLSX workbook export + import**, and **provenance chips on budget lines** (nearly free, we already compute it).

## What I'd steal, ranked by value ÷ cost
1. **Provenance chips (AUTO / Manual) on every budget line** — we already have the data; this is presentation only.
2. **Rate inline in the payroll matrix left block** — closes Adam's "rates are flat" note without reopening the rates table.
3. **Settlement catch-up queue** — render the unsettled backlog as a checkbox batch, not a count.
4. **XLSX accounting workbook, export then import with duplicate flagging** — the accountant's actual workflow.
5. **Per-diem request object** (period + department-grouped roster multi-select) — their shape, our P1 #4.
6. **Brand & Logos library stamped onto every document.**
7. **Withholding panel** — needs real tax data behind it; the UI is the easy half. Do not ship guessed rates.
8. **ATA Carnet / gear manifest export** — later, but it's a closer for European touring.

## On the visuals (Adam: "it's good! I love it!")
Worth being precise about what's actually good, because it isn't restraint. Their palette is *more* saturated than ours — cyan, violet, magenta, amber gradients on cards, gradient hero panels, coloured module chips. What makes it read as premium is not the hue count, it's that **every colour is bound to a module identity** (Money, Tour, Production, Community each own a hue and keep it everywhere), and that **the empty states are invitations with a next action** rather than dead ends: "Nothing in JULY — tour picks up Aug 7. Jump straight to the next show, or add a date here." Our F2 backlog already has an empty-state invitation sweep; this is the bar for it.

The one they beat us on outright is **nudge banners tied to data quality** — "12 items to review · 12 shows missing a guarantee", "51 days need a type — label them so pay counts are exact". Each is a one-line diagnosis plus a fix button. We have the derivations to generate these already.
