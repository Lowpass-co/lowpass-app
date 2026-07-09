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
  /** §SP-FIX-7 — structured title-bar metadata (renders on output). */
  subtitle?: string;
  tmName?: string;
  tmRole?: string;
  tmPhone?: string;
  tmEmail?: string;
  versionLabel?: string;
  logoPosition?: 'top-left' | 'top-right' | 'top-center';
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
  /** Height in feet — third dimension for risers/stacked gear + the
   *  expert W×D×H override (§SP-FIX-2). */
  heightFt?: number;
  /** @deprecated §SP-FIX-2 removed per-item scaling; items lock to
   *  footprint. Kept for back-compat with stored rows; not rendered. */
  scale?: number;
  rotationDeg?: number;
  colorTint?: string | null;
  locked?: boolean;
  label?: string;
  layer?: StagePlotLayer;
  /** Linked channel-list rows (§SP4). One instrument can take many
   *  channels (e.g. a kick has in + out, a kit has many mics). */
  channelRowIds?: string[];
  /** Grouping id (§SP-FIX-3 kit split → shared id across the pieces). */
  groupId?: string;
  /** For a split-out drum-kit piece: the composite icon to recombine to. */
  kitName?: string;
  /** Label placement around the item (§SP-FIX-4). Default 'bottom'. */
  labelPosition?: 'top' | 'bottom' | 'left' | 'right' | 'inside' | 'hidden';
  /** Label font size in px (§SP-FIX-4), 8–18, default 11. */
  labelFontPx?: number;
  /** §SP-FIX-5 — keep this item axis-aligned even when the riser it
   *  sits on is rotated (opt out of riser-attached rotation). */
  decoupleRotation?: boolean;
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

/** §SP-FIX-7 — one-time helper: pull TM contact details out of free
 *  text annotations (the old hand-built title bar) into structured
 *  fields. Pure (kept here so client code doesn't import server.ts). */
export function extractTitleBarFromItems(items: EditorItem[]): Partial<EditorPlot> {
  const texts = items.filter((i) => i.kind === 'text' && i.text).map((i) => i.text!.trim());
  const patch: Partial<EditorPlot> = {};
  for (const t of texts) {
    const email = t.match(/[\w.+-]+@[\w-]+\.[\w.-]+/);
    if (email && !patch.tmEmail) patch.tmEmail = email[0];
    const phone = t.match(/\+?[\d][\d\s().-]{7,}\d/);
    if (phone && !patch.tmPhone) patch.tmPhone = phone[0].trim();
    if (/\b(TM|tour manager|FOH|PM|production manager)\b/i.test(t) && !patch.tmRole) {
      patch.tmRole = t.length <= 24 ? t : t.match(/\b(TM\/FoH|TM|FOH|PM|Tour Manager|Production Manager)\b/i)?.[0];
    }
  }
  return patch;
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
  // VIS-SP-02 — default brand is NEUTRAL (was #FF4500 orange). Orange on the
  // canvas is reserved for selection; brand only tints the faint fill wash /
  // riser, so a neutral default keeps the canvas hue-free until a user opts in.
  brandColor: '#6B7280',
  units: 'ft',
};
