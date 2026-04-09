-- ============================================================
-- RENTAL HOUSE — Database Setup
-- Compatible with the Claude migration (user_id + RLS + policies).
-- Safe to re-run: ADD COLUMN IF NOT EXISTS, DROP POLICY IF EXISTS,
-- CREATE INDEX IF NOT EXISTS.
--
-- Supabase → SQL Editor → paste → Run
-- Run the artist/tour block only after `artists` and `tours` tables exist.
-- ============================================================

-- ----------------------------------------------------------------
-- 1. Tables (greenfield). IF NOT EXISTS skips if Claude already created them.
-- ----------------------------------------------------------------
CREATE TABLE IF NOT EXISTS rental_inventory (
  id                UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id           UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  name              TEXT NOT NULL,
  category          TEXT,
  serial_number     TEXT,
  country_of_origin TEXT,
  purchase_cost     NUMERIC(10,2),
  day_rate          NUMERIC(10,2),
  weight_kg         NUMERIC(8,2),
  image_url         TEXT,
  notes             TEXT,
  created_at        TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS rental_jobs (
  id               UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id          UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  name             TEXT NOT NULL,
  client_name      TEXT,
  start_date       DATE,
  end_date         DATE,
  discount_percent NUMERIC(5,2) DEFAULT 0,
  discount_fixed   NUMERIC(10,2) DEFAULT 0,
  notes            TEXT,
  status           TEXT DEFAULT 'draft'
                   CHECK (status IN ('draft', 'confirmed', 'invoiced', 'completed')),
  created_at       TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS rental_job_items (
  id                UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  job_id            UUID NOT NULL REFERENCES rental_jobs(id) ON DELETE CASCADE,
  inventory_id      UUID NOT NULL REFERENCES rental_inventory(id) ON DELETE RESTRICT,
  quantity          INTEGER DEFAULT 1,
  day_rate_override NUMERIC(10,2),
  created_at        TIMESTAMPTZ DEFAULT NOW()
);

-- ----------------------------------------------------------------
-- 2. user_id on existing tables (same as Claude migration — no-op if present)
-- ----------------------------------------------------------------
ALTER TABLE rental_inventory ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE rental_jobs ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE;

-- Day rate: auto 1% of purchase unless user overrides (app sets day_rate_manual)
ALTER TABLE rental_inventory ADD COLUMN IF NOT EXISTS day_rate_manual BOOLEAN NOT NULL DEFAULT FALSE;
UPDATE rental_inventory
SET day_rate_manual = TRUE
WHERE purchase_cost IS NOT NULL AND purchase_cost > 0
  AND day_rate IS NOT NULL
  AND ABS(day_rate - ROUND((purchase_cost * 0.01)::numeric, 2)) > 0.02;
UPDATE rental_inventory
SET day_rate = ROUND((purchase_cost * 0.01)::numeric, 2)
WHERE day_rate_manual = FALSE
  AND purchase_cost IS NOT NULL AND purchase_cost > 0;

-- Optional after backfilling NULL user_id rows:
-- ALTER TABLE rental_inventory ALTER COLUMN user_id SET NOT NULL;
-- ALTER TABLE rental_jobs ALTER COLUMN user_id SET NOT NULL;

-- ----------------------------------------------------------------
-- 3. RLS
-- ----------------------------------------------------------------
ALTER TABLE rental_inventory ENABLE ROW LEVEL SECURITY;
ALTER TABLE rental_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE rental_job_items ENABLE ROW LEVEL SECURITY;

-- ----------------------------------------------------------------
-- 4. Policies (match Claude — drop first so re-runs succeed)
-- ----------------------------------------------------------------
DROP POLICY IF EXISTS "Users manage own inventory" ON rental_inventory;
CREATE POLICY "Users manage own inventory"
  ON rental_inventory FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users manage own jobs" ON rental_jobs;
CREATE POLICY "Users manage own jobs"
  ON rental_jobs FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users manage items in own jobs" ON rental_job_items;
CREATE POLICY "Users manage items in own jobs"
  ON rental_job_items FOR ALL
  USING (
    job_id IN (SELECT id FROM rental_jobs WHERE user_id = auth.uid())
  )
  WITH CHECK (
    job_id IN (SELECT id FROM rental_jobs WHERE user_id = auth.uid())
  );

-- ----------------------------------------------------------------
-- 5. Indexes
-- ----------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_rental_inventory_user ON rental_inventory(user_id);
CREATE INDEX IF NOT EXISTS idx_rental_jobs_user ON rental_jobs(user_id);
CREATE INDEX IF NOT EXISTS idx_rental_job_items_job ON rental_job_items(job_id);

-- ----------------------------------------------------------------
-- 6. Workspace artist / tour links (app Equipment → Jobs). Requires `artists` + `tours`.
-- ----------------------------------------------------------------
ALTER TABLE rental_jobs
  ADD COLUMN IF NOT EXISTS artist_id UUID REFERENCES artists(id) ON DELETE SET NULL;
ALTER TABLE rental_jobs
  ADD COLUMN IF NOT EXISTS tour_id UUID REFERENCES tours(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_rental_jobs_artist ON rental_jobs(artist_id);
CREATE INDEX IF NOT EXISTS idx_rental_jobs_tour ON rental_jobs(tour_id);
