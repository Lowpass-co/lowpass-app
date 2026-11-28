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
