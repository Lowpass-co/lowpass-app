# CC — Rebuild Rooming Matrix + Payroll Days matrix **ON the canonical `<Grid>`** (with "wide mode")

**Supersedes the earlier "render transpose" framing.** Adam's complaint: the rooming
+ payroll matrices look old/ugly/inconsistent and **lost drag-to-select + the design
cues**. Root cause: they were **never built on `<Grid>`** — they're bespoke
hand-rolled grids (`spreadsheet-view` `InlineEditCell` + manual CSS) that borrowed a
few tokens + `RailNightCell`. Re-skinning the lookalikes is what produced the drift.

**The fix Adam chose: rebuild both matrices AS canonical `<Grid>` instances**, which
also delivers the people-on-left orientation for free, because `<Grid>` is
rows × typed-columns:
- **rows = people** (frozen left); **columns = days** (one `dropdown` Column per
  routing date, `id` = day id, `options` = ROOM_OPTIONS / DAY_OPTIONS,
  `optColors` = the existing tints → render as the cell fill, confirmed `Grid.tsx:1386`).
- cell value = `row[dayId]`; native **drag-select** (the `Sel` range model), ring,
  insertion line, tokens — all inherited.

## The catch you must solve first — `<Grid>` "wide mode"
`<Grid>` was built for the budget's ~10 on-screen columns. It has **no frozen-first-
column, no horizontal scroll, no column grouping** today (verified — grep found none).
A people × 60-day matrix needs:
1. **Horizontal scroll + a frozen first column** (person names stay visible).
2. **Payroll week bands** — `<Grid>` groups ROWS (`GroupBy = section|status`), not
   columns. Weeks can't be spanning column-headers without new work.

So this job **extends `<Grid>`**. ⚠ `<Grid>` is the component the **verified-good
budget grid** depends on — wide mode MUST be **additive / opt-in** (only active when
columns overflow, which budget never does) so the budget grid is byte-for-byte
unchanged. That invariant is the whole risk surface.

## What stays free (don't rebuild it)
Writes still go through `useRoomingGrid` / `usePayrollGrid` — cells keyed by **ids**
(`saveCell(night,person)` / `saveDayStatus(...)`), so the budget feeds (Accommodation,
Salary), shared-room letter logic, day-type tints, off-roster, the £0/non-£0 reconcile
— all unchanged. Only the VIEW layer is rebuilt.

## ⛔ Gated: Stage A (map, no code) → review → Stage B

### Stage A — map (NO code) → `docs/handover/MATRIX_ON_GRID_MAP.md`
1. **`<Grid>` internals**: how columns render + lay out today (CSS? fixed widths?),
   where a frozen-first-column + horizontal-scroll + (optional) column-band header
   would slot in, and — critically — **prove wide mode can be additive** (a flag/prop
   that budget never sets, leaving budget's render path untouched). If it CAN'T be
   additive without reworking budget's layout, **stop and say so** — that changes the
   cost and Adam re-decides.
2. **Express each matrix as `<Grid>` props**: rows = people (incl. off-roster ✕ as
   rows now), day `dropdown` columns w/ optColor tints, frozen person column. Map the
   binding from the id-keyed hooks (`cellOf`/`statusOf` → `row[dayId]`;
   edit → `saveCell`/`saveDayStatus`).
3. **The two hard bits** — give Adam the options + a recommendation:
   - **Week bands (payroll)**: build real column-grouping vs degrade to a week label
     in each day-header. (Recommend the lighter one unless grouping is cheap.)
   - **Footer totals**: rooming "Rooms per night" was a left-rail row → now a
     **per-column** footer (sums down each day). How does `<Grid>` show a footer/
     summary row? (Budget has section + tour totals — reuse or extend.)
4. Confirm `RailNightCell` is only the left rail in these two (grep) so dropping it
   here doesn't touch `RoutingRail` / advance / Cards / Nights.
5. Decisions + recommendation. Then stop.

### Stage B — build (after the map is approved)
1. Add the additive **wide mode** to `<Grid>` (h-scroll + frozen first column + the
   chosen week-band treatment). Budget grid unchanged — prove it.
2. Rebuild `RoomingMatrix` + `PayrollDaysMatrix` as `<Grid>` instances: people rows,
   day dropdown columns w/ tints, frozen person column, per-column footer totals,
   week treatment, off-roster rows. Bind to the existing id-keyed hooks.
3. Preserve every behaviour + both budget feeds + shared-room counting + week grouping
   + day-type/room-code tints + off-roster add/remove + assumed-rate/est-total.

## Hard rules
- **Budget grid must not regress.** It's the load-bearing verified surface; wide mode
  is opt-in and budget must render identically. Name the budget files you confirm
  unchanged.
- Don't touch `RoutingRail.tsx` or its other consumers (advance, routing, Cards, Nights).
- Tokens; `next build --webpack`; tsc 0; eslint 0.
- **Verify before claiming** — name files/lines; mark build vs needs-live. I
  Chrome-verify on the preview: drag-to-select works, people are rows + days are
  columns, the tints fill cells, frozen person column + horizontal scroll, cells write
  + persist, budget Accommodation/Salary feeds unchanged, week grouping + shared-room
  counting intact — AND the budget grid is visually/behaviourally unchanged.
- Land smoke IDs + add Adam's manual smokes to `SMOKE_QUEUE.md`.
