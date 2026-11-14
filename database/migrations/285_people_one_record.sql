/* ============================================================
   MIGRATION 285 — one person record (Nov 2026, Adam)

   The same person lived in two tables and three forms disagreed:
     · personnel  — the People page record (the big form).
     · persons    — a second copy the Crew page, rooming, ⌘K and the old
                    "person" panel read and wrote.
     · personnel_rates (the Payroll card) kept its OWN name and role, so a
       role typed in Payroll never reached Crew and vice versa, and a name
       typed in Payroll snapped back on refresh.

   Adam's rules:
     · The People record is the master. persons is an automatic copy.
     · Role is per tour (tour_personnel.role) — Crew and Payroll edit the same
       value. The person's default role (People page) only seeds new tours.
     · Employment (Principal / Band / Crew) is per tour, on the payroll card
       (personnel_rates.person_type); a new tour starts from the person's
       People-page groups. (The old 5-value tour_personnel.employment_type is
       no longer shown or written anywhere; the column is left in place.)

   What this does:
     1. Gives every persons-only person a People record (same id), so every
        person on a tour can be opened and edited in one place.
     2. Copies anything typed only into the old person panel (email, phone,
        dietary, pronouns, preferred name, date of birth, passport, notes)
        into the People record where that field is still blank there.
        The People record wins wherever it already has a value.
     3. Lines up every payroll card with its tour roster row: same person,
        same role. Where Crew and Payroll disagree on a role, the more
        recently edited row wins (see the preview query below).
     4. Three triggers keep it that way — so no writer, including one added
        later, can make the copies disagree again:
          personnel        → persons (name, preferred name = Nickname,
                             pronouns, email, phone, dietary) + card names
          tour_personnel   → its payroll card (role, person)
          personnel_rates  → a card always shows its roster row's role and
                             its person's name (typed values are replaced)

   OPTIONAL — before pasting, run this to see where Crew and Payroll
   disagree on a role today, and which one will win:

     SELECT t.name AS tour, p.full_name AS person,
            tp.role AS crew_role, pr.role AS payroll_role,
            CASE WHEN pr.updated_at > tp.updated_at AND nullif(btrim(pr.role), '') IS NOT NULL
                 THEN 'payroll' ELSE 'crew' END AS wins
     FROM personnel_rates pr
     JOIN tour_personnel tp ON tp.id = pr.tour_personnel_id
     JOIN tours t ON t.id = tp.tour_id
     LEFT JOIN persons p ON p.id = tp.person_id
     WHERE coalesce(btrim(pr.role), '') IS DISTINCT FROM tp.role
     ORDER BY t.name, p.full_name;

   HAND-PASTE into the Supabase SQL editor. Idempotent — a re-run is a no-op.
   The query at the end (read-only) lists People that now share a name, to
   merge by hand.
   ============================================================ */


-- ── 1. Every person gets a People record (same id) ───────────────────────
-- lp_id continues each workspace's LP-00001 sequence.
WITH base AS (
  SELECT workspace_id,
         coalesce(max(substring(upper(lp_id) FROM '^LP-([0-9]{1,9})$')::bigint), 0) AS n
  FROM public.personnel
  GROUP BY workspace_id
),
todo AS (
  SELECT p.*,
         row_number() OVER (PARTITION BY p.workspace_id ORDER BY p.created_at, p.id) AS rn,
         (SELECT tp.role FROM public.tour_personnel tp
           WHERE tp.person_id = p.id
           ORDER BY tp.created_at DESC LIMIT 1) AS last_role
  FROM public.persons p
  WHERE NOT EXISTS (SELECT 1 FROM public.personnel x WHERE x.id = p.id)
)
INSERT INTO public.personnel
  (id, workspace_id, lp_id, name, email, phone, role, dietary_needs,
   passport_info, extended_profile, created_at, updated_at)
