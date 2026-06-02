/* ============================================================
   APPLY 101 in Supabase SQL Editor (Sprint 12 §9c.0)

   Adds tour_personnel.role_tag — the structured role
   discriminator the rider variable resolver filters on.

   Idempotent. Safe to re-run.
   ============================================================ */


ALTER TABLE public.tour_personnel
  ADD COLUMN IF NOT EXISTS role_tag TEXT NOT NULL DEFAULT 'other';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'tour_personnel_role_tag_check'
      AND conrelid = 'public.tour_personnel'::regclass
  ) THEN
    ALTER TABLE public.tour_personnel
      ADD CONSTRAINT tour_personnel_role_tag_check
      CHECK (role_tag IN (
        'tm', 'tm2', 'pm', 'foh', 'mons',
        'ld', 'backline', 'management', 'other'
      ));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS tour_personnel_tour_role_tag_idx
  ON public.tour_personnel (tour_id, role_tag)
  WHERE role_tag <> 'other';


-- Tracking insert
INSERT INTO public._lp_migrations (filename, checksum, applied_by)
VALUES
  ('101_tour_personnel_role_tag.sql', 'backfill', 'manual-supabase-editor')
ON CONFLICT (filename) DO NOTHING;


/* ============================================================
   Post-apply verification (run separately)

   1. role_tag column populated on every row (DEFAULT backfills)
      SELECT role_tag, count(*)
      FROM public.tour_personnel
      GROUP BY role_tag
      ORDER BY role_tag;
      -- Expect: every existing row in 'other' on first run.
      -- Counts shift as Adam tags forward through tours.

   2. CHECK constraint blocks bad values (negative test, optional)
      -- DO NOT RUN unless you want a guaranteed error:
      -- INSERT INTO public.tour_personnel (tour_id, role_tag) VALUES (gen_random_uuid(), 'invalid');
      -- Should fail with: new row for relation "tour_personnel" violates check constraint

   3. Tracking row recorded
      SELECT filename, applied_at FROM public._lp_migrations
      WHERE filename = '101_tour_personnel_role_tag.sql';
   ============================================================ */
