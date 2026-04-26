# UX11 — Room as Canonical Entity

> Same pattern as UX09 / UX10, applied to Room. One Room record. Rooming list shows assignments; Budget shows hotel cost; Advance shows confirmation.

---

## 0. Context for Cursor

Read first:

1. `docs/cursor-prompts/UX_OVERHAUL_ROADMAP.md` — section 4.
2. UX09 + UX10 — same pattern, simpler scope here.
3. UX08–UX10 (must be merged).

---

## 1. Why this prompt exists

Hotel data lives in: Rooming list (per-show room assignments), Budget hotels section ($ amounts), Advance hotel info (confirmation #, address, phone). Triple-entry. Each surface drifts.

UX11 makes one Room record. Rooming references it. Budget hotels are derived rows. Advance hotel info reads from the Room.

---

## 2. Hard rules

Same as UX09 §2.

Specifically:
- Existing Rooming likely has its own data; check before touching it. Likely candidates for the canonical model are `rooms` (the room itself) and `room_assignments` (which person stays in which room on which night).
- Hotels themselves are distinct from rooms — a hotel has many rooms. The roadmap calls this entity "Room" but the schema is best modelled as `hotels` + `rooms` + `room_assignments`.

---

## 3. Step 1 — Migration

File: `database/migrations/NNN_room_canonical.sql`

### 3.1 Schema

```sql
CREATE TABLE IF NOT EXISTS public.hotels (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  tour_id uuid NOT NULL REFERENCES public.tours(id) ON DELETE CASCADE,

  name text NOT NULL,
  address text,
  city text,
  country text,
  phone text,
  confirmation_number text,
  check_in_at timestamptz,
  check_out_at timestamptz,
  show_id uuid REFERENCES public.shows(id) ON DELETE SET NULL, -- which show this hotel is for

  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.rooms (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  hotel_id uuid NOT NULL REFERENCES public.hotels(id) ON DELETE CASCADE,

  room_number text,
  room_type text, -- 'single' | 'double' | 'twin' | 'suite'
  cost_amount numeric(12,2),
  cost_currency text DEFAULT 'GBP',
  bed_count int,
  notes text,

  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.room_assignments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  room_id uuid NOT NULL REFERENCES public.rooms(id) ON DELETE CASCADE,
  person_id uuid NOT NULL REFERENCES public.persons(id) ON DELETE CASCADE,
  starts_on date NOT NULL,
  ends_on date NOT NULL, -- inclusive

  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (room_id, person_id, starts_on)
);

-- Budget link
ALTER TABLE public.budget_lines
  ADD COLUMN IF NOT EXISTS hotel_id uuid REFERENCES public.hotels(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS room_id  uuid REFERENCES public.rooms(id)  ON DELETE SET NULL;
```

Indexes + RLS as per pattern. Admin-only delete.

### 3.2 Backfill

Migrate existing rooming data into `hotels` + `rooms` + `room_assignments`. Existing budget hotel lines: leave as ad-hoc; user can link via picker after migration.

---

## 4. Step 2 — TypeScript types + API + entity descriptor

`src/lib/types/room.ts`, `src/lib/types/hotel.ts`. API at `src/lib/api/hotels.ts` and `src/lib/api/rooms.ts`. Entity descriptor for `room` registers a slide-over that shows hotel + room details together.

For the entity registry, "room" is the canonical kind (per the roadmap's section 4). Hotel is treated as a parent context. The slide-over for a Room shows the hotel info at the top and the room-specific details below.

---

## 5. Step 3 — `<RoomSlideOver>`

File: `src/components/entity/room/RoomSlideOver.tsx`

Sections:
1. **Hotel** — name, address, phone, confirmation # (editable; updates parent hotel)
2. **Room** — number, type, cost, beds
3. **Assignments** — list of (Person × date range) — pickers for adding
4. **Notes**
5. **Activity**

---

## 6. Step 4 — Wire into surfaces

- **Rooming page** → reads `hotels` + `rooms` + `room_assignments`. Display: per-show rooming layout (existing UX, just reading new tables).
- **Advance hotel info** → reads from `hotels` for the show (show.hotel_id back-reference).
- **Budget hotels section** → derived rows from `rooms.cost_amount × nights × occupancy` (or simply room.cost_amount × number-of-assignments-spanning days; clarify with user via PR comment if implementation unclear).

---

## 7. Verification

1. Migration applies; backfill preserves data
2. Rooming page renders existing data after the migration
3. Slide-over edits persist
4. Linking a Budget hotel row to a Room makes amount derived
5. ⌘K finds rooms by hotel name / room number
6. Lint + typecheck clean

---

## 8. Acceptance criteria

- [ ] Migration with `hotels` + `rooms` + `room_assignments` + budget FK
- [ ] Backfill from existing rooming data
- [ ] TS types + API + entity descriptor
- [ ] `<RoomSlideOver>` with 5 sections
- [ ] Rooming + Advance + Budget reading from new tables
- [ ] `docs/data-model/rooms.md` written
- [ ] No new deps; lint + typecheck clean

---

## 9. Out of scope

- ❌ Rooming page redesign — UX15
- ❌ Hotel imports from confirmation emails — defer
- ❌ Auto-allocation algorithms — defer

---

## 10. Commit plan

```
UX11: Room as canonical entity

- Migration NNN_room_canonical.sql (hotels + rooms + room_assignments + budget FK)
- Backfill from existing rooming data
- API + entity descriptor + <RoomSlideOver>
- Rooming/Advance/Budget read from new tables
```
