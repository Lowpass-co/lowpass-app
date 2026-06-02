/* ============================================================
   APPLY 091 → 095 in Supabase SQL Editor
   (Sprint 11 §5 + Sprint 12 §1 combined)

   Single paste; runs in order. All five migrations are
   idempotent — safe to re-run if the SQL Editor times out
   partway and you need to retry.

   091 is included because it adds the rental_inventory.status
   column that 092's index references. If 091 was partially
   applied previously (e.g. category column landed but status
   didn't), this re-run will fill the gaps without rebuilding
   anything already in place.

   After successful run, scroll to the bottom — the tracking
   inserts mark all five as applied in public._lp_migrations
   so a future `npm run db:migrate` won't try them again.
   ============================================================ */


/* ============================================================
   MIGRATION 091 — rental_inventory grid columns
   (category / status / last_used_at)
   ============================================================ */

ALTER TABLE public.rental_inventory
  ADD COLUMN IF NOT EXISTS category TEXT;

ALTER TABLE public.rental_inventory
  ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'available';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'rental_inventory_status_check'
      AND conrelid = 'public.rental_inventory'::regclass
  ) THEN
    ALTER TABLE public.rental_inventory
      ADD CONSTRAINT rental_inventory_status_check
      CHECK (status IN ('available', 'in_use', 'maintenance', 'retired'));
  END IF;
END $$;

ALTER TABLE public.rental_inventory
  ADD COLUMN IF NOT EXISTS last_used_at TIMESTAMPTZ;

UPDATE public.rental_inventory inv
SET last_used_at = sub.last_use
FROM (
  SELECT rji.inventory_id, MAX(
    COALESCE(
      to_timestamp(rj.start_date::text, 'YYYY-MM-DD'),
      rj.created_at
    )
  ) AS last_use
  FROM public.rental_job_items rji
  INNER JOIN public.rental_jobs rj ON rj.id = rji.job_id
  WHERE rj.status IN ('confirmed', 'invoiced', 'completed')
  GROUP BY rji.inventory_id
) AS sub
WHERE inv.id = sub.inventory_id
  AND (inv.last_used_at IS DISTINCT FROM sub.last_use);

CREATE INDEX IF NOT EXISTS rental_inventory_status_active_idx
  ON public.rental_inventory (status)
  WHERE status IN ('in_use', 'maintenance');

CREATE INDEX IF NOT EXISTS rental_inventory_last_used_at_idx
  ON public.rental_inventory (last_used_at DESC NULLS LAST);


/* ============================================================
   MIGRATION 092 — rental_* tables orphan capture
   ============================================================ */

CREATE TABLE IF NOT EXISTS public.rental_inventory (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  category TEXT,
  serial_number TEXT,
  country_of_origin TEXT,
  purchase_cost NUMERIC(12, 2),
  day_rate NUMERIC(10, 2),
  day_rate_manual BOOLEAN NOT NULL DEFAULT FALSE,
  weight_kg NUMERIC(10, 3),
  image_url TEXT,
  notes TEXT,
  status TEXT NOT NULL DEFAULT 'available'
    CHECK (status IN ('available', 'in_use', 'maintenance', 'retired')),
  last_used_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_rental_inventory_user_id
  ON public.rental_inventory (user_id);
CREATE INDEX IF NOT EXISTS idx_rental_inventory_category
  ON public.rental_inventory (category);
CREATE INDEX IF NOT EXISTS rental_inventory_status_active_idx
  ON public.rental_inventory (status)
  WHERE status IN ('in_use', 'maintenance');
CREATE INDEX IF NOT EXISTS rental_inventory_last_used_at_idx
  ON public.rental_inventory (last_used_at DESC NULLS LAST);

CREATE TABLE IF NOT EXISTS public.rental_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  client_name TEXT,
  artist_id UUID REFERENCES public.artists(id) ON DELETE SET NULL,
  tour_id UUID REFERENCES public.tours(id) ON DELETE SET NULL,
  start_date DATE,
  end_date DATE,
  discount_percent NUMERIC(5, 2),
  discount_fixed NUMERIC(10, 2),
  notes TEXT,
  status TEXT NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'confirmed', 'invoiced', 'completed')),
  billing_address TEXT,
  billing_email TEXT,
  billing_phone TEXT,
  billing_tax_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_rental_jobs_user_id
  ON public.rental_jobs (user_id);
CREATE INDEX IF NOT EXISTS rental_jobs_tour_id_idx
  ON public.rental_jobs (tour_id);
CREATE INDEX IF NOT EXISTS idx_rental_jobs_status
  ON public.rental_jobs (status);

