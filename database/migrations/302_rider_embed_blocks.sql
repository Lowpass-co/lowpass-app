-- ============================================================================
-- 302_rider_embed_blocks.sql  (Nov 2026, Adam: "channel list and stage plot
-- are standalone tools but ALSO need to integrate into the tech rider")
--
-- Two more kinds of block on a rider document:
--
--   input_list   shows the channel list (the tour's — or, on a show's own
--                link, the one attached to that show)
--   stage_plot   shows the stage plot, the same way
--
-- The documents stay in their own tools (Production › Channel list / Stage
-- plot). The rider only SHOWS them, and Publish freezes a copy into the
-- version's snapshot (rider_versions.snapshot) — so no new table or column.
--
-- Request lines also gain an optional link to the exact item and a photo of
-- it. Both live in rider_blocks.content (JSONB) and need nothing here. Photos
-- are stored in the private tour-files bucket under
-- rider-photos/<workspace>/<tour>/, uploaded through storage_upload_grants
-- (282) like every other upload, and only ever shown through signed URLs.
--
-- Re-runnable: the CHECK is dropped and re-added with the full list.
-- ============================================================================
BEGIN;

ALTER TABLE public.rider_blocks DROP CONSTRAINT IF EXISTS rider_blocks_kind_check;
ALTER TABLE public.rider_blocks ADD CONSTRAINT rider_blocks_kind_check
  CHECK (kind IN ('heading', 'text', 'request', 'table', 'contacts', 'summary', 'files', 'break', 'input_list', 'stage_plot'));

COMMIT;

-- ---------------------------------------------------------------------------
-- Down (only once no block uses the two kinds — the re-add would fail):
--   DELETE FROM public.rider_blocks WHERE kind IN ('input_list', 'stage_plot');
--   ALTER TABLE public.rider_blocks DROP CONSTRAINT IF EXISTS rider_blocks_kind_check;
--   ALTER TABLE public.rider_blocks ADD CONSTRAINT rider_blocks_kind_check
--     CHECK (kind IN ('heading', 'text', 'request', 'table', 'contacts', 'summary', 'files', 'break'));
-- ---------------------------------------------------------------------------