SELECT
  t.id,
  t.workspace_id,
  'LP-' || CASE WHEN length((coalesce(b.n, 0) + t.rn)::text) >= 5
                THEN (coalesce(b.n, 0) + t.rn)::text
                ELSE lpad((coalesce(b.n, 0) + t.rn)::text, 5, '0') END,
  coalesce(nullif(btrim(t.full_name), ''), 'Unknown'),
  nullif(btrim(t.email), ''),
  nullif(btrim(t.phone), ''),
  coalesce(t.last_role, ''),
  nullif(btrim(t.dietary), ''),
  jsonb_strip_nulls(jsonb_build_object(
    'number', nullif(btrim(t.passport_number), ''),
    'expiry_date', t.passport_expiry::text,
    'country', nullif(btrim(t.passport_country), ''),
    'full_name', nullif(btrim(t.passport_full_name), '')
  )),
  jsonb_strip_nulls(jsonb_build_object(
    'pronouns', nullif(btrim(t.pronouns), ''),
    'date_of_birth', t.date_of_birth::text,
    'internal_notes', nullif(btrim(t.notes), ''),
    'emergency_contact', CASE WHEN nullif(btrim(t.emergency_contact), '') IS NULL THEN NULL
                              ELSE jsonb_build_object('name', btrim(t.emergency_contact)) END,
    'name_parts', CASE WHEN nullif(btrim(t.preferred_name), '') IS NULL
                         OR lower(btrim(t.preferred_name)) = lower(btrim(t.full_name)) THEN NULL
                       ELSE jsonb_build_object('nickname', btrim(t.preferred_name)) END
  )),
  t.created_at,
  now()
FROM todo t
LEFT JOIN base b ON b.workspace_id = t.workspace_id
ON CONFLICT DO NOTHING;


