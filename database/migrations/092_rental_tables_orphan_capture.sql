/* ============================================
   Migration 092 — rental_* tables orphan capture (Sprint 12 §1)

   The rental_inventory / rental_jobs / rental_job_items triplet
   has existed in production since the original Rental Business
   module ship, but never had CREATE TABLE statements in the
   migration history — they were direct-pasted into prod.
   CLAUDE.md "Things that have bitten agents before" §3 calls
   this out as a fresh-clone bootstrap hazard.

   This migration captures the schema as observed via:
     - src/components/equipment/types.ts (the canonical TS shape)
     - migration 028 (rental_inventory.day_rate_manual)
     - migration 035 (rental_jobs.billing_*)
     - migration 057 (rental_jobs.tour_id, gear→rental FK)
     - migration 091 (rental_inventory.status, last_used_at)

   Idempotent — `CREATE TABLE IF NOT EXISTS` is a no-op against
   the existing prod tables. If your production schema turns
   out to have additional columns this migration didn't capture,
   add them in a follow-up `ALTER TABLE … ADD COLUMN IF NOT
   EXISTS` migration; this CREATE statement won't reshape an
   existing table.

   Subsequent migrations build on this baseline:
     - 093 — Carnet + scanning fields
     - 094 — rental_movements audit log
     - 095 — workspace_id denormalisation + canonical RLS swap
             (replaces the legacy user-scoped policies — those
             stay in place after THIS migration so app code
             keeps working until 095 lands.)

   Apply via: npm run db:migrate
   ============================================ */

CREATE TABLE IF NOT EXISTS public.rental_inventory (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  category TEXT,
  serial_number TEXT,
  country_of_origin TEXT,
  purchase_cost NUMERIC(12, 2),
  day_rate NUMERIC(10, 2),
  /* Added in 028 — when false, day_rate is auto-derived as 1%
     of purchase_cost. */
  day_rate_manual BOOLEAN NOT NULL DEFAULT FALSE,
  weight_kg NUMERIC(10, 3),
  image_url TEXT,
  notes TEXT,
  /* Added in 091 — lifecycle state. */
  status TEXT NOT NULL DEFAULT 'available'
    CHECK (status IN ('available', 'in_use', 'maintenance', 'retired')),
  /* Added in 091 — server-stamped on confirmed rental_jobs. */
  last_used_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_rental_inventory_user_id
  ON public.rental_inventory (user_id);
CREATE INDEX IF NOT EXISTS idx_rental_inventory_category
  ON public.rental_inventory (category);
/* Indexes from 091 — captured here defensively in case the
   prod table is missing them. */
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
  /* Optional links into the workspace — added in 057 (tour_id).
     artist_id was direct-pasted but maps cleanly to the artists
     table; capture both nullable. */
  artist_id UUID REFERENCES public.artists(id) ON DELETE SET NULL,
  tour_id UUID REFERENCES public.tours(id) ON DELETE SET NULL,
  start_date DATE,
  end_date DATE,
  discount_percent NUMERIC(5, 2),
  discount_fixed NUMERIC(10, 2),
  notes TEXT,
  status TEXT NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'confirmed', 'invoiced', 'completed')),
  /* Added in 035 — billing fields for the branded PDF export. */
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

/* RLS is enabled on all three tables in production with
   user-scoped policies (workspace_members JOIN). Migration 095
   swaps to the canonical workspace-only pattern. We don't
   re-state those policies here — that would risk drifting from
   prod. ENABLE ROW LEVEL SECURITY is also a no-op when already
   enabled. */
ALTER TABLE public.rental_inventory ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.rental_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.rental_job_items ENABLE ROW LEVEL SECURITY;

/* ============================================
   Down migration — DO NOT auto-run. The triplet predates this
   migration in production; dropping would lose data.
   ============================================ */
-- DROP TABLE IF EXISTS public.rental_job_items;
-- DROP TABLE IF EXISTS public.rental_jobs;
-- DROP TABLE IF EXISTS public.rental_inventory;
