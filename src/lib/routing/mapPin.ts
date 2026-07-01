/* ============================================
   LOWPASS — Branded map pin (routing maps)

   ONE inline SVG teardrop shared by the in-app routing map + the budget routing
   mini-map, so both read as one brand (and match the export map's orange
   treatment in routing-pdf.ts renderRouteMap). No external CDN fetch — the pin is
   inline SVG; `var(--lp-orange)` resolves in the live DOM.

   Anchoring is DETERMINISTIC: the SVG is a fixed known size and its tip is at
   bottom-centre (PIN_W/2, PIN_H). Callers set iconSize = PIN_SIZE and
   iconAnchor = PIN_ANCHOR with NO CSS transform on the anchored element, so
   Leaflet reprojects the tip to the exact lat/lng across every zoom level (kills
   the old translate(-50%,-100%) + variable-label drift). The date label must live
   in a Leaflet Tooltip (tooltipAnchor = PIN_TOOLTIP_ANCHOR), never inside the pin.
   ============================================ */

export const PIN_W = 26;
export const PIN_H = 36;
/** Leaflet iconSize — the SVG's real px size. */
export const PIN_SIZE: [number, number] = [PIN_W, PIN_H];
/** Leaflet iconAnchor — the tip (bottom-centre). The marker's lat/lng locks here. */
export const PIN_ANCHOR: [number, number] = [PIN_W / 2, PIN_H];
/** Leaflet tooltipAnchor — the top of the pin, so a permanent date Tooltip sits
 *  above the pin and its variable width can never shift the anchored tip. */
export const PIN_TOOLTIP_ANCHOR: [number, number] = [0, -PIN_H];

/** The inline branded teardrop. `fill` defaults to the brand orange token; a
 *  caller may pass an on-brand day-type tint. The tip is exactly (PIN_W/2, PIN_H)
 *  so PIN_ANCHOR lands on the coordinate. NO transform, NO external <img>. */
export function brandedPinSvg(fill: string = 'var(--lp-orange,#FF4500)'): string {
  return (
    `<svg width="${PIN_W}" height="${PIN_H}" viewBox="0 0 ${PIN_W} ${PIN_H}" xmlns="http://www.w3.org/2000/svg" style="display:block">` +
    // Teardrop: circle (centre 13,13 r12) tapering to the tip at (13,36).
    `<path d="M13 36 C13 36 25 21 25 13 A12 12 0 1 0 1 13 C1 21 13 36 13 36 Z" fill="${fill}" stroke="#ffffff" stroke-width="1.5"/>` +
    `<circle cx="13" cy="13" r="4.5" fill="#ffffff"/>` +
    `</svg>`
  );
}
