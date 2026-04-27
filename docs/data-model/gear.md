# Gear canonical model

UX12 introduces canonical gear entities with ownership semantics.

## Canonical tables

- `public.gear`: workspace-level gear identity + ownership + base hire cost.
- `public.tour_gear`: per-tour link/overrides (ownership/cost/dates/quantity).

Ownership values:

- `owned`
- `sub_hired`
- `hired_to_client`

Only `hired_to_client` gear should surface as derived budget hire rows.

## Linked surfaces

- `channel_list_rows.gear_id` links channel rows to canonical gear records.
- `budget_line_items.gear_id` and `budget_line_items.tour_gear_id` support derived hire rows.

## Backfill policy

- `mic_library` entries are copied to `gear` with `category = 'mic'` and `ownership = 'owned'`.
- `channel_list_rows.mic` text is matched to `gear.name` and `gear_id` is filled for unambiguous matches.
- Unmatched text remains intact to preserve stage/channel compatibility.
