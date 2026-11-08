/* ============================================================
   MIGRATION 283 — file_entity_links (Nov 2026, Adam)

   A file in tour Files can be linked to any number of shows, venues and
   people, and shows up on each one's page:
     · show   → routing.id        (advance show page, Schedule's show panel)
     · venue  → canonical_venues.id — on EVERY show at that venue across this
                workspace's tours (labelled with the tour it came from)
     · person → persons.id        (the person panel, on any tour)
   The file still lives where it lives (file_references.linked_to_*); a link
   is only "also show it here". Unlinking never deletes the file; deleting
   the file removes its links.

   canonical_venues is shared across workspaces, so every link carries
   workspace_id — a venue link only ever shows YOUR files.

   HAND-PASTE into the Supabase SQL editor. Idempotent — a re-run is a no-op.
   ============================================================ */

CREATE TABLE IF NOT EXISTS public.file_entity_links (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  file_id UUID NOT NULL REFERENCES public.file_references(id) ON DELETE CASCADE,
  entity_type TEXT NOT NULL,
  entity_id UUID NOT NULL,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT file_entity_links_type_chk CHECK (entity_type IN ('show', 'venue', 'person')),
  CONSTRAINT file_entity_links_unique UNIQUE (file_id, entity_type, entity_id)
);

CREATE INDEX IF NOT EXISTS idx_file_entity_links_entity ON public.file_entity_links(workspace_id, entity_type, entity_id);

ALTER TABLE public.file_entity_links ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS file_entity_links_select ON public.file_entity_links;
CREATE POLICY file_entity_links_select ON public.file_entity_links
  FOR SELECT USING (workspace_id = public.get_my_workspace_id());

DROP POLICY IF EXISTS file_entity_links_insert ON public.file_entity_links;
CREATE POLICY file_entity_links_insert ON public.file_entity_links
  FOR INSERT WITH CHECK (
    workspace_id = public.get_my_workspace_id()
    AND file_id IN (SELECT f.id FROM public.file_references f WHERE f.workspace_id = public.get_my_workspace_id())
  );

DROP POLICY IF EXISTS file_entity_links_delete ON public.file_entity_links;
CREATE POLICY file_entity_links_delete ON public.file_entity_links
  FOR DELETE USING (workspace_id = public.get_my_workspace_id());

/* ── Checks (optional) ───────────────────────────────────────
   SELECT to_regclass('public.file_entity_links');
   SELECT policyname FROM pg_policies WHERE tablename = 'file_entity_links' ORDER BY 1;
   -- expect 3 rows */

/* ============================================================
   DOWN MIGRATION (manual)
   ----------------------------------------------------------
   DROP TABLE IF EXISTS public.file_entity_links;
   ============================================================ */
