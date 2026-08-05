-- ============================================================================
-- 255_movements_gear_first.sql
--
-- S1 D-2 (0/n) — make rental_movements gear-first so a movement can be logged
-- for a gear-native item, and give `gear` its own QR tokens.
--
-- THE BLOCKER. 094_rental_movements.sql:27 declares
--     rental_inventory_id UUID NOT NULL REFERENCES rental_inventory(id)
-- and 250 added `gear_id` as NULLABLE without relaxing it. A gear row created
-- natively through Assets has rental_inventory_id NULL (057:20-25 is a
-- provenance pointer, ON DELETE SET NULL), so its movement insert fails the
-- NOT NULL. The table is still structurally rental-first despite 250's framing.
--
-- THE ARGUMENT FOR GEAR-FIRST rather than a permissive
-- CHECK (gear_id IS NOT NULL OR rental_inventory_id IS NOT NULL):
--
--   1. `gear` is canonical after Stage B. 248 made the mapping TOTAL — every
--      rental_inventory row has exactly one gear row — so gear_id can address
--      every item that exists, and rental_inventory_id cannot.
--   2. A permissive CHECK preserves the ambiguity rather than resolving it.
--      Every reader downstream would then carry "which referent is set?"
--      forever, and the scan flow would be the first of many places to encode
--      that branch. Two nullable referents with no rule is what we have now,
--      and it is why nothing enforces that they agree.
--   3. It makes the bad state unrepresentable rather than detectable. With
--      gear_id NOT NULL there is one referent, always populated, and
--      rental_inventory_id is demoted to what it actually is: legacy
--      provenance. No CHECK is needed because there is no longer a choice.
--
-- SAFE TO PASTE — probed 2026-08-05, not assumed:
--   rental_movements rows_without_gear_id = 0   (250's backfill resolved)
--   gear total 33 · without_qr_token 0 · gear_native_no_provenance 0
-- Step 1 below re-asserts that at paste time anyway, so a re-paste against
-- changed data fails LOUDLY instead of silently skipping.
--
-- FK ASYMMETRY, fixed here as flagged. Both referents were ON DELETE CASCADE,
-- which contradicts 094's stated intent that movements survive as historical
-- record. rental_inventory_id becomes ON DELETE SET NULL: deleting a legacy
-- rental row must not destroy the movement history of an item that still
-- exists. gear_id STAYS CASCADE deliberately — with gear_id NOT NULL a movement
-- without its item is meaningless, and RESTRICT would make any scanned item
-- undeletable.
--
-- WRITE: unchanged. This alters no policy. rental_movements keeps its existing
-- workspace-scoped RLS; the write path is admin + manager via requireWrite on
-- the route (S1 D-2), and readonly members may SELECT their workspace's rows.
--
-- IDEMPOTENT: every step guarded; re-running is a no-op.

-- ── 1. ASSERT before altering. A loud failure beats a silent skip. ──────────
DO $$
DECLARE
  v_orphans BIGINT;
BEGIN
  SELECT count(*) INTO v_orphans FROM public.rental_movements WHERE gear_id IS NULL;
  IF v_orphans > 0 THEN
    RAISE EXCEPTION
      'ABORT: % rental_movements row(s) have gear_id IS NULL. Backfill them before pasting 255 — see 250:26-30 for the resolution query.',
      v_orphans;
  END IF;
END $$;

-- ── 2. gear_id becomes THE referent. ───────────────────────────────────────
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='rental_movements'
      AND column_name='gear_id' AND is_nullable='YES'
  ) THEN
    ALTER TABLE public.rental_movements ALTER COLUMN gear_id SET NOT NULL;
  END IF;
END $$;

-- ── 3. rental_inventory_id becomes optional provenance. ────────────────────
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='rental_movements'
      AND column_name='rental_inventory_id' AND is_nullable='NO'
  ) THEN
    ALTER TABLE public.rental_movements ALTER COLUMN rental_inventory_id DROP NOT NULL;
  END IF;
END $$;

COMMENT ON COLUMN public.rental_movements.gear_id IS
  'THE referent. Always set. gear is canonical after Stage B (248).';
COMMENT ON COLUMN public.rental_movements.rental_inventory_id IS
  'Legacy provenance only, nullable since 255. Never the identity of the item — '
  'read gear_id. NULL for anything created natively through Assets.';

-- ── 4. History survives the deletion of a legacy rental row. ───────────────
DO $$
DECLARE
  v_con TEXT;
BEGIN
  SELECT tc.constraint_name INTO v_con
  FROM information_schema.table_constraints tc
  JOIN information_schema.key_column_usage kcu
    ON kcu.constraint_name = tc.constraint_name AND kcu.table_schema = tc.table_schema
  WHERE tc.table_schema='public' AND tc.table_name='rental_movements'
    AND tc.constraint_type='FOREIGN KEY' AND kcu.column_name='rental_inventory_id'
  LIMIT 1;

  IF v_con IS NOT NULL THEN
    EXECUTE format('ALTER TABLE public.rental_movements DROP CONSTRAINT %I', v_con);
  END IF;

  ALTER TABLE public.rental_movements
    ADD CONSTRAINT rental_movements_rental_inventory_id_fkey
    FOREIGN KEY (rental_inventory_id)
    REFERENCES public.rental_inventory(id) ON DELETE SET NULL;
EXCEPTION
  WHEN duplicate_object THEN NULL;  -- already re-pointed by an earlier paste
END $$;

-- ── 5. D2-2: gear gets its OWN qr_token generation. ─────────────────────────
-- The 093 trigger lives on rental_inventory. On gear, qr_token is only ever a
-- request-body passthrough (gear/[id]/route.ts:71) — nothing generates one. All
-- 33 rows have a token because all 33 are rental-derived and inherited it
-- through the 248 backfill. The FIRST item created natively through Assets gets
-- NULL and cannot be labelled, and nothing reports that.
--
-- Same format as 093:47 — 8 hex chars from a fresh UUID (16^8 ~ 4.3B), so
-- existing and new labels are indistinguishable.

CREATE OR REPLACE FUNCTION public.gear_set_qr_token()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.qr_token IS NULL OR btrim(NEW.qr_token) = '' THEN
    NEW.qr_token := substring(replace(gen_random_uuid()::text, '-', ''), 1, 8);
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS gear_qr_token_biu ON public.gear;
CREATE TRIGGER gear_qr_token_biu
  BEFORE INSERT ON public.gear
  FOR EACH ROW EXECUTE FUNCTION public.gear_set_qr_token();

-- Backfill any NULLs. Guarded, so a re-paste touches nothing.
UPDATE public.gear
SET qr_token = substring(replace(gen_random_uuid()::text, '-', ''), 1, 8)
WHERE qr_token IS NULL OR btrim(qr_token) = '';

-- A token is only useful if it is unique — the lookup is .eq('qr_token', ...).
CREATE UNIQUE INDEX IF NOT EXISTS gear_qr_token_key
  ON public.gear (qr_token) WHERE qr_token IS NOT NULL;

-- ── down ──────────────────────────────────────────────────────────────────
-- DROP INDEX IF EXISTS public.gear_qr_token_key;
-- DROP TRIGGER IF EXISTS gear_qr_token_biu ON public.gear;
-- DROP FUNCTION IF EXISTS public.gear_set_qr_token();
-- ALTER TABLE public.rental_movements ALTER COLUMN gear_id DROP NOT NULL;
-- -- rental_inventory_id NOT NULL cannot be restored while gear-native rows
-- -- exist; delete those movements first if you truly need the old shape.
