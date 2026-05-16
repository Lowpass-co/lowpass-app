/* ============================================
   Migration 093 — rental_inventory Carnet + scanning fields
   (Sprint 12 §1)

   Adds the field set the Carnet CSV export (Sprint 12 §5) and
   the QR-scan workflow (Sprint 12 §2 + §3) need:

     - country_of_origin   ALREADY in TS / migration 092 — defensive
                           ADD COLUMN IF NOT EXISTS so prod tables
                           that drifted gain it.
     - customs_hs_code     Optional HS classification for Carnet.
     - weight_kg           ALREADY in TS / 092 — defensive.
     - value_amount        Replacement value for Carnet + insurance.
     - value_currency      ISO-4217 (defaults to 'GBP' since
                           Adam's workspace is GBP).
     - dimensions_cm       JSONB { l, w, h } for shipping.
     - qr_token            Stable 8-char short ID encoded in the
                           printed QR. UNIQUE per workspace via
                           a partial index (workspace_id lands in
                           migration 095, so the unique index is
                           created there once the column exists).

   qr_token backfill: 8 hex chars from a fresh random UUID for
   every existing row that doesn't have one. 4.3B-ish key space;
   collision risk inside a single workspace's inventory is
   negligible. The UNIQUE-within-workspace index in 095 belt-
   and-braces guards against a second-paste accidentally
   duplicating.

   Apply via: npm run db:migrate
   ============================================ */

ALTER TABLE public.rental_inventory
  ADD COLUMN IF NOT EXISTS country_of_origin TEXT,
  ADD COLUMN IF NOT EXISTS customs_hs_code TEXT,
  ADD COLUMN IF NOT EXISTS weight_kg NUMERIC(10, 3),
  ADD COLUMN IF NOT EXISTS value_amount NUMERIC(12, 2),
  ADD COLUMN IF NOT EXISTS value_currency TEXT DEFAULT 'GBP',
  ADD COLUMN IF NOT EXISTS dimensions_cm JSONB DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS qr_token TEXT;

/* Backfill qr_token for rows that don't have one yet. Runs
   once; subsequent re-applies are no-ops because the WHERE
   filters out already-stamped rows. The substring of a fresh
   UUID gives us 8 hex chars (16^8 ≈ 4.3B combos). */
UPDATE public.rental_inventory
SET qr_token = substring(replace(gen_random_uuid()::text, '-', ''), 1, 8)
WHERE qr_token IS NULL;

/* Plain (non-unique) index for the lookup-by-token path used
   by /api/rental/scan. The UNIQUE-within-workspace partial
   index lands in 095 alongside the workspace_id column. */
CREATE INDEX IF NOT EXISTS rental_inventory_qr_token_idx
  ON public.rental_inventory (qr_token)
  WHERE qr_token IS NOT NULL;

/* ============================================
   Down migration
   ============================================ */
-- DROP INDEX IF EXISTS rental_inventory_qr_token_idx;
-- ALTER TABLE public.rental_inventory
--   DROP COLUMN IF EXISTS qr_token,
--   DROP COLUMN IF EXISTS dimensions_cm,
--   DROP COLUMN IF EXISTS value_currency,
--   DROP COLUMN IF EXISTS value_amount,
--   DROP COLUMN IF EXISTS customs_hs_code;
-- (country_of_origin + weight_kg intentionally NOT dropped — they
--  predate this migration in the TS shape.)
