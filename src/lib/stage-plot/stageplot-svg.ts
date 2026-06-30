/* ============================================
   LOWPASS — Stage Plot SVG (server-safe geometry)

   Extracted (sprint Part 2) from the retired pdf-render.ts so the unified export
   can reuse the PROVEN reconstruct-from-data SVG without the old HTML shell. Pure:
   the icon registry + geometry are plain modules; category colours are inlined from
   CATEGORY_HEX (Chromium has no app CSS vars). StageCanvas does NOT import this, so
   it can never touch the live editor.

   Custom icons (`custom_<uuid>`) are passed in as a PER-REQUEST map (not the global
   registerCustomIcons() registry) so concurrent exports for different workspaces
   can't clobber each other.
   ============================================ */

import { CATEGORY_HEX, getCategory, getIcon } from './icons';
import { ICON_BRAND_TINT_PCT, type IconDescriptor } from './icons/types';
import { ft } from './geometry';
import type { EditorItem, EditorPlot } from './editor-types';

const esc = (s: string): string =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** Static SVG of the plot in stage-pixel space. `customIcons` resolves
 *  `custom_<uuid>` names ahead of the built-in registry (per-request, race-free). */
export function buildStagePlotSvg(plot: EditorPlot, items: EditorItem[], customIcons?: Map<string, IconDescriptor>): string {
  const stageW = ft(plot.widthFt);
  const stageH = ft(plot.depthFt);
  const mX = ft(2);
  const mTop = ft(1.6);
  const mBot = ft(2.6);
  const vb = `${-mX} ${-mTop} ${stageW + mX * 2} ${stageH + mTop + mBot}`;

  const gridDots: string[] = [];
  if (plot.showGrid) {
    for (let x = 0; x <= plot.widthFt; x += plot.gridSizeFt) {
      for (let y = 0; y <= plot.depthFt; y += plot.gridSizeFt) {
        gridDots.push(`<circle cx="${ft(x)}" cy="${ft(y)}" r="1.4" fill="#d4d4d2"/>`);
      }
    }
  }

  const itemSvg = items
    .map((it) => {
      const icon = customIcons?.get(it.iconName) ?? getIcon(it.iconName);
      if (!icon) return '';
      const wFt = it.widthFt ?? icon.footprint.width_ft;
      const dFt = it.depthFt ?? icon.footprint.depth_ft;
      const cx = ft(it.xFt);
      const cy = ft(it.yFt);
      const wpx = ft(wFt);
      const hpx = ft(dFt);
      const cat = CATEGORY_HEX[getCategory(icon.category).key];
      const fill = icon.outline
        ? 'none'
        : it.colorTint ?? `color-mix(in srgb, ${plot.brandColor} ${ICON_BRAND_TINT_PCT}%, transparent)`;
      const labelText = it.label
        ? `<text x="${cx}" y="${cy + hpx / 2 + ft(0.7)}" text-anchor="middle" font-size="${ft(0.7)}" fill="#404040">${esc(it.label)}</text>`
        : '';
      return (
        `<g transform="rotate(${it.rotationDeg ?? 0} ${cx} ${cy})">` +
        `<svg class="spi" x="${cx - wpx / 2}" y="${cy - hpx / 2}" width="${wpx}" height="${hpx}" viewBox="${icon.viewBox ?? '0 0 100 100'}" preserveAspectRatio="xMidYMid meet" style="fill:${fill};stroke:${cat};--lp-cat:${cat}">${icon.body}</svg>` +
        `</g>${labelText}`
      );
    })
    .join('');

  return (
    `<svg class="lp-plot-svg" viewBox="${vb}" xmlns="http://www.w3.org/2000/svg">` +
    `<style>` +
    `.lp-plot-svg .spi{stroke-width:1.6;stroke-linecap:round;stroke-linejoin:round}` +
    `.lp-plot-svg .spi *{vector-effect:non-scaling-stroke}` +
    `.lp-plot-svg .spi .lp-ico-detail{fill:none}` +
    `.lp-plot-svg .spi .lp-ico-label{stroke:none;fill:var(--lp-cat)}` +
    `</style>` +
    `<rect x="0" y="0" width="${stageW}" height="${stageH}" rx="4" fill="#ffffff" stroke="#111827" stroke-width="1.5"/>` +
    gridDots.join('') +
    (plot.showCenterLine ? `<line x1="${stageW / 2}" y1="0" x2="${stageW / 2}" y2="${stageH}" stroke="#9ca3af" stroke-width="1" stroke-dasharray="5 4"/>` : '') +
    `<text x="${stageW / 2}" y="-10" text-anchor="middle" font-size="${ft(0.8)}" fill="#6b7280">US</text>` +
    `<text x="${stageW / 2}" y="${stageH + ft(1)}" text-anchor="middle" font-size="${ft(0.8)}" fill="#6b7280">DS</text>` +
    `<text x="${-ft(1)}" y="${stageH / 2}" text-anchor="middle" font-size="${ft(0.8)}" fill="#6b7280">SR</text>` +
    `<text x="${stageW + ft(1)}" y="${stageH / 2}" text-anchor="middle" font-size="${ft(0.8)}" fill="#6b7280">SL</text>` +
    `<text x="${stageW / 2}" y="${stageH + ft(2)}" text-anchor="middle" font-size="${ft(0.9)}" fill="#6b7280" letter-spacing="3">AUDIENCE</text>` +
    itemSvg +
    `</svg>`
  );
}
