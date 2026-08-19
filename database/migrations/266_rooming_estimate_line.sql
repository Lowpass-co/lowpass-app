-- ============================================
-- LOWPASS — Rooming: one estimate line, editable unit cost (M-2)
-- Migration 266 — ADDITIVE. Nothing is dropped, no existing number moves.
--
-- ── THE REPORT ──────────────────────────────────────────────────────
-- Adam, on Coachella: "I can't add hotel prices and there are like twenty
-- lines. There should only be one summary line with the assumed cost
-- multiplied by rooms. This should be editable still, which would update the
-- estimated nightly cost cell."
--
-- Twenty lines because there are twenty HOTELS: the rooming grid creates a
-- one-night placeholder hotel per uncovered night
-- (`api/budget/rooming/route.ts:290-302`), and `computeHotelDesired` emits one
-- derived budget line per hotel row. The price can't be typed because the
-- budget refuses derived-field edits on any row carrying `hotel_id`
-- (`line-items/route.ts:442-447`), and the "estimated nightly cost" cell Adam
-- remembers does not exist — the assumed-rate control is ephemeral React state
-- (`RoomingMatrix.tsx:54`, `useState(0)`), reset to 0 on every mount, which
-- only stamps rooms saved AFTER you type it.
--
-- Adam's rulings, 2026-08-14, both settled:
--   1. Placeholder nights collapse into ONE estimate line. Genuinely booked
--      hotels keep their own line. Detail where detail exists.
--   2. The assumed nightly rate is PER TOUR — a planning assumption, not a
--      fact about a building — so it lives on `budget_settings`.
--
-- ── WHY A FLAG AND NOT A NAME MATCH ─────────────────────────────────
-- `placeholderHotelName(city, date)` produces 'Hotel — {city} · {date}' and
-- `isPlaceholderHotelName()` matches that prefix. Matching on it at RUNTIME is
-- the substring-grep hazard CLAUDE.md documents: a real hotel somebody names
-- after a city and a date would silently vanish into the estimate line and its
-- real cost would disappear from the budget. So the marker becomes explicit
-- data. The name match is used ONCE, here, to backfill — never again.
--
-- ── THE TRANSITION, which is the part that keeps this correct ───────
-- A placeholder that stays inside the summary after being booked is the same
-- failure one layer along. `is_placeholder` must CLEAR the moment a human
-- turns the row into a real booking. Three places, all of them existing
-- write paths — the flag is cleared in the SAME update, not by a sweeper:
--
--   1. PATCH /api/budget/hotels — `src/app/api/budget/hotels/route.ts:336`.
--      Clear when `hotel_name` or `confirmation_number` is present in the
--      body. Renaming it is the human saying "this is a real hotel".
--   2. PATCH /api/rooms/[id] — `src/app/api/rooms/[id]/route.ts:60-73`.
--      Same two fields on the hotel payload; ALSO clear when `cost_amount`
--      is set on the room, since a typed price is a real booking too.
--   3. POST /api/budget/hotels — `route.ts:237`. Nothing to do: the column
--      defaults to false, and a hotel a person created was never a
--      placeholder. Only the rooming grid's auto-insert sets it true.
--
-- The estimate line then SPLITS automatically: `computeHotelDesired` groups by
-- `is_placeholder`, so the next reconcile pass emits a named line for the
-- newly-real hotel and drops it out of the collapsed estimate. No backfill, no
-- second code path, nothing to remember.
--
-- ── SHIPPED AS SCHEMA ONLY ──────────────────────────────────────────
-- The application code that USES these three columns is NOT in this bank. It
-- cannot be: migrations here are pasted by hand, and code that selects a
-- column which does not exist yet fails at runtime with no compile-time
-- signal. Paste this, confirm, then the reconcile/grid work lands against a
-- schema that actually has them.
--
-- Idempotent (ADD COLUMN IF NOT EXISTS; the backfill is guarded so a re-paste
-- is a no-op). Down-block at the end.
-- ============================================

-- ── 1. hotels.is_placeholder ────────────────────────────────────────
-- True ONLY for rows the rooming grid auto-created to cover an uncovered
-- night. Set by `api/budget/rooming/route.ts` at insert; cleared by the three
-- promotion points above.
ALTER TABLE public.hotels
  ADD COLUMN IF NOT EXISTS is_placeholder boolean NOT NULL DEFAULT false;

