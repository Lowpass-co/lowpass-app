-- ============================================================
-- Migration: rental_jobs billing details (optional)
-- Adds optional billing fields used by the branded PDF export.
-- All fields nullable; export falls back to client_name only when
-- billing fields are blank.
-- ============================================================

ALTER TABLE rental_jobs
  ADD COLUMN IF NOT EXISTS billing_address TEXT,
  ADD COLUMN IF NOT EXISTS billing_email   TEXT,
  ADD COLUMN IF NOT EXISTS billing_phone   TEXT,
  ADD COLUMN IF NOT EXISTS billing_tax_id  TEXT;

COMMENT ON COLUMN rental_jobs.billing_address IS 'Optional multi-line billing address for the rental quote/invoice export.';
COMMENT ON COLUMN rental_jobs.billing_email   IS 'Optional billing contact email.';
COMMENT ON COLUMN rental_jobs.billing_phone   IS 'Optional billing contact phone.';
COMMENT ON COLUMN rental_jobs.billing_tax_id  IS 'Optional VAT / EIN / tax-ID for invoicing.';
