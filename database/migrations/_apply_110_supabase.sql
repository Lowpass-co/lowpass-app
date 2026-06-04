-- Apply 110 — stage plot title-bar metadata (§SP-FIX-7)
-- Hand-paste version for the Supabase SQL editor (-- comments only).
-- Idempotent: safe to re-run.

ALTER TABLE public.stage_plots ADD COLUMN IF NOT EXISTS subtitle TEXT;
ALTER TABLE public.stage_plots ADD COLUMN IF NOT EXISTS version_label TEXT;
