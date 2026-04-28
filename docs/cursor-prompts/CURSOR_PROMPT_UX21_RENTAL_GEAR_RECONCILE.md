# UX21 — Rental Inventory ↔ Gear Canonical Reconciliation

> **Deferred follow-up.** Wires together two modules that were built independently: the standalone Rental Business module (`/equipment` — `rental_inventory` + `rental_jobs` + `rental_job_items` + branded PDF export) and the canonical Gear entity introduced in UX12. **Both tables stay intact.** This prompt adds the connecting tissue, no schema collapses.

---

## 0. Context for Cursor

Read first:

1. `CLAUDE.md` at repo root.
2. `database/migrations/README.md` — pick the next sequential migration number above the highest in `main`.
3. `docs/cursor-prompts/UX_OVERHAUL_ROADMAP.md` — section 4 (relational data model), section 4.4 (Gear ownership rule).
4. `docs/cursor-prompts/CURSOR_PROMPT_UX12_GEAR_CANONICAL.md` — the canonical Gear entity, with the `ownership` enum (`owned` / `sub_hired` / `hired_to_client`).
5. The rental module:
   - `src/app/(app)/equipment/page.tsx`
   - `src/components/equipment/*` (EquipmentClient, JobsTab, JobDetail, JobModal, InventoryTab, exportJobPdf, types.ts)
   - `src/lib/rental-pricing.ts`
   - `database/migrations/035_rental_jobs_billing_details.sql` and the original rental_inventory migration
6. Confirm UX08b–UX20 are merged before starting (UX21 is the very last item in the chain).

---

## 1. Why this prompt exists

There are now **two distinct gear concepts** in Lowpass, both of which are correct:

| Module | Table(s) | Mental model |
|--------|---------|--------------|
| Rental business (`/equipment`) | `rental_inventory`, `rental_jobs`, `rental_job_items` | "Gear we **own as a rental house** and ship to clients. Has day-rate, weight, serial, image. Generates invoices." |
| Tour-side gear (UX12) | `gear`, `tour_gear` | "Gear **deployed on a tour**, with ownership status (owned / sub_hired / hired_to_client). Referenced by Channel List, Stage Plot. May or may not be from our own rental inventory." |

These are different lifecycles, different consumers, and different audiences. **Don't merge them.** They legitimately need to coexist.

What's missing is the **bridge** — when the user adds gear to a tour and they own it via the rental business, they should be able to pick from `rental_inventory` and have the system know:
- Channel List references the canonical Gear record
- The Gear record is linked back to the underlying `rental_inventory` row
- If that gear is on a rental_job for the same tour, it doesn't double-count anywhere

This prompt adds that bridge.

---

## 2. Hard rules

1. **No schema collapses.** `rental_inventory`, `rental_jobs`, `rental_job_items`, `gear`, `tour_gear` all stay. This is a linking exercise.
2. **One migration** at `database/migrations/NNN_rental_gear_link.sql`. Adds nullable FKs only, no destructive changes. Pick the next sequential number per `database/migrations/README.md` (probably 054+ depending on what UX14 took).
3. **No new dependencies.**
4. **Use existing RLS helpers** (`public.get_my_workspace_id()`, `public.is_workspace_admin()`).
5. **Don't change the rental PDF export's appearance.** Aesthetic stays exactly as-is. We're only changing how it sources gear data when a link is present.
6. **Don't redesign `/equipment` UI.** This prompt adds an "Add to a tour" affordance and a "Source: rental inventory" indicator, nothing more.
7. **Don't change Channel List behaviour.** Gear picker (already wired in UX08 + UX12 + UX15) gains the ability to surface rental_inventory as a source, not a different picker.
8. Lint + typecheck clean.

---

## 3. Step 1 — Schema bridge

File: `database/migrations/NNN_rental_gear_link.sql` (NNN = next sequential after current highest on main).

