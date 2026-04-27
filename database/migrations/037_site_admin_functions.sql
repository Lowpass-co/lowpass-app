-- ============================================
-- LOWPASS — Site admin management functions
-- Migration 037
--
-- Builds on 036 (profiles.is_site_admin). Adds SECURITY DEFINER
-- Postgres functions so admins can promote/demote other users by
-- email safely, with built-in guardrails:
--   - Only existing site admins can promote/demote.
--   - You cannot demote yourself (prevents accidental lockout).
--   - You cannot demote the last remaining admin.
--   - Target emails / UUIDs are validated before the update runs.
--
-- These functions are callable from the server (via supabase.rpc)
-- and — because of RLS + SECURITY DEFINER — they are the ONLY
-- supported way to mutate `is_site_admin`. A bare
-- `UPDATE profiles SET is_site_admin = true` from an untrusted
-- client will still be blocked by the profiles RLS policies.
--
-- Idempotent: safe to re-run.
-- ============================================

-- ============================================
-- 1. No-arg convenience overload: is_site_admin()
--    Uses auth.uid() internally so RLS policies can just call
--    public.is_site_admin() without passing auth.uid() explicitly.
-- ============================================

CREATE OR REPLACE FUNCTION public.is_site_admin()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.is_site_admin(auth.uid());
$$;

REVOKE ALL ON FUNCTION public.is_site_admin() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_site_admin() TO authenticated, anon, service_role;

-- ============================================
-- 2. promote_site_admin_by_email(target_email)
--
--    Only callable by an existing site admin. Looks up the profile
--    by case-insensitive email and flips is_site_admin to true.
--    Returns the promoted profile id. Raises if no profile matches
--    or the caller is not an admin.
-- ============================================

CREATE OR REPLACE FUNCTION public.promote_site_admin_by_email(target_email TEXT)
RETURNS TABLE (id UUID, email TEXT, name TEXT, is_site_admin BOOLEAN)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
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

-- ============================================
-- 3. demote_site_admin(target_id)
--
--    Only callable by an existing site admin. Guardrails:
--      - cannot demote yourself
--      - cannot demote the last remaining admin
--    Returns the demoted profile row.
-- ============================================

CREATE OR REPLACE FUNCTION public.demote_site_admin(target_id UUID)
RETURNS TABLE (id UUID, email TEXT, name TEXT, is_site_admin BOOLEAN)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
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
    FROM public.profiles
   WHERE is_site_admin = true;

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

-- ============================================
-- 4. list_site_admins() view-function for the admin UI
--    Returns the current set of admins (id, email, name, avatar, created_at).
--    Callable by any authed user — seeing who's an admin isn't secret,
--    and the UI hides the management surface behind is_site_admin anyway.
-- ============================================

CREATE OR REPLACE FUNCTION public.list_site_admins()
RETURNS TABLE (
  id         UUID,
  email      TEXT,
  name       TEXT,
  avatar_url TEXT,
  created_at TIMESTAMPTZ
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT p.id, p.email, p.name, p.avatar_url, p.created_at
    FROM public.profiles p
   WHERE p.is_site_admin = true
   ORDER BY lower(p.name), lower(p.email);
$$;

REVOKE ALL ON FUNCTION public.list_site_admins() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.list_site_admins() TO authenticated, service_role;

-- ============================================
-- 5. Tighten profiles RLS so non-admins cannot flip is_site_admin
--    directly. They can still UPDATE their own profile for name,
--    avatar, etc. — we enforce the column lock via a trigger because
--    Supabase RLS cannot express column-level write restrictions.
-- ============================================

CREATE OR REPLACE FUNCTION public.enforce_is_site_admin_write()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.is_site_admin IS DISTINCT FROM OLD.is_site_admin THEN
    IF NOT COALESCE(public.is_site_admin(auth.uid()), false) THEN
      RAISE EXCEPTION 'Only site admins can change is_site_admin'
        USING ERRCODE = '42501';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS profiles_enforce_is_site_admin ON public.profiles;
CREATE TRIGGER profiles_enforce_is_site_admin
  BEFORE UPDATE OF is_site_admin ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_is_site_admin_write();

-- ============================================
-- 6. Nudge PostgREST to reload its schema cache
-- ============================================

NOTIFY pgrst, 'reload schema';