-- Backfill by matching the generator's exact output, AT BACKFILL TIME ONLY.
-- Both shapes: the current 'Hotel — {city} · {YYYY-MM-DD}' / 'Hotel — {date}'
-- and the legacy 'Unassigned Hotel' the healer renames.
--
-- Guarded three ways so a re-paste cannot capture a hotel someone has since
-- made real: only rows still flagged false, only rows with NO confirmation
-- number, and only rows whose stay is exactly one night (the placeholder
-- shape: check_in at 00:00 and check_out at the next day's 00:00).
UPDATE public.hotels h
SET is_placeholder = true
WHERE h.is_placeholder = false
  AND h.confirmation_number IS NULL
  AND (
    h.name = 'Unassigned Hotel'
    OR h.name LIKE 'Hotel — %'
  )
  AND h.check_in_at IS NOT NULL
  AND h.check_out_at IS NOT NULL
  AND (h.check_out_at::date - h.check_in_at::date) <= 1;

COMMENT ON COLUMN public.hotels.is_placeholder IS
  'True for rooming-grid auto-created one-night placeholders. Cleared when a human renames the hotel, sets a confirmation number, or types a room cost — see migration 266. Never infer this from the name at runtime.';

-- ── 2. budget_settings.default_room_rate ────────────────────────────
-- The tour's assumed nightly rate. Named for its five neighbours
-- (`default_dollars_per_head`, `default_merch_fee_pct`, `default_sell_thru`),
-- which are the same class of planning assumption.
--
-- NULLABLE on purpose: NULL means "no assumption set", which is a different
-- statement from "the assumption is £0" and is what the rooming header should
-- render as an empty cell rather than a confident zero.
--
-- Migration 264 gated `budget_settings` WRITES behind
-- can_access('page','budget.summary','write'), so editing this figure is
-- correctly a budget-write. Reads stay workspace-wide. No RLS change needed.
ALTER TABLE public.budget_settings
  ADD COLUMN IF NOT EXISTS default_room_rate numeric;

COMMENT ON COLUMN public.budget_settings.default_room_rate IS
  'Assumed nightly room rate for this tour (planning assumption, not a fact about any hotel). The collapsed rooming estimate line is room-nights × this, and editing that line''s unit cost writes back HERE — so the budget line and the rooming header read the same stored number and cannot disagree.';

-- ── 3. budget_line_items.unit_cost ──────────────────────────────────
-- The per-unit figure behind `proposed_cost`, following the gear pattern in
-- `lib/gear/deriveBudget.ts:13-84` (`const total = unitCost * qty`). Hotels
-- currently hardcode `quantity: 1` (`reconcileDerivedLines.ts:369`) and bake
-- the nights into the cost, while the label already advertises the room count
-- it refuses to multiply by (`:180`, from `roomCountByHotel` at `:114-120`,
-- computed and then discarded).
--
-- NULLABLE: NULL means "this line has no unit breakdown", which is every
-- existing row. Nothing derives `proposed_cost` from it until the code lands.
ALTER TABLE public.budget_line_items
  ADD COLUMN IF NOT EXISTS unit_cost numeric;

COMMENT ON COLUMN public.budget_line_items.unit_cost IS
  'Per-unit cost behind proposed_cost (proposed_cost = unit_cost × quantity where set). NULL = no unit breakdown. On the collapsed rooming estimate line, quantity is room-nights and editing unit_cost writes through to budget_settings.default_room_rate — the one narrow exemption to the derived-row edit guard at line-items/route.ts:442.';

-- ============================================
-- DOWN
--
-- ALTER TABLE public.budget_line_items DROP COLUMN IF EXISTS unit_cost;
-- ALTER TABLE public.budget_settings   DROP COLUMN IF EXISTS default_room_rate;
-- ALTER TABLE public.hotels            DROP COLUMN IF EXISTS is_placeholder;
--
-- Safe: all three are additive and nullable-or-defaulted, and no existing code
-- reads them. The only loss is the is_placeholder backfill, which the same
-- guarded UPDATE above reproduces.
-- ============================================
