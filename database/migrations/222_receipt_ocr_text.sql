-- ============================================
-- LOWPASS — Receipt OCR text (Receipts B2 — searchable receipts)
-- Migration 222
-- ============================================
--
-- B2 turns on per-receipt OCR in the bulk inbox AND makes receipts searchable.
-- The OCR route (Claude Vision) persists its extraction here so a ⌘K provider can
-- fuzzy-match over vendor / amount / date / extracted text without re-scanning:
--
--   • expense_receipts.raw_ocr_json — the structured Vision JSON (vendor, date,
--     total_amount, currency, category, description, payment_method, line_items).
--   • expense_receipts.extracted_text — a flat, searchable concatenation of the
--     scrape (vendor + description + line-item descriptions) for the search index.
--
-- Receipts are workspace-scoped financial/PII — these columns ride the existing
-- expense_receipts RLS (no new policy). Additive, nullable, idempotent. Down-block.
--
-- NUMBER: 219 (rollback) / 220 (income overrides) / 221 (income actuals) are all
-- taken across main + active branches → this is 222 (re-confirmed at write time).

ALTER TABLE public.expense_receipts
  ADD COLUMN IF NOT EXISTS raw_ocr_json   JSONB,
  ADD COLUMN IF NOT EXISTS extracted_text TEXT;

-- Trigram index on the flat text so the scoped ?q= search stays fast as the
-- receipt log grows. pg_trgm is already enabled (used elsewhere); guard anyway.
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE INDEX IF NOT EXISTS expense_receipts_extracted_text_trgm
  ON public.expense_receipts USING gin (extracted_text gin_trgm_ops);

-- ============================================================
-- DOWN MIGRATION (manual — uncomment to roll back)
-- ============================================================
-- DROP INDEX IF EXISTS public.expense_receipts_extracted_text_trgm;
-- ALTER TABLE public.expense_receipts
--   DROP COLUMN IF EXISTS raw_ocr_json,
--   DROP COLUMN IF EXISTS extracted_text;
