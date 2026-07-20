-- ============================================================================
-- 247_gear_physical_carnet_columns.sql
--
-- S1 Stage B (2/5) — make `gear` the ONE item table. Move rental_inventory's
-- physical / carnet / lifecycle columns UP onto gear, and add placement FKs
-- (space_id / container_id) so an item lives in a container or directly in a
-- space (or neither = the "unassigned" bucket).
--
-- Additive only — every column IF NOT EXISTS, so re-paste is a no-op. Existing
-- gear rows get the column defaults (status='available', day_rate_manual=false).
-- Backfill FROM rental_inventory happens in migration 248.
--
-- HAND-APPLIED. Idempotent; down-block at the end. Depends on 246 (spaces /
-- containers must exist for the FKs).
-- ============================================================================

BEGIN;

ALTER TABLE public.gear
  ADD COLUMN IF NOT EXISTS country_of_origin TEXT,
  ADD COLUMN IF NOT EXISTS customs_hs_code   TEXT,
  ADD COLUMN IF NOT EXISTS purchase_cost     NUMERIC(12,2),
  ADD COLUMN IF NOT EXISTS day_rate          NUMERIC(10,2),
  ADD COLUMN IF NOT EXISTS day_rate_manual   BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS weight_kg         NUMERIC(10,3),
  ADD COLUMN IF NOT EXISTS value_amount      NUMERIC(12,2),
  ADD COLUMN IF NOT EXISTS value_currency    TEXT DEFAULT 'GBP',
  ADD COLUMN IF NOT EXISTS dimensions_cm     JSONB NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS qr_token          TEXT,
  ADD COLUMN IF NOT EXISTS status            TEXT NOT NULL DEFAULT 'available'
                            CHECK (status IN ('available','in_use','maintenance','retired')),
  ADD COLUMN IF NOT EXISTS last_used_at      TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS space_id          UUID REFERENCES public.spaces(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS container_id      UUID REFERENCES public.containers(id) ON DELETE SET NULL;

-- qr_token unique WITHIN a workspace (partial — nulls don't collide). Mirrors
-- the 095 rental_inventory index so scan tokens stay unique after the merge.
CREATE UNIQUE INDEX IF NOT EXISTS gear_qr_token_workspace_uidx
  ON public.gear(workspace_id, qr_token) WHERE qr_token IS NOT NULL;

CREATE INDEX IF NOT EXISTS gear_space_idx     ON public.gear(space_id);
CREATE INDEX IF NOT EXISTS gear_container_idx ON public.gear(container_id);

COMMIT;

-- ============================================================================
-- DOWN (manual — paste to reverse):
-- BEGIN;
-- DROP INDEX IF EXISTS public.gear_container_idx;
-- DROP INDEX IF EXISTS public.gear_space_idx;
-- DROP INDEX IF EXISTS public.gear_qr_token_workspace_uidx;
-- ALTER TABLE public.gear
--   DROP COLUMN IF EXISTS container_id, DROP COLUMN IF EXISTS space_id,
--   DROP COLUMN IF EXISTS last_used_at, DROP COLUMN IF EXISTS status,
--   DROP COLUMN IF EXISTS qr_token, DROP COLUMN IF EXISTS dimensions_cm,
--   DROP COLUMN IF EXISTS value_currency, DROP COLUMN IF EXISTS value_amount,
--   DROP COLUMN IF EXISTS weight_kg, DROP COLUMN IF EXISTS day_rate_manual,
--   DROP COLUMN IF EXISTS day_rate, DROP COLUMN IF EXISTS purchase_cost,
--   DROP COLUMN IF EXISTS customs_hs_code, DROP COLUMN IF EXISTS country_of_origin;
-- COMMIT;
-- ============================================================================
