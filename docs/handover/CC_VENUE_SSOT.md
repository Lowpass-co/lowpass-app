# CC — Venue SSOT (P2). One venue truth: live until show day, then frozen. SINGLE OWNER.

> **RUN ORDER 2 of 6 — see `ROADMAP_2026-07.md`. Master sprint is complete and verified. Blocks the design pass (order 3) and intake upgrade (order 5).**

Decision (Adam, 2026-07): a routing row's venue is a **live reference until the show day passes, then a frozen snapshot** — upcoming shows reflect venue edits automatically; history never rewrites.

## Problem (audit 2026-07-03, verified)
Up to four divergent venue copies: legacy `venues` table (near-dead) · `canonical_venues` (migrations 214/226 — autocomplete backstop, service-role writer only, no edit UI) · `routing.venue_*` text columns (captured at pick-time, never resynced) · `advance_instances.data` JSONB (frozen at advance-creation). Editing a venue anywhere updates nothing downstream — wrong address reaching crew on show day is the failure mode.

## Model
- `canonical_venues` is THE venue record. Routing rows gain `canonical_venue_id` FK (nullable — free-text venues stay legal).
- **Live phase** (routing date ≥ today AND day not locked): venue name/address/contacts render FROM the canonical row (join or hydrate server-side). The `routing.venue_*` text columns stop being read for these rows.
- **Freeze**: when the day passes (or TM explicitly locks the day), snapshot canonical values INTO `routing.venue_*` — those columns become the immutable historical record. `venue_frozen_at` timestamp marks the transition.
- Advance instances: render venue block from canonical while live; on freeze, their snapshot stands (already in `data` JSONB). Intake/packets use the same resolution function.
- One resolution function server-side: `resolveVenue(routingRow) → {source: 'canonical'|'frozen', ...fields}` — every consumer (routing grid, advance, exports, day sheets) goes through it. No component reads `venue_*` columns directly.

## Work
1. Migration (next free 2xx — check the tree, ≥237; idempotent, down-block, hand-paste SQL posted for Adam): `ADD COLUMN IF NOT EXISTS canonical_venue_id uuid REFERENCES canonical_venues`, `venue_frozen_at timestamptz`, backfill `canonical_venue_id` by exact-then-fuzzy name+city match (report the match rate; unmatched stay NULL/free-text).
2. `resolveVenue()` + convert all consumers (grep `venue_name|venue_address|venue_phone|venue_website|venue_capacity` across src/ — same grep-gate discipline as rates: direct column reads allowed ONLY inside the resolver + types + migrations; paste output).
3. Venue edit UI on `/venues`: editing a canonical venue shows a propagation notice — "N upcoming shows reference this venue" (list them); past/frozen shows untouched.
4. Freeze: on-read freeze is acceptable v1 (first resolution after date-passed writes the snapshot) — no cron; say which you implemented.
5. Routing venue picker: selecting from autocomplete sets the FK; free-typing leaves FK NULL (explicitly supported — one-off venues shouldn't require canonical records).

## Gates
Floor green · grep gate pasted · scripted proof: edit a canonical venue → upcoming routing row reflects it, past row doesn't · advance render for a live day shows the edited value · VEN-01..04 smoke IDs in `docs/smoke-tests/` same PR. Verify-before-claim per house rules.

## Out of scope
Deleting the legacy `venues` table (flag its remaining readers instead) · venue dedup/merge tooling · design-pass restyling.
