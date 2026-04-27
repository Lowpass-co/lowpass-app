# Persons Data Model (UX10)

`public.persons` is the canonical workspace-level person record.

## Table: `public.persons`

- Identity: `full_name`, `preferred_name`, `pronouns`
- Contact: `email`, `phone`, `emergency_contact`
- Travel: passport fields, DOB, dietary notes
- Scope: `workspace_id` (persons are reusable across tours)

## Table: `public.tour_personnel`

Tour-scoped role/rate assignment join:

- `tour_id`, `person_id`, `role`
- optional employment/rate metadata (`employment_type`, `rate_amount`, `rate_currency`, `rate_period`)
- schedule window (`starts_on`, `ends_on`)

## FK links introduced

- `rooming_grid.person_id -> persons.id`
- `payroll_entries.person_id -> persons.id`
- `contacts.person_id -> persons.id`

These links allow roster, rooming, payroll, and advance-contact surfaces to point to one canonical person record.

## Backfill behavior

Migration `034_person_canonical.sql`:

- backfills `persons` from existing `personnel`
- backfills `tour_personnel` from existing `personnel_rates`
- backfills `rooming_grid.person_id` by matching existing row name/role to tour assignment
- backfills `payroll_entries.person_id` from `tour_personnel`

Rows that cannot be matched remain as ad-hoc text rows and continue working without data loss.
