/* ============================================
   Migration 100 — rider editor rebuild foundation (Sprint 12 §9a)

   Five additive columns + one carry-forward, all idempotent.

   artists.default_logo_url
     Per-artist default logo URL. Cascade source for rider
     cover pages: rider_packs.cover_logo_url falls back to this
     when null. Stored as a TEXT URL (no FK; logos live in
     storage and we don't enforce existence at the SQL layer).

   rider_packs.cover_logo_url
     Per-rider cover-page logo override. NULL = inherit from
     artists.default_logo_url at render time. Operators set
     this on a rider that needs different branding (e.g. a
     festival-specific rider with the festival's logo
     alongside the artist's).

   rider_packs.cover_subtitle
     Optional cover-page subtitle like "Global Festivals —
     Summer '26". Renders below the rider title on the cover.

   rider_packs.cover_disclaimer
     Optional per-rider disclaimer override. NULL = use the
     artist-level / workspace fallback at render time. The §9
     spec leaves the artist-level + workspace-level disclaimer
     storage for a future iteration; v1 reads only from this
     column.

   rider_sections.metadata JSONB DEFAULT '{}'::jsonb
     Catch-all per-section structured metadata. Sprint 12 §9
     uses it to:
       1. Store Tiptap document JSON on section_type='rich_text'
          rows (rider_sections.fields is JSONB-as-array per the
          original migration 034 CHECK; Tiptap docs are objects,
          so they need their own home).
       2. Hold the deferred Mics/DIs aggregate notes carried
          forward from §8b3 (channel_list sections — notes
          map of `mic|provider` -> string).
     Default '{}'::jsonb so existing rows backfill safely.
     OBJECT-typed (no CHECK constraint) so it's free-shaped.

   Section type discriminator
     rider_sections.section_type is already TEXT (no enum); the
     §9 work extends the union in the TS types layer to include
     'rich_text' and 'advance_summary'. No schema change needed
     for the discriminator — adding values is type-only.

   Apply via: npm run db:migrate (or paste in Supabase SQL Editor)
   ============================================ */

-- ============================================
-- 1. artists.default_logo_url
-- ============================================
ALTER TABLE public.artists
  ADD COLUMN IF NOT EXISTS default_logo_url TEXT;

-- ============================================
-- 2. rider_packs cover-page columns
-- ============================================
ALTER TABLE public.rider_packs
  ADD COLUMN IF NOT EXISTS cover_logo_url TEXT,
  ADD COLUMN IF NOT EXISTS cover_subtitle TEXT,
  ADD COLUMN IF NOT EXISTS cover_disclaimer TEXT;

-- ============================================
-- 3. rider_sections.metadata
-- ============================================
ALTER TABLE public.rider_sections
  ADD COLUMN IF NOT EXISTS metadata JSONB NOT NULL DEFAULT '{}'::jsonb;

/* ============================================
   Down migration — DO NOT auto-run on a live workspace.
   The cover-* and default_logo_url columns hold per-row
   data that would be lost on DROP COLUMN. metadata holds
   rich-text body content for rich_text sections (§9a) and
   inventory notes for channel_list sections (§8b3 carry-
   forward) — dropping would lose authored content.
   ============================================ */
-- ALTER TABLE public.rider_sections DROP COLUMN IF EXISTS metadata;
-- ALTER TABLE public.rider_packs
--   DROP COLUMN IF EXISTS cover_disclaimer,
--   DROP COLUMN IF EXISTS cover_subtitle,
--   DROP COLUMN IF EXISTS cover_logo_url;
-- ALTER TABLE public.artists DROP COLUMN IF EXISTS default_logo_url;
