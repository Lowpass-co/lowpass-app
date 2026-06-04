-- Migration 110 — stage plot title-bar metadata (§SP-FIX-7)
--
-- Adds subtitle + version_label to stage_plots so the structured
-- title bar can carry them. TM name/role/phone/email + logo position
-- already exist from migration 109.

ALTER TABLE public.stage_plots ADD COLUMN IF NOT EXISTS subtitle TEXT;
ALTER TABLE public.stage_plots ADD COLUMN IF NOT EXISTS version_label TEXT;

-- Down:
-- ALTER TABLE public.stage_plots DROP COLUMN IF EXISTS subtitle;
-- ALTER TABLE public.stage_plots DROP COLUMN IF EXISTS version_label;
