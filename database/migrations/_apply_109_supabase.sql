-- APPLY 109 in Supabase SQL Editor (Stage Plot Builder §SP0)
--
-- rider_packs.kind += 'stage_plot' + five workspace-scoped
-- tables (stage_plots, stage_plot_items, stage_plot_versions,
-- stage_plot_custom_items, stage_plot_share_links) + the
-- stage-plot-assets storage bucket with workspace-path RLS.
--
-- This file uses only -- line comments. Markdown / C-style
-- (/* */) comment blocks trigger the dashboard's trailing-quote
-- paste crash (see §A1 history). Idempotent; safe to re-run.

-- 0. Extend the kind discriminator to add 'stage_plot'.
ALTER TABLE public.rider_packs
  DROP CONSTRAINT IF EXISTS rider_packs_kind_check;
ALTER TABLE public.rider_packs
  ADD CONSTRAINT rider_packs_kind_check
  CHECK (kind IN ('rider', 'channel_list', 'stage_plot'));

-- 1. stage_plots — 1:1 config per rider_pack (kind='stage_plot').
CREATE TABLE IF NOT EXISTS public.stage_plots (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id         UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  rider_pack_id        UUID NOT NULL UNIQUE REFERENCES public.rider_packs(id) ON DELETE CASCADE,
  stage_width_ft       NUMERIC(5, 2) NOT NULL DEFAULT 24,
  stage_depth_ft       NUMERIC(5, 2) NOT NULL DEFAULT 16,
  stage_shape          JSONB NOT NULL DEFAULT '{"type":"rect"}',
  units                TEXT NOT NULL DEFAULT 'ft' CHECK (units IN ('ft', 'm')),
  show_grid            BOOLEAN NOT NULL DEFAULT true,
  grid_size_ft         NUMERIC(4, 2) NOT NULL DEFAULT 1,
  show_center_line     BOOLEAN NOT NULL DEFAULT false,
  show_ds_cross        BOOLEAN NOT NULL DEFAULT false,
  show_lateral_markers BOOLEAN NOT NULL DEFAULT false,
  show_rulers          BOOLEAN NOT NULL DEFAULT true,
  notes                TEXT,
  show_tm_name         TEXT,
  show_tm_role         TEXT,
  show_tm_phone        TEXT,
  show_tm_email        TEXT,
  show_logo_position   TEXT DEFAULT 'top-right' CHECK (show_logo_position IN ('top-left', 'top-right', 'top-center')),
  show_qr_on_print     BOOLEAN NOT NULL DEFAULT true,
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

-- 2. stage_plot_items — placed icons / power drops / annotations.
CREATE TABLE IF NOT EXISTS public.stage_plot_items (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id        UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  stage_plot_id       UUID NOT NULL REFERENCES public.stage_plots(id) ON DELETE CASCADE,
  layer               TEXT NOT NULL DEFAULT 'main' CHECK (layer IN ('house', 'main', 'annotations')),
  icon_name           TEXT NOT NULL,
  label               TEXT,
  label_position      TEXT DEFAULT 'bottom' CHECK (label_position IN ('top', 'bottom', 'left', 'right', 'inside', 'hidden')),
  label_rotation_deg  NUMERIC(5, 2) DEFAULT 0,
  label_style         JSONB DEFAULT '{}',
  position_x_ft       NUMERIC(6, 2) NOT NULL,
  position_y_ft       NUMERIC(6, 2) NOT NULL,
  width_ft            NUMERIC(5, 2),
  depth_ft            NUMERIC(5, 2),
  height_ft           NUMERIC(4, 2),
  rotation_deg        NUMERIC(5, 2) NOT NULL DEFAULT 0,
  scale               NUMERIC(4, 2) NOT NULL DEFAULT 1.0,
  color_tint          TEXT,
  shape_variant       TEXT CHECK (shape_variant IN ('natural', 'rectangle', 'circle', 'diamond', 'triangle', 'hexagon', 'octagon', 'rounded-rect', 'custom-polygon')),
  custom_polygon      JSONB,
  notes               TEXT,
  power_required      BOOLEAN NOT NULL DEFAULT false,
  power_amperage      INTEGER,
  power_voltage       INTEGER,
  channel_list_row_id UUID REFERENCES public.channel_list_rows(id) ON DELETE SET NULL,
  auto_position_label TEXT,
  z_index             INTEGER NOT NULL DEFAULT 0,
  locked              BOOLEAN NOT NULL DEFAULT false,
  group_id            UUID,
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

-- 3. stage_plot_versions — named version history.
CREATE TABLE IF NOT EXISTS public.stage_plot_versions (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id        UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  stage_plot_id       UUID NOT NULL REFERENCES public.stage_plots(id) ON DELETE CASCADE,
  version_name        TEXT NOT NULL,
  version_description TEXT,
  snapshot            JSONB NOT NULL,
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

-- 4. stage_plot_custom_items — workspace icon library.
CREATE TABLE IF NOT EXISTS public.stage_plot_custom_items (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id     UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  label            TEXT NOT NULL,
  category         TEXT,
  svg_content      TEXT NOT NULL,
  source           TEXT NOT NULL CHECK (source IN ('uploaded', 'ai-generated')),
  ai_prompt        TEXT,
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

-- 5. stage_plot_share_links — public reader tokens.
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

-- 6. stage-plot-assets storage bucket + workspace-path RLS.
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
