/* ============================================================
   MIGRATION 109 — Stage Plot Builder data model
   (Stage Plot Builder §SP0)

   Adds the Stage Plot Builder schema. Stage plots are a third
   rider_packs.kind discriminator value ('stage_plot'), siblings
   to riders + channel lists — they live in the artist library,
   snapshot-copy to tours, and pair with a rider + channel list
   via the existing linked_rider_pack_id relationship (097).

   Five new workspace-scoped tables, each 1-or-many to a
   rider_pack of kind='stage_plot':

     1. stage_plots             — 1:1 plot config (stage size,
                                  grid, reference markers, output
                                  header fields, colour override).
     2. stage_plot_items        — every placed icon / power drop /
                                  riser / annotation. Carries the
                                  channel_list_rows FK (§SP4),
                                  the festival house/main/annotation
                                  layer, grouping + z-stacking.
     3. stage_plot_versions     — named version history snapshots
                                  (§SP13). Full plot+items JSON blob.
     4. stage_plot_custom_items — workspace icon library: uploaded
                                  SVG/PNG (§SP10) + AI-generated
                                  icons (§SP11).
     5. stage_plot_share_links  — tokenised public-reader links
                                  (§SP8) + view tracking.

   Plus the stage-plot-assets storage bucket (uploads, reference
   images, AI-generated SVGs) with workspace-path-prefix RLS.

   Numbering: 106 is highest on main; 107/108 are advance-intake
   migrations on design/ux-audit-2026. 109 is the next collision-
   free number across all active branches (README §numbering).

   Canonical 4-policy workspace RLS on every table (mirrors 104).
   The public-reader anon-by-token read path for share links is
   deferred to §SP8 (a SECURITY DEFINER fetch-by-token function),
   so §SP0 ships workspace-only RLS.

   updated_at columns are app-managed (no trigger), matching the
   most recent canonical table pattern (104).

   Idempotent. Safe to re-run.

   Apply via: npm run db:migrate
   (or paste database/migrations/_apply_109_supabase.sql)
   ============================================================ */

-- ============================================================
-- 0. Extend rider_packs.kind discriminator to add 'stage_plot'
--    097 created rider_packs_kind_check CHECK (kind IN
--    ('rider','channel_list')) via a guarded DO block. DROP +
--    re-ADD so the constraint picks up the new value; DROP IF
--    EXISTS keeps the re-add idempotent.
-- ============================================================
ALTER TABLE public.rider_packs
  DROP CONSTRAINT IF EXISTS rider_packs_kind_check;
ALTER TABLE public.rider_packs
  ADD CONSTRAINT rider_packs_kind_check
  CHECK (kind IN ('rider', 'channel_list', 'stage_plot'));

