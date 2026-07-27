-- 252_receipt_page_range.sql
--
-- RC-5 — one uploaded PDF can hold SEVERAL receipts.
--
-- A hotel folio is one receipt over four pages. A TM scanning a week's stack is
-- N receipts in one file. The second case needs N expense_receipts rows that all
-- point at the SAME stored file (receipt_file_url), distinguished by which pages
-- each one covers — so a reviewer opening row 3 knows to look at pp. 5–6.
--
-- Nullable on purpose: every existing row, and every single-image receipt, has no
-- meaningful page range and must stay valid. NULL means "the whole file".
--
-- No money column is touched. Amounts still land as transactions.
--
-- Idempotent: ADD COLUMN IF NOT EXISTS, and the CHECK is dropped before it is
-- recreated (a CHECK cannot be added "if not exists", and this file WILL be
-- pasted more than once).

ALTER TABLE public.expense_receipts
  ADD COLUMN IF NOT EXISTS page_from integer,
  ADD COLUMN IF NOT EXISTS page_to   integer;

COMMENT ON COLUMN public.expense_receipts.page_from IS
  'RC-5: first 1-based page of this receipt within receipt_file_url. NULL = whole file.';
COMMENT ON COLUMN public.expense_receipts.page_to IS
  'RC-5: last 1-based page of this receipt within receipt_file_url. NULL = whole file.';

-- Either both bounds are set and sane, or neither is.
ALTER TABLE public.expense_receipts
  DROP CONSTRAINT IF EXISTS expense_receipts_page_range_check;
ALTER TABLE public.expense_receipts
  ADD CONSTRAINT expense_receipts_page_range_check CHECK (
    (page_from IS NULL AND page_to IS NULL)
    OR (page_from >= 1 AND page_to >= page_from)
  );

-- Siblings split out of one upload are read together; index the file they share.
CREATE INDEX IF NOT EXISTS expense_receipts_file_url_idx
  ON public.expense_receipts (workspace_id, receipt_file_url)
  WHERE receipt_file_url IS NOT NULL;

-- ============================================================
-- DOWN
-- ============================================================
-- DROP INDEX IF EXISTS public.expense_receipts_file_url_idx;
-- ALTER TABLE public.expense_receipts
--   DROP CONSTRAINT IF EXISTS expense_receipts_page_range_check;
-- ALTER TABLE public.expense_receipts
--   DROP COLUMN IF EXISTS page_from,
--   DROP COLUMN IF EXISTS page_to;
