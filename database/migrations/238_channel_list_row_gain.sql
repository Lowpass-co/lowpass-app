-- ============================================================
-- Migration 238 — channel_list_rows: add `gain` column
--
-- P4 Stage 4 (Channel list) · VIS-CL-06. The channel-list editor gains a Gain
-- column. Stored as TEXT (mirrors 098's cable_length) so the editor can hold
-- flexible values ("+4", "unity", "-10dB") without a numeric-unit contract.
--
-- Idempotent + re-runnable (hand-paste convention — no migration runner, no
-- _lp_migrations tracking): ADD COLUMN IF NOT EXISTS. Down-block at the end.
-- Next free number after 237 on main.
-- ============================================================

ALTER TABLE public.channel_list_rows
  ADD COLUMN IF NOT EXISTS gain TEXT;

-- ---- DOWN ----
-- ALTER TABLE public.channel_list_rows
--   DROP COLUMN IF EXISTS gain;
