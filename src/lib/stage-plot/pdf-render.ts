/* ============================================
   LOWPASS — Stage Plot PDF / static render (§SP7, reused by §SP8)

   Builds a self-contained SVG of a plot (stage + grid + markers +
   items from the icon registry) and a full print HTML document
   with the Saint-Motel-style header (STAGE PLOT title +
   last-updated + TM block) and a version/timestamp footer.
   Server-safe: the icon registry + geometry are plain modules and
   category colours are inlined from CATEGORY_HEX (the app's CSS
   custom properties aren't available to Puppeteer).
   ============================================ */

import { CATEGORY_HEX, getCategory, getIcon } from './icons';
import { ICON_BRAND_TINT_PCT } from './icons/types';
import { ft } from './geometry';
import type { EditorItem, EditorPlot } from './editor-types';

export interface StagePlotPdfMeta {
  title?: string;
  updatedLabel?: string;
  tmName?: string;
  tmRole?: string;
  tmPhone?: string;
  tmEmail?: string;
  version?: string;
  timestamp?: string;
}

export interface StagePlotRenderOpts {
  /** Black & white (grayscale) variant. */
  bw?: boolean;
  paper?: 'A4' | 'Letter';
  orientation?: 'landscape' | 'portrait';
}

const esc = (s: string): string =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** Static SVG of the plot in stage-pixel space. */
export function buildStagePlotSvg(plot: EditorPlot, items: EditorItem[]): string {
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
      const icon = getIcon(it.iconName);
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
    `<svg class="lp-plot-svg" viewBox="${vb}" xmlns="http://www.w3.org/2000/svg" style="${plot.showGrid ? '' : ''}">` +
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

export function buildStagePlotPdfHtml(
  plot: EditorPlot,
  items: EditorItem[],
  meta: StagePlotPdfMeta = {},
  opts: StagePlotRenderOpts = {},
): string {
  const svg = buildStagePlotSvg(plot, items);
  const tm = [meta.tmName, meta.tmRole, meta.tmPhone, meta.tmEmail].filter(Boolean) as string[];
  return `<!doctype html><html><head><meta charset="utf-8"><style>
    @page { size: ${opts.paper ?? 'A4'} ${opts.orientation ?? 'landscape'}; margin: 14mm; }
    * { box-sizing: border-box; }
    body { margin: 0; font-family: -apple-system, system-ui, sans-serif; color: #111827; ${opts.bw ? 'filter: grayscale(1);' : ''} }
    .hd { display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 2px solid #111827; padding-bottom: 8px; margin-bottom: 10px; }
    .hd h1 { font-size: 20px; margin: 0 0 2px; letter-spacing: 1px; }
    .hd .upd { font-size: 11px; color: #6b7280; }
    .hd .tm { font-size: 11px; line-height: 1.4; text-align: right; color: #374151; }
    .hd .tm .nm { font-weight: 600; color: #111827; }
    .plot { width: 100%; }
    .plot svg { width: 100%; height: auto; max-height: 165mm; }
    .ft { margin-top: 8px; border-top: 1px solid #e5e7eb; padding-top: 6px; font-size: 9px; color: #9ca3af; display: flex; justify-content: space-between; }
  </style></head><body>
    <div class="hd">
      <div>
        <h1>${esc(meta.title || plot.name || 'STAGE PLOT')}</h1>
        ${meta.updatedLabel ? `<div class="upd">Updated ${esc(meta.updatedLabel)}</div>` : ''}
      </div>
      ${tm.length ? `<div class="tm">${tm.map((t, i) => `<div class="${i === 0 ? 'nm' : ''}">${esc(t)}</div>`).join('')}</div>` : ''}
    </div>
    <div class="plot">${svg}</div>
    <div class="ft"><span>${esc(meta.version || '')}</span><span>${esc(meta.timestamp || '')}</span></div>
  </body></html>`;
}
