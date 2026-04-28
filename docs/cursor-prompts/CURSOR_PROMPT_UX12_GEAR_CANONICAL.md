# UX12 — Gear as Canonical Entity (with Ownership)

> Last prompt of Phase C. One Gear record. Channel List references it; Stage Plot uses it; Budget hire section shows derived rows **only for `hired-to-client` items**. Folds in the previously-planned R14 (hire list) work.

---

## 0. Context for Cursor

Read first:

1. `docs/cursor-prompts/UX_OVERHAUL_ROADMAP.md` — section 4 (especially 4.4 Gear ownership rule).
2. `docs/cursor-prompts/RIDER_PACK_ROADMAP.md` — R-series context. R14 (hire list) is **superseded by this prompt**. Mark R14 as deferred-to-UX12 in the rider roadmap.
3. UX09–UX11 — same pattern, plus ownership semantics.
4. UX08–UX11 (must be merged).

---

## 1. Why this prompt exists

Gear today: channel list lists items by text; stage plot references items by text; hire list (R14, planned but unbuilt) was going to be a separate table; budget hire section was going to be its own data. Multiple sources, no single record.

UX12 makes one Gear record with **ownership state** (owned / sub-hired / hired-to-client) determining whether a Budget hire row is created. Channel List and Stage Plot reference Gear by id regardless of ownership.

This collapses R14 into UX12 — no separate hire-list page; the Library/Gear page IS the hire list.

---

## 2. Hard rules

Same as UX09 §2.

Additionally:
- **Ownership state** drives Budget surfacing. Only `hired-to-client` items produce derived Budget rows.
- **Schema must support** transitions between ownership states without data loss (e.g. a sub-hired item becomes hired-to-client mid-tour).
- Existing channel list / stage plot text references migrate to FK references where unambiguous.

---

## 3. Step 1 — Migration

File: `database/migrations/NNN_gear_canonical.sql`

### 3.1 Schema

```sql
CREATE TYPE gear_ownership AS ENUM ('owned', 'sub_hired', 'hired_to_client');

CREATE TABLE IF NOT EXISTS public.gear (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,

  -- Identity
  name text NOT NULL,
  category text, -- 'console' | 'mic' | 'speaker' | 'amp' | 'instrument' | 'cable' | 'stand' | 'other'
  manufacturer text,
  model text,
  serial_number text,

  -- Ownership
  ownership gear_ownership NOT NULL DEFAULT 'owned',
  owner_label text, -- e.g. "Britannia Row" — only meaningful when ownership <> 'owned'
  supplier_id uuid REFERENCES public.suppliers(id) ON DELETE SET NULL, -- if a Suppliers table exists; otherwise drop this line

  -- Cost (only relevant for sub_hired or hired_to_client)
  hire_cost_amount numeric(12,2),
  hire_cost_currency text DEFAULT 'GBP',
  hire_cost_period text, -- 'day' | 'week' | 'flat'

  -- Tour scoping
  -- Gear is workspace-level, but availability per tour is tracked separately.
  notes text,
  image_url text,

  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.tour_gear (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  tour_id uuid NOT NULL REFERENCES public.tours(id) ON DELETE CASCADE,
  gear_id uuid NOT NULL REFERENCES public.gear(id) ON DELETE CASCADE,

  -- Per-tour overrides (optional)
  tour_ownership gear_ownership, -- if NULL, fall back to gear.ownership
  tour_hire_cost_amount numeric(12,2),
  tour_hire_cost_currency text,
  tour_hire_cost_period text,
  starts_on date,
  ends_on date,
  quantity int DEFAULT 1,

  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tour_id, gear_id)
);

ALTER TABLE public.budget_lines
  ADD COLUMN IF NOT EXISTS gear_id uuid REFERENCES public.gear(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS tour_gear_id uuid REFERENCES public.tour_gear(id) ON DELETE SET NULL;

-- Channel list rows already have a stage_box_id / sub_snake_id from R-series. Add a gear_id
-- for input gear (microphone, DI, instrument).
ALTER TABLE public.channel_list_rows
  ADD COLUMN IF NOT EXISTS gear_id uuid REFERENCES public.gear(id) ON DELETE SET NULL;
```

If `suppliers` doesn't exist, drop the `supplier_id` column. If R-series mic library was built (R8R10 prompt or similar), migrate mic library entries into `gear` rows with `category = 'mic'`.

### 3.2 RLS / indexes / triggers

Per pattern. Admin-only delete.

### 3.3 Backfill

