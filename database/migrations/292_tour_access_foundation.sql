-- ============================================================================
-- 292_tour_access_foundation.sql
-- Permissions, step 2 of 6 — the FOUNDATION (Nov 2026, Adam).
-- Design: docs/handover/PERMISSIONS_DESIGN_2026_11.md
--
-- Adds things; changes no existing rule. Nobody sees more or less after this
-- paste. The rules that USE it are 293 (paste only after the shadow report,
-- _REPORT_292_shadow_access.sql, reads right).
--
--   1. `private` schema — helpers that rules call but the browser can't
--      (PostgREST only exposes `public`; the schema is not in Exposed schemas).
--   2. `public.tour_access` — a Member's areas on a tour (or on all tours):
--      one row per (member, tour|all, area), level view | edit.
--   3. private.tours_i_can(area, level) — the ONE question every rule asks.
--      Admin / manager: every tour in the active workspace. Member: the tours
--      their rows give, at that level or higher. Plus private helpers for
--      tables that reach the tour through a parent (show day, rider pack,
--      budget line, settlement) and private.is_manager / my_person_ids.
--   4. public.my_tour_access(tour) — what the app reads ("my access here").
--   5. Invites carry a crew record + tour access; accepting links the login
--      to the crew record (personnel.user_id) and writes the access rows.
--   6. public.beta_codes — one code per tester, email-bound, site-admin only.
--   7. Copies today's page grants (permission_grants) into tour_access as
--      "all tours" rows, so nobody loses what they have when 293 lands.
--
-- Idempotent: one transaction; every object guarded; the copy is ON CONFLICT.
-- ============================================================================

BEGIN;

-- ---------------------------------------------------------------------------
-- 1. private schema
-- ---------------------------------------------------------------------------
CREATE SCHEMA IF NOT EXISTS private;
REVOKE ALL ON SCHEMA private FROM PUBLIC;
-- Rules run as the caller, so the caller's role needs USAGE + EXECUTE. The
-- browser still can't reach it: `private` is not an exposed API schema.
GRANT USAGE ON SCHEMA private TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 2. tour_access
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.tour_access (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  member_id    UUID NOT NULL REFERENCES public.workspace_members(id) ON DELETE CASCADE,
  tour_id      UUID REFERENCES public.tours(id) ON DELETE CASCADE,  -- NULL = all tours
  area         TEXT NOT NULL CONSTRAINT tour_access_area_check CHECK (area IN (
                 'advance','production','parking','logistics','files',
                 'schedule','budget','receipts','payroll','income')),
  level        TEXT NOT NULL CONSTRAINT tour_access_level_check CHECK (level IN ('view','edit')),
  granted_by   UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS tour_access_one_per_tour
  ON public.tour_access (member_id, tour_id, area) WHERE tour_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS tour_access_one_all_tours
  ON public.tour_access (member_id, area) WHERE tour_id IS NULL;
CREATE INDEX IF NOT EXISTS tour_access_workspace_idx ON public.tour_access (workspace_id);
CREATE INDEX IF NOT EXISTS tour_access_tour_idx ON public.tour_access (tour_id) WHERE tour_id IS NOT NULL;

-- The member and the tour must both belong to the row's workspace.
CREATE OR REPLACE FUNCTION private.tour_access_same_workspace()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.workspace_members m
                 WHERE m.id = NEW.member_id AND m.workspace_id = NEW.workspace_id) THEN
    RAISE EXCEPTION 'tour_access: member is not in this workspace' USING ERRCODE = '23514';
  END IF;
  IF NEW.tour_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.tours t
                 WHERE t.id = NEW.tour_id AND t.workspace_id = NEW.workspace_id) THEN
    RAISE EXCEPTION 'tour_access: tour is not in this workspace' USING ERRCODE = '23514';
  END IF;
  NEW.updated_at := now();
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION private.tour_access_same_workspace() FROM PUBLIC;

DROP TRIGGER IF EXISTS tour_access_same_workspace ON public.tour_access;
CREATE TRIGGER tour_access_same_workspace
  BEFORE INSERT OR UPDATE ON public.tour_access
  FOR EACH ROW EXECUTE FUNCTION private.tour_access_same_workspace();

