# CC — S1: SPACES (assets unification). SINGLE OWNER. DISCOVERY-FIRST — STOP AFTER STAGE A.

Adam's ruling (2026-07-19): "Unify under Spaces — one spine: Spaces (locker/vehicle/venue) → Containers → Items, with gear and rental_inventory merged onto it. Kills the dual inventory." Context: `docs/design/COMPETITIVE_GAMEPLAN_ATOM_2026-07-19.md` §8 and the topology audit summarized below.

## Ground truth (verified 2026-07-19, evidence in the audit)
- `gear` (052): workspace-scoped, tour-independent, ownership enum, serial — NO location, NO grouping, NO weight/dims/value.
- `tour_gear` (052): true M:N link + per-tour overrides, UNIQUE(tour_id, gear_id); derived budget lines for `hired_to_client` via `api/gear/[id]/route.ts:146-177`.
- `rental_inventory` (092/093/095): workspace-scoped since 095 (canonical RLS — the "unaudited user-scoped" note in old docs is STALE); carries the physical/carnet fields: `weight_kg`, `value_amount`, `dimensions_cm`, `country_of_origin`, `customs_hs_code`, `qr_token`, status enum.
- `rental_jobs`/`rental_job_items` (092): jobs billing; `rental_job_items.inventory_id` is **ON DELETE RESTRICT** — this constrains any merge.
- `rental_movements` (094): scan log (scan_out/scan_in/repair/lost) with NO location column — its own header comment promises a "where" that doesn't exist.
- Bridge: `gear.rental_inventory_id` (057), optional, manual, no backfill.
- Two disconnected UIs: `/equipment` (rental tables, queries tables DIRECTLY — registry bypass) and `GearLibraryClient` (gear/tour_gear, workspace + tour instances). Known rough edges: quantity hardcoded 1 on add-to-tour, `window.prompt` for bulk ownership, dead search query state, tour filter done in JS post-fetch (silent truncation at limit 300).

## Target topology
```
spaces (workspace-scoped: warehouse | vehicle | locker | venue | other; name, preset/custom dims, notes)
  └─ containers (space_id nullable FK; case/cart/box; name, dims, weight_empty)
       └─ ITEMS = canonical gear (ONE item table)
            ├─ container_id nullable FK, space_id nullable FK (direct placement w/o container)
            ├─ physical/carnet columns MOVED UP from rental_inventory
            ├─ tour_gear (unchanged: assignment to tours + budget derivation)
            └─ movements (rental_movements extended with from/to space|container — the missing "where")
rental_jobs / rental_job_items → re-pointed at gear items (the rental BUSINESS stays; only the duplicate INVENTORY dies)
```
Weight/value rollups computed at read time per container/space/tour. "Unassigned" is the null-space bucket (their dashboard grammar — steal it).

## Stage A — DISCOVERY + MIGRATION PLAN (then STOP for Adam's sign-off)
This merge touches an ON DELETE RESTRICT FK, live budget derivation, and possibly real production rows. Before writing any migration: count rows in both inventories (Adam runs the count SQL you provide), map every reader/writer of `rental_inventory` (components, API routes, PDFs), decide linked-row merge semantics (gear rows with `rental_inventory_id` set = same physical item — merge; unlinked rental rows = insert as new gear), and produce the numbered migration plan (numbers ≥ next free after D1's; verify). Deliver the plan + row counts + reader map, THEN WAIT. Migrations are hand-pasted; nothing is applied until Adam says "pasted."

## Stage B — Schema (post-sign-off)
Spaces + containers tables (canonical 4-policy RLS, `get_my_workspace_id()`); physical/carnet columns added to `gear`; backfill from linked rental rows; unlinked rental rows inserted as gear (keep `rental_inventory_id` as provenance during transition); `rental_job_items` gains `gear_id`, backfilled, old FK retired only after verification; movements gain `from_space_id/to_space_id/from_container_id/to_container_id`. All idempotent, down-blocks, guarded UPDATEs.

## Stage C — UI
One Assets surface replacing BOTH `/equipment` inventory tab and the gear library: dashboard (Spaces/Containers/Items/Total weight KPIs + Unassigned bucket), space/container tree, item table (DataTable, registry-routed — kill the direct table queries and the audit's rough edges: real quantity picker, StyledSelect not window.prompt, SQL-side tour filter), **move flow** (select items → move to space/container/tour — the "populate a storage locker and then move it to the tour" flow Adam loved), rental Jobs tab survives pointing at unified items.

## Stage D — Flows + exports
- Storage/vehicle costs: a space can carry a monthly/tour cost → derived budget line on the tour using it (EXTEND the existing tour_gear derivation pattern in `api/gear/[id]/route.ts` — do not invent a second derivation path).
- Exports through shared shell: Gear Manifest PDF (per space/container/tour, weights) + **ATA Carnet PDF/CSV** (the 093 fields, general-list format).
- AI bulk import (CSV/XLSX/photo of a gear list → proposed items) through the EXISTING review-queue grammar — proposals, never direct writes.
- QR: `qr_token` scan → move dialog (movements get their "where").

## Smokes
SPC-01 create space→container→item, weight rolls up · SPC-02 move locker→tour, tour gear list + budget line reflect · SPC-03 unassigned bucket accurate · SPC-04 rental job still bills against merged item · SPC-05 carnet export carries HS/origin/value/weight · SPC-06 bulk import proposes, reject leaves no rows.

## Gates
Stage A STOP is hard. Money gate: budget derivation harness/greps re-run after Stage D. RLS: new tables canonical pattern; confirm live `rental_*` policies match 095 in production (the docs contradicted the migrations once already). Git evidence raw. Cowork walks per stage.
