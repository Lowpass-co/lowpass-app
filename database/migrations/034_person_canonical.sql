-- ============================================
-- LOWPASS — Person as canonical entity
-- Migration 034
-- ============================================

CREATE TABLE IF NOT EXISTS public.persons (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  full_name text NOT NULL,
  preferred_name text,
  pronouns text,
  email text,
  phone text,
  emergency_contact text,
  passport_full_name text,
  passport_number text,
  passport_expiry date,
  passport_country text,
  date_of_birth date,
  dietary text,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES auth.users(id),
  updated_by uuid REFERENCES auth.users(id)
);

CREATE TABLE IF NOT EXISTS public.tour_personnel (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  tour_id uuid NOT NULL REFERENCES public.tours(id) ON DELETE CASCADE,
  person_id uuid NOT NULL REFERENCES public.persons(id) ON DELETE CASCADE,
  role text NOT NULL,
  employment_type text,
  rate_amount numeric(12,2),
  rate_currency text DEFAULT 'GBP',
  rate_period text,
  starts_on date,
  ends_on date,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tour_id, person_id, role)
);

CREATE INDEX IF NOT EXISTS persons_workspace_id_idx ON public.persons(workspace_id);
CREATE INDEX IF NOT EXISTS tour_personnel_tour_id_idx ON public.tour_personnel(tour_id);
CREATE INDEX IF NOT EXISTS tour_personnel_person_id_idx ON public.tour_personnel(person_id);

ALTER TABLE public.persons ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tour_personnel ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS persons_select ON public.persons;
CREATE POLICY persons_select ON public.persons
  FOR SELECT USING (workspace_id = public.get_my_workspace_id());
DROP POLICY IF EXISTS persons_insert ON public.persons;
CREATE POLICY persons_insert ON public.persons
  FOR INSERT WITH CHECK (workspace_id = public.get_my_workspace_id());
DROP POLICY IF EXISTS persons_update ON public.persons;
CREATE POLICY persons_update ON public.persons
  FOR UPDATE USING (workspace_id = public.get_my_workspace_id());
DROP POLICY IF EXISTS persons_delete ON public.persons;
CREATE POLICY persons_delete ON public.persons
  FOR DELETE USING (workspace_id = public.get_my_workspace_id() AND public.is_workspace_admin());

DROP POLICY IF EXISTS tour_personnel_select ON public.tour_personnel;
CREATE POLICY tour_personnel_select ON public.tour_personnel
  FOR SELECT USING (workspace_id = public.get_my_workspace_id());
DROP POLICY IF EXISTS tour_personnel_insert ON public.tour_personnel;
CREATE POLICY tour_personnel_insert ON public.tour_personnel
  FOR INSERT WITH CHECK (workspace_id = public.get_my_workspace_id());
DROP POLICY IF EXISTS tour_personnel_update ON public.tour_personnel;
CREATE POLICY tour_personnel_update ON public.tour_personnel
  FOR UPDATE USING (workspace_id = public.get_my_workspace_id());
DROP POLICY IF EXISTS tour_personnel_delete ON public.tour_personnel;
CREATE POLICY tour_personnel_delete ON public.tour_personnel
  FOR DELETE USING (workspace_id = public.get_my_workspace_id() AND public.is_workspace_admin());