CREATE TABLE IF NOT EXISTS public.rental_job_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id UUID NOT NULL REFERENCES public.rental_jobs(id) ON DELETE CASCADE,
  inventory_id UUID NOT NULL REFERENCES public.rental_inventory(id) ON DELETE RESTRICT,
  quantity INTEGER NOT NULL DEFAULT 1 CHECK (quantity > 0),
  day_rate_override NUMERIC(10, 2),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_rental_job_items_job_id
  ON public.rental_job_items (job_id);
CREATE INDEX IF NOT EXISTS idx_rental_job_items_inventory_id
  ON public.rental_job_items (inventory_id);

ALTER TABLE public.rental_inventory ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.rental_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.rental_job_items ENABLE ROW LEVEL SECURITY;


/* ============================================================
   MIGRATION 093 — rental_inventory Carnet + scan fields
   ============================================================ */

ALTER TABLE public.rental_inventory
  ADD COLUMN IF NOT EXISTS country_of_origin TEXT,
  ADD COLUMN IF NOT EXISTS customs_hs_code TEXT,
  ADD COLUMN IF NOT EXISTS weight_kg NUMERIC(10, 3),
  ADD COLUMN IF NOT EXISTS value_amount NUMERIC(12, 2),
  ADD COLUMN IF NOT EXISTS value_currency TEXT DEFAULT 'GBP',
  ADD COLUMN IF NOT EXISTS dimensions_cm JSONB DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS qr_token TEXT;

UPDATE public.rental_inventory
SET qr_token = substring(replace(gen_random_uuid()::text, '-', ''), 1, 8)
WHERE qr_token IS NULL;

CREATE INDEX IF NOT EXISTS rental_inventory_qr_token_idx
  ON public.rental_inventory (qr_token)
  WHERE qr_token IS NOT NULL;


/* ============================================================
   MIGRATION 094 — rental_movements audit log
   ============================================================ */

CREATE TABLE IF NOT EXISTS public.rental_movements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  rental_inventory_id UUID NOT NULL REFERENCES public.rental_inventory(id) ON DELETE CASCADE,
  rental_job_id UUID REFERENCES public.rental_jobs(id) ON DELETE SET NULL,
  movement_type TEXT NOT NULL
    CHECK (movement_type IN ('scan_out', 'scan_in', 'mark_repair', 'mark_lost', 'manual_correction')),
  scanned_by_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS rental_movements_item_idx
  ON public.rental_movements (rental_inventory_id, created_at DESC);

CREATE INDEX IF NOT EXISTS rental_movements_job_idx
  ON public.rental_movements (rental_job_id, created_at DESC)
  WHERE rental_job_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS rental_movements_workspace_idx
  ON public.rental_movements (workspace_id, created_at DESC);

ALTER TABLE public.rental_movements ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS rental_movements_select ON public.rental_movements;
CREATE POLICY rental_movements_select ON public.rental_movements
  FOR SELECT
  USING (workspace_id = public.get_my_workspace_id());

DROP POLICY IF EXISTS rental_movements_insert ON public.rental_movements;
CREATE POLICY rental_movements_insert ON public.rental_movements
  FOR INSERT
  WITH CHECK (workspace_id = public.get_my_workspace_id());

DROP POLICY IF EXISTS rental_movements_update ON public.rental_movements;
CREATE POLICY rental_movements_update ON public.rental_movements
  FOR UPDATE
  USING (workspace_id = public.get_my_workspace_id())
  WITH CHECK (workspace_id = public.get_my_workspace_id());

DROP POLICY IF EXISTS rental_movements_delete ON public.rental_movements;
CREATE POLICY rental_movements_delete ON public.rental_movements
  FOR DELETE
  USING (workspace_id = public.get_my_workspace_id() AND public.is_workspace_admin());


/* ============================================================
   MIGRATION 095 — workspace_id denormalise + canonical RLS swap
   ============================================================ */

-- 1. ADD COLUMN workspace_id (nullable for backfill)
ALTER TABLE public.rental_inventory
  ADD COLUMN IF NOT EXISTS workspace_id UUID
    REFERENCES public.workspaces(id) ON DELETE CASCADE;

ALTER TABLE public.rental_jobs
  ADD COLUMN IF NOT EXISTS workspace_id UUID
    REFERENCES public.workspaces(id) ON DELETE CASCADE;

ALTER TABLE public.rental_job_items
  ADD COLUMN IF NOT EXISTS workspace_id UUID
    REFERENCES public.workspaces(id) ON DELETE CASCADE;

