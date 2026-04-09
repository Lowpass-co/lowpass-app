-- ============================================================
-- RENTAL HOUSE — Database Setup
-- Run this once in your Supabase SQL Editor:
-- supabase.com → your project → SQL Editor → New query → paste → Run
-- ============================================================

-- Inventory items (per user)
CREATE TABLE IF NOT EXISTS rental_inventory (
  id                UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id           UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
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

-- Jobs / bookings (per user)
CREATE TABLE IF NOT EXISTS rental_jobs (
  id               UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id          UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
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

-- Items assigned to a job
CREATE TABLE IF NOT EXISTS rental_job_items (
  id                UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  job_id            UUID NOT NULL REFERENCES rental_jobs(id) ON DELETE CASCADE,
  inventory_id      UUID NOT NULL REFERENCES rental_inventory(id) ON DELETE RESTRICT,
  quantity          INTEGER DEFAULT 1,
  day_rate_override NUMERIC(10,2),
  created_at        TIMESTAMPTZ DEFAULT NOW()
);

-- Enable RLS — each user only sees their own data
ALTER TABLE rental_inventory ENABLE ROW LEVEL SECURITY;
ALTER TABLE rental_jobs       ENABLE ROW LEVEL SECURITY;
ALTER TABLE rental_job_items  ENABLE ROW LEVEL SECURITY;

-- Policies: rental_inventory
CREATE POLICY "Users manage own inventory"
  ON rental_inventory FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Policies: rental_jobs
CREATE POLICY "Users manage own jobs"
  ON rental_jobs FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Policies: rental_job_items (accessible if you own the parent job)
CREATE POLICY "Users manage items in own jobs"
  ON rental_job_items FOR ALL
  USING (
    job_id IN (SELECT id FROM rental_jobs WHERE user_id = auth.uid())
  )
  WITH CHECK (
    job_id IN (SELECT id FROM rental_jobs WHERE user_id = auth.uid())
  );

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_rental_inventory_user ON rental_inventory(user_id);
CREATE INDEX IF NOT EXISTS idx_rental_jobs_user      ON rental_jobs(user_id);
CREATE INDEX IF NOT EXISTS idx_rental_job_items_job  ON rental_job_items(job_id);
