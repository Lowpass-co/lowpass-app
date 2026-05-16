/* ============================================
   Migration 097 — rider_packs.kind discriminator
   + linked_rider_pack_id self-FK
   + propagated_from_template_at audit column
   + unique-index recomputation
   (Sprint 12 §7 — Artist library, schema-only)

   The Sprint 12 §7 spec originally proposed four new tables
   (artist_riders, artist_channel_lists, artist_financials,
   artist_files). The recon revealed those would duplicate the
   existing rider_packs surface, which already supports
   scope='artist'. The course-corrected plan is ADD-only on
   rider_packs:

     1. kind                        — discriminator 'rider' |
                                       'channel_list'. Default
                                       'rider' so every
                                       existing row backfills
                                       to the rider kind.
     2. linked_rider_pack_id        — self-FK with ON DELETE
                                       SET NULL. Lets a
                                       channel-list pack
                                       reference the tech rider
                                       it accompanies, so the
                                       Advance packet view can
                                       surface them as paired
                                       documents.
     3. propagated_from_template_at — audit column stamped when
                                       a tour-scoped pack is
                                       overwritten from its
                                       source artist template
                                       (the §7.1 propagate-
                                       modal work). Lands here
                                       so the modal commit
                                       doesn't need its own
                                       migration; the column
                                       is dormant until §7.1
                                       wires up the propagate
                                       flow.

   No unique-index reshape: migration 039 (rider_folders)
   already dropped the per-scope unique indexes from 034 and
   moved to a folder-per-pack model where many folders (and
   thus many packs) live per artist/tour/show. The `kind`
   column adds a discriminator orthogonal to that — multiple
   packs of either kind can coexist per scope tuple. No
   uniqueness constraint is needed for the channel-list-as-
   document model.

   No table drops. The /templates page surface (workspace-
   level unified template library) is deleted in code only —
   the underlying advance_templates / advance_layout_templates
   / advance_schedule_templates tables back the live Advance
   product and stay intact.

   Apply via: npm run db:migrate
   ============================================ */

-- ============================================
-- 1. kind discriminator
-- ============================================
ALTER TABLE public.rider_packs
  ADD COLUMN IF NOT EXISTS kind TEXT NOT NULL DEFAULT 'rider';

/* CHECK constraint added in a guarded DO block so re-running
   the migration against an already-applied database doesn't
   trip a duplicate-constraint error. */
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'rider_packs_kind_check'
      AND conrelid = 'public.rider_packs'::regclass
  ) THEN
    ALTER TABLE public.rider_packs
      ADD CONSTRAINT rider_packs_kind_check
      CHECK (kind IN ('rider', 'channel_list'));
  END IF;
END $$;

-- ============================================
-- 2. linked_rider_pack_id self-FK
-- ============================================
ALTER TABLE public.rider_packs
  ADD COLUMN IF NOT EXISTS linked_rider_pack_id UUID
    REFERENCES public.rider_packs(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS rider_packs_linked_rider_pack_idx
  ON public.rider_packs(linked_rider_pack_id)
  WHERE linked_rider_pack_id IS NOT NULL;

-- ============================================
-- 3. propagated_from_template_at audit
-- ============================================
ALTER TABLE public.rider_packs
  ADD COLUMN IF NOT EXISTS propagated_from_template_at TIMESTAMPTZ;

/* ============================================
   Down migration — DO NOT auto-run.

   The CHECK constraint must come off before dropping the
   column. linked_rider_pack_id's self-FK has ON DELETE SET
   NULL semantics, so dropping the column doesn't cascade
   any rows. propagated_from_template_at is pure audit data
   and safe to drop. No index reshape to undo (39 already
   removed the kind-free unique indexes; 097 doesn't replace
   them).
   ============================================ */
-- DROP INDEX IF EXISTS public.rider_packs_linked_rider_pack_idx;
-- ALTER TABLE public.rider_packs DROP COLUMN IF EXISTS propagated_from_template_at;
-- ALTER TABLE public.rider_packs DROP COLUMN IF EXISTS linked_rider_pack_id;
-- ALTER TABLE public.rider_packs DROP CONSTRAINT IF EXISTS rider_packs_kind_check;
-- ALTER TABLE public.rider_packs DROP COLUMN IF EXISTS kind;