- Mic library → `gear` with `category = 'mic'`, `ownership = 'owned'` by default
- Channel list `microphone` text values → match against `gear.name`; FK where unambiguous, leave as text where not
- Stage plot text references → same
- Existing budget hire rows → leave alone; user links via picker

---

## 4. Step 2 — TS + API + descriptor

`src/lib/types/gear.ts`. API at `src/lib/api/gear.ts` with `searchGear(query, opts)` supporting `ownership` filter, `category` filter, `tourId` (for "what's on this tour" queries).

Entity descriptor for `gear`:

```ts
registerEntity({
  kind: 'gear',
  fetchById: getGearById,
  search: searchGear,
  getLabel: (g) => `${g.manufacturer ?? ''} ${g.model ?? g.name}`.trim(),
  getSecondary: (g) => `${g.category ?? ''} · ${g.ownership.replace('_', '-')}`,
  getColor: (g) => OWNERSHIP_COLORS[g.ownership], // owned green, sub-hired blue, hired-to-client orange
  SlideOverContent: () => import('@/components/entity/gear/GearSlideOver'),
});
```

---

## 5. Step 3 — `<GearSlideOver>`

File: `src/components/entity/gear/GearSlideOver.tsx`

Sections:
1. **Identity** — name, category, manufacturer, model, serial
2. **Ownership** — radio: owned / sub-hired / hired-to-client. Owner label (when not owned). Supplier picker (if suppliers exist).
3. **Cost** — only visible when ownership ≠ owned. Amount + currency + period (day/week/flat).
4. **Image** — upload + display
5. **Tour usage** — list of `tour_gear` records (which tours this gear is on, with per-tour overrides)
6. **Notes**
7. **Activity**

When user changes ownership in section 2:
- `owned` → cost section hides, any linked Budget rows are unlinked (with confirmation)
- `sub_hired` → cost section visible; no Budget surfacing rule change
- `hired_to_client` → cost section visible; auto-create a derived Budget hire row in the current tour's hire section if not already present

---

## 6. Step 4 — Wire into surfaces

### 6.1 Library / Gear page (formerly R14 hire list)

`/library/gear` and `/tours/[id]/hire` (or wherever it lives) becomes a DataTable of Gear:
- Workspace-scope view (Library): all gear
- Tour-scope view: only gear linked via `tour_gear`

Filters: ownership, category, supplier.

Row click → GearSlideOver. Inline ownership pill (color-coded).

### 6.2 Channel List

`channel_list_rows.gear_id` populated for input rows. Render as EntityChip in the relevant column. Edit via EntityRefEditor (UX08 wired into UX06).

### 6.3 Budget hire section

Reads `tour_gear` rows where ownership (effective) is `hired_to_client`. Computed amount = `hire_cost_amount × period multiplier × quantity`. Derived rows show the link icon and are read-only.

User can manually add ad-hoc hire rows (no `gear_id`) for quick entries.

---

## 7. Verification

1. Migration applies; backfill maps mic library + channel list text where possible
2. Library/Gear page lists gear; filters work
3. Slide-over edits persist; ownership change auto-creates/removes Budget row as specified
4. Channel List input columns now use EntityChip for `gear_id`
5. Budget hire section shows only `hired-to-client` items
6. ⌘K palette finds gear by manufacturer / model / category
7. Stage plot (existing R-series) still renders (text fallback for unmatched references)
8. Lint + typecheck clean

---

## 8. Acceptance criteria

- [ ] Migration with `gear`, `tour_gear`, ownership enum, FK changes
- [ ] Backfill from mic library + channel list text references
- [ ] TS types, API, entity descriptor populated
- [ ] `<GearSlideOver>` with all 7 sections + ownership transition logic
- [ ] Library/Gear page DataTable with filters
- [ ] Channel List input columns wired to EntityChip
- [ ] Budget hire section reads only `hired-to-client`
- [ ] R14 (rider roadmap) marked superseded
- [ ] `docs/data-model/gear.md` written
- [ ] Lint + typecheck clean
- [ ] No new deps

---

## 9. Out of scope

- ❌ Stage plot redesign (R17 / future)
- ❌ Mic-specific patch logic beyond what R-series already has
- ❌ Auto-suggest gear from channel list (defer; current R-series logic still works)
- ❌ Hire list page redesign beyond using DataTable (full polish in UX13)

---

## 10. Commit plan

```
UX12: Gear as canonical entity (with ownership)

- Migration NNN_gear_canonical.sql with ownership enum, tour_gear, FKs
- Backfill from mic library + channel list text
- API + entity descriptor + <GearSlideOver>
- Library/Gear page DataTable with filters
- Channel List input columns wired to EntityChip
- Budget hire section reads only hired_to_client
- R14 superseded
```