-- 2. Backfill from user_id → profiles.workspace_id
UPDATE public.rental_inventory ri
SET workspace_id = p.workspace_id
FROM public.profiles p
WHERE ri.user_id = p.id AND ri.workspace_id IS NULL;

UPDATE public.rental_jobs rj
SET workspace_id = p.workspace_id
FROM public.profiles p
WHERE rj.user_id = p.id AND rj.workspace_id IS NULL;

UPDATE public.rental_job_items rji
SET workspace_id = rj.workspace_id
FROM public.rental_jobs rj
WHERE rji.job_id = rj.id AND rji.workspace_id IS NULL;

-- 3. Set NOT NULL + indexes for the new RLS pattern
ALTER TABLE public.rental_inventory ALTER COLUMN workspace_id SET NOT NULL;
ALTER TABLE public.rental_jobs ALTER COLUMN workspace_id SET NOT NULL;
ALTER TABLE public.rental_job_items ALTER COLUMN workspace_id SET NOT NULL;

CREATE INDEX IF NOT EXISTS idx_rental_inventory_workspace
  ON public.rental_inventory (workspace_id);
CREATE INDEX IF NOT EXISTS idx_rental_jobs_workspace
  ON public.rental_jobs (workspace_id);
CREATE INDEX IF NOT EXISTS idx_rental_job_items_workspace
  ON public.rental_job_items (workspace_id);

CREATE UNIQUE INDEX IF NOT EXISTS rental_inventory_qr_token_workspace_unique
  ON public.rental_inventory (workspace_id, qr_token)
  WHERE qr_token IS NOT NULL;

-- 4. Canonical RLS swap — rental_inventory
DROP POLICY IF EXISTS rental_inventory_user_select ON public.rental_inventory;
DROP POLICY IF EXISTS rental_inventory_user_insert ON public.rental_inventory;
DROP POLICY IF EXISTS rental_inventory_user_update ON public.rental_inventory;
DROP POLICY IF EXISTS rental_inventory_user_delete ON public.rental_inventory;
DROP POLICY IF EXISTS rental_inventory_workspace_member_select ON public.rental_inventory;
DROP POLICY IF EXISTS rental_inventory_workspace_member_insert ON public.rental_inventory;
DROP POLICY IF EXISTS rental_inventory_workspace_member_update ON public.rental_inventory;
DROP POLICY IF EXISTS rental_inventory_workspace_member_delete ON public.rental_inventory;
DROP POLICY IF EXISTS rental_inventory_select ON public.rental_inventory;
DROP POLICY IF EXISTS rental_inventory_insert ON public.rental_inventory;
DROP POLICY IF EXISTS rental_inventory_update ON public.rental_inventory;
DROP POLICY IF EXISTS rental_inventory_delete ON public.rental_inventory;

CREATE POLICY rental_inventory_select ON public.rental_inventory
  FOR SELECT USING (workspace_id = public.get_my_workspace_id());
CREATE POLICY rental_inventory_insert ON public.rental_inventory
  FOR INSERT WITH CHECK (workspace_id = public.get_my_workspace_id());
CREATE POLICY rental_inventory_update ON public.rental_inventory
  FOR UPDATE USING (workspace_id = public.get_my_workspace_id())
  WITH CHECK (workspace_id = public.get_my_workspace_id());
CREATE POLICY rental_inventory_delete ON public.rental_inventory
  FOR DELETE USING (workspace_id = public.get_my_workspace_id() AND public.is_workspace_admin());

-- Canonical RLS swap — rental_jobs
DROP POLICY IF EXISTS rental_jobs_user_select ON public.rental_jobs;
DROP POLICY IF EXISTS rental_jobs_user_insert ON public.rental_jobs;
DROP POLICY IF EXISTS rental_jobs_user_update ON public.rental_jobs;
DROP POLICY IF EXISTS rental_jobs_user_delete ON public.rental_jobs;
DROP POLICY IF EXISTS rental_jobs_workspace_member_select ON public.rental_jobs;
DROP POLICY IF EXISTS rental_jobs_workspace_member_insert ON public.rental_jobs;
DROP POLICY IF EXISTS rental_jobs_workspace_member_update ON public.rental_jobs;
DROP POLICY IF EXISTS rental_jobs_workspace_member_delete ON public.rental_jobs;
DROP POLICY IF EXISTS rental_jobs_select ON public.rental_jobs;
DROP POLICY IF EXISTS rental_jobs_insert ON public.rental_jobs;
DROP POLICY IF EXISTS rental_jobs_update ON public.rental_jobs;
DROP POLICY IF EXISTS rental_jobs_delete ON public.rental_jobs;

