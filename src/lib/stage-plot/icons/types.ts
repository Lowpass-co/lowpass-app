/* ============================================
   LOWPASS — Stage Plot icon system types (§SP1a·1)

   The spine for ~140 hand-authored top-down SVG icons. Every
   icon is authored ONCE as normalized closed-path SVG with no
   colour attributes; the <StagePlotIcon> primitive renders it
   two ways from the same source via CSS:

   - LIBRARY mode: monochrome outline (currentColor =
     --lp-text-secondary), fill:none, 1.5px non-scaling stroke.
     Category is conveyed by the badge chip, not the glyph.
   - CANVAS mode: closed shapes filled with the brand tint,
     stroked in the category hue (--lp-plot-cat-*), drawn to the
     descriptor's real-world footprint.

   See icons/categories.ts for the 12 categories + badges and
   src/components/stage-plot/StagePlotIcon.tsx for the renderer.
   ============================================ */

/** The 12 v1 icon categories (PARKED doc icon catalog). */
export type IconCategoryKey =
  | 'musicians'
  | 'mics'
  | 'drums'
  | 'strings'
  | 'keys'
  | 'amps'
  | 'monitors'
  | 'signal'
  | 'infrastructure'
  | 'lighting'
  | 'stands'
  | 'utility';

export interface IconCategory {
  key: IconCategoryKey;
  /** Palette section heading. */
  label: string;
  /** 2–3 char colour-blind-safe badge — the PRIMARY category
   *  signal (colour is reinforcement only). */
  badge: string;
  /** CSS var carrying the category stroke hue, light + .dark. */
  colorVar: string;
}

/** How a <StagePlotIcon> is being rendered. */
export type IconRenderMode = 'library' | 'canvas';

/** A single placeable icon. Authored in a normalized viewBox
 *  with NO fill/stroke attributes so CSS can drive both modes. */
export interface IconDescriptor {
  /** Stable registry key, e.g. 'drum-kick', 'amp-marshall-stack'.
   *  Stored verbatim in stage_plot_items.icon_name. */
  name: string;
  category: IconCategoryKey;
  /** Human label (shown when the palette "show labels" toggle is on). */
  label: string;
  /** Real-world default footprint in feet. Canvas size =
   *  width_ft * pxPerFoot, so a Marshall stack out-sizes a Kemper. */
  footprint: { width_ft: number; depth_ft: number };
  /** SVG viewBox; defaults to '0 0 100 100'. */
  viewBox?: string;
  /** SVG inner markup. Closed footprint shapes carry NO fill/stroke
   *  (CSS supplies them). Stroke-only detail (knobs, lines) goes in
   *  a `<g class="lp-ico-detail">` so it is never flood-filled. */
  body: string;
  /** Drum composites ship a left-handed twin (locked decision). */
  leftHanded?: boolean;
  /** Splittable cluster (§SP9) — composite kit / rig. */
  composite?: boolean;
  /** Extra ⌘K / palette search terms beyond name + label. */
  keywords?: string[];
}

/** Authoring viewBox shared by all hand-authored footprint icons. */
export const ICON_VIEWBOX = '0 0 100 100';

/** Stroke widths (px; non-scaling so they hold at any canvas zoom). */
export const ICON_STROKE_LIBRARY = 1.5;
export const ICON_STROKE_CANVAS = 1.75;

/** Brand-tint fill strength on canvas (locked 10–15% range). */
export const ICON_BRAND_TINT_PCT = 12;
