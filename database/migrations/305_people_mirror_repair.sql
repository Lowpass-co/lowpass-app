-- ============================================================
-- 305_people_mirror_repair.sql
--
-- Adam, Nov 2026: adding someone NEW on Add crew failed with
--   insert or update on table "tour_personnel" violates foreign key
--   constraint "tour_personnel_person_id_fkey"
-- tour_personnel.person_id points at persons. The ONLY thing that makes a
-- persons row for a new People record is 285's trigger
-- (personnel_mirror_person). The People row was written and the persons row
-- wasn't, so the trigger isn't installed in this database (285 pasted only
-- partly, most likely).
--
-- This puts the function + trigger back exactly as 285 defined them and
-- copies every People record that has no persons row yet. Re-runnable: the
-- function is CREATE OR REPLACE, the trigger DROP IF EXISTS + CREATE, the
-- copy ON CONFLICT and guarded.
--
-- CHECK FIRST (read-only, optional): run this before pasting —
--   SELECT tgname FROM pg_trigger
--   WHERE tgrelid = 'public.personnel'::regclass AND NOT tgisinternal;
--   SELECT count(*) AS people_without_copy FROM public.personnel x
--   WHERE NOT EXISTS (SELECT 1 FROM public.persons p WHERE p.id = x.id);
-- If personnel_mirror_person is missing from the first list, this is the fix.
-- ============================================================

-- ── 1. The trigger (copied from 285 §5) ──────────────────────────────────
CREATE OR REPLACE FUNCTION public.personnel_mirror_person()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_name text := coalesce(nullif(btrim(NEW.name), ''), 'Unknown');
BEGIN
  INSERT INTO public.persons (id, workspace_id, full_name, preferred_name, pronouns, email, phone, dietary)
  VALUES (
    NEW.id,
    NEW.workspace_id,
    v_name,
    nullif(btrim(coalesce(NEW.extended_profile #>> '{name_parts,nickname}', '')), ''),
    nullif(btrim(coalesce(NEW.extended_profile ->> 'pronouns', '')), ''),
    nullif(btrim(coalesce(NEW.email, '')), ''),
    nullif(btrim(coalesce(NEW.phone, '')), ''),
    nullif(btrim(coalesce(NEW.dietary_needs, '')), '')
  )
  ON CONFLICT (id) DO UPDATE SET
    full_name = EXCLUDED.full_name,
    preferred_name = EXCLUDED.preferred_name,
    pronouns = EXCLUDED.pronouns,
    email = EXCLUDED.email,
    phone = EXCLUDED.phone,
    dietary = EXCLUDED.dietary
  WHERE persons.workspace_id = EXCLUDED.workspace_id
    AND (persons.full_name, persons.preferred_name, persons.pronouns, persons.email, persons.phone, persons.dietary)
        IS DISTINCT FROM
        (EXCLUDED.full_name, EXCLUDED.preferred_name, EXCLUDED.pronouns, EXCLUDED.email, EXCLUDED.phone, EXCLUDED.dietary);

  UPDATE public.personnel_rates
  SET person_name = v_name
  WHERE person_id = NEW.id
    AND workspace_id = NEW.workspace_id
    AND person_name IS DISTINCT FROM v_name;

  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS personnel_mirror_person ON public.personnel;
CREATE TRIGGER personnel_mirror_person
  AFTER INSERT OR UPDATE OF name, email, phone, dietary_needs, extended_profile ON public.personnel
  FOR EACH ROW EXECUTE FUNCTION public.personnel_mirror_person();

-- ── 2. Every People record gets its copy (copied from 285 §4) ───────────
INSERT INTO public.persons (id, workspace_id, full_name, preferred_name, pronouns, email, phone, dietary)
SELECT
  x.id,
  x.workspace_id,
  coalesce(nullif(btrim(x.name), ''), 'Unknown'),
  nullif(btrim(coalesce(x.extended_profile #>> '{name_parts,nickname}', '')), ''),
  nullif(btrim(coalesce(x.extended_profile ->> 'pronouns', '')), ''),
  nullif(btrim(coalesce(x.email, '')), ''),
  nullif(btrim(coalesce(x.phone, '')), ''),
  nullif(btrim(coalesce(x.dietary_needs, '')), '')
FROM public.personnel x
ON CONFLICT (id) DO UPDATE SET
  full_name = EXCLUDED.full_name,
  preferred_name = EXCLUDED.preferred_name,
  pronouns = EXCLUDED.pronouns,
  email = EXCLUDED.email,
  phone = EXCLUDED.phone,
  dietary = EXCLUDED.dietary
WHERE persons.workspace_id = EXCLUDED.workspace_id
  AND (persons.full_name, persons.preferred_name, persons.pronouns, persons.email, persons.phone, persons.dietary)
      IS DISTINCT FROM
      (EXCLUDED.full_name, EXCLUDED.preferred_name, EXCLUDED.pronouns, EXCLUDED.email, EXCLUDED.phone, EXCLUDED.dietary);


-- ── 5. The triggers that keep it that way ────────────────────────────────

-- ── 3. Report (read-only): should say 0 and list the trigger ────────────
SELECT
  (SELECT count(*) FROM public.personnel x
    WHERE NOT EXISTS (SELECT 1 FROM public.persons p WHERE p.id = x.id)) AS people_without_copy,
  (SELECT string_agg(tgname, ', ') FROM pg_trigger
    WHERE tgrelid = 'public.personnel'::regclass AND NOT tgisinternal) AS personnel_triggers;

/* ============================================================
   DOWN — nothing to undo: 285 owns the trigger and the copies.
   ============================================================ */