```sql
-- ============================================
-- LOWPASS — Rental inventory ↔ Gear canonical bridge
-- Migration NNN
-- ============================================

-- Link a canonical Gear record to its underlying rental_inventory row, if any.
ALTER TABLE public.gear
  ADD COLUMN IF NOT EXISTS rental_inventory_id uuid
    REFERENCES public.rental_inventory(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS gear_rental_inventory_id_idx
  ON public.gear(rental_inventory_id);

-- (Optional, depends on whether rental_jobs may reference a tour directly.)
-- If rental_jobs.tour_id already exists per the rental setup migration, skip this block.
ALTER TABLE public.rental_jobs
  ADD COLUMN IF NOT EXISTS tour_id uuid
    REFERENCES public.tours(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS rental_jobs_tour_id_idx
  ON public.rental_jobs(tour_id);
```

(Inspect the current `rental_jobs` table first — `035_rental_jobs_billing_details.sql` may already include `tour_id`. If it does, drop the second ALTER.)

Down migration: drop the `rental_inventory_id` column from gear; drop the index. Don't drop the rental_jobs.tour_id if it was pre-existing.

### 3.1 Backfill (operator-driven, not automatic)

No automatic backfill. Operators link gear ↔ rental_inventory by hand via the UI in Step 4. There's no reliable name match across the two tables (rental items often have manufacturer-prefixed names while channel-list gear may be free-text — automatic matching would create false positives).

---

## 4. Step 2 — TypeScript + API

### 4.1 Types

Update `src/lib/types/gear.ts` to add `rentalInventoryId: string | null` to the Gear type.

If a `RentalInventory` type doesn't already exist as a TS type (only as DB row), define it in `src/lib/types/rental.ts` and export it.

### 4.2 API

In `src/lib/api/gear.ts`:

- `searchGear(query, opts)` gains an optional filter `opts.includeRentalInventory: boolean` (default false). When true, the search ALSO returns rental_inventory rows that are not yet linked to any Gear — these come back as a special `kind: 'rental-only'` shape that the picker can display with an "(Add to tour)" affordance.
- New: `linkGearToRentalInventory(gearId, rentalInventoryId)` — updates `gear.rental_inventory_id`. Workspace-scoped via RLS.
- New: `createGearFromRentalInventory(rentalInventoryId, opts: { tourId?: string; ownership?: 'owned' | 'sub_hired' | 'hired_to_client' })` — creates a new `gear` row populated from the rental_inventory row, links them, and (if `tourId` provided) creates a `tour_gear` join. Default ownership when promoting from rental_inventory: **`owned`** (because the user is the rental house and owns the item).

In `src/lib/api/rental.ts` (or wherever rental functions live):

- `getRentalJobsForTour(tourId)` — list rental jobs linked to a tour (uses the new `rental_jobs.tour_id` if added).
- `listRentalInventoryNotInGear(workspaceId)` — useful for the bridging UI.

---

## 5. Step 3 — Update Gear entity descriptor

`src/lib/entities/gear.ts`:

- `getSecondary(gear)` — when `rental_inventory_id` is non-null, append "(Rental inventory)" to the secondary line so the chip indicates the source.
- `search(query, opts)` — pass `includeRentalInventory` through. When the picker is opened from a tour-context (Channel List, Stage Plot), default to `includeRentalInventory: true`.

`<GearSlideOver>` (built in UX12) gains a new section:

**Rental inventory link** (only visible if `rental_inventory_id` is set or if user has rental access):
- If linked: show the rental_inventory row's name + image + day_rate, with an "Open in /equipment" link
- If unlinked: show a picker "Link to rental inventory item" that calls `linkGearToRentalInventory`
- Below: button "Unlink" (admin-only, soft action — sets the FK to null without deleting either row)

---

## 6. Step 4 — UI: tour-side gear picker enhancements

In Channel List's gear picker (already wired by UX08 + UX15) and the Library/Gear page:

- When `includeRentalInventory: true` is in scope, the picker results show a small section header "From your rental inventory" listing rental_inventory items not yet promoted to canonical Gear
- Selecting one calls `createGearFromRentalInventory()` which creates the Gear row + tour_gear join in one go
- The newly-created Gear chip immediately becomes the cell value, no second step

