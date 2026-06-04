/* ============================================
   LOWPASS — Stage Plot types (Stage Plot Builder §SP0)

   Mirrors migration 109 exactly (database/migrations/
   109_stage_plot_builder.sql). Fields are snake_case to match
   the Supabase row shape returned by the JS client.

   A stage plot is a rider_packs row with kind='stage_plot'
   (the discriminator was extended from ('rider','channel_list')
   to add 'stage_plot' in 109). Each such pack has exactly one
   public.stage_plots config row (1:1 via rider_pack_id) plus
   many stage_plot_items. Versions, the workspace custom-icon
   library, and public share links hang off the stage_plots id.
   ============================================ */

/** rider_packs.kind discriminator, extended in migration 109. */
export type RiderPackKind = 'rider' | 'channel_list' | 'stage_plot';

export type StagePlotUnits = 'ft' | 'm';

export type StagePlotLogoPosition = 'top-left' | 'top-right' | 'top-center';

/** Festival mode layers (§SP12). 'main' is the default act layer;
 *  'house' is shared venue infrastructure; 'annotations' is the
 *  text/callout/arrow layer (§SP17). */
export type StagePlotLayer = 'house' | 'main' | 'annotations';

export type StagePlotLabelPosition =
  | 'top'
  | 'bottom'
  | 'left'
  | 'right'
  | 'inside'
  | 'hidden';

export type StagePlotShapeVariant =
  | 'natural'
  | 'rectangle'
  | 'circle'
  | 'diamond'
  | 'triangle'
  | 'hexagon'
  | 'octagon'
  | 'rounded-rect'
  | 'custom-polygon';

export type StagePlotCustomItemSource = 'uploaded' | 'ai-generated';

/** Derived stage-position label written by §SP4 from canvas
 *  coordinates. Octant scheme for rectangular stages; polygon
 *  stages extend this (Q3, confirmed at §SP4). */
export type AutoPositionLabel =
  | 'USL' | 'USC' | 'USR'
  | 'DSL' | 'DSC' | 'DSR'
  | 'OSL' | 'OSR';

/** Row in public.stage_plots — 1:1 config per stage-plot pack. */
export interface StagePlotRow {
  id: string;
  workspace_id: string;
  /** FK to the owning rider_packs row (kind='stage_plot'). UNIQUE. */
  rider_pack_id: string;
  stage_width_ft: number;
  stage_depth_ft: number;
  /** Rectangle by default; supports additive polygon extensions. */
  stage_shape: StageShape;
  units: StagePlotUnits;
  show_grid: boolean;
  grid_size_ft: number;
  show_center_line: boolean;
  show_ds_cross: boolean;
  show_lateral_markers: boolean;
  show_rulers: boolean;
  notes: string | null;
  // Output header fields (PDF / public reader)
  show_tm_name: string | null;
  show_tm_role: string | null;
  show_tm_phone: string | null;
  show_tm_email: string | null;
  show_logo_position: StagePlotLogoPosition | null;
  show_qr_on_print: boolean;
  /** Hex override; null = fall through to tour/artist/workspace. */
  color_override: string | null;
  created_at: string;
  updated_at: string;
}

/** stage_plots.stage_shape JSONB. Rect is the v1 default; polygon
 *  carries explicit vertices for thrust / festival side-wings. */
export type StageShape =
  | { type: 'rect' }
  | { type: 'polygon'; vertices: Array<{ x: number; y: number }> };

/** Row in public.stage_plot_items — every placed icon, power drop,
 *  riser, or annotation. Positions are in feet from stage origin. */
export interface StagePlotItemRow {
  id: string;
  workspace_id: string;
  stage_plot_id: string;
  layer: StagePlotLayer;
  /** Registry icon key, or `custom_<uuid>` for a custom-item icon. */
  icon_name: string;
  label: string | null;
  label_position: StagePlotLabelPosition | null;
  label_rotation_deg: number | null;
  /** Background style + bold/italic flags. */
  label_style: Record<string, unknown> | null;
  position_x_ft: number;
  position_y_ft: number;
  width_ft: number | null;
  depth_ft: number | null;
  /** Height for risers + stacked items (the H in WxDxH). */
  height_ft: number | null;
  rotation_deg: number;
  scale: number;
  color_tint: string | null;
  shape_variant: StagePlotShapeVariant | null;
  /** Vertices when shape_variant='custom-polygon'. */
  custom_polygon: Array<{ x: number; y: number }> | null;
  notes: string | null;
  power_required: boolean;
  power_amperage: number | null;
  power_voltage: number | null;
  /** FK to channel_list_rows.id; null = unlinked (§SP4 warns). */
  channel_list_row_id: string | null;
  /** Derived from canvas coordinates (§SP4). */
  auto_position_label: AutoPositionLabel | string | null;
  z_index: number;
  locked: boolean;
  /** Shared across grouped items (§SP3). */
  group_id: string | null;
  created_at: string;
  updated_at: string;
}

/** Row in public.stage_plot_versions — named history snapshot. */
export interface StagePlotVersionRow {
  id: string;
  workspace_id: string;
  stage_plot_id: string;
  version_name: string;
  version_description: string | null;
  /** Full plot + items state captured at save time (§SP13). */
  snapshot: StagePlotSnapshot;
  created_by: string | null;
  created_at: string;
}

/** Shape persisted in stage_plot_versions.snapshot. */
export interface StagePlotSnapshot {
  plot: StagePlotRow;
  items: StagePlotItemRow[];
}

/** Row in public.stage_plot_custom_items — workspace icon library. */
export interface StagePlotCustomItemRow {
  id: string;
  workspace_id: string;
  label: string;
  category: string | null;
  /** Raw SVG paths. */
  svg_content: string;
  source: StagePlotCustomItemSource;
  /** Prompt used, when source='ai-generated' (§SP11). */
  ai_prompt: string | null;
  default_width_ft: number | null;
  default_depth_ft: number | null;
  created_by: string | null;
  created_at: string;
}

/** Row in public.stage_plot_share_links — tokenised public reader. */
export interface StagePlotShareLinkRow {
  id: string;
  workspace_id: string;
  stage_plot_id: string;
  token: string;
  view_count: number;
  last_viewed_at: string | null;
  last_viewer_ip: string | null;
  created_by: string | null;
  created_at: string;
}