-- ── 2. Fill People blanks from the old person panel ──────────────────────
WITH f AS (
  SELECT
    x.id,
    coalesce(nullif(btrim(x.email), ''), nullif(btrim(p.email), '')) AS email,
    coalesce(nullif(btrim(x.phone), ''), nullif(btrim(p.phone), '')) AS phone,
    coalesce(nullif(btrim(x.dietary_needs), ''), nullif(btrim(p.dietary), '')) AS dietary_needs,
    coalesce(x.extended_profile, '{}'::jsonb)
      || CASE WHEN coalesce(btrim(x.extended_profile ->> 'pronouns'), '') = ''
                   AND nullif(btrim(p.pronouns), '') IS NOT NULL
              THEN jsonb_build_object('pronouns', btrim(p.pronouns)) ELSE '{}'::jsonb END
      || CASE WHEN coalesce(btrim(x.extended_profile ->> 'date_of_birth'), '') = ''
                   AND p.date_of_birth IS NOT NULL
              THEN jsonb_build_object('date_of_birth', p.date_of_birth::text) ELSE '{}'::jsonb END
      || CASE WHEN coalesce(btrim(x.extended_profile ->> 'internal_notes'), '') = ''
                   AND nullif(btrim(p.notes), '') IS NOT NULL
              THEN jsonb_build_object('internal_notes', btrim(p.notes)) ELSE '{}'::jsonb END
      || CASE WHEN coalesce(btrim(x.extended_profile #>> '{name_parts,nickname}'), '') = ''
                   AND nullif(btrim(p.preferred_name), '') IS NOT NULL
                   AND lower(btrim(p.preferred_name)) <> lower(btrim(coalesce(x.name, '')))
              THEN jsonb_build_object('name_parts',
                     CASE WHEN jsonb_typeof(x.extended_profile -> 'name_parts') = 'object'
                          THEN x.extended_profile -> 'name_parts' ELSE '{}'::jsonb END
                     || jsonb_build_object('nickname', btrim(p.preferred_name)))
              ELSE '{}'::jsonb END
      AS extended_profile,
    CASE WHEN coalesce(btrim(x.passport_info ->> 'number'), '') = ''
              AND nullif(btrim(p.passport_number), '') IS NOT NULL
         THEN coalesce(x.passport_info, '{}'::jsonb) || jsonb_strip_nulls(jsonb_build_object(
                'number', btrim(p.passport_number),
                'expiry_date', p.passport_expiry::text,
                'country', nullif(btrim(p.passport_country), ''),
                'full_name', nullif(btrim(p.passport_full_name), '')))
         ELSE x.passport_info END AS passport_info
  FROM public.personnel x
  JOIN public.persons p ON p.id = x.id AND p.workspace_id = x.workspace_id
)
UPDATE public.personnel x
SET email = f.email,
    phone = f.phone,
    dietary_needs = f.dietary_needs,
    extended_profile = f.extended_profile,
    passport_info = f.passport_info
FROM f
WHERE f.id = x.id
  AND (x.email, x.phone, x.dietary_needs, x.extended_profile, x.passport_info)
      IS DISTINCT FROM (f.email, f.phone, f.dietary_needs, f.extended_profile, f.passport_info);


-- ── 3. Payroll cards follow their roster row ─────────────────────────────
-- 3a. Same person as the roster row (a swap could leave the card behind).
UPDATE public.personnel_rates pr
SET person_id = tp.person_id
FROM public.tour_personnel tp
WHERE pr.tour_personnel_id = tp.id
  AND pr.person_id IS DISTINCT FROM tp.person_id;

-- 3b. A role typed in Payroll more recently than Crew's goes to the roster —
--     unless that person already holds that role on the tour.
UPDATE public.tour_personnel tp
SET role = btrim(pr.role)
FROM public.personnel_rates pr
WHERE pr.tour_personnel_id = tp.id
  AND nullif(btrim(pr.role), '') IS NOT NULL
  AND btrim(pr.role) IS DISTINCT FROM tp.role
  AND pr.updated_at > tp.updated_at
  AND NOT EXISTS (
    SELECT 1 FROM public.tour_personnel o
    WHERE o.tour_id = tp.tour_id AND o.person_id = tp.person_id
      AND o.role = btrim(pr.role) AND o.id <> tp.id
  );

-- 3c. Everything else: the card shows the roster role.
UPDATE public.personnel_rates pr
SET role = tp.role
FROM public.tour_personnel tp
WHERE pr.tour_personnel_id = tp.id
  AND pr.role IS DISTINCT FROM tp.role;

-- 3d. The card shows the person's People name.
UPDATE public.personnel_rates pr
SET person_name = coalesce(nullif(btrim(x.name), ''), 'Unknown')
FROM public.personnel x
WHERE pr.person_id = x.id
  AND pr.person_name IS DISTINCT FROM coalesce(nullif(btrim(x.name), ''), 'Unknown');


-- ── 4. persons = a copy of People ────────────────────────────────────────
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

-- People → persons + the name on every payroll card for that person.
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

-- Roster row → its payroll card (role on this tour; who it is after a swap).
CREATE OR REPLACE FUNCTION public.tour_personnel_to_card()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.personnel_rates
  SET role = NEW.role, person_id = NEW.person_id
  WHERE tour_personnel_id = NEW.id
    AND (role IS DISTINCT FROM NEW.role OR person_id IS DISTINCT FROM NEW.person_id);
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS tour_personnel_to_card ON public.tour_personnel;
CREATE TRIGGER tour_personnel_to_card
  AFTER UPDATE OF role, person_id ON public.tour_personnel
  FOR EACH ROW EXECUTE FUNCTION public.tour_personnel_to_card();

-- A payroll card always shows its roster row's role and its person's name.
-- (Cards not on the roster keep what was typed.)
CREATE OR REPLACE FUNCTION public.personnel_rates_follow_roster()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  v_role text;
  v_person uuid;
  v_name text;
BEGIN
  IF NEW.tour_personnel_id IS NOT NULL THEN
    SELECT tp.role, tp.person_id INTO v_role, v_person
    FROM public.tour_personnel tp WHERE tp.id = NEW.tour_personnel_id;
    IF FOUND THEN
      NEW.role := v_role;
      NEW.person_id := v_person;
    END IF;
  END IF;
  IF NEW.person_id IS NOT NULL THEN
    SELECT coalesce(nullif(btrim(x.name), ''), 'Unknown') INTO v_name
    FROM public.personnel x WHERE x.id = NEW.person_id;
    IF FOUND THEN
      NEW.person_name := v_name;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS personnel_rates_follow_roster ON public.personnel_rates;
CREATE TRIGGER personnel_rates_follow_roster
  BEFORE INSERT OR UPDATE OF role, person_name, person_id, tour_personnel_id ON public.personnel_rates
  FOR EACH ROW EXECUTE FUNCTION public.personnel_rates_follow_roster();


-- ── Read-only: People that now share a name (merge by hand) ──────────────
SELECT x.workspace_id, lower(btrim(x.name)) AS name, count(*) AS records,
       string_agg(x.lp_id, ', ' ORDER BY x.lp_id) AS lp_ids
FROM public.personnel x
GROUP BY x.workspace_id, lower(btrim(x.name))
HAVING count(*) > 1
ORDER BY 2;


/* ============================================================
   DOWN (manual — uncomment to invert; the back-filled People records,
   filled blanks and lined-up cards are kept)
   ============================================================
-- DROP TRIGGER IF EXISTS personnel_rates_follow_roster ON public.personnel_rates;
-- DROP TRIGGER IF EXISTS tour_personnel_to_card ON public.tour_personnel;
-- DROP TRIGGER IF EXISTS personnel_mirror_person ON public.personnel;
-- DROP FUNCTION IF EXISTS public.personnel_rates_follow_roster();
-- DROP FUNCTION IF EXISTS public.tour_personnel_to_card();
-- DROP FUNCTION IF EXISTS public.personnel_mirror_person();
*/