ALTER TABLE public.tour_access ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tour_access_select ON public.tour_access;
DROP POLICY IF EXISTS tour_access_admin_insert ON public.tour_access;
DROP POLICY IF EXISTS tour_access_admin_update ON public.tour_access;
DROP POLICY IF EXISTS tour_access_admin_delete ON public.tour_access;
-- Read: your own rows, or every row of the workspace if you're its admin.
CREATE POLICY tour_access_select ON public.tour_access FOR SELECT TO authenticated USING (
  member_id IN (SELECT m.id FROM public.workspace_members m WHERE m.user_id = (SELECT auth.uid()))
  OR (workspace_id = (SELECT public.get_my_workspace_id()) AND (SELECT public.is_workspace_admin()))
);
-- Write: workspace admins only (managers run tours, admins run people).
CREATE POLICY tour_access_admin_insert ON public.tour_access FOR INSERT TO authenticated WITH CHECK (
  workspace_id = (SELECT public.get_my_workspace_id()) AND (SELECT public.is_workspace_admin())
);
CREATE POLICY tour_access_admin_update ON public.tour_access FOR UPDATE TO authenticated USING (
  workspace_id = (SELECT public.get_my_workspace_id()) AND (SELECT public.is_workspace_admin())
) WITH CHECK (
  workspace_id = (SELECT public.get_my_workspace_id()) AND (SELECT public.is_workspace_admin())
);
CREATE POLICY tour_access_admin_delete ON public.tour_access FOR DELETE TO authenticated USING (
  workspace_id = (SELECT public.get_my_workspace_id()) AND (SELECT public.is_workspace_admin())
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.tour_access TO authenticated;

-- ---------------------------------------------------------------------------
-- 3. private helpers — every one SECURITY DEFINER, empty search_path, STABLE,
--    set-returning where a rule needs a set, so a rule written as
--    `col IN (SELECT private.fn(...))` is computed once per query.
-- ---------------------------------------------------------------------------

-- The caller's membership in their ACTIVE workspace (same notion as
-- public.get_my_workspace_id: profile workspace + a membership row).
CREATE OR REPLACE FUNCTION private.my_membership()
RETURNS TABLE (member_id UUID, workspace_id UUID, role TEXT)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT m.id, m.workspace_id, m.role
    FROM public.profiles p
    JOIN public.workspace_members m ON m.user_id = p.id AND m.workspace_id = p.workspace_id
   WHERE p.id = auth.uid()
$$;

-- Admin or manager of the active workspace.
CREATE OR REPLACE FUNCTION private.is_manager()
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT EXISTS (SELECT 1 FROM private.my_membership() me WHERE me.role IN ('admin','manager'))
$$;

-- Tours in the active workspace where the caller has `p_area` at `p_level`
-- or higher. Admin / manager: all of them.
CREATE OR REPLACE FUNCTION private.tours_i_can(p_area TEXT, p_level TEXT DEFAULT 'view')
RETURNS SETOF UUID LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT t.id
    FROM public.tours t
    JOIN private.my_membership() me ON me.workspace_id = t.workspace_id
   WHERE me.role IN ('admin','manager')
  UNION
  SELECT t.id
    FROM private.my_membership() me
    JOIN public.tour_access a ON a.member_id = me.member_id
    JOIN public.tours t ON t.workspace_id = me.workspace_id
                       AND (a.tour_id IS NULL OR a.tour_id = t.id)
   WHERE me.role = 'readonly'
     AND a.area = p_area
     AND (p_level = 'view' OR a.level = 'edit')
$$;

-- Tours the caller can see at all (any area). Rules for the tour itself and
-- its show days use this: every area's pages need the tour and its dates.
CREATE OR REPLACE FUNCTION private.tours_i_see()
RETURNS SETOF UUID LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT t.id
    FROM public.tours t
    JOIN private.my_membership() me ON me.workspace_id = t.workspace_id
   WHERE me.role IN ('admin','manager')
  UNION
  SELECT t.id
    FROM private.my_membership() me
    JOIN public.tour_access a ON a.member_id = me.member_id
    JOIN public.tours t ON t.workspace_id = me.workspace_id
                       AND (a.tour_id IS NULL OR a.tour_id = t.id)
   WHERE me.role = 'readonly'
$$;

-- Show days (routing ids) on tours where the caller has the area.
CREATE OR REPLACE FUNCTION private.days_i_can(p_area TEXT, p_level TEXT DEFAULT 'view')
RETURNS SETOF UUID LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT r.id FROM public.routing r
   WHERE r.tour_id IN (SELECT private.tours_i_can(p_area, p_level))
