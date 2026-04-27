# Flights Data Model (UX09)

`public.flights` is now the canonical flight table.

## Table: `public.flights`

- Identity/scope: `id`, `workspace_id`, `tour_id`
- Details: `airline`, `flight_number`, `pnr`
- Route/timing: `origin_airport`, `destination_airport`, `depart_at`, `arrive_at`
- Money: `cost_amount`, `cost_currency`
- Linking: `passenger_ids`, `show_id`
- Misc: `notes`
- Audit: `created_at`, `updated_at`, `created_by`, `updated_by`
- Compatibility fields for current UI: `person_name`, `role`, `confirmation`, `leg_order`

## Budget link

`public.budget_line_items.flight_id` links a budget travel row to a canonical flight.

When `flight_id` is set:

- the row is derived from the flight
- API rejects updates to `label`, `proposed_cost`, `actual_cost`, and `currency`
- users should edit the linked flight record instead

## Backfill behavior

Migration `033_flight_canonical.sql` backfills from legacy `flight_bookings` to `flights` (id-preserving), then links `budget_line_items` via `flight_id` where `flight_bookings.line_item_id` already existed.

Legacy ad-hoc budget travel rows remain untouched unless explicitly linked by users.
