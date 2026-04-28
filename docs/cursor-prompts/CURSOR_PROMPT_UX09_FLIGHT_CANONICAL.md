# UX09 — Flight as Canonical Entity

> First prompt of Phase C (relational refactor). Makes Flight a single record edited from both Advance flights tab and Budget travel section. Eliminates the double-entry bug where flight cost in Advance ≠ flight cost in Budget.

---

## 0. Context for Cursor

Read first:

1. `docs/cursor-prompts/UX_OVERHAUL_ROADMAP.md` — section 4 (relational data model).
2. `database/migrations/` — review the most recent migration to identify the correct numbering for the new migration file (likely 045+; check what exists).
3. `src/lib/entities/registry.ts` (UX08) — Flight has a stub descriptor. UX09 replaces the stub with a real implementation.
4. UX02–UX08b (must be merged).

---

## 1. Why this prompt exists

Today, flight data lives in (at least) two places:
- Advance has its own flights tab where the user enters times, PNR, airline, route
- Budget has a travel section where the user enters $ amounts for flights

These are unrelated rows. Editing one doesn't update the other. The user explicitly called this out as the type of bug they want gone.

UX09 makes one canonical Flight record. Both surfaces edit the same row. The Budget's travel rows become **derived rows** — read-only computed entries that pull `flight.cost` from the Flight record.

---

## 2. Hard rules

1. **One migration file** at `database/migrations/NNN_flight_canonical.sql` (where NNN is next sequential number).
2. **No data loss.** The migration must preserve every existing flight detail and every existing budget travel line. Use a backfill step that maps existing Budget travel rows to new Flight records where possible, and leaves orphans as ad-hoc Budget rows.
3. **RLS** uses existing helpers `public.get_my_workspace_id()` and `public.is_workspace_admin()` — don't reinvent.
4. **No new dependencies.**
5. **Typed end-to-end.** No `any`.
6. **Tested manually with a fresh tour + an existing tour.** Both must work.
7. **Document the new schema** in `docs/data-model/flights.md`.
8. **Update the Flight entity descriptor** in `src/lib/entities/flight.ts` to read/write the new table.
9. Lint + typecheck clean. No build run.

---

## 3. Step 1 — Migration

File: `database/migrations/NNN_flight_canonical.sql`

### 3.1 New table

```sql
CREATE TABLE public.flights (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  tour_id uuid NOT NULL REFERENCES public.tours(id) ON DELETE CASCADE,

  -- Flight details
  airline text,
  flight_number text,
  pnr text,

  -- Route + timing
  origin_airport text NOT NULL, -- IATA code
  destination_airport text NOT NULL,
  depart_at timestamptz NOT NULL,
  arrive_at timestamptz NOT NULL,

  -- Money
  cost_amount numeric(12,2),
  cost_currency text DEFAULT 'GBP',

  -- Pax
  passenger_ids uuid[] DEFAULT '{}', -- references public.personnel(id) — optional for now

  -- Misc
  notes text,
  show_id uuid REFERENCES public.shows(id) ON DELETE SET NULL, -- which show this flight is for

  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES auth.users(id),
  updated_by uuid REFERENCES auth.users(id)
);

CREATE INDEX flights_workspace_id_idx ON public.flights(workspace_id);
CREATE INDEX flights_tour_id_idx ON public.flights(tour_id);
CREATE INDEX flights_show_id_idx ON public.flights(show_id);
CREATE INDEX flights_depart_at_idx ON public.flights(depart_at);
```

### 3.2 RLS

```sql
ALTER TABLE public.flights ENABLE ROW LEVEL SECURITY;

CREATE POLICY flights_select ON public.flights
  FOR SELECT USING (workspace_id = public.get_my_workspace_id());

CREATE POLICY flights_insert ON public.flights
  FOR INSERT WITH CHECK (workspace_id = public.get_my_workspace_id());

CREATE POLICY flights_update ON public.flights
  FOR UPDATE USING (workspace_id = public.get_my_workspace_id());

CREATE POLICY flights_delete ON public.flights
  FOR DELETE USING (
    workspace_id = public.get_my_workspace_id() AND public.is_workspace_admin()
  );

CREATE TRIGGER flights_updated_at
  BEFORE UPDATE ON public.flights
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
```

