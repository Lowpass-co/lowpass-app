# Rooms canonical model

UX11 introduces canonical rooming entities so rooming, budget hotels, and advance hotel details resolve from one source.

## Tables

- `public.hotels`: hotel-level details (`name`, `address`, `phone`, `confirmation_number`, `check_in_at`, `check_out_at`, `notes`, optional `show_id`).
- `public.rooms`: room-level details under a hotel (`room_number`, `room_type`, `cost_amount`, `cost_currency`, `bed_count`, `notes`).
- `public.room_assignments`: person/date assignments to a room (`person_id`, `starts_on`, `ends_on`).

All three tables are workspace-scoped, RLS-protected, and use admin-only delete policy (matching canonical pattern from UX09/UX10).

## Budget link

`public.budget_line_items` gains:

- `hotel_id` → `public.hotels(id)`
- `room_id` → `public.rooms(id)`

When linked, hotel/room budget rows are treated as derived rows and should be edited from canonical rooming entities.

## Backfill strategy

- Existing `hotel_bookings` rows are copied into `public.hotels` (id-preserving).
- Existing `hotel_room_assignments` rows are copied into `public.rooms` (id-preserving).
- `public.room_assignments` is backfilled by matching legacy assignment `person_name` to canonical `persons.full_name`.
- Existing linked hotel budget rows are assigned `budget_line_items.hotel_id`.

Legacy hotel rows without deterministic person matches remain visible and can be manually linked/adjusted in UI.