-- ============================================================
-- 1. stage_plots — 1:1 config per rider_pack (kind='stage_plot')
-- ============================================================
CREATE TABLE IF NOT EXISTS public.stage_plots (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id         UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  rider_pack_id        UUID NOT NULL UNIQUE REFERENCES public.rider_packs(id) ON DELETE CASCADE,
  stage_width_ft       NUMERIC(5, 2) NOT NULL DEFAULT 24,
  stage_depth_ft       NUMERIC(5, 2) NOT NULL DEFAULT 16,
  stage_shape          JSONB NOT NULL DEFAULT '{"type":"rect"}',   -- rect + additive polygon extensions
  units                TEXT NOT NULL DEFAULT 'ft' CHECK (units IN ('ft', 'm')),
  show_grid            BOOLEAN NOT NULL DEFAULT true,
  grid_size_ft         NUMERIC(4, 2) NOT NULL DEFAULT 1,
  show_center_line     BOOLEAN NOT NULL DEFAULT false,
  show_ds_cross        BOOLEAN NOT NULL DEFAULT false,
  show_lateral_markers BOOLEAN NOT NULL DEFAULT false,
  show_rulers          BOOLEAN NOT NULL DEFAULT true,
  notes                TEXT,
  -- Output header fields (PDF / public reader)
  show_tm_name         TEXT,
  show_tm_role         TEXT,
  show_tm_phone        TEXT,
  show_tm_email        TEXT,
  show_logo_position   TEXT DEFAULT 'top-right' CHECK (show_logo_position IN ('top-left', 'top-right', 'top-center')),
  show_qr_on_print     BOOLEAN NOT NULL DEFAULT true,
  -- Colour cascade override (plot.color -> tour -> artist -> workspace default)
  color_override       TEXT,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS stage_plots_workspace_idx
  ON public.stage_plots (workspace_id);

ALTER TABLE public.stage_plots ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS stage_plots_select ON public.stage_plots;
CREATE POLICY stage_plots_select ON public.stage_plots
  FOR SELECT USING (workspace_id = public.get_my_workspace_id());

DROP POLICY IF EXISTS stage_plots_insert ON public.stage_plots;
CREATE POLICY stage_plots_insert ON public.stage_plots
  FOR INSERT WITH CHECK (workspace_id = public.get_my_workspace_id());

DROP POLICY IF EXISTS stage_plots_update ON public.stage_plots;
CREATE POLICY stage_plots_update ON public.stage_plots
  FOR UPDATE USING (workspace_id = public.get_my_workspace_id())
    WITH CHECK (workspace_id = public.get_my_workspace_id());

DROP POLICY IF EXISTS stage_plots_delete ON public.stage_plots;
CREATE POLICY stage_plots_delete ON public.stage_plots
  FOR DELETE USING (
    workspace_id = public.get_my_workspace_id()
    AND public.is_workspace_admin()
  );

-- ============================================================
-- 2. stage_plot_items — placed icons / power drops / annotations
-- ============================================================
CREATE TABLE IF NOT EXISTS public.stage_plot_items (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id        UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  stage_plot_id       UUID NOT NULL REFERENCES public.stage_plots(id) ON DELETE CASCADE,
  layer               TEXT NOT NULL DEFAULT 'main' CHECK (layer IN ('house', 'main', 'annotations')),
  icon_name           TEXT NOT NULL,                    -- registry key OR custom_<uuid>
  label               TEXT,
  label_position      TEXT DEFAULT 'bottom' CHECK (label_position IN ('top', 'bottom', 'left', 'right', 'inside', 'hidden')),
  label_rotation_deg  NUMERIC(5, 2) DEFAULT 0,
  label_style         JSONB DEFAULT '{}',               -- bg style, bold/italic, etc.
  position_x_ft       NUMERIC(6, 2) NOT NULL,
  position_y_ft       NUMERIC(6, 2) NOT NULL,
  width_ft            NUMERIC(5, 2),
  depth_ft            NUMERIC(5, 2),
  height_ft           NUMERIC(4, 2),                    -- risers + stacked items
  rotation_deg        NUMERIC(5, 2) NOT NULL DEFAULT 0,
  scale               NUMERIC(4, 2) NOT NULL DEFAULT 1.0,
  color_tint          TEXT,
  shape_variant       TEXT CHECK (shape_variant IN ('natural', 'rectangle', 'circle', 'diamond', 'triangle', 'hexagon', 'octagon', 'rounded-rect', 'custom-polygon')),
  custom_polygon      JSONB,                            -- vertices when shape_variant='custom-polygon'
  notes               TEXT,
  power_required      BOOLEAN NOT NULL DEFAULT false,
  power_amperage      INTEGER,
  power_voltage       INTEGER,
  channel_list_row_id UUID REFERENCES public.channel_list_rows(id) ON DELETE SET NULL,
  auto_position_label TEXT,                             -- derived: USL/USR/USC/DSL/DSC/DSR/OSL/OSR
  z_index             INTEGER NOT NULL DEFAULT 0,
  locked              BOOLEAN NOT NULL DEFAULT false,
  group_id            UUID,                             -- grouped items share a group_id
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS spi_plot_layer_z
  ON public.stage_plot_items (stage_plot_id, layer, z_index);
CREATE INDEX IF NOT EXISTS spi_channel
  ON public.stage_plot_items (channel_list_row_id) WHERE channel_list_row_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS spi_group
  ON public.stage_plot_items (group_id) WHERE group_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS spi_workspace
  ON public.stage_plot_items (workspace_id);

ALTER TABLE public.stage_plot_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS stage_plot_items_select ON public.stage_plot_items;
CREATE POLICY stage_plot_items_select ON public.stage_plot_items
  FOR SELECT USING (workspace_id = public.get_my_workspace_id());

DROP POLICY IF EXISTS stage_plot_items_insert ON public.stage_plot_items;
CREATE POLICY stage_plot_items_insert ON public.stage_plot_items
  FOR INSERT WITH CHECK (workspace_id = public.get_my_workspace_id());

DROP POLICY IF EXISTS stage_plot_items_update ON public.stage_plot_items;
CREATE POLICY stage_plot_items_update ON public.stage_plot_items
  FOR UPDATE USING (workspace_id = public.get_my_workspace_id())
    WITH CHECK (workspace_id = public.get_my_workspace_id());

DROP POLICY IF EXISTS stage_plot_items_delete ON public.stage_plot_items;
CREATE POLICY stage_plot_items_delete ON public.stage_plot_items
  FOR DELETE USING (
    workspace_id = public.get_my_workspace_id()
    AND public.is_workspace_admin()
  );

-- ============================================================
-- 3. stage_plot_versions — named version history (§SP13)
-- ============================================================
CREATE TABLE IF NOT EXISTS public.stage_plot_versions (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id        UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  stage_plot_id       UUID NOT NULL REFERENCES public.stage_plots(id) ON DELETE CASCADE,
  version_name        TEXT NOT NULL,
  version_description TEXT,
  snapshot            JSONB NOT NULL,                   -- full plot + items state at this version
  created_by          UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS spv_plot_created
  ON public.stage_plot_versions (stage_plot_id, created_at DESC);

ALTER TABLE public.stage_plot_versions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS stage_plot_versions_select ON public.stage_plot_versions;
CREATE POLICY stage_plot_versions_select ON public.stage_plot_versions
  FOR SELECT USING (workspace_id = public.get_my_workspace_id());

DROP POLICY IF EXISTS stage_plot_versions_insert ON public.stage_plot_versions;
CREATE POLICY stage_plot_versions_insert ON public.stage_plot_versions
  FOR INSERT WITH CHECK (workspace_id = public.get_my_workspace_id());

DROP POLICY IF EXISTS stage_plot_versions_update ON public.stage_plot_versions;
CREATE POLICY stage_plot_versions_update ON public.stage_plot_versions
  FOR UPDATE USING (workspace_id = public.get_my_workspace_id())
    WITH CHECK (workspace_id = public.get_my_workspace_id());

DROP POLICY IF EXISTS stage_plot_versions_delete ON public.stage_plot_versions;
CREATE POLICY stage_plot_versions_delete ON public.stage_plot_versions
  FOR DELETE USING (
    workspace_id = public.get_my_workspace_id()
    AND public.is_workspace_admin()
  );

-- ============================================================
-- 4. stage_plot_custom_items — workspace icon library
--    (uploaded SVG/PNG §SP10 + AI-generated §SP11)
-- ============================================================
CREATE TABLE IF NOT EXISTS public.stage_plot_custom_items (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id     UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  label            TEXT NOT NULL,
  category         TEXT,
  svg_content      TEXT NOT NULL,                       -- the actual SVG paths
  source           TEXT NOT NULL CHECK (source IN ('uploaded', 'ai-generated')),
  ai_prompt        TEXT,                                -- prompt used, if AI-generated
  default_width_ft NUMERIC(4, 2),
  default_depth_ft NUMERIC(4, 2),
  created_by       UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (workspace_id, label)
);

CREATE INDEX IF NOT EXISTS spci_workspace
  ON public.stage_plot_custom_items (workspace_id);

ALTER TABLE public.stage_plot_custom_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS stage_plot_custom_items_select ON public.stage_plot_custom_items;
CREATE POLICY stage_plot_custom_items_select ON public.stage_plot_custom_items
  FOR SELECT USING (workspace_id = public.get_my_workspace_id());

DROP POLICY IF EXISTS stage_plot_custom_items_insert ON public.stage_plot_custom_items;
CREATE POLICY stage_plot_custom_items_insert ON public.stage_plot_custom_items
  FOR INSERT WITH CHECK (workspace_id = public.get_my_workspace_id());

DROP POLICY IF EXISTS stage_plot_custom_items_update ON public.stage_plot_custom_items;
CREATE POLICY stage_plot_custom_items_update ON public.stage_plot_custom_items
  FOR UPDATE USING (workspace_id = public.get_my_workspace_id())
    WITH CHECK (workspace_id = public.get_my_workspace_id());

DROP POLICY IF EXISTS stage_plot_custom_items_delete ON public.stage_plot_custom_items;
CREATE POLICY stage_plot_custom_items_delete ON public.stage_plot_custom_items
  FOR DELETE USING (
    workspace_id = public.get_my_workspace_id()
    AND public.is_workspace_admin()
  );

-- ============================================================
-- 5. stage_plot_share_links — public reader tokens (§SP8)
--    Anon read-by-token path is added in §SP8 (SECURITY DEFINER
--    function); §SP0 ships workspace-only RLS.
-- ============================================================
CREATE TABLE IF NOT EXISTS public.stage_plot_share_links (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id    UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  stage_plot_id   UUID NOT NULL REFERENCES public.stage_plots(id) ON DELETE CASCADE,
  token           TEXT NOT NULL UNIQUE,
  view_count      INTEGER NOT NULL DEFAULT 0,
  last_viewed_at  TIMESTAMPTZ,
  last_viewer_ip  TEXT,
  created_by      UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS spsl_token
  ON public.stage_plot_share_links (token);

ALTER TABLE public.stage_plot_share_links ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS stage_plot_share_links_select ON public.stage_plot_share_links;
CREATE POLICY stage_plot_share_links_select ON public.stage_plot_share_links
  FOR SELECT USING (workspace_id = public.get_my_workspace_id());

DROP POLICY IF EXISTS stage_plot_share_links_insert ON public.stage_plot_share_links;
CREATE POLICY stage_plot_share_links_insert ON public.stage_plot_share_links
  FOR INSERT WITH CHECK (workspace_id = public.get_my_workspace_id());

DROP POLICY IF EXISTS stage_plot_share_links_update ON public.stage_plot_share_links;
CREATE POLICY stage_plot_share_links_update ON public.stage_plot_share_links
  FOR UPDATE USING (workspace_id = public.get_my_workspace_id())
    WITH CHECK (workspace_id = public.get_my_workspace_id());

DROP POLICY IF EXISTS stage_plot_share_links_delete ON public.stage_plot_share_links;
CREATE POLICY stage_plot_share_links_delete ON public.stage_plot_share_links
  FOR DELETE USING (
    workspace_id = public.get_my_workspace_id()
    AND public.is_workspace_admin()
  );

-- ============================================================
-- 6. stage-plot-assets storage bucket + workspace-path RLS
--    First path segment is the workspace_id (matches 106's
--    payroll-pdfs pattern).
-- ============================================================
INSERT INTO storage.buckets (id, name, public)
VALUES ('stage-plot-assets', 'stage-plot-assets', false)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS stage_plot_assets_select ON storage.objects;
CREATE POLICY stage_plot_assets_select ON storage.objects
  FOR SELECT TO authenticated USING (
    bucket_id = 'stage-plot-assets'
    AND (storage.foldername(name))[1] = public.get_my_workspace_id()::text
  );

DROP POLICY IF EXISTS stage_plot_assets_insert ON storage.objects;
CREATE POLICY stage_plot_assets_insert ON storage.objects
  FOR INSERT TO authenticated WITH CHECK (
    bucket_id = 'stage-plot-assets'
    AND (storage.foldername(name))[1] = public.get_my_workspace_id()::text
  );

DROP POLICY IF EXISTS stage_plot_assets_update ON storage.objects;
CREATE POLICY stage_plot_assets_update ON storage.objects
  FOR UPDATE TO authenticated USING (
    bucket_id = 'stage-plot-assets'
    AND (storage.foldername(name))[1] = public.get_my_workspace_id()::text
  );

DROP POLICY IF EXISTS stage_plot_assets_delete ON storage.objects;
CREATE POLICY stage_plot_assets_delete ON storage.objects
  FOR DELETE TO authenticated USING (
    bucket_id = 'stage-plot-assets'
    AND (storage.foldername(name))[1] = public.get_my_workspace_id()::text
    AND public.is_workspace_admin()
  );

/* ============================================================
   DOWN MIGRATION (manual — DO NOT auto-run)
   ----------------------------------------------------------
   Storage policies + bucket:
     DROP POLICY IF EXISTS stage_plot_assets_select ON storage.objects;
     DROP POLICY IF EXISTS stage_plot_assets_insert ON storage.objects;
     DROP POLICY IF EXISTS stage_plot_assets_update ON storage.objects;
     DROP POLICY IF EXISTS stage_plot_assets_delete ON storage.objects;
     DELETE FROM storage.buckets WHERE id = 'stage-plot-assets';

   Tables (children first; FKs cascade):
     DROP TABLE IF EXISTS public.stage_plot_share_links CASCADE;
     DROP TABLE IF EXISTS public.stage_plot_custom_items CASCADE;
     DROP TABLE IF EXISTS public.stage_plot_versions CASCADE;
     DROP TABLE IF EXISTS public.stage_plot_items CASCADE;
     DROP TABLE IF EXISTS public.stage_plots CASCADE;

   Revert the kind CHECK (only safe once no stage_plot rows
   remain in rider_packs):
     ALTER TABLE public.rider_packs DROP CONSTRAINT IF EXISTS rider_packs_kind_check;
     ALTER TABLE public.rider_packs ADD CONSTRAINT rider_packs_kind_check
       CHECK (kind IN ('rider', 'channel_list'));
   ============================================================ */
