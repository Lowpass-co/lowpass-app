/* ============================================
   LOWPASS — Stage Plot canvas geometry (§SP2a)

   The canvas works in a fixed "stage-pixel" space: 1 foot =
   BASE_PX_PER_FOOT px. Content (stage, grid, items) is laid out
   in that space with the stage's top-left at (0,0); x increases
   toward the page-right, y increases downstage (toward the
   audience at the bottom). Pan/zoom is a single <g> transform
   applied on top, so item coordinates never change with zoom.

   Stage-left / stage-right are from the performer's POV (facing
   the audience): SR is page-left, SL is page-right.
   ============================================ */

/** Stage-pixel scale: 1 ft → this many px at zoom 1. */
export const BASE_PX_PER_FOOT = 22;

export interface ViewTransform {
  /** Multiplier on BASE_PX_PER_FOOT. */
  zoom: number;
  /** Pan offset in screen px. */
  panX: number;
  panY: number;
}

export const DEFAULT_VIEW: ViewTransform = { zoom: 1, panX: 0, panY: 0 };

export const ZOOM_MIN = 0.25;
export const ZOOM_MAX = 4;

export const ft = (feet: number): number => feet * BASE_PX_PER_FOOT;

/** Center the stage in the viewport at a zoom that leaves a margin. */
export function fitView(
  viewportW: number,
  viewportH: number,
  stageWidthFt: number,
  stageDepthFt: number,
  marginPx = 96,
): ViewTransform {
  const stageW = ft(stageWidthFt);
  const stageH = ft(stageDepthFt);
  const zoom = clampZoom(
    Math.min((viewportW - marginPx * 2) / stageW, (viewportH - marginPx * 2) / stageH),
  );
  return {
    zoom,
    panX: (viewportW - stageW * zoom) / 2,
    panY: (viewportH - stageH * zoom) / 2,
  };
}

export const clampZoom = (z: number): number => Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, z));

/** Screen px → stage-pixel-space point, given the current transform. */
export function screenToStage(sx: number, sy: number, v: ViewTransform): { x: number; y: number } {
  return { x: (sx - v.panX) / v.zoom, y: (sy - v.panY) / v.zoom };
}

/** Zoom toward a screen anchor (e.g. the cursor) keeping it fixed. */
export function zoomAt(v: ViewTransform, factor: number, sx: number, sy: number): ViewTransform {
  const zoom = clampZoom(v.zoom * factor);
  const k = zoom / v.zoom;
  return { zoom, panX: sx - (sx - v.panX) * k, panY: sy - (sy - v.panY) * k };
}

/** Snap a stage-space coordinate (px) to the grid. */
export function snapToGrid(coordPx: number, gridSizeFt: number): number {
  const step = ft(gridSizeFt);
  return Math.round(coordPx / step) * step;
}

/** Derive the octant position label (USL/USC/USR/DSL/DSC/DSR/OSL/OSR)
 *  for a point on a rectangular stage. Off-stage points get OS*. */
export function octantLabel(
  xFt: number,
  yFt: number,
  stageWidthFt: number,
  stageDepthFt: number,
): string {
  const offStage = xFt < 0 || xFt > stageWidthFt || yFt < 0 || yFt > stageDepthFt;
  // page-left third = stage-right (SR); page-right third = stage-left (SL)
  const col = xFt < stageWidthFt / 3 ? 'R' : xFt > (stageWidthFt * 2) / 3 ? 'L' : 'C';
  if (offStage) return `OS${col === 'C' ? '' : col}`;
  const row = yFt < stageDepthFt / 2 ? 'US' : 'DS';
  return `${row}${col}`;
}
