-- ============================================================================
-- 301_riders.sql  (Nov 2026, Adam: "rebuild from the ground up … beautiful and
-- functional, for both user and promoter")
--
-- The rider, rebuilt. A tour has TWO documents — Tech and Hospitality — behind
-- ONE live link per show. A document is an ordered list of BLOCKS (heading,
-- prose, request line, table, contacts, advance summary, attachments, page
-- break). Blocks save one at a time with their own version, so two people can
-- edit the same rider; only the same block at the same moment conflicts (409).
-- A block can apply only from / until a date, so a change halfway through a
-- tour (a console swap) reaches the right shows.
--
-- Publish freezes BOTH documents into an immutable rider_versions row (1.0,
-- 1.1 … 2.0) with what changed. Promoters only ever see published versions.
-- Each show's link records views, acknowledgements (name + date, per version)
-- and replies on a request line; the TM answers and marks the line confirmed /
-- substitute / cut for that show. Lowpass never emails venues: Notify drafts
-- the email, the TM sends it, the send is recorded (rider_sends).
--
-- Rules: the Production area, GENERATED below from scripts/permissions/
-- rules.mjs (never hand-edit that section). Promoter reads / writes go through
-- the service role after a token check. Old rider_packs data is untouched —
-- "Bring over" copies it (rider_legacy_imports). Re-runnable.
-- ============================================================================
BEGIN;

-- ---- The two documents ----------------------------------------------------
CREATE TABLE IF NOT EXISTS public.riders (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id  UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  tour_id       UUID NOT NULL REFERENCES public.tours(id) ON DELETE CASCADE,
  kind          TEXT NOT NULL CHECK (kind IN ('tech', 'hospitality')),
  title         TEXT NOT NULL DEFAULT '' CHECK (char_length(title) <= 200),
  created_by    UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (tour_id, kind)
);

-- ---- Blocks: position is a fractional key (sorts as plain bytes) -----------
CREATE TABLE IF NOT EXISTS public.rider_blocks (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  rider_id      UUID NOT NULL REFERENCES public.riders(id) ON DELETE CASCADE,
  workspace_id  UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  tour_id       UUID NOT NULL REFERENCES public.tours(id) ON DELETE CASCADE,
  position      TEXT COLLATE "C" NOT NULL CHECK (position ~ '^[0-9A-Za-z]{1,64}$'),
  kind          TEXT NOT NULL CHECK (kind IN ('heading', 'text', 'request', 'table', 'contacts', 'summary', 'files', 'break')),
  content       JSONB NOT NULL DEFAULT '{}'::jsonb CHECK (octet_length(content::text) <= 100000),
  applies_from  DATE,
  applies_until DATE,
  version       INT NOT NULL DEFAULT 1,
  updated_by    UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (applies_from IS NULL OR applies_until IS NULL OR applies_until >= applies_from)
);
CREATE INDEX IF NOT EXISTS rider_blocks_order_idx ON public.rider_blocks (rider_id, position);

-- ---- Shared by both documents ----------------------------------------------
CREATE TABLE IF NOT EXISTS public.rider_settings (
  tour_id       UUID PRIMARY KEY REFERENCES public.tours(id) ON DELETE CASCADE,
  workspace_id  UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  party_size    INT CHECK (party_size IS NULL OR party_size BETWEEN 1 AND 999),  -- NULL = count the crew
  updated_by    UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ---- Published versions: frozen ---------------------------------------------
CREATE TABLE IF NOT EXISTS public.rider_versions (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id  UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  tour_id       UUID NOT NULL REFERENCES public.tours(id) ON DELETE CASCADE,
  major         INT NOT NULL CHECK (major >= 1),
  minor         INT NOT NULL CHECK (minor >= 0),
  note          TEXT CHECK (char_length(note) <= 500),
  changes       JSONB NOT NULL DEFAULT '[]'::jsonb,
  snapshot      JSONB NOT NULL,
  published_by  UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  published_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (tour_id, major, minor)
);

-- ---- One live link per show (routing_id NULL = the whole tour) -------------
CREATE TABLE IF NOT EXISTS public.rider_links (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id     UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  tour_id          UUID NOT NULL REFERENCES public.tours(id) ON DELETE CASCADE,
  routing_id       UUID REFERENCES public.routing(id) ON DELETE CASCADE,
  token            TEXT NOT NULL UNIQUE CHECK (char_length(token) BETWEEN 20 AND 64),
  recipient_name   TEXT CHECK (char_length(recipient_name) <= 120),
  recipient_email  TEXT CHECK (char_length(recipient_email) <= 200),
  created_by       UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  revoked_at       TIMESTAMPTZ,
  last_viewed_at   TIMESTAMPTZ,
  last_viewed_version_id UUID REFERENCES public.rider_versions(id) ON DELETE SET NULL,
  view_count       INT NOT NULL DEFAULT 0
);
CREATE UNIQUE INDEX IF NOT EXISTS rider_links_live_idx ON public.rider_links
  (tour_id, (coalesce(routing_id, '00000000-0000-0000-0000-000000000000'::uuid))) WHERE revoked_at IS NULL;

CREATE TABLE IF NOT EXISTS public.rider_sends (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id     UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  tour_id          UUID NOT NULL REFERENCES public.tours(id) ON DELETE CASCADE,
  link_id          UUID NOT NULL REFERENCES public.rider_links(id) ON DELETE CASCADE,
  routing_id       UUID REFERENCES public.routing(id) ON DELETE CASCADE,
  version_id       UUID NOT NULL REFERENCES public.rider_versions(id) ON DELETE CASCADE,
  recipient_email  TEXT CHECK (char_length(recipient_email) <= 200),
  sent_by          UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  sent_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS rider_sends_link_idx ON public.rider_sends (link_id, sent_at DESC);

-- ---- What promoters do on the link ----------------------------------------
CREATE TABLE IF NOT EXISTS public.rider_acks (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  tour_id      UUID NOT NULL REFERENCES public.tours(id) ON DELETE CASCADE,
  link_id      UUID NOT NULL REFERENCES public.rider_links(id) ON DELETE CASCADE,
  routing_id   UUID REFERENCES public.routing(id) ON DELETE CASCADE,
  version_id   UUID NOT NULL REFERENCES public.rider_versions(id) ON DELETE CASCADE,
  name         TEXT NOT NULL CHECK (char_length(btrim(name)) BETWEEN 1 AND 120),
  company      TEXT CHECK (char_length(company) <= 120),
  email        TEXT CHECK (char_length(email) <= 200),
  acked_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS rider_acks_link_idx ON public.rider_acks (link_id, acked_at DESC);

CREATE TABLE IF NOT EXISTS public.rider_replies (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  tour_id      UUID NOT NULL REFERENCES public.tours(id) ON DELETE CASCADE,
  link_id      UUID NOT NULL REFERENCES public.rider_links(id) ON DELETE CASCADE,
  routing_id   UUID REFERENCES public.routing(id) ON DELETE CASCADE,
  block_id     UUID NOT NULL,   -- the request line; no FK, so a thread outlives an edit
  line         TEXT NOT NULL CHECK (char_length(line) <= 300),  -- the line as it read
  version_id   UUID REFERENCES public.rider_versions(id) ON DELETE SET NULL,
  author       TEXT NOT NULL CHECK (author IN ('venue', 'tour')),
  name         TEXT CHECK (char_length(name) <= 120),
  body         TEXT NOT NULL CHECK (char_length(btrim(body)) BETWEEN 1 AND 2000),
  created_by   UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  resolved_at  TIMESTAMPTZ,
  resolved_by  UUID REFERENCES auth.users(id) ON DELETE SET NULL
);
CREATE INDEX IF NOT EXISTS rider_replies_link_idx ON public.rider_replies (link_id, block_id, created_at);

CREATE TABLE IF NOT EXISTS public.rider_line_states (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  tour_id      UUID NOT NULL REFERENCES public.tours(id) ON DELETE CASCADE,
  routing_id   UUID NOT NULL REFERENCES public.routing(id) ON DELETE CASCADE,
  block_id     UUID NOT NULL,
  state        TEXT NOT NULL CHECK (state IN ('confirmed', 'substitute', 'cut')),
  note         TEXT CHECK (char_length(note) <= 300),
  updated_by   UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (routing_id, block_id)
);

-- ---- Templates (workspace library) + the bring-over ledger ----------------
CREATE TABLE IF NOT EXISTS public.rider_templates (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID REFERENCES public.workspaces(id) ON DELETE CASCADE,
  name         TEXT NOT NULL CHECK (char_length(btrim(name)) BETWEEN 1 AND 120),
  kind         TEXT NOT NULL CHECK (kind IN ('tech', 'hospitality')),
  artist_id    UUID REFERENCES public.artists(id) ON DELETE SET NULL,
  blocks       JSONB NOT NULL DEFAULT '[]'::jsonb CHECK (octet_length(blocks::text) <= 2000000),
  created_by   UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.rider_legacy_imports (
  pack_id      UUID PRIMARY KEY,
  workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  tour_id      UUID REFERENCES public.tours(id) ON DELETE CASCADE,
  target       TEXT NOT NULL,   -- 'rider:<id>' | 'template:<id>' | 'skipped:<why>'
  imported_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ---- Guards ----------------------------------------------------------------
-- A block's tour + workspace are its rider's (a client can't misplace one);
-- an update bumps the version the editor saves against.
CREATE OR REPLACE FUNCTION private.rider_blocks_place() RETURNS trigger
LANGUAGE plpgsql SET search_path = '' AS $fn$
DECLARE r RECORD;
BEGIN
  IF TG_OP = 'UPDATE' THEN
    NEW.rider_id   := OLD.rider_id;
    NEW.version    := OLD.version + 1;
    NEW.created_at := OLD.created_at;
    NEW.updated_at := now();
  END IF;
  SELECT workspace_id, tour_id INTO r FROM public.riders WHERE id = NEW.rider_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'rider % not found', NEW.rider_id USING ERRCODE = '23503'; END IF;
  NEW.workspace_id := r.workspace_id;
  NEW.tour_id := r.tour_id;
  RETURN NEW;
END $fn$;
DROP TRIGGER IF EXISTS rider_blocks_place ON public.rider_blocks;
CREATE TRIGGER rider_blocks_place BEFORE INSERT OR UPDATE ON public.rider_blocks
  FOR EACH ROW EXECUTE FUNCTION private.rider_blocks_place();

-- Every other tour-scoped rider row takes its workspace from its tour, and a
-- show it names must be on that tour.
CREATE OR REPLACE FUNCTION private.rider_row_scope() RETURNS trigger
LANGUAGE plpgsql SET search_path = '' AS $fn$
DECLARE ws UUID; rid TEXT;
BEGIN
  SELECT t.workspace_id INTO ws FROM public.tours t WHERE t.id = NEW.tour_id;
  IF ws IS NULL THEN RAISE EXCEPTION 'tour % not found', NEW.tour_id USING ERRCODE = '23503'; END IF;
  NEW.workspace_id := ws;
  rid := to_jsonb(NEW) ->> 'routing_id';
  IF rid IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.routing r WHERE r.id = rid::uuid AND r.tour_id = NEW.tour_id) THEN
    RAISE EXCEPTION 'show % is not on tour %', rid, NEW.tour_id USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END $fn$;
DO $do$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY['riders', 'rider_settings', 'rider_versions', 'rider_links', 'rider_sends',
                           'rider_acks', 'rider_replies', 'rider_line_states'] LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS rider_row_scope ON public.%I', t);
    EXECUTE format('CREATE TRIGGER rider_row_scope BEFORE INSERT OR UPDATE ON public.%I FOR EACH ROW EXECUTE FUNCTION private.rider_row_scope()', t);
  END LOOP;
END $do$;

-- A published version is the reference copy: never changed, never deleted on
-- its own (only with its tour — a cascade runs one trigger level deeper).
CREATE OR REPLACE FUNCTION private.rider_versions_frozen() RETURNS trigger
LANGUAGE plpgsql SET search_path = '' AS $fn$
BEGIN
  IF TG_OP = 'UPDATE' THEN
    RAISE EXCEPTION 'A published rider version can''t be changed' USING ERRCODE = '42501';
  END IF;
  IF pg_trigger_depth() < 2 THEN
    RAISE EXCEPTION 'A published rider version can''t be deleted' USING ERRCODE = '42501';
  END IF;
  RETURN OLD;
END $fn$;
DROP TRIGGER IF EXISTS rider_versions_frozen ON public.rider_versions;
CREATE TRIGGER rider_versions_frozen BEFORE UPDATE OR DELETE ON public.rider_versions
  FOR EACH ROW EXECUTE FUNCTION private.rider_versions_frozen();

-- ---- Live: other editors' saves and promoters' replies arrive by Realtime --
DO $do$
DECLARE t TEXT;
BEGIN
  IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
    FOREACH t IN ARRAY ARRAY['rider_blocks', 'rider_versions', 'rider_acks', 'rider_replies', 'rider_line_states'] LOOP
      IF NOT EXISTS (SELECT 1 FROM pg_publication_tables
                      WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = t) THEN
        EXECUTE format('ALTER PUBLICATION supabase_realtime ADD TABLE public.%I', t);
      END IF;
    END LOOP;
  END IF;
END $do$;

-- >>> rules: GENERATED by scripts/permissions/gen293.mjs from rules.mjs (since: 301) — do not hand-edit
-- One helper sets a table's rules: checks the columns (stops everything if
-- one is missing), drops EVERY existing rule on the table, indexes the
-- columns the rules read, creates lp_select / lp_insert / lp_update / lp_delete.
CREATE OR REPLACE FUNCTION private.lp_set_rules(p_table TEXT, p_cols TEXT[], p_read TEXT, p_write TEXT)
RETURNS TEXT LANGUAGE plpgsql SET search_path = '' AS $fn$
DECLARE r RECORD; missing TEXT; c TEXT;
BEGIN
  IF to_regclass('public.' || p_table) IS NULL THEN
    RAISE NOTICE '293: table % not found — skipped', p_table;
    RETURN 'skipped';
  END IF;
  SELECT string_agg(x, ', ') INTO missing FROM unnest(p_cols) AS x
   WHERE NOT EXISTS (SELECT 1 FROM information_schema.columns
                      WHERE table_schema = 'public' AND table_name = p_table AND column_name = x);
  IF missing IS NOT NULL THEN
    RAISE EXCEPTION '293 stopped, nothing changed: % has no column(s) %', p_table, missing;
  END IF;
  FOR r IN SELECT policyname FROM pg_policies WHERE schemaname = 'public' AND tablename = p_table LOOP
    EXECUTE format('DROP POLICY %I ON public.%I', r.policyname, p_table);
  END LOOP;
  EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', p_table);
  FOREACH c IN ARRAY p_cols LOOP
    IF c NOT IN ('id', 'linked_to_type') THEN
      EXECUTE format('CREATE INDEX IF NOT EXISTS %I ON public.%I (%I)', 'lp_' || p_table || '_' || c || '_idx', p_table, c);
    END IF;
  END LOOP;
  EXECUTE format('CREATE POLICY lp_select ON public.%I FOR SELECT TO authenticated USING (%s)', p_table, p_read);
  EXECUTE format('CREATE POLICY lp_insert ON public.%I FOR INSERT TO authenticated WITH CHECK (%s)', p_table, p_write);
  EXECUTE format('CREATE POLICY lp_update ON public.%I FOR UPDATE TO authenticated USING (%s) WITH CHECK (%s)', p_table, p_write, p_write);
  EXECUTE format('CREATE POLICY lp_delete ON public.%I FOR DELETE TO authenticated USING (%s)', p_table, p_write);
  RETURN 'ok';
END $fn$;
REVOKE ALL ON FUNCTION private.lp_set_rules(TEXT, TEXT[], TEXT, TEXT) FROM PUBLIC, authenticated;

-- riders: tour · production
SELECT private.lp_set_rules('riders', ARRAY['tour_id', 'workspace_id'],
  $q$tour_id IN (SELECT private.tours_i_can('production', 'view'))$q$,
  $q$tour_id IN (SELECT private.tours_i_can('production', 'edit'))$q$);
-- rider_blocks: tour · production
SELECT private.lp_set_rules('rider_blocks', ARRAY['tour_id', 'workspace_id'],
  $q$tour_id IN (SELECT private.tours_i_can('production', 'view'))$q$,
  $q$tour_id IN (SELECT private.tours_i_can('production', 'edit'))$q$);
-- rider_settings: tour · production
SELECT private.lp_set_rules('rider_settings', ARRAY['tour_id', 'workspace_id'],
  $q$tour_id IN (SELECT private.tours_i_can('production', 'view'))$q$,
  $q$tour_id IN (SELECT private.tours_i_can('production', 'edit'))$q$);
-- rider_versions: tour · production
SELECT private.lp_set_rules('rider_versions', ARRAY['tour_id', 'workspace_id'],
  $q$tour_id IN (SELECT private.tours_i_can('production', 'view'))$q$,
  $q$tour_id IN (SELECT private.tours_i_can('production', 'edit'))$q$);
-- rider_links: tour · production
SELECT private.lp_set_rules('rider_links', ARRAY['tour_id', 'workspace_id'],
  $q$tour_id IN (SELECT private.tours_i_can('production', 'view'))$q$,
  $q$tour_id IN (SELECT private.tours_i_can('production', 'edit'))$q$);
-- rider_sends: tour · production
SELECT private.lp_set_rules('rider_sends', ARRAY['tour_id', 'workspace_id'],
  $q$tour_id IN (SELECT private.tours_i_can('production', 'view'))$q$,
  $q$tour_id IN (SELECT private.tours_i_can('production', 'edit'))$q$);
-- rider_acks: tour · production
SELECT private.lp_set_rules('rider_acks', ARRAY['tour_id', 'workspace_id'],
  $q$tour_id IN (SELECT private.tours_i_can('production', 'view'))$q$,
  $q$tour_id IN (SELECT private.tours_i_can('production', 'edit'))$q$);
-- rider_replies: tour · production
SELECT private.lp_set_rules('rider_replies', ARRAY['tour_id', 'workspace_id'],
  $q$tour_id IN (SELECT private.tours_i_can('production', 'view'))$q$,
  $q$tour_id IN (SELECT private.tours_i_can('production', 'edit'))$q$);
-- rider_line_states: tour · production
SELECT private.lp_set_rules('rider_line_states', ARRAY['tour_id', 'workspace_id'],
  $q$tour_id IN (SELECT private.tours_i_can('production', 'view'))$q$,
  $q$tour_id IN (SELECT private.tours_i_can('production', 'edit'))$q$);
-- rider_templates: ref
SELECT private.lp_set_rules('rider_templates', ARRAY['workspace_id'],
  $q$workspace_id IS NULL OR workspace_id = (SELECT public.get_my_workspace_id())$q$,
  $q$workspace_id = (SELECT public.get_my_workspace_id()) AND (SELECT private.is_library_editor())$q$);
-- rider_legacy_imports: manager
SELECT private.lp_set_rules('rider_legacy_imports', ARRAY['workspace_id'],
  $q$workspace_id = (SELECT public.get_my_workspace_id()) AND (SELECT private.is_manager())$q$,
  $q$workspace_id = (SELECT public.get_my_workspace_id()) AND (SELECT private.is_manager())$q$);
-- <<< rules

COMMIT;

-- ---------------------------------------------------------------------------
-- Down (the old rider_packs data was never touched):
--   DROP TABLE IF EXISTS public.rider_legacy_imports, public.rider_templates,
--     public.rider_line_states, public.rider_replies, public.rider_acks,
--     public.rider_sends, public.rider_links, public.rider_versions,
--     public.rider_settings, public.rider_blocks, public.riders;
--   DROP FUNCTION IF EXISTS private.rider_blocks_place(), private.rider_row_scope(),
--     private.rider_versions_frozen();
-- ---------------------------------------------------------------------------
