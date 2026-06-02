/* ============================================
   LOWPASS — Stage Plot editor state (§SP2b/§SP3)

   Local editor shapes (simpler than the DB rows in
   src/lib/types/stage-plot.ts). The editor maps these to/from
   stage_plots + stage_plot_items when persisting via the API.
   ============================================ */

export type StagePlotLayer = 'house' | 'main' | 'annotations';

/** Icon placement, free text box, or an arrow annotation. */
export type ItemKind = 'icon' | 'text' | 'arrow';

/** A channel-list row available to link an item to (§SP4). Sourced
 *  from the paired channel_list pack: channel_list_rows + sub_snakes. */
export interface Channel {
  /** channel_list_rows.id */
  id: string;
  /** Channel number (row order, 1-based) for the overlay. */
  number: number;
  /** channel_name (e.g. "Kick", "Lead Vox"). */
  label: string;
  /** sub_snakes.colour (hex) or null if unrouted. */
  color: string | null;
  /** Short sub-snake label (the colour-blind badge), e.g. "A". */
  snakeLabel: string | null;
}

export interface EditorPlot {
  name: string;
  widthFt: number;
  depthFt: number;
  gridSizeFt: number;
  showGrid: boolean;
  showRulers: boolean;
  showCenterLine: boolean;
  showDsCross: boolean;
  showLateralMarkers: boolean;
  /** Overlay channel numbers/labels on linked items (§SP4, default off). */
  showChannels: boolean;
  snap: boolean;
  brandColor: string;
  units: 'ft' | 'm';
}

export interface EditorItem {
  id: string;
  /** 'icon' (default), 'text', or 'arrow'. */
  kind?: ItemKind;
  /** Icon registry key (kind='icon'). */
  iconName: string;
  /** Centre, in feet from the stage's upstage-left origin. */
  xFt: number;
  yFt: number;
  widthFt?: number;
  depthFt?: number;
  /** Uniform size multiplier on the footprint (drag-to-resize / scale field). */
  scale?: number;
  rotationDeg?: number;
  colorTint?: string | null;
  locked?: boolean;
  label?: string;
  layer?: StagePlotLayer;
  /** Linked channel-list row (§SP4). */
  channelRowId?: string | null;
  /** Text content (kind='text'). */
  text?: string;
  /** Text size in feet (kind='text'). */
  fontSizeFt?: number;
  /** Arrow second endpoint, feet (kind='arrow'); xFt/yFt is the first. */
  x2Ft?: number;
  y2Ft?: number;
  /** Arrow line thickness in px (kind='arrow'). */
  weight?: number;
}

export const DEFAULT_PLOT: EditorPlot = {
  name: 'Untitled stage plot',
  widthFt: 24,
  depthFt: 16,
  gridSizeFt: 1,
  showGrid: true,
  showRulers: true,
  showCenterLine: false,
  showDsCross: false,
  showLateralMarkers: false,
  showChannels: false,
  snap: true,
  brandColor: '#FF4500',
  units: 'ft',
};
