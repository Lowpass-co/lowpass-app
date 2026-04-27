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

Migration `050_person_canonical.sql`:

- backfills `persons` from existing `personnel`
- backfills `tour_personnel` from existing `personnel_rates`
- backfills `rooming_grid.person_id` by matching existing row name/role to tour assignment
- backfills `payroll_entries.person_id` from `tour_personnel`

Rows that cannot be matched remain as ad-hoc text rows and continue working without data loss.

## Channel-list inputs and `person_id`

The current `channel_list_rows` schema (migration `040_channel_list.sql`) does not have a personnel column to replace — its input fields (`mic`, `mic_substitute`, `di`, `stand`, `phantom_power`, `provider`) describe gear and signal flow, not people.

The UX10 prompt called for a `person_id` FK on Channel List input rows; in this codebase the closest match is the `contacts` table (used as the durable people store for advance contacts), which now has `contacts.person_id -> persons.id`.

If a future migration adds a dedicated input-owner column on `channel_list_rows` (e.g. `played_by_person_id`), it should reference `persons.id` directly. UX12 (Gear canonical) replaces `mic`/`di`/`stand` text with `gear_id` FKs but does not need to add a personnel FK unless explicitly scoped.
