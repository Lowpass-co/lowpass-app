# Smoke tests — Rental (Gear & rentals · job builder)

Workspace › Gear & rentals (`/assets`) is the stock; Rental jobs
(`/equipment`) is the job builder. Phase 1 (Nov 2026) needs migration 306.

#### RNT-01 — New stock goes on a job
Gear & rentals › add an item → open it → Rental: Quantity owned 40, Purchase
cost 250. Open a rental job → Add items: the new item is in the list ("· 40
owned"). Add 12 → it's on the quote. (Before: anything added since stock
moved to Assets never appeared in the picker.)

#### RNT-02 — Day rate from the purchase cost
That item's day rate on the quote is 3% of its purchase cost ($7.50) unless a
day rate was typed in its Rental section. Typing one overrides it; clearing it
goes back to 3%.

#### RNT-03 — Adding again adds to the quantity
Add the same item again (8): one line, quantity 20 — never two lines.

#### RNT-04 — Week pricing
A job 1 Dec → 6 Dec (6 days) bills 3 days, the same as 7 days (it used to bill
6). 1 → 9 Dec bills 5. On the job, "A week is charged as" → 4 days: the
billable days and total change; the PDF says the same. The page header's
"A week is charged as" sets the default for jobs that haven't chosen.

#### RNT-05 — Saves are real
Change status to Confirmed with the network off: an error shows and the status
goes back (it used to show Confirmed anyway). Opening a job writes nothing
(the discount used to save on every open).

#### RNT-06 — Nobody else's stock or jobs
A job id or stock id from another workspace in a request → 404 / "isn't in
your stock". Nothing is written.
