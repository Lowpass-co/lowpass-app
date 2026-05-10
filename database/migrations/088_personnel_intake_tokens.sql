/* ============================================
   Migration 088 — Personnel intake tokens (Sprint 10 §2.4)

   Public-shareable form tokens for personnel records. Workspace
   admins generate a token + URL that an unauthenticated person
   uses to fill in their own profile (passport, contact, dietary,
   merch sizes, emergency contacts, etc.). On submit, server
   validates the token and writes back to personnel.extended_profile.

   Replaces Adam's current Google Forms workflow.

   Apply via: npm run db:migrate
   ============================================ */

CREATE TABLE IF NOT EXISTS public.personnel_intake_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  personnel_id UUID NOT NULL REFERENCES public.personnel(id) ON DELETE CASCADE,
  workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  token TEXT NOT NULL UNIQUE,
  invited_by_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  expires_at TIMESTAMPTZ NOT NULL DEFAULT (now() + INTERVAL '14 days'),
  submitted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS personnel_intake_tokens_personnel_idx
  ON public.personnel_intake_tokens (personnel_id);

CREATE INDEX IF NOT EXISTS personnel_intake_tokens_token_idx
  ON public.personnel_intake_tokens (token);

ALTER TABLE public.personnel_intake_tokens ENABLE ROW LEVEL SECURITY;

/* ============================================
   RLS — admin/manager (or anyone with operations.personnel.write)
   in the same workspace can create / read / delete token rows.
   The PUBLIC token-validation path goes through a SECURITY DEFINER
   RPC (no direct SELECT for unauthenticated callers).
   ============================================ */
DROP POLICY IF EXISTS personnel_intake_tokens_admin_all ON public.personnel_intake_tokens;
CREATE POLICY personnel_intake_tokens_admin_all ON public.personnel_intake_tokens
  FOR ALL USING (
    workspace_id = public.get_my_workspace_id()
    AND public.can_access('page', 'operations.personnel', 'write')
  ) WITH CHECK (
    workspace_id = public.get_my_workspace_id()
    AND public.can_access('page', 'operations.personnel', 'write')
  );

/* ============================================
   SECURITY DEFINER RPC — load intake context for the public form.
   Returns workspace name + personnel display name + already-
   submitted-at timestamp (so the form can show a "this token
   has already been used" panel). Returns NULL when token is
   invalid / expired.

   Public — no auth required.
   ============================================ */
CREATE OR REPLACE FUNCTION public.lookup_personnel_intake(p_token TEXT)
RETURNS TABLE (
  token TEXT,
  workspace_name TEXT,
  personnel_name TEXT,
  expires_at TIMESTAMPTZ,
  submitted_at TIMESTAMPTZ
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    t.token,
    w.name AS workspace_name,
    p.name AS personnel_name,
    t.expires_at,
    t.submitted_at
  FROM public.personnel_intake_tokens AS t
  INNER JOIN public.workspaces AS w ON w.id = t.workspace_id
  INNER JOIN public.personnel AS p ON p.id = t.personnel_id
  WHERE t.token = p_token
    AND t.expires_at > now();
$$;

GRANT EXECUTE ON FUNCTION public.lookup_personnel_intake(TEXT) TO anon, authenticated;

/* ============================================
   SECURITY DEFINER RPC — submit intake form. Validates the
   token, writes the supplied JSONB into the personnel record's
   extended_profile (merging — never replacing existing fields
   the operator pre-filled), and stamps submitted_at on the
   token row so it can't be re-used.

   Public — no auth required.
   ============================================ */
CREATE OR REPLACE FUNCTION public.submit_personnel_intake(
  p_token TEXT,
  p_payload JSONB
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_token public.personnel_intake_tokens%ROWTYPE;
BEGIN
  SELECT * INTO v_token
  FROM public.personnel_intake_tokens
  WHERE token = p_token
    AND expires_at > now()
    AND submitted_at IS NULL
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN FALSE;
  END IF;

  UPDATE public.personnel
  SET extended_profile = COALESCE(extended_profile, '{}'::jsonb) || COALESCE(p_payload, '{}'::jsonb),
      updated_at = now()
  WHERE id = v_token.personnel_id;

  UPDATE public.personnel_intake_tokens
  SET submitted_at = now()
  WHERE id = v_token.id;

  RETURN TRUE;
END;
$$;

GRANT EXECUTE ON FUNCTION public.submit_personnel_intake(TEXT, JSONB) TO anon, authenticated;

/* ============================================
   Down migration — drop in reverse dependency order.
   ============================================ */
-- DROP FUNCTION IF EXISTS public.submit_personnel_intake(TEXT, JSONB);
-- DROP FUNCTION IF EXISTS public.lookup_personnel_intake(TEXT);
-- DROP TABLE IF EXISTS public.personnel_intake_tokens CASCADE;
