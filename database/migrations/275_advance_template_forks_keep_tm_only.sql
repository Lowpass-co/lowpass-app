-- ============================================
-- LOWPASS — advance template forks keep tm_only
-- Migration 275
-- ============================================
--
-- Paste into the Supabase SQL Editor and Run. Safe to paste twice: the
-- UPDATE only touches rows that are still wrong (NOT c.tm_only), so a
-- second run changes nothing.
--
-- WHY. Some advance sections are TM-view-only (`advance_templates.tm_only`,
-- migration 023 — Deal Info: guarantee, guest list, transport). The venue
-- intake form drops them. But forking a platform template into the
-- workspace (fork-add-field) didn't copy tm_only, so the workspace's Deal
-- Info fork is tm_only = false. Venue sending has been broken until now
-- (fix/advance-intake-sections), which is the only reason the guarantee
-- hasn't been shown to venues. Fixing sending without this would expose it.
--
-- The route now copies tm_only on fork; this repairs the forks made before.
-- ============================================

-- 1. The platform Deal Info template is TM-only (as seeded by 023) — make
--    sure, in case it was edited since.
UPDATE public.advance_templates
SET tm_only = true
WHERE workspace_id IS NULL
  AND name = 'Deal Info'
  AND tm_only = false;

-- 2. Every fork of a TM-only template is TM-only.
UPDATE public.advance_templates AS c
SET tm_only = true
FROM public.advance_templates AS p
WHERE c.forked_from_id = p.id
  AND p.tm_only = true
  AND c.tm_only = false;

-- Check: every fork of a TM-only template is TM-only (expect 0 rows).
-- SELECT c.id, c.name FROM public.advance_templates c
--   JOIN public.advance_templates p ON p.id = c.forked_from_id
--  WHERE p.tm_only AND NOT c.tm_only;

-- ============================================
-- DOWN (not recommended — it re-exposes TM-only sections to venues):
-- there is no record of which forks were false before, so no exact down.
-- ============================================
