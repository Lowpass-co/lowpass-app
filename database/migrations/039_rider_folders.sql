-- ============================================
-- LOWPASS — Rider folders: multiple "rider" documents per artist / tour / show
-- Migration 039
--
-- Replaces the one-pack-per-(artist|tour|show) model with:
--   rider_folders  — one row per "folder" (user-facing grouping; multiple per artist
--                    and multiple per show/tour as needed).
--   rider_packs    — exactly one pack per folder (the editable rider / sections).
-- Inheritance for merge (show > tour > artist) follows rider_folders.inherit_from_folder_id
-- to form a chain (show → tour → artist) instead of a single parent pack per scope.
-- ============================================

-- --------------------------------------------
-- 1) Table: rider_folders
-- --------------------------------------------
CREATE TABLE IF NOT EXISTS public.rider_folders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  artist_id UUID NOT NULL REFERENCES public.artists(id) ON DELETE CASCADE,
  scope TEXT NOT NULL CHECK (scope IN ('artist', 'tour', 'show')),
  tour_id UUID REFERENCES public.tours(id) ON DELETE CASCADE,
  routing_id UUID REFERENCES public.routing(id) ON DELETE CASCADE,
  title TEXT,
  inherit_from_folder_id UUID REFERENCES public.rider_folders(id) ON DELETE SET NULL,
  sort_order INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT rider_folders_scope_shape CHECK (
    (scope = 'artist' AND tour_id IS NULL AND routing_id IS NULL) OR
    (scope = 'tour'   AND tour_id IS NOT NULL AND routing_id IS NULL) OR
    (scope = 'show'   AND tour_id IS NOT NULL AND routing_id IS NOT NULL)
  )
);

CREATE INDEX IF NOT EXISTS rider_folders_workspace_idx ON public.rider_folders(workspace_id);
CREATE INDEX IF NOT EXISTS rider_folders_artist_idx ON public.rider_folders(artist_id);
CREATE INDEX IF NOT EXISTS rider_folders_tour_idx ON public.rider_folders(tour_id) WHERE tour_id IS NOT NULL;

-- --------------------------------------------
-- 2) Backfill: one folder per existing pack, set rider_packs.folder_id
-- --------------------------------------------
ALTER TABLE public.rider_packs
  ADD COLUMN IF NOT EXISTS folder_id UUID;

-- Staging: pack_id -> new folder_id (only packs not yet linked)
DROP TABLE IF EXISTS public._m39_pack_folder;
CREATE TABLE public._m39_pack_folder (
  pack_id UUID PRIMARY KEY REFERENCES public.rider_packs(id) ON DELETE CASCADE,
  folder_id UUID NOT NULL
);

INSERT INTO public._m39_pack_folder (pack_id, folder_id)
SELECT id, gen_random_uuid() FROM public.rider_packs WHERE folder_id IS NULL;

INSERT INTO public.rider_folders (
  id, workspace_id, artist_id, scope, tour_id, routing_id, title,
  created_at, updated_at, sort_order, inherit_from_folder_id
)
SELECT
  m.folder_id,
  rp.workspace_id,
  rp.artist_id,
  rp.scope,
  rp.tour_id,
  rp.routing_id,
  rp.title,
  rp.created_at,
  rp.updated_at,
  0,
  NULL
FROM public._m39_pack_folder m
JOIN public.rider_packs rp ON rp.id = m.pack_id;

UPDATE public.rider_packs AS rp
SET folder_id = m.folder_id
FROM public._m39_pack_folder AS m
WHERE rp.id = m.pack_id;

ALTER TABLE public.rider_packs
  ALTER COLUMN folder_id SET NOT NULL;

DO $$
BEGIN
  ALTER TABLE public.rider_packs
    ADD CONSTRAINT rider_packs_folder_id_fkey
    FOREIGN KEY (folder_id) REFERENCES public.rider_folders(id) ON DELETE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END
$$;