Visual: the rental-inventory section uses a small "Rental" pill next to each result so the user knows it's coming from the rental house side.

---

## 7. Step 5 — UI: rental-side "Add to tour" affordance

In `/equipment` Inventory tab:

- Each rental_inventory row in the InventoryTab DataTable gains an extra column or row-action: "Add to tour…"
- Clicking opens a small picker: select a tour → calls `createGearFromRentalInventory(rentalInventoryId, { tourId, ownership: 'owned' })` → toast "Added to <tour name>"
- If the inventory item is already linked to a Gear that's already on tour_gear for that tour, show "Already on this tour" instead of the action

In the JobDetail view (rental jobs), if the job is linked to a tour:
- Each line item shows whether the underlying rental_inventory row is also on the tour's canonical gear list (small green dot + tooltip "On tour gear")
- This is informational only — it doesn't change the export's pricing or output

---

## 8. Step 6 — PDF export integration

In `JobDetail.tsx` (the rental PDF export):

- **No visual changes to the export itself.**
- Behind the scenes: when a rental_job line item's underlying rental_inventory has a linked Gear, the export can prefer the Gear's `manufacturer` / `model` / `notes` fields when they are richer than the rental_inventory row's. If the Gear is unset, fall back to rental_inventory exactly as today.
- This keeps existing rental jobs exporting identically; only newly-linked items potentially read better metadata.

If this branching feels risky, leave it strict on rental_inventory only and move the Gear-aware version to a v2 follow-up. Pick the safer path.

---

## 9. Verification

1. Migration applies cleanly; `rental_inventory_id` column added to gear; index created; rental_jobs.tour_id is present (whether pre-existing or newly added).
2. `GearSlideOver` shows the rental-inventory link section, with picker for unlinked items.
3. From Channel List, gear picker surfaces unlinked rental_inventory items under a "From your rental inventory" header.
4. Selecting a rental_inventory item from the picker creates the Gear + tour_gear in one operation.
5. From `/equipment` Inventory tab, "Add to tour" creates the link and shows a confirmation toast.
6. Rental jobs export PDF visually unchanged.
7. RLS: items only show within the user's workspace.
8. Unlinking from GearSlideOver sets the FK to null on both sides without deleting either row.
9. Lint + typecheck clean.

---

## 10. Acceptance criteria

- [ ] Migration `NNN_rental_gear_link.sql` applies; FKs added with indexes
- [ ] No schema collapses (rental_inventory + rental_jobs + rental_job_items remain; gear + tour_gear remain)
- [ ] `searchGear` supports `includeRentalInventory` flag
- [ ] `linkGearToRentalInventory` and `createGearFromRentalInventory` API functions
- [ ] `<GearSlideOver>` has rental-inventory link section (using `<SlideOver>` primitive, not rolled-own chrome)
- [ ] Channel List gear picker surfaces unlinked rental_inventory items in a labelled section
- [ ] `/equipment` Inventory tab has "Add to tour" affordance per row
- [ ] Rental jobs export visually unchanged
- [ ] Workspace-scoped via existing RLS helpers
- [ ] No new dependencies
- [ ] Lint + typecheck clean

---

## 11. Out of scope

- ❌ Don't merge `rental_inventory` and `gear` into one table
- ❌ Don't auto-backfill links across the existing two datasets (operator does this manually via UI)
- ❌ Don't redesign `/equipment` or rebuild the rental PDF export
- ❌ Don't change rental pricing logic, day rates, or invoicing
- ❌ Don't add inventory-management features to the canonical Gear page (Library/Gear stays focused on what's on tours; `/equipment` stays the rental business module)
- ❌ Don't change RLS or auth model

---

## 12. Commit plan

Two commits, both small:

1. `UX21: rental_inventory ↔ gear schema link + API`
2. `UX21: gear picker + GearSlideOver rental link UI + /equipment "Add to tour"`

---

## 13. Why this is last

This prompt doesn't unlock anything else. It's an integration polish that only matters for users who run both the rental business module AND tour management on the same workspace (which the project owner does). All other users see no change. Defer until everything else is stable.