$$;

-- Rider packs (riders, channel lists, stage plots…) the caller can reach for
-- Production. Artist-level packs (no tour) are admin / manager only.
CREATE OR REPLACE FUNCTION private.packs_i_can(p_level TEXT DEFAULT 'view')
RETURNS SETOF UUID LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT rp.id FROM public.rider_packs rp
   WHERE rp.workspace_id IN (SELECT me.workspace_id FROM private.my_membership() me)
     AND (rp.tour_id IN (SELECT private.tours_i_can('production', p_level))
          OR (rp.tour_id IS NULL AND private.is_manager()))
$$;

-- Budget lines on tours where the caller has the area.
CREATE OR REPLACE FUNCTION private.lines_i_can(p_area TEXT, p_level TEXT DEFAULT 'view')
RETURNS SETOF UUID LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT li.id FROM public.budget_line_items li
   WHERE li.tour_id IN (SELECT private.tours_i_can(p_area, p_level))
$$;

-- Settlements on show days where the caller has Income.
CREATE OR REPLACE FUNCTION private.settlements_i_can(p_level TEXT DEFAULT 'view')
RETURNS SETOF UUID LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT s.id FROM public.settlement s
   WHERE s.routing_id IN (SELECT private.days_i_can('income', p_level))
$$;

-- The caller's own crew record(s) in the active workspace — linked by an
-- invite (personnel.user_id). persons shares personnel's ids (285).
CREATE OR REPLACE FUNCTION private.my_person_ids()
RETURNS SETOF UUID LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT pe.id FROM public.personnel pe
    JOIN private.my_membership() me ON me.workspace_id = pe.workspace_id
   WHERE pe.user_id = auth.uid()
$$;

