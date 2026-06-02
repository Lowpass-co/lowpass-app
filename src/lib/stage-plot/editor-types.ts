/* ============================================
   LOWPASS — Stage Plot editor state (§SP2b/§SP3)

   Local editor shapes (simpler than the DB rows in
   src/lib/types/stage-plot.ts). The editor maps these to/from
   stage_plots + stage_plot_items when persisting via the API.
   ============================================ */

export type StagePlotLayer = 'house' | 'main' | 'annotations';

export interface EditorPlot {
  name: string;
  widthFt: number;
  depthFt: number;
  gridSizeFt: number;
  showGrid: boolean;
  showRulers: boolean;
  snap: boolean;
  brandColor: string;
  units: 'ft' | 'm';
}

export interface EditorItem {
  id: string;
  iconName: string;
  /** Centre, in feet from the stage's upstage-left origin. */
  xFt: number;
  yFt: number;
  widthFt?: number;
  depthFt?: number;
  rotationDeg?: number;
  colorTint?: string | null;
  locked?: boolean;
  label?: string;
  layer?: StagePlotLayer;
  /** Linked channel-list row (§SP4). */
  channelRowId?: string | null;
}

export const DEFAULT_PLOT: EditorPlot = {
  name: 'Untitled stage plot',
  widthFt: 24,
  depthFt: 16,
  gridSizeFt: 1,
  showGrid: true,
  showRulers: true,
  snap: true,
  brandColor: '#FF4500',
  units: 'ft',
};
