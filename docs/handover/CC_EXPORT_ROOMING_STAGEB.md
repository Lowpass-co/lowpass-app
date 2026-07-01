# CC — Document Export: **Rooming** slice. Stage B: GO. Branch off `feat/export-budget`.

The Budget slice + the shared shell are built (`feat/export-budget`). Build the **Rooming** PDF on that
same shell — second of the four surfaces. **Branch off `feat/export-budget`** (you need `shell.ts` +
`logo.ts` + the route pattern from that branch; it isn't on `main` yet). Branch name `feat/export-rooming`.

## Locked (from EXPORT_MAP.md §3B + the sign-off)
- **Standard hotel rooming-list format** — the doc you email a hotel. **Grouped by hotel + date range**,
  rows = **guest · room type · check-in · check-out · # nights**.
- **Branded A4**, same shell as Budget (artist/tour/logo letterhead, Lowpass footer) — **reuse `shell.ts`
  as-is, do not modify it** (it's shared infra; budget-specific assumptions stay out).
- Data source (map §3B, confirmed real): `hotels` / `rooms` / `room_assignments` (migration `051` — hotel
  is first-class; `check_in_at` / `check_out_at` / `room_type` all exist) + the guest (person). **Legacy
  `rooming_grid` is do-not-use.**

## Build
1. **`src/lib/export/rooming-pdf.ts` — `buildRoomingBodyHtml(data)`**: the hotel-grouped table (per hotel:
   name + address + date span, then guest rows: guest · room type · check-in · check-out · nights). Nights
   derive from check-in/out. Use the shell's shared table primitives + tokens.
2. **`loadRoomingExportData(tourId)`** — mirror the rooming page's own loaders (so the export matches what
   the Rooming surface shows). Read-only.
3. **`POST /api/rooming/[tourId]/export/pdf`** (match wherever the rooming product routes live) — auth →
   workspace-RLS (foreign tour 404s) → load → `buildRoomingBodyHtml` → `shell.renderDocument(...)` →
   `getBrowser()` → stream `application/pdf`, filename `<Artist> — <Tour> — Rooming.pdf`. **Reuse the exact
   route pattern from the Budget slice.**
4. **UI** — a "Branded PDF…" export action on the Rooming surface (reuse the Budget slice's
   `ExportDialog`/control pattern; no scope toggle needed here unless rooming has an obvious one — keep it
   simple, a single Download).

## Hard rules
- **Branch off `feat/export-budget`. Commit + PUSH. Confirm `git log origin/<branch>` before reporting.**
- **Reuse `shell.ts` unchanged** — if you find yourself wanting to edit it for rooming, stop and flag it
  (the shell must stay generic for Payroll/Routing too).
- **Read-only**; **workspace RLS** (a foreign-workspace tour 404s; rooming is PII — no cross-workspace
  leak). No migration.
- Tokens (`var(--lp-*)`); `next build --webpack`; `tsc` 0; `eslint` 0. Smoke `EXP-ROOM-01..` in `budget.md`
  (or a rooming smoke file): the PDF lists guests grouped by hotel with room type + dates + nights; a
  foreign-workspace tour is gated.
- **Verify before claiming** — name files/lines; push the hash. (Render proof is Adam's download, same as
  Budget — the puppeteer pipeline is shared, so if the Budget PDF renders, this one does too.)