CREATE POLICY rental_jobs_select ON public.rental_jobs
  FOR SELECT USING (workspace_id = public.get_my_workspace_id());
CREATE POLICY rental_jobs_insert ON public.rental_jobs
  FOR INSERT WITH CHECK (workspace_id = public.get_my_workspace_id());
CREATE POLICY rental_jobs_update ON public.rental_jobs
  FOR UPDATE USING (workspace_id = public.get_my_workspace_id())
  WITH CHECK (workspace_id = public.get_my_workspace_id());
CREATE POLICY rental_jobs_delete ON public.rental_jobs
  FOR DELETE USING (workspace_id = public.get_my_workspace_id() AND public.is_workspace_admin());

-- Canonical RLS swap — rental_job_items
DROP POLICY IF EXISTS rental_job_items_user_select ON public.rental_job_items;
DROP POLICY IF EXISTS rental_job_items_user_insert ON public.rental_job_items;
DROP POLICY IF EXISTS rental_job_items_user_update ON public.rental_job_items;
DROP POLICY IF EXISTS rental_job_items_user_delete ON public.rental_job_items;
DROP POLICY IF EXISTS rental_job_items_workspace_member_select ON public.rental_job_items;
DROP POLICY IF EXISTS rental_job_items_workspace_member_insert ON public.rental_job_items;
DROP POLICY IF EXISTS rental_job_items_workspace_member_update ON public.rental_job_items;
DROP POLICY IF EXISTS rental_job_items_workspace_member_delete ON public.rental_job_items;
DROP POLICY IF EXISTS rental_job_items_select ON public.rental_job_items;
DROP POLICY IF EXISTS rental_job_items_insert ON public.rental_job_items;
DROP POLICY IF EXISTS rental_job_items_update ON public.rental_job_items;
DROP POLICY IF EXISTS rental_job_items_delete ON public.rental_job_items;

CREATE POLICY rental_job_items_select ON public.rental_job_items
  FOR SELECT USING (workspace_id = public.get_my_workspace_id());
CREATE POLICY rental_job_items_insert ON public.rental_job_items
  FOR INSERT WITH CHECK (workspace_id = public.get_my_workspace_id());
CREATE POLICY rental_job_items_update ON public.rental_job_items
  FOR UPDATE USING (workspace_id = public.get_my_workspace_id())
  WITH CHECK (workspace_id = public.get_my_workspace_id());
CREATE POLICY rental_job_items_delete ON public.rental_job_items
  FOR DELETE USING (workspace_id = public.get_my_workspace_id() AND public.is_workspace_admin());


/* ============================================================
   Tracking inserts — mark all four as applied so future
   `npm run db:migrate` runs skip them.
   ============================================================ */

INSERT INTO public._lp_migrations (filename, checksum, applied_by)
VALUES
  ('091_rental_inventory_status_columns.sql',                    'backfill', 'manual-supabase-editor'),
  ('092_rental_tables_orphan_capture.sql',                       'backfill', 'manual-supabase-editor'),
  ('093_rental_inventory_carnet_scan_fields.sql',                'backfill', 'manual-supabase-editor'),
  ('094_rental_movements.sql',                                   'backfill', 'manual-supabase-editor'),
  ('095_rental_workspace_denormalise_and_canonical_rls.sql',     'backfill', 'manual-supabase-editor')
ON CONFLICT (filename) DO NOTHING;


/* ============================================================
   Post-apply verification — run these separately after the
   migration block succeeds. Should all return zero / clean.
   ============================================================ */

-- 1. qr_token column exists + every row has one
-- SELECT COUNT(*) AS missing_qr FROM public.rental_inventory WHERE qr_token IS NULL;

-- 2. workspace_id column populated on all three tables
-- SELECT
--   (SELECT COUNT(*) FROM public.rental_inventory  WHERE workspace_id IS NULL) AS inv_missing_ws,
--   (SELECT COUNT(*) FROM public.rental_jobs        WHERE workspace_id IS NULL) AS jobs_missing_ws,
--   (SELECT COUNT(*) FROM public.rental_job_items   WHERE workspace_id IS NULL) AS items_missing_ws;

-- 3. rental_movements table exists + RLS enabled
-- SELECT relrowsecurity FROM pg_class WHERE relname = 'rental_movements';

-- 4. Tracking row recorded
-- SELECT filename, applied_at FROM public._lp_migrations
-- WHERE filename LIKE '09%_rental%' ORDER BY filename;
