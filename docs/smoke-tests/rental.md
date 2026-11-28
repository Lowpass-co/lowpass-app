# Smoke tests — Rental (Gear & rentals · job builder)

Workspace › Gear & rentals (`/assets`) is the stock; Rental jobs
(`/equipment`) is the job builder. Phase 1 (Nov 2026) needs migration 306.

#### RNT-01 — New stock goes on a job
Gear & rentals › add an item → open it → Rental: Quantity owned 40, Purchase
cost 250. Open a rental job → type its name in Add gear: it's in the results ("40
owned"). Type "12 <name>", Enter → it's on the quote. (Before: anything added since stock
moved to Assets never appeared in the picker.)

#### RNT-02 — Day rate from the purchase cost
That item's day rate on the quote is 3% of its purchase cost ($7.50) unless a
day rate was typed in its Rental section. Typing one overrides it; clearing it
goes back to 3%.

#### RNT-03 — Adding again adds to the quantity
Add the same item again (8): one line, quantity 20 — never two lines.

#### RNT-04 — Week pricing
A job 1 Dec → 6 Dec (6 days) bills 3 days, the same as 7 days (it used to bill
6). 1 → 9 Dec bills 5. On the job, the rail's "A week is" → 4 days: the
billable days and total change; the PDF says "a week is charged as 4 days".
Rental jobs › Settings › "A week is charged as" sets the default for jobs that
haven't chosen.

#### RNT-05 — Saves are real
Change status to Confirmed with the network off: an error shows and the status
goes back (it used to show Confirmed anyway). Opening a job writes nothing
(the discount used to save on every open).

#### RNT-06 — Nobody else's stock or jobs
A job id or stock id from another workspace in a request → 404 / "isn't in
your stock". Nothing is written.

## Visual pass (Nov 2026) — needs 306 + 307

#### RNT-07 — Add gear from the keyboard
On a job press `/`: the Add gear box takes focus. Type "sm5", ↓, Enter → one
SM58 added, the box stays focused and empty. "8 sm58" shows "Adds 8"; Enter
adds 8 to the same line. Esc clears, Esc again leaves. Retired stock isn't
offered (unless it's already on the job).

#### RNT-08 — Lines grouped by category
Lines sit under their category (Audio, Lighting, … then any other category
A–Z, then Other), each heading with its subtotal. The rail's Total = Σ group
subtotals − discount. Change a line's rate → "custom rate" beside it;
right-click → Reset to the item's rate clears it.

#### RNT-09 — Status is the pill
Click the status pill under the title → pick Confirmed. On a GBP draft the
rate freezes (rail: "· frozen"); Show in is locked. With the network off the
pill goes back and an error shows.

#### RNT-10 — Jobs list by month, or by status
Rental jobs: groups by month of the start date — this month first, soonest at
the top, then later months, then earlier months (newest first), undated last.
Each heading shows the count and the sum. Group by › Status regroups Draft →
Completed and is remembered on reload. The status chips filter; search finds
client and artist names. Every row shows its total.

#### RNT-11 — Quote PDF
Export a Draft: header "Valid until" = today + 14 days (Settings › Quotes are
valid for changes it), lines grouped with subtotals, the period says "N days
billed · a week is charged as N days" with the JOB'S week (it used to say "3-day
week" whatever), footer "Page 1 of N" on every page. An Invoice has no
Valid until.

#### RNT-12 — Payment details are optional
Settings › Payment details empty → the export menu's "Payment details" is off
and says where to add them. Type them, Save → on an Invoice the tick is on by
default, on a Quote off; ticked, they print under the totals as typed.

#### RNT-13 — Before 307 is pasted
Rental jobs and the PDF work (valid 14 days, no payment details); Settings ›
Save says "Paste migration 307 first."

#### RNT-14 — Editing a line saves however you leave it
On a job, click a line's Qty, type 34, then click another cell (or anywhere
off the table): it saves 34 on THAT line and the editor closes — the number
doesn't follow the click. Same for Day rate. Enter and Tab still save too.

#### RNT-15 — Remove, one more, one fewer
Each line has an × at the right: it comes off the job. Right-click a line:
One more / One fewer (when > 1) / Reset to the item's rate (custom rates) /
Remove from job (red, last). The menu closes on a click elsewhere or Esc.

#### RNT-16 — Right-click the lists
Rental jobs: right-click a job → Open · Edit details · Duplicate (a copy with
its lines, "(copy)") · Mark … (every other status; a GBP draft freezes its
rate) · Delete job (asks). Gear & rentals: right-click an item → Open · Move…
· Mark available / in use / maintenance / retired.

## Stock (Gear & rentals) — Nov 2026

#### RNT-17 — Add an item, looked up online
Gear & rentals › New item. Type "AKG C414 XLII" in Look it up online → Look
it up: within ~20 s the blanks fill (name, make, model, Audio, a description
in Notes, retail value, weight, size) and a photo appears; "Filled the blanks
from …" names the sites. A USD retail price also fills Purchase cost, so the
day rate shows "$… · 3%". Add to stock → it's in the list under Audio and
the panel stays open on it. Type a name first, then look up: your name stays.
(No ANTHROPIC_API_KEY → "Online lookup isn't set up"; web search not enabled
on the key → it says so.)

#### RNT-18 — Photo
On an item: drop a JPEG on the photo box, or click it and choose one → it
shows, and the list row shows it. Link → paste a product page → its photo is
copied in. Remove clears it. A .svg or a renamed text file is refused.

#### RNT-19 — Status, retire, delete
The panel's Status (Available · In use · Maintenance · Retired) saves as you
tap; the pill in the header follows. Retired items aren't offered by a job's
Add gear. Delete on an item never used on a job → gone (with its photo).
Delete on one that's been on a job → "It's on N job lines… retire it
instead" with a Retire it button. Right-click a row → Delete does the same.

#### RNT-20 — Import
Import › paste "8 x SM58\n2 x Beta 91A\nAvid S6L" → three rows (8, 2, 1).
Paste cells with a header (Item, Qty, Category, Cost…) → "Columns: Name, Qty,
Category, Cost"; totals rows skipped. A name already in stock comes unticked
("already in stock"). Add N items → they're in the list with those quantities.

#### RNT-21 — The page
Full width; facts line "N items · N pieces · N kg · N spaces"; items grouped by
category (Group by › Place regroups); status chips with counts; the place
menu filters (a space includes its containers) and makes New space / New
container. Tick items across groups → one bar: Move… · Mark … · Retire · Clear.
Every column fits at 1280 px wide (no cut-off Weight / Place).

#### RNT-22 — The panel
Labelled fields; no ids anywhere; tours listed by name. Typing saves
(SaveStatus pill); Cancel puts back what it was when you opened it; Done
closes.
