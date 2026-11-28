-- ============================================================================
-- 307_rental_quote_settings.sql
--
-- Rental quote / invoice settings (Nov 2026, Adam — the rental visual pass):
--
--   1. workspaces.rental_quote_valid_days — a quote PDF prints "Valid until
--      <issue date + N days>". Default 14 (Adam: "14"). It used to print a
--      fixed "valid for 30 days" in the terms.
--   2. workspaces.rental_payment_details — free text (bank details, payment
--      terms) typed once and printed on the PDF when the export asks for it
--      (Adam: "put em on there as an optional"). NULL = none. Lowpass stores
--      and prints what was typed; it never reads it.
--
-- Needs 306 first only in the sense that the app reads both; nothing here
-- depends on 306's columns.
--
-- HAND-APPLIED. Idempotent / re-runnable: ADD COLUMN IF NOT EXISTS, constraints
-- added only when missing. Down-block at the end. Ends with a read-only report.
-- ============================================================================

BEGIN;

ALTER TABLE public.workspaces
  ADD COLUMN IF NOT EXISTS rental_quote_valid_days INTEGER NOT NULL DEFAULT 14;
ALTER TABLE public.workspaces
  ADD COLUMN IF NOT EXISTS rental_payment_details TEXT;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'workspaces_rental_quote_valid_days_range') THEN
    ALTER TABLE public.workspaces ADD CONSTRAINT workspaces_rental_quote_valid_days_range
      CHECK (rental_quote_valid_days >= 1 AND rental_quote_valid_days <= 365);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'workspaces_rental_payment_details_len') THEN
    ALTER TABLE public.workspaces ADD CONSTRAINT workspaces_rental_payment_details_len
      CHECK (rental_payment_details IS NULL OR char_length(rental_payment_details) <= 2000);
  END IF;
END $$;

COMMIT;

-- ── Report (read-only): both should be 1 ────────────────────────────────────
SELECT
  (SELECT count(*) FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = 'workspaces' AND column_name = 'rental_quote_valid_days') AS has_valid_days,
  (SELECT count(*) FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = 'workspaces' AND column_name = 'rental_payment_details')  AS has_payment_details;

/* ============================================================================
   DOWN (manual):
   ALTER TABLE public.workspaces DROP CONSTRAINT IF EXISTS workspaces_rental_payment_details_len;
   ALTER TABLE public.workspaces DROP CONSTRAINT IF EXISTS workspaces_rental_quote_valid_days_range;
   ALTER TABLE public.workspaces DROP COLUMN IF EXISTS rental_payment_details;
   ALTER TABLE public.workspaces DROP COLUMN IF EXISTS rental_quote_valid_days;
   ============================================================================ */
