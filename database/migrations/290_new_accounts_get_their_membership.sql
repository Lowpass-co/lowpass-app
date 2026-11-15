-- ============================================================================
-- 290 — New accounts get a membership of their own workspace (Nov 2026, Adam)
-- ============================================================================
--
-- THE BUG: a new account signed up, confirmed, and /artists reloaded forever.
--
-- handle_new_user() (migration 002) gives every new auth user a workspace
-- (owner_id = them), a role and a profile pointing at it — but NO
-- workspace_members row. Migration 078 back-filled memberships for the users
-- who existed then; nothing has created one for a new sign-up since. And since
-- 086, reading a workspace (RLS on workspaces, get_my_workspace_id()) needs a
-- membership. So a new owner can't read their own workspace: the app treats
-- them as having none → /login → middleware sends a signed-in user back to
-- /artists → /login … (the app side of that loop is fixed in the same PR).
--
-- THE FIX: a trigger on profiles — AFTER INSERT, when the new profile points
-- at a workspace that person OWNS, add them as its admin + owner. A separate
-- trigger rather than a new handle_new_user(): production's copy of that
-- function may differ from the repo's (migration 254's notes describe it
-- creating a membership), and CREATE OR REPLACE would overwrite whatever is
-- there. This is a no-op wherever a membership already exists.
--
-- SAFETY: only ever a workspace the person owns (workspaces.owner_id), only
-- on INSERT — never on UPDATE of profiles.workspace_id, so switching or
-- pointing a profile at someone else's workspace can never mint a membership.
--
-- BACKFILL: every profile pointed at a workspace it owns, with no membership
-- there, gets one (this repairs the accounts already stuck).
--
-- IDEMPOTENT: CREATE OR REPLACE / DROP … IF EXISTS / ON CONFLICT DO NOTHING.
-- Re-running changes nothing.
--
-- The last statement is READ-ONLY: anyone still pointed at a workspace they
-- can't open (expected: no rows; an invited member pointed at a workspace
-- whose invite was never accepted would show here — fix those by hand).
-- ============================================================================

CREATE OR REPLACE FUNCTION public.profiles_owner_membership()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.workspace_id IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.workspaces w
    WHERE w.id = NEW.workspace_id AND w.owner_id = NEW.id
  ) THEN
    INSERT INTO public.workspace_members (user_id, workspace_id, role, is_workspace_owner)
    VALUES (NEW.id, NEW.workspace_id, 'admin', TRUE)
    ON CONFLICT (user_id, workspace_id) DO NOTHING;
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.profiles_owner_membership() FROM PUBLIC;

DROP TRIGGER IF EXISTS profiles_owner_membership ON public.profiles;
CREATE TRIGGER profiles_owner_membership
  AFTER INSERT ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.profiles_owner_membership();

-- Backfill: owners pointed at their own workspace with no membership there.
INSERT INTO public.workspace_members (user_id, workspace_id, role, is_workspace_owner)
SELECT p.id, p.workspace_id, 'admin', TRUE
FROM public.profiles p
JOIN public.workspaces w ON w.id = p.workspace_id AND w.owner_id = p.id
WHERE NOT EXISTS (
  SELECT 1 FROM public.workspace_members m
  WHERE m.user_id = p.id AND m.workspace_id = p.workspace_id
)
ON CONFLICT (user_id, workspace_id) DO NOTHING;

-- READ-ONLY check: profiles still pointed at a workspace they can't open.
SELECT p.email,
       w.name AS workspace,
       (w.owner_id = p.id) AS owns_it,
       w.archived_at
FROM public.profiles p
LEFT JOIN public.workspaces w ON w.id = p.workspace_id
WHERE p.workspace_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM public.workspace_members m
    WHERE m.user_id = p.id AND m.workspace_id = p.workspace_id
  )
ORDER BY p.email;

-- ── down ────────────────────────────────────────────────────────────────────
-- DROP TRIGGER IF EXISTS profiles_owner_membership ON public.profiles;
-- DROP FUNCTION IF EXISTS public.profiles_owner_membership();
-- (Back-filled memberships are left in place: removing them would lock those
--  owners out of their workspaces again.)