CREATE UNIQUE INDEX IF NOT EXISTS rider_packs_one_per_folder
  ON public.rider_packs(folder_id);

-- No longer: one pack per (artist|tour|show) — multiple folders (and thus packs) are allowed.
DROP INDEX IF EXISTS public.rider_packs_artist_unique;
DROP INDEX IF EXISTS public.rider_packs_tour_unique;
DROP INDEX IF EXISTS public.rider_packs_show_unique;

-- --------------------------------------------
-- 3) Backfill folder inheritance links from legacy single-chain semantics
-- --------------------------------------------
-- Tour → oldest artist-scoped folder for the same artist
UPDATE public.rider_folders AS f
SET inherit_from_folder_id = sub.parent_id
FROM (
  SELECT
    f_tour.id AS id,
    (
      SELECT f_art.id
      FROM public.rider_folders AS f_art
      WHERE f_art.artist_id = f_tour.artist_id
        AND f_art.scope = 'artist'
      ORDER BY f_art.created_at ASC NULLS LAST, f_art.id ASC
      LIMIT 1
    ) AS parent_id
  FROM public.rider_folders AS f_tour
  WHERE f_tour.scope = 'tour'
) AS sub
WHERE f.id = sub.id
  AND sub.parent_id IS NOT NULL;

-- Show → oldest tour-scoped folder for the same artist + tour
UPDATE public.rider_folders AS f_show
SET inherit_from_folder_id = (
  SELECT f_tour.id
  FROM public.rider_folders AS f_tour
  WHERE f_tour.artist_id = f_show.artist_id
    AND f_tour.tour_id = f_show.tour_id
    AND f_tour.scope = 'tour'
  ORDER BY f_tour.created_at ASC NULLS LAST, f_tour.id ASC
  LIMIT 1
)
WHERE f_show.scope = 'show'
  AND f_show.tour_id IS NOT NULL;

-- --------------------------------------------
-- 4) RLS for rider_folders
-- --------------------------------------------
ALTER TABLE public.rider_folders ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "rider_folders_select" ON public.rider_folders;
CREATE POLICY "rider_folders_select"
  ON public.rider_folders FOR SELECT
  USING (workspace_id = public.get_my_workspace_id());

DROP POLICY IF EXISTS "rider_folders_insert" ON public.rider_folders;
CREATE POLICY "rider_folders_insert"
  ON public.rider_folders FOR INSERT
  WITH CHECK (
    workspace_id = public.get_my_workspace_id() AND
    (scope <> 'artist' OR public.is_workspace_admin())
  );

DROP POLICY IF EXISTS "rider_folders_update" ON public.rider_folders;
CREATE POLICY "rider_folders_update"
  ON public.rider_folders FOR UPDATE
  USING (workspace_id = public.get_my_workspace_id())
  WITH CHECK (
    workspace_id = public.get_my_workspace_id() AND
    (scope <> 'artist' OR public.is_workspace_admin())
  );

DROP POLICY IF EXISTS "rider_folders_delete" ON public.rider_folders;
CREATE POLICY "rider_folders_delete"
  ON public.rider_folders FOR DELETE
  USING (
    workspace_id = public.get_my_workspace_id() AND
    (scope <> 'artist' OR public.is_workspace_admin())
  );

-- --------------------------------------------
-- 5) Triggers: updated_at
-- --------------------------------------------
CREATE OR REPLACE FUNCTION public.rider_folders_set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS rider_folders_updated_at ON public.rider_folders;
CREATE TRIGGER rider_folders_updated_at
  BEFORE UPDATE ON public.rider_folders
  FOR EACH ROW EXECUTE FUNCTION public.rider_folders_set_updated_at();

-- --------------------------------------------
-- 6) Drop staging
-- --------------------------------------------
DROP TABLE IF EXISTS public._m39_pack_folder;

COMMENT ON TABLE public.rider_folders IS
  'User-facing "folder" for rider content: many per artist / tour / show. One rider_packs row per folder. Inheritance for merged sections uses inherit_from_folder_id.';