(`set_updated_at()` exists from earlier migrations; if not, define it.)

### 3.3 Backfill

Inspect the current schema for where flight data lives. Likely candidates:
- An `advance_flights` or similar table
- Budget travel rows with a flight_number / airline string

Migrate existing Advance flight records (1:1 → new `flights` rows). For Budget travel rows, leave them where they are; UX09 doesn't auto-merge them. The user can manually link them via the new picker (next prompt).

```sql
-- Example backfill (adjust column names to match actual schema)
INSERT INTO public.flights (
  id, workspace_id, tour_id, airline, flight_number, pnr,
  origin_airport, destination_airport, depart_at, arrive_at,
  cost_amount, cost_currency, notes, show_id, created_at, updated_at
)
SELECT
  af.id, af.workspace_id, af.tour_id, af.airline, af.flight_number, af.pnr,
  af.origin, af.destination, af.depart_at, af.arrive_at,
  af.cost, COALESCE(af.cost_currency, 'GBP'), af.notes, af.show_id, af.created_at, af.updated_at
FROM public.advance_flights af -- replace with real table name
ON CONFLICT (id) DO NOTHING;
```

### 3.4 Budget link

Add a `flight_id` column to the Budget line item table (whatever it's called) so a Budget row can be linked to a canonical Flight:

```sql
ALTER TABLE public.budget_lines -- replace with real table
  ADD COLUMN flight_id uuid REFERENCES public.flights(id) ON DELETE SET NULL;

CREATE INDEX budget_lines_flight_id_idx ON public.budget_lines(flight_id);
```

When `flight_id IS NOT NULL`, the row's `amount` / `currency` / `description` are **derived** from the flight (read-only in UI; this is enforced in the API layer in Step 3).

### 3.5 Down migration

Provide a `-- DOWN` block that drops the new column on `budget_lines`, drops the table, drops policies. Standard pattern.

---

## 4. Step 2 — TypeScript types

File: `src/lib/types/flight.ts`

```ts
export type Flight = {
  id: string;
  workspaceId: string;
  tourId: string;
  airline: string | null;
  flightNumber: string | null;
  pnr: string | null;
  originAirport: string;
  destinationAirport: string;
  departAt: string; // ISO
  arriveAt: string;
  costAmount: number | null;
  costCurrency: string;
  passengerIds: string[];
  notes: string | null;
  showId: string | null;
  createdAt: string;
  updatedAt: string;
};
```

Update `src/lib/types/budget.ts` (or equivalent) to add `flightId: string | null` on the budget line type.

---

## 5. Step 3 — API layer

File: `src/lib/api/flights.ts`

CRUD functions: `listFlights(tourId)`, `getFlightById(id)`, `createFlight(input)`, `updateFlight(id, patch)`, `deleteFlight(id)`. All scoped to current workspace via Supabase RLS.

File: `src/app/api/flights/route.ts` and `src/app/api/flights/[id]/route.ts` — REST endpoints if other surfaces need them. Otherwise, server actions are fine.

**Derivation rule** (enforce in API):
- When `budget_lines.flight_id IS NOT NULL`:
  - Reject UPDATE attempts on `amount`, `currency`, `description` for that row (return 409 Conflict with message "This row is derived from flight <id>; edit the flight instead")
  - Allow UPDATE on row-local fields: notes, attachments, etc.

---

## 6. Step 4 — Update Flight entity descriptor

`src/lib/entities/flight.ts` (created stub in UX08): replace with full implementation.

```ts
import { registerEntity } from './registry';
import { listFlights, getFlightById, searchFlights } from '@/lib/api/flights';

registerEntity({
  kind: 'flight',
  fetchById: getFlightById,
  search: async (query, opts) => searchFlights(query, opts),
  getLabel: (f) => `${f.airline ?? '?'} ${f.flightNumber ?? ''}`.trim() || `Flight ${f.id.slice(0, 6)}`,
  getSecondary: (f) => `${f.originAirport} → ${f.destinationAirport} · ${formatDate(f.departAt)}`,
  SlideOverContent: () => import('@/components/entity/flight/FlightSlideOver'),
});
```

`searchFlights(query, opts)` — search by airline, flight number, route, PNR, passenger names. Workspace-scoped via RLS.

---

## 7. Step 5 — `<FlightSlideOver>`

File: `src/components/entity/flight/FlightSlideOver.tsx` (`'use client'`)

Renders inside `<SlideOver>` (UX03). Sections:

1. **Details** — flight number, airline, PNR (editable inline; commits write to `flights` table)
2. **Route** — origin / destination / depart / arrive
3. **Cost** — amount + currency
4. **Passengers** — list of EntityChip (person) — picker to add/remove
5. **Show** — EntityChip (show) — picker to link to a show
6. **Notes** — rich text
7. **Activity** — audit log (later)

Per the slide-over contract, this is **the** primary edit surface for Flight (Flight has no other dedicated full page). That's allowed for entities — only line items use the on-page-only edit rule.

---

## 8. Step 6 — Wire into Advance + Budget

### 8.1 Advance flights tab

Replace whatever currently renders the Advance flights tab with a list (using `<DataTable>` from UX05) of flights for this tour. Row click opens `<FlightSlideOver>`.

### 8.2 Budget travel section

Add a "Link flight" action on each Budget travel row. Clicking it opens a small picker (uses Flight descriptor's `search`). Selecting a flight sets `budget_lines.flight_id` and converts the row to derived: amount/currency/description become read-only, "computed from <flight chip>" indicator shown.

Unlinking a flight reverts the row to a manual Budget row.

This step is small in this prompt because the full Budget redesign is UX14; UX09's job is to enable the linking, not redesign the page.

---

## 9. Verification

1. Migration applies cleanly (`supabase db reset` against a fresh schema → run migration → no errors)
2. Backfill copies existing flight data
3. New `flights` table is RLS-protected: switching workspace returns no flights from other workspaces
4. Advance flights tab lists workspace flights
5. Editing a flight in its slide-over updates the record; refresh confirms persistence
6. Linking a Budget travel row to a Flight makes amount/currency/description read-only on that row
7. Editing those fields in API returns 409
8. ⌘K palette finds flights by airline / flight number / route
9. Lint + typecheck clean
10. No data loss verified by counting rows pre/post backfill

---

## 10. Acceptance criteria

- [ ] Migration `NNN_flight_canonical.sql` exists with up + down
- [ ] `flights` table with RLS, indexes, trigger
- [ ] `budget_lines.flight_id` column added with FK
- [ ] Backfill from existing flight data
- [ ] TypeScript types updated
- [ ] API layer enforces derivation rule
- [ ] Flight entity descriptor populated
- [ ] `<FlightSlideOver>` renders with all 7 sections
- [ ] Advance flights tab uses DataTable + slide-over
- [ ] Budget travel rows can link/unlink flights
- [ ] `docs/data-model/flights.md` documents the schema
- [ ] No new dependencies
- [ ] Lint + typecheck clean

---

## 11. Out of scope

- ❌ Don't redesign the Budget page — UX14
- ❌ Don't add multi-passenger flight search beyond simple ID arrays — defer
- ❌ Don't add flight imports from PDF (e.g. confirmation emails) — defer
- ❌ Don't migrate ad-hoc Budget travel rows to canonical flights automatically — leave to user

---

## 12. Commit plan

```
UX09: Flight as canonical entity

- Migration NNN_flight_canonical.sql + backfill
- API layer with derivation rule enforcement
- <FlightSlideOver> with 7 sections
- Advance flights tab → DataTable + slide-over
- Budget travel rows can link to flights
```
