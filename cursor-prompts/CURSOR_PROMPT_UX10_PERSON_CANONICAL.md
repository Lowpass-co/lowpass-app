# UX10 — Person as Canonical Entity

> Same shape as UX09, applied to Person. One Person record surfaced in Personnel, Rooming, Payroll, Channel List inputs, Advance contacts.

---

## 0. Context for Cursor

Read first:

1. `docs/cursor-prompts/UX_OVERHAUL_ROADMAP.md` — section 4 (relational data model).
2. `docs/cursor-prompts/CURSOR_PROMPT_UX09_FLIGHT_CANONICAL.md` — UX10 follows the same pattern.
3. `database/migrations/` — find current schema for personnel; pick next migration number (after UX09's).
4. UX08–UX09 (must be merged).

---

## 1. Why this prompt exists

Personnel data fragments today: a person on Personnel page, a person on Rooming list, a person on Payroll, a person on a Channel input, a contact in Advance. Each may be entered independently and drift. UX10 makes one Person record the source of truth; every other surface either references the Person (`person_id` FK) or derives from it.

---

## 2. Hard rules

Same as UX09 §2. One migration, no data loss, RLS via existing helpers, no new deps, lint + typecheck clean.

Additionally:
- Existing Personnel table likely already exists. If so, **don't create a duplicate**. Instead, ensure the canonical schema (below) is achieved by additive ALTER TABLE statements where possible.
- **Channel List input rows** referencing personnel-by-text become `person_id` FKs (with backfill that matches by name; leaves orphans as text).

---

## 3. Step 1 — Migration

File: `database/migrations/NNN_person_canonical.sql`

### 3.1 Inspect

First, dump the current personnel-related schema (whatever it's called). The migration's exact ALTERs depend on what's there.

Target shape:

```sql
-- Canonical persons table (rename / morph the existing personnel table to this)
-- Adjust column names to match current; goal is to land on this schema:

CREATE TABLE IF NOT EXISTS public.persons (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,

  -- Identity
  full_name text NOT NULL,
  preferred_name text,
  pronouns text,

  -- Contact
  email text,
  phone text,
  emergency_contact text,

  -- Travel
  passport_full_name text, -- as it appears on passport (often differs from preferred name)
  passport_number text,
  passport_expiry date,
  passport_country text,
  date_of_birth date,
  dietary text,
  notes text,

  -- Tour-scoped role + rate live in a join table (see below).
  -- Person itself is workspace-scoped (people often work multiple tours).

  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES auth.users(id),
  updated_by uuid REFERENCES auth.users(id)
);

-- Tour-Person join: roles, rates, dates per tour
CREATE TABLE IF NOT EXISTS public.tour_personnel (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  tour_id uuid NOT NULL REFERENCES public.tours(id) ON DELETE CASCADE,
  person_id uuid NOT NULL REFERENCES public.persons(id) ON DELETE CASCADE,

  role text NOT NULL,
  employment_type text, -- 'staff' | 'freelance' | 'crew' | 'band' | 'mgmt'
  rate_amount numeric(12,2),
  rate_currency text DEFAULT 'GBP',
  rate_period text, -- 'day' | 'week' | 'flat' | 'hour'
  starts_on date,
  ends_on date,

  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),

  UNIQUE (tour_id, person_id, role)
);

CREATE INDEX persons_workspace_id_idx ON public.persons(workspace_id);
CREATE INDEX tour_personnel_tour_id_idx ON public.tour_personnel(tour_id);
CREATE INDEX tour_personnel_person_id_idx ON public.tour_personnel(person_id);
```

### 3.2 RLS

Same pattern as UX09 — workspace-scoped policies, admin-only delete.

### 3.3 Cross-table FK changes

Add `person_id` FK columns to:
- Channel List input rows (replacing text lookup)
- Rooming assignments (likely already FKs; verify)
- Budget payroll lines

Backfill each by matching name → person_id where unambiguous; leave non-matches as ad-hoc text rows.

---

## 4. Step 2 — TypeScript types

File: `src/lib/types/person.ts` — `Person` and `TourPerson`. Update related types.

---

## 5. Step 3 — API layer

File: `src/lib/api/persons.ts` — CRUD + search. `searchPersons(query, opts?: { tourId?: string })` searches workspace persons; if `tourId` is passed, prioritises persons currently on that tour.

---

## 6. Step 4 — Update Person entity descriptor

`src/lib/entities/person.ts`:

```ts
registerEntity({
  kind: 'person',
  fetchById: getPersonById,
  search: searchPersons,
  getLabel: (p) => p.preferredName ?? p.fullName,
  getSecondary: (p) => p.tourPersonnel?.[0]?.role ?? p.email ?? '',
  SlideOverContent: () => import('@/components/entity/person/PersonSlideOver'),
});
```

---

## 7. Step 5 — `<PersonSlideOver>`

File: `src/components/entity/person/PersonSlideOver.tsx`

Sections:
1. **Identity** — full name, preferred name, pronouns
2. **Contact** — email, phone, emergency contact
3. **Travel** — passport info, DOB, dietary
4. **Tours** — list of `TourPersonnel` records (which tours, role on each, rate)
5. **Notes** — rich text
6. **Activity**

Tour-scoped fields edit on the `tour_personnel` row, not on the Person itself. UI clarifies this with "Editing role for [Tour Name] only".

---

## 8. Step 6 — Wire into surfaces

- **Personnel page** → DataTable of persons (workspace-scoped if global Library, tour-scoped if inside a tour) + slide-over
- **Rooming** → assigns by `person_id`; no changes to schema beyond the FK
- **Channel List inputs** → `person_id` reference rendered as EntityChip
- **Advance contacts** → reference persons; no manual contact entry beyond a link to the Person

Keep the wiring minimal in this prompt. Full page redesigns happen in UX13 / UX15 / UX17.

---

## 9. Verification

1. Migration applies cleanly; backfill preserves all data
2. Personnel list shows workspace persons
3. Slide-over edits persist
4. Tour-Personnel join records render correctly
5. Channel List inputs with person FK render EntityChip
6. ⌘K palette finds persons by name / email / role
7. Lint + typecheck clean

---

## 10. Acceptance criteria

- [ ] `database/migrations/NNN_person_canonical.sql` with backfill
- [ ] `persons` + `tour_personnel` schema correct
- [ ] FK changes on Channel List, Rooming, Budget payroll lines
- [ ] TS types updated
- [ ] API layer
- [ ] Person entity descriptor populated
- [ ] `<PersonSlideOver>` with 6 sections
- [ ] Wiring in Personnel page (DataTable + slide-over)
- [ ] `docs/data-model/persons.md` written
- [ ] Lint + typecheck clean
- [ ] No new deps

---

## 11. Out of scope

- ❌ Don't redesign Personnel / Rooming / Channel List pages — UX13 / UX15
- ❌ Don't add HR-style fields (salary, benefits) — out of product scope
- ❌ Don't merge duplicate persons (defer to a manual admin tool)

---

## 12. Commit plan

```
UX10: Person as canonical entity

- Migration NNN_person_canonical.sql with persons + tour_personnel join
- FK migrations for Channel List, Rooming, Budget payroll
- API + entity descriptor
- <PersonSlideOver>
- Personnel page wiring
```
