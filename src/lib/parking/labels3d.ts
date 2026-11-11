/* ============================================
   LOWPASS — Parking 3D: which labels show (Nov 2026, Adam)

   Every vehicle, marker, area and measurement has a label in 3D, and they
   are drawn on top of everything (readable through roofs). Five trucks side
   by side put five labels on the same spot — an unreadable stack that hid
   the vehicles under it.

   So, each frame, the labels are laid out like a map's place names: nearest
   to the camera first, and any label whose box would touch one already
   placed is hidden. Zoom in and the hidden ones come back as the vehicles
   spread apart on screen. Pure (screen boxes in, ids out) so it's tested
   without WebGL.
   ============================================ */

export interface LabelBox {
  id: string;
  /** Screen box, CSS pixels, y down. */
  x0: number;
  y0: number;
  x1: number;
  y1: number;
  /** Distance from the camera (metres) — nearer wins. */
  depth: number;
}

/** Clear space kept round each shown label. */
export const LABEL_GAP_PX = 3;

/** The ids of the labels to show: nearest first, none touching. */
export function placeLabels(boxes: LabelBox[], gap = LABEL_GAP_PX): Set<string> {
  const order = [...boxes].sort((a, b) => a.depth - b.depth || (a.id < b.id ? -1 : 1));
  const placed: LabelBox[] = [];
  for (const b of order) {
    const hit = placed.some((p) => b.x0 < p.x1 + gap && b.x1 + gap > p.x0 && b.y0 < p.y1 + gap && b.y1 + gap > p.y0);
    if (!hit) placed.push(b);
  }
  return new Set(placed.map((p) => p.id));
}

/** A label's box on screen: anchored bottom-centre at (x, y) + offset (y down). */
export function labelBox(
  id: string,
  at: { x: number; y: number },
  size: { w: number; h: number },
  offsetY: number,
  depth: number,
): LabelBox {
  const bottom = at.y + offsetY;
  return { id, x0: at.x - size.w / 2, x1: at.x + size.w / 2, y0: bottom - size.h, y1: bottom, depth };
}
