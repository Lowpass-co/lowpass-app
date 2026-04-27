-- ============================================
-- LOWPASS — Site admin functions hotfix
-- Migration 038
--
-- Fixes a shadowing bug in migration 037.
--
-- `demote_site_admin` and `promote_site_admin_by_email` declare
-- `RETURNS TABLE (..., is_site_admin BOOLEAN)`, which creates an
-- implicit PL/pgSQL OUT variable named `is_site_admin`. In queries
-- like:
--
--   SELECT COUNT(*) FROM public.profiles WHERE is_site_admin = true;
--
-- the unqualified `is_site_admin` can bind to the OUT variable
-- (NULL at that point) instead of the table column, depending on
-- the active `plpgsql.variable_conflict` setting. That made the
-- last-admin guard always see `admin_count = 0`, which in turn
-- blocked every demote with "Cannot demote the last remaining
-- site admin".
--
-- The fix: add `#variable_conflict use_column` to both functions
-- and fully qualify the profiles reference in the COUNT query.
-- Idempotent: safe to re-run.
-- ============================================

CREATE OR REPLACE FUNCTION public.promote_site_admin_by_email(target_email TEXT)
RETURNS TABLE (id UUID, email TEXT, name TEXT, is_site_admin BOOLEAN)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
#variable_conflict use_column
DECLARE
  caller_is_admin BOOLEAN;
  clean_email     TEXT;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '42501';
  END IF;

  SELECT public.is_site_admin(auth.uid()) INTO caller_is_admin;
  IF NOT COALESCE(caller_is_admin, false) THEN
    RAISE EXCEPTION 'Only site admins can promote other admins' USING ERRCODE = '42501';
  END IF;

  clean_email := lower(trim(COALESCE(target_email, '')));
  IF clean_email = '' THEN
    RAISE EXCEPTION 'Email is required' USING ERRCODE = '22023';
  END IF;

  UPDATE public.profiles p
    SET is_site_admin = true,
        updated_at    = now()
   WHERE lower(p.email) = clean_email
  RETURNING p.id, p.email, p.name, p.is_site_admin
    INTO id, email, name, is_site_admin;

  IF id IS NULL THEN
    RAISE EXCEPTION 'No profile found for email %', clean_email USING ERRCODE = 'P0002';
  END IF;

  RETURN NEXT;
END;
$$;

REVOKE ALL ON FUNCTION public.promote_site_admin_by_email(TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.promote_site_admin_by_email(TEXT) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.demote_site_admin(target_id UUID)
RETURNS TABLE (id UUID, email TEXT, name TEXT, is_site_admin BOOLEAN)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
#variable_conflict use_column
DECLARE
  caller_is_admin BOOLEAN;
  admin_count     INT;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '42501';
  END IF;

  SELECT public.is_site_admin(auth.uid()) INTO caller_is_admin;
  IF NOT COALESCE(caller_is_admin, false) THEN
    RAISE EXCEPTION 'Only site admins can demote admins' USING ERRCODE = '42501';
  END IF;

  IF target_id IS NULL THEN
    RAISE EXCEPTION 'Target id is required' USING ERRCODE = '22023';
  END IF;

  IF target_id = auth.uid() THEN
    RAISE EXCEPTION 'You cannot demote yourself. Ask another admin.' USING ERRCODE = '22023';
  END IF;

  SELECT COUNT(*) INTO admin_count
    FROM public.profiles p
   WHERE p.is_site_admin = true;

  IF admin_count <= 1 THEN
    RAISE EXCEPTION 'Cannot demote the last remaining site admin' USING ERRCODE = '22023';
  END IF;

  UPDATE public.profiles p
    SET is_site_admin = false,
        updated_at    = now()
   WHERE p.id = target_id
     AND p.is_site_admin = true
  RETURNING p.id, p.email, p.name, p.is_site_admin
    INTO id, email, name, is_site_admin;

  IF id IS NULL THEN
    RAISE EXCEPTION 'Target is not a site admin or does not exist' USING ERRCODE = 'P0002';
  END IF;

  RETURN NEXT;
END;
$$;

REVOKE ALL ON FUNCTION public.demote_site_admin(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.demote_site_admin(UUID) TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';