DROP TRIGGER IF EXISTS persons_updated_at ON public.persons;
CREATE TRIGGER persons_updated_at
  BEFORE UPDATE ON public.persons
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS tour_personnel_updated_at ON public.tour_personnel;
CREATE TRIGGER tour_personnel_updated_at
  BEFORE UPDATE ON public.tour_personnel
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Cross-table FK links
ALTER TABLE public.rooming_grid
  ADD COLUMN IF NOT EXISTS person_id uuid REFERENCES public.persons(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS rooming_grid_person_id_idx ON public.rooming_grid(person_id);

ALTER TABLE public.payroll_entries
  ADD COLUMN IF NOT EXISTS person_id uuid REFERENCES public.persons(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS payroll_entries_person_id_idx ON public.payroll_entries(person_id);

-- No dedicated channel-list rows table exists in this schema; contacts is the closest durable store.
ALTER TABLE public.contacts
  ADD COLUMN IF NOT EXISTS person_id uuid REFERENCES public.persons(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS contacts_person_id_idx ON public.contacts(person_id);

-- Backfill persons from existing workspace personnel roster
INSERT INTO public.persons (
  id,
  workspace_id,
  full_name,
  preferred_name,
  email,
  phone,
  passport_full_name,
  dietary,
  notes,
  created_at,
  updated_at
)
SELECT
  p.id,
  p.workspace_id,
  COALESCE(NULLIF(p.name, ''), 'Unknown'),
  NULLIF(p.name, ''),
  NULLIF(p.email, ''),
  NULLIF(p.phone, ''),
  NULLIF(p.name, ''),
  NULLIF(p.dietary_needs, ''),
  NULLIF(p.preferences, ''),
  p.created_at,
  p.updated_at
FROM public.personnel p
ON CONFLICT (id) DO UPDATE SET
  workspace_id = EXCLUDED.workspace_id,
  full_name = EXCLUDED.full_name,
  preferred_name = COALESCE(public.persons.preferred_name, EXCLUDED.preferred_name),
  email = COALESCE(public.persons.email, EXCLUDED.email),
  phone = COALESCE(public.persons.phone, EXCLUDED.phone),
  dietary = COALESCE(public.persons.dietary, EXCLUDED.dietary),
  notes = COALESCE(public.persons.notes, EXCLUDED.notes),
  updated_at = now();

-- Backfill tour-personnel join from personnel_rates
INSERT INTO public.tour_personnel (
  id,
  workspace_id,
  tour_id,
  person_id,
  role,
  employment_type,
  rate_amount,
  rate_currency,
  rate_period,
  created_at,
  updated_at
)
SELECT
  pr.id,
  pr.workspace_id,
  pr.tour_id,
  COALESCE(
    pr.roster_personnel_id,
    (
      SELECT p.id
      FROM public.personnel p
      WHERE p.workspace_id = pr.workspace_id
        AND lower(trim(p.name)) = lower(trim(pr.person_name))
      ORDER BY p.created_at ASC
      LIMIT 1
    )
  ) AS person_id,
  COALESCE(NULLIF(pr.role, ''), 'Crew'),
  pr.person_type,
  CASE
    WHEN pr.rate_type = 'split_rate' THEN COALESCE(pr.show_rate, pr.off_rate, 0)
    ELSE COALESCE(pr.off_rate, 0)
  END AS rate_amount,
  'GBP' AS rate_currency,
  CASE
    WHEN pr.rate_type = 'split_rate' THEN 'day'
    ELSE 'day'
  END AS rate_period,
  pr.created_at,
  pr.updated_at
FROM public.personnel_rates pr
WHERE COALESCE(
    pr.roster_personnel_id,
    (
      SELECT p.id
      FROM public.personnel p
      WHERE p.workspace_id = pr.workspace_id
        AND lower(trim(p.name)) = lower(trim(pr.person_name))
      ORDER BY p.created_at ASC
      LIMIT 1
    )
  ) IS NOT NULL
ON CONFLICT (tour_id, person_id, role) DO NOTHING;

-- Backfill rooming/person FK
UPDATE public.rooming_grid rg
SET person_id = matched.person_id
FROM (
  SELECT
    rg2.id AS rooming_id,
    tp.person_id
  FROM public.rooming_grid rg2
  JOIN public.tour_personnel tp
    ON tp.tour_id = rg2.tour_id
   AND tp.workspace_id = rg2.workspace_id
   AND lower(trim(tp.role)) = lower(trim(COALESCE(rg2.role, '')))
  JOIN public.persons p
    ON p.id = tp.person_id
   AND lower(trim(p.full_name)) = lower(trim(rg2.person_name))
) matched
WHERE rg.id = matched.rooming_id
  AND rg.person_id IS NULL;

-- Backfill payroll person FK from personnel_rates
UPDATE public.payroll_entries pe
SET person_id = tp.person_id
FROM public.tour_personnel tp
WHERE pe.personnel_id = tp.id
  AND pe.person_id IS NULL;

-- DOWN
-- DROP INDEX IF EXISTS contacts_person_id_idx;
-- ALTER TABLE public.contacts DROP COLUMN IF EXISTS person_id;
-- DROP INDEX IF EXISTS payroll_entries_person_id_idx;
-- ALTER TABLE public.payroll_entries DROP COLUMN IF EXISTS person_id;
-- DROP INDEX IF EXISTS rooming_grid_person_id_idx;
-- ALTER TABLE public.rooming_grid DROP COLUMN IF EXISTS person_id;
-- DROP TRIGGER IF EXISTS tour_personnel_updated_at ON public.tour_personnel;
-- DROP TRIGGER IF EXISTS persons_updated_at ON public.persons;
-- DROP POLICY IF EXISTS tour_personnel_delete ON public.tour_personnel;
-- DROP POLICY IF EXISTS tour_personnel_update ON public.tour_personnel;
-- DROP POLICY IF EXISTS tour_personnel_insert ON public.tour_personnel;
-- DROP POLICY IF EXISTS tour_personnel_select ON public.tour_personnel;
-- DROP POLICY IF EXISTS persons_delete ON public.persons;
-- DROP POLICY IF EXISTS persons_update ON public.persons;
-- DROP POLICY IF EXISTS persons_insert ON public.persons;
-- DROP POLICY IF EXISTS persons_select ON public.persons;
-- DROP TABLE IF EXISTS public.tour_personnel;
-- DROP TABLE IF EXISTS public.persons;