REVOKE ALL ON FUNCTION private.my_membership() FROM PUBLIC;
REVOKE ALL ON FUNCTION private.is_manager() FROM PUBLIC;
REVOKE ALL ON FUNCTION private.tours_i_can(TEXT, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION private.tours_i_see() FROM PUBLIC;
REVOKE ALL ON FUNCTION private.days_i_can(TEXT, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION private.packs_i_can(TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION private.lines_i_can(TEXT, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION private.settlements_i_can(TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION private.my_person_ids() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION private.my_membership(), private.is_manager(),
  private.tours_i_can(TEXT, TEXT), private.tours_i_see(), private.days_i_can(TEXT, TEXT),
  private.packs_i_can(TEXT), private.lines_i_can(TEXT, TEXT), private.settlements_i_can(TEXT),
  private.my_person_ids()
  TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 4. What the app reads: my access on one tour (area → level).
--    Admin / manager: every area at edit. Not a member of the tour's
--    workspace (or not active there): no rows.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.my_tour_access(p_tour_id UUID)
RETURNS TABLE (area TEXT, level TEXT)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  WITH me AS (SELECT * FROM private.my_membership()),
  tour AS (SELECT t.id FROM public.tours t JOIN me ON me.workspace_id = t.workspace_id WHERE t.id = p_tour_id)
  SELECT a.area, 'edit'::text
    FROM unnest(ARRAY['advance','production','parking','logistics','files',
                      'schedule','budget','receipts','payroll','income']) AS a(area)
   WHERE EXISTS (SELECT 1 FROM tour) AND EXISTS (SELECT 1 FROM me WHERE me.role IN ('admin','manager'))
  UNION ALL
  SELECT ta.area, CASE WHEN bool_or(ta.level = 'edit') THEN 'edit' ELSE 'view' END
    FROM me
    JOIN public.tour_access ta ON ta.member_id = me.member_id
   WHERE me.role = 'readonly'
     AND EXISTS (SELECT 1 FROM tour)
     AND (ta.tour_id IS NULL OR ta.tour_id = p_tour_id)
   GROUP BY ta.area
$$;
REVOKE ALL ON FUNCTION public.my_tour_access(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.my_tour_access(UUID) TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 5. Invites: a crew record to link + the tour access to give.
--    initial_access: [{ "tour_id": uuid|null, "area": text, "level": text }]
-- ---------------------------------------------------------------------------
ALTER TABLE public.workspace_invites
  ADD COLUMN IF NOT EXISTS personnel_id UUID REFERENCES public.personnel(id) ON DELETE SET NULL;
ALTER TABLE public.workspace_invites
  ADD COLUMN IF NOT EXISTS initial_access JSONB NOT NULL DEFAULT '[]'::jsonb;

-- Same function as 254, plus: tour access rows, and the login ↔ crew link.
CREATE OR REPLACE FUNCTION public.accept_workspace_invite(p_token TEXT)
RETURNS UUID
LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_invite RECORD;
  v_caller_email TEXT;
  v_caller_id UUID;
  v_existing_member_count INT;
  v_new_member_id UUID;
  v_member_id UUID;
  v_tag TEXT;
  v_grant JSONB;
  v_access JSONB;
BEGIN
  v_caller_id := auth.uid();
  IF v_caller_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required' USING ERRCODE = 'P0001';
  END IF;

  SELECT email::text INTO v_caller_email FROM auth.users WHERE id = v_caller_id;

  SELECT * INTO v_invite FROM public.workspace_invites WHERE token = p_token FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Invite not found' USING ERRCODE = 'P0002';
  END IF;
  IF v_invite.accepted_at IS NOT NULL THEN
    RAISE EXCEPTION 'Invite already accepted' USING ERRCODE = 'P0003';
  END IF;
  IF v_invite.expires_at < now() THEN
    RAISE EXCEPTION 'Invite expired' USING ERRCODE = 'P0004';
  END IF;
  IF lower(v_caller_email) <> v_invite.invited_email THEN
    RAISE EXCEPTION 'Invite email does not match caller' USING ERRCODE = 'P0005';
  END IF;

  SELECT id INTO v_member_id FROM public.workspace_members
   WHERE user_id = v_caller_id AND workspace_id = v_invite.workspace_id;

  IF v_member_id IS NULL THEN
    INSERT INTO public.workspace_members (user_id, workspace_id, role, is_workspace_owner)
    VALUES (v_caller_id, v_invite.workspace_id, v_invite.invited_role, false)
    RETURNING id INTO v_new_member_id;
    v_member_id := v_new_member_id;

    IF v_invite.initial_tags IS NOT NULL AND array_length(v_invite.initial_tags, 1) > 0 THEN
      FOREACH v_tag IN ARRAY v_invite.initial_tags LOOP
        INSERT INTO public.workspace_member_tags (workspace_id, member_id, tag_name)
        VALUES (v_invite.workspace_id, v_new_member_id, v_tag)
        ON CONFLICT (member_id, tag_name) DO NOTHING;
      END LOOP;

      IF 'crew' = ANY(v_invite.initial_tags) THEN
        INSERT INTO public.permission_grants (
          workspace_id, subject_type, subject_id, resource_type, resource_id, permission
        ) VALUES (
          v_invite.workspace_id, 'tag', 'crew', 'page', 'operations.personnel.my_schedule', 'read'
        )
        ON CONFLICT (workspace_id, subject_type, subject_id, resource_type, resource_id, permission)
        DO NOTHING;
      END IF;
    END IF;

    IF v_invite.initial_grants IS NOT NULL AND jsonb_typeof(v_invite.initial_grants) = 'array' THEN
      FOR v_grant IN SELECT * FROM jsonb_array_elements(v_invite.initial_grants) LOOP
        INSERT INTO public.permission_grants (
          workspace_id, subject_type, subject_id, resource_type, resource_id, permission
        ) VALUES (
          v_invite.workspace_id, 'user', v_caller_id::text,
          v_grant->>'resource_type', v_grant->>'resource_id', v_grant->>'permission'
        )
        ON CONFLICT (workspace_id, subject_type, subject_id, resource_type, resource_id, permission)
        DO NOTHING;
      END LOOP;
    END IF;
  END IF;

  -- Tour access (Members only — admin / manager already see everything).
  IF v_invite.invited_role = 'readonly'
     AND jsonb_typeof(v_invite.initial_access) = 'array' THEN
    FOR v_access IN SELECT * FROM jsonb_array_elements(v_invite.initial_access) LOOP
      IF (v_access->>'tour_id') IS NULL THEN
        INSERT INTO public.tour_access (workspace_id, member_id, tour_id, area, level, granted_by)
        VALUES (v_invite.workspace_id, v_member_id, NULL, v_access->>'area', v_access->>'level',
                v_invite.invited_by_user_id)
        ON CONFLICT (member_id, area) WHERE tour_id IS NULL
        DO UPDATE SET level = CASE WHEN 'edit' IN (public.tour_access.level, EXCLUDED.level) THEN 'edit' ELSE 'view' END;
      ELSE
        INSERT INTO public.tour_access (workspace_id, member_id, tour_id, area, level, granted_by)
        VALUES (v_invite.workspace_id, v_member_id, (v_access->>'tour_id')::uuid,
                v_access->>'area', v_access->>'level', v_invite.invited_by_user_id)
        ON CONFLICT (member_id, tour_id, area) WHERE tour_id IS NOT NULL
        DO UPDATE SET level = CASE WHEN 'edit' IN (public.tour_access.level, EXCLUDED.level) THEN 'edit' ELSE 'view' END;
      END IF;
    END LOOP;
  END IF;

  -- Link the login to the crew record — only a record in this workspace that
  -- no other login holds.
  IF v_invite.personnel_id IS NOT NULL THEN
    UPDATE public.personnel
       SET user_id = v_caller_id
     WHERE id = v_invite.personnel_id
       AND workspace_id = v_invite.workspace_id
       AND (user_id IS NULL OR user_id = v_caller_id);
  END IF;

  SELECT COUNT(*) INTO v_existing_member_count FROM public.workspace_members WHERE user_id = v_caller_id;

  UPDATE public.profiles SET workspace_id = v_invite.workspace_id WHERE id = v_caller_id;

  UPDATE public.workspace_invites
     SET accepted_at = now(), accepted_user_id = v_caller_id
   WHERE id = v_invite.id;

  IF v_new_member_id IS NOT NULL THEN
    INSERT INTO public.audit_log (
      workspace_id, actor_user_id, action, entity_type, entity_id, field_changes
    ) VALUES (
      v_invite.workspace_id, v_caller_id, 'created', 'workspace_member', v_new_member_id,
      jsonb_build_object(
        'invite_id', v_invite.id,
        'invited_email', v_invite.invited_email,
        'invited_role', v_invite.invited_role,
        'personnel_id', v_invite.personnel_id,
        'auto_switched_active', (v_existing_member_count = 1)
      )
    );
  END IF;

  RETURN v_invite.workspace_id;
END;
$$;
REVOKE ALL ON FUNCTION public.accept_workspace_invite(TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.accept_workspace_invite(TEXT) TO authenticated;

-- ---------------------------------------------------------------------------
-- 6. Beta codes — one per tester, bound to their email. Site admins make and
--    read them; redeeming is server-side (service role) at sign-up.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.beta_codes (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code             TEXT NOT NULL UNIQUE,
  email            TEXT NOT NULL CONSTRAINT beta_codes_email_norm CHECK (email = lower(btrim(email))),
  note             TEXT,
  created_by       UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at       TIMESTAMPTZ NOT NULL DEFAULT (now() + INTERVAL '30 days'),
  revoked_at       TIMESTAMPTZ,
  redeemed_at      TIMESTAMPTZ,
  redeemed_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL
);
CREATE INDEX IF NOT EXISTS beta_codes_email_idx ON public.beta_codes (email);

ALTER TABLE public.beta_codes ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS beta_codes_site_admin ON public.beta_codes;
CREATE POLICY beta_codes_site_admin ON public.beta_codes FOR ALL TO authenticated
  USING ((SELECT public.is_site_admin())) WITH CHECK ((SELECT public.is_site_admin()));
GRANT SELECT, INSERT, UPDATE, DELETE ON public.beta_codes TO authenticated;

-- ---------------------------------------------------------------------------
-- 7. Today's page grants → tour_access ("all tours"), Members only.
--    User grants and tag grants (expanded to the tag's members). Higher
--    level wins. Pages with no tour area (artist / home) are left out —
--    members see tour items only (Adam, 16 Nov).
-- ---------------------------------------------------------------------------
WITH area_map(resource_id, area) AS (VALUES
  ('operations.routing', 'schedule'),
  ('operations.personnel', 'logistics'),
  ('operations.personnel.compensation', 'payroll'),
  ('operations.channel_list', 'production'),
  ('operations.stage_plot', 'production'),
  ('operations.payroll', 'payroll'),
  ('operations.rooming', 'logistics'),
  ('operations.files', 'files'),
  ('operations.riders', 'production'),
  ('budget.line_items', 'budget'),
  ('budget.receipts', 'receipts'),
  ('budget.payroll', 'payroll'),
  ('budget.deal_memos', 'income'),
  ('budget.commissions', 'income'),
  ('budget.summary', 'budget'),
  ('advance', 'advance')
),
grant_members AS (
  SELECT g.workspace_id, m.id AS member_id, g.resource_id, g.permission
    FROM public.permission_grants g
    JOIN public.workspace_members m
      ON m.workspace_id = g.workspace_id AND m.user_id::text = g.subject_id
   WHERE g.subject_type = 'user'
  UNION ALL
  SELECT g.workspace_id, t.member_id, g.resource_id, g.permission
    FROM public.permission_grants g
    JOIN public.workspace_member_tags t
      ON t.workspace_id = g.workspace_id AND t.tag_name = g.subject_id
   WHERE g.subject_type = 'tag'
),
wanted AS (
  SELECT gm.workspace_id, gm.member_id, am.area,
         CASE WHEN bool_or(gm.permission = 'write') THEN 'edit' ELSE 'view' END AS level
    FROM grant_members gm
    JOIN area_map am ON am.resource_id = gm.resource_id
    JOIN public.workspace_members m ON m.id = gm.member_id AND m.role = 'readonly'
   GROUP BY gm.workspace_id, gm.member_id, am.area
)
INSERT INTO public.tour_access (workspace_id, member_id, tour_id, area, level)
SELECT workspace_id, member_id, NULL, area, level FROM wanted
ON CONFLICT (member_id, area) WHERE tour_id IS NULL
DO UPDATE SET level = CASE WHEN 'edit' IN (public.tour_access.level, EXCLUDED.level) THEN 'edit' ELSE 'view' END;

COMMIT;

-- ---------------------------------------------------------------------------
-- Read-only check. Expect every row OK.
-- ---------------------------------------------------------------------------
SELECT '1 tour_access table + rules' AS step,
       CASE WHEN to_regclass('public.tour_access') IS NOT NULL
             AND (SELECT count(*) FROM pg_policy WHERE polrelid = 'public.tour_access'::regclass) = 4
            THEN 'OK' ELSE 'CHECK' END AS status
UNION ALL
SELECT '2 private helpers',
       CASE WHEN (SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
                   WHERE n.nspname = 'private'
                     AND p.proname IN ('my_membership','is_manager','tours_i_can','tours_i_see','days_i_can',
                                       'packs_i_can','lines_i_can','settlements_i_can','my_person_ids')) = 9
            THEN 'OK' ELSE 'CHECK' END
UNION ALL
SELECT '3 private not callable by anon',
       CASE WHEN NOT has_schema_privilege('anon', 'private', 'USAGE') THEN 'OK' ELSE 'CHECK' END
UNION ALL
SELECT '4 my_tour_access',
       CASE WHEN to_regprocedure('public.my_tour_access(uuid)') IS NOT NULL THEN 'OK' ELSE 'CHECK' END
UNION ALL
SELECT '5 invites carry crew + access',
       CASE WHEN (SELECT count(*) FROM information_schema.columns
                   WHERE table_schema = 'public' AND table_name = 'workspace_invites'
                     AND column_name IN ('personnel_id','initial_access')) = 2
             AND pg_get_functiondef('public.accept_workspace_invite(text)'::regprocedure) ILIKE '%tour_access%'
            THEN 'OK' ELSE 'CHECK' END
UNION ALL
SELECT '6 beta codes (site admin only)',
       CASE WHEN to_regclass('public.beta_codes') IS NOT NULL THEN 'OK' ELSE 'CHECK' END
UNION ALL
SELECT '7 grants copied: ' || (SELECT count(*) FROM public.tour_access WHERE tour_id IS NULL) || ' all-tours rows',
       'OK';

-- ---------------------------------------------------------------------------
-- DOWN (manual; only before 293 is pasted — 293's rules call these helpers):
--   BEGIN;
--   DROP TABLE IF EXISTS public.beta_codes;
--   ALTER TABLE public.workspace_invites DROP COLUMN IF EXISTS initial_access,
--                                        DROP COLUMN IF EXISTS personnel_id;
--   -- re-paste 254_accept_invite_lands_you_there.sql to restore accept_workspace_invite
--   DROP FUNCTION IF EXISTS public.my_tour_access(UUID);
--   DROP TABLE IF EXISTS public.tour_access;
--   DROP SCHEMA IF EXISTS private CASCADE;
--   COMMIT;
-- ---------------------------------------------------------------------------
