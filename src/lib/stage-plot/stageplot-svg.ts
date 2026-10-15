/* ============================================
   LOWPASS — Stage Plot SVG (server-safe, print)

   A static SVG of the plot, drawn the way <StageCanvas> draws it (Oct 2026
   rebuild — the old export dropped text notes and arrows, printed risers as a
   crossed box, people as head icons, ignored label position / hidden / size,
   and never showed channels, rulers or the downstage cross).

   Mirrors StageCanvas element for element, minus the editing chrome
   (selection, handles, the dashed box around text notes):
     stage · fine + bold grid · rulers · centre line · DS cross · lateral
     markers · cardinals · AUDIENCE · icons · risers (faint fill + W×D×H) ·
     people (position dot) · text notes · arrows · channel chips · name pills.

   Colours are literal hex per theme (a standalone Chromium doc and the public
   show link both lack the app's CSS vars / theme). Every colour that comes from
   the database (item tint, brand colour, stage-box colour) passes safeColour()
   so a stored value can never break out of a style attribute.

   Used by the export (stageplot-pdf.ts) AND the public show link — the
   options default to "draw the plot as saved", so the show link needs none.
   StageCanvas does NOT import this, so it can never touch the live editor.

   Custom icons (`custom_<uuid>`) come in as a PER-REQUEST map (not the global
   registerCustomIcons() registry) so concurrent exports can't clobber each other.
   ============================================ */

import { getIcon, getCategory } from './icons';
import { ICON_BRAND_TINT_PCT, type IconDescriptor } from './icons/types';
import { ft } from './geometry';
import { labelPx, type EditorItem, type EditorPlot } from './editor-types';

const esc = (s: string): string =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** A hex colour from the database, or null. (Same rule as the channel-list
 *  export's safeColour — kept local so this module has no export-layer import.) */
function hex(c: string | null | undefined): string | null {
  const v = (c ?? '').trim();
  return /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{4}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/.test(v) ? v : null;
}

/** One channel an item can be linked to (channel_list_rows.id → what to print). */
export interface PlotChannelRef {
  /** The channel number as the input list prints it. */
  number: number;
  name: string;
  /** Stage-box colour (hex) — the same colour the channel list export uses. */
  colour: string | null;
}

export interface PlotSvgOptions {
  theme?: 'light' | 'dark';
  /** channel_list_rows.id → channel. Needed for chips. */
  channels?: Map<string, PlotChannelRef>;
  /** Channel-number chips on linked items. Default off (needs `channels`). */
  showChips?: boolean;
  /** Overrides of the plot's own settings; undefined = as the plot is saved. */
  showGrid?: boolean;
  showRulers?: boolean;
  /** Item name pills. Default on (each item's own "hidden" still applies). */
  showLabels?: boolean;
}

/* StageCanvas's token roles, resolved to hex per theme. Light leans one step
   darker than the screen (paper and print need more contrast than a monitor). */
const PALETTE = {
  light: {
    stageFill: '#F9FAFB', stageStroke: '#9CA3AF', gridBold: '#CFCFCC', gridFine: '#E5E7EB',
    ruler: '#D1D5DB', rulerText: '#9CA3AF', text: '#111827', text2: '#6B7280', text3: '#9CA3AF',
    surface: '#FFFFFF', chipBorder: '#D4D4D2', bg: '#FFFFFF', centre: '#C4C4C2',
  },
  dark: {
    stageFill: '#1A1A1A', stageStroke: '#5A5A5A', gridBold: '#3B3B3B', gridFine: '#262626',
    ruler: '#3A3A3A', rulerText: '#8A8A8A', text: '#F5F5F5', text2: '#B3B3B3', text3: '#8A8A8A',
    surface: '#232323', chipBorder: '#3B3B3B', bg: '#0F0F0F', centre: '#4A4A4A',
  },
} as const;
type Palette = (typeof PALETTE)['light' | 'dark'];

/** "1–3", "4,7", or "×6" when the list would be too long for a chip. */
export function chipText(numbers: number[]): string {
  const ns = [...new Set(numbers)].sort((a, b) => a - b);
  if (ns.length === 0) return '';
  const runs: string[] = [];
  for (let i = 0; i < ns.length; ) {
    let j = i;
    while (j + 1 < ns.length && ns[j + 1] === ns[j] + 1) j++;
    runs.push(j > i ? `${ns[i]}–${ns[j]}` : String(ns[i]));
    i = j + 1;
  }
  const s = runs.join(',');
  return s.length <= 7 ? s : `×${ns.length}`;
}

/** The linked channels of one item, in channel order (unknown ids skipped —
 *  a link can outlive its row). */
export function linkedChannels(it: EditorItem, channels: Map<string, PlotChannelRef> | undefined): PlotChannelRef[] {
  if (!channels) return [];
  return (it.channelRowIds ?? [])
    .map((id) => channels.get(id))
    .filter((c): c is PlotChannelRef => Boolean(c))
    .sort((a, b) => a.number - b.number);
}

/** StageCanvas ItemLabel: a pill (8% text tint) + text, UNROTATED, placed
 *  around the item. */
function labelBox(cx: number, cy: number, halfW: number, halfH: number, text: string, px: number, position: string) {
  const gap = 4;
  const pw = text.length * px * 0.58 + px * 0.9;
  const ph = px * 1.5;
  let lx = cx;
  let ly = cy;
  if (position === 'bottom') ly = cy + halfH + gap + ph / 2;
  else if (position === 'top') ly = cy - halfH - gap - ph / 2;
  else if (position === 'left') lx = cx - halfW - gap - pw / 2;
  else if (position === 'right') lx = cx + halfW + gap + pw / 2;
  return { lx, ly, pw, ph };
}

function labelPill(p: Palette, cx: number, cy: number, halfW: number, halfH: number, text: string, px: number, position: string, heavy: boolean): string {
  const { lx, ly, pw, ph } = labelBox(cx, cy, halfW, halfH, text, px, position);
  return (
    `<rect x="${lx - pw / 2}" y="${ly - ph / 2}" width="${pw}" height="${ph}" rx="${ph / 2}" fill="${p.text}" fill-opacity="0.08"/>` +
    `<text x="${lx}" y="${ly}" font-size="${px}" fill="${p.text}" text-anchor="middle" dominant-baseline="central" font-weight="${heavy ? 600 : 500}">${esc(text)}</text>`
  );
}

/** Rotate (x, y) about (cx, cy) by deg. */
function rot(x: number, y: number, cx: number, cy: number, deg: number): [number, number] {
  const r = (deg * Math.PI) / 180;
  const dx = x - cx;
  const dy = y - cy;
  return [cx + dx * Math.cos(r) - dy * Math.sin(r), cy + dx * Math.sin(r) + dy * Math.cos(r)];
}

/** Channel chip: neutral pill + a colour stripe tick (stage box) + number(s).
 *  Drawn upright at the item's (rotated) top-right corner so it stays readable. */
const chipWidth = (label: string) => Math.max(20, label.length * 5.2 + 11);

function chip(p: Palette, x: number, y: number, linked: PlotChannelRef[]): string {
  const label = chipText(linked.map((c) => c.number));
  const w = chipWidth(label);
  const stripe = hex(linked[0]?.colour) ?? p.text3;
  return (
    `<g class="lp-sp-chip">` +
    `<rect x="${x - 8}" y="${y - 7}" width="${w}" height="12" rx="3" fill="${p.surface}" stroke="${p.chipBorder}" stroke-width="0.75"/>` +
    `<rect x="${x - 8}" y="${y - 7}" width="3" height="12" rx="1.5" fill="${stripe}"/>` +
    `<text x="${x - 8 + 3 + (w - 3) / 2}" y="${y - 1}" font-size="8" fill="${p.text}" text-anchor="middle" dominant-baseline="central" font-weight="700">${esc(label)}</text>` +
    `</g>`
  );
}

function arrow(p: Palette, it: EditorItem): string {
  const x1 = ft(it.xFt);
  const y1 = ft(it.yFt);
  const x2 = ft(it.x2Ft ?? it.xFt + 3);
  const y2 = ft(it.y2Ft ?? it.yFt);
  const stroke = hex(it.colorTint) ?? p.text2;
  const w = it.weight ?? 2;
  // Arrowhead as a polygon (an SVG <marker> can't take the line's colour in
  // Chromium without context-stroke, and needs a document-unique id).
  const a = Math.atan2(y2 - y1, x2 - x1);
  const L = 6 + w * 2.2;
  const H = 3 + w * 1.2;
  const bx = x2 - L * Math.cos(a);
  const by = y2 - L * Math.sin(a);
  const head = [
    [x2, y2],
    [bx + H * Math.sin(a), by - H * Math.cos(a)],
    [bx - H * Math.sin(a), by + H * Math.cos(a)],
  ].map(([x, y]) => `${x.toFixed(2)},${y.toFixed(2)}`).join(' ');
  return (
    `<line x1="${x1}" y1="${y1}" x2="${bx.toFixed(2)}" y2="${by.toFixed(2)}" stroke="${stroke}" stroke-width="${w}" stroke-linecap="round"/>` +
    `<polygon points="${head}" fill="${stroke}"/>`
  );
}

function textNote(p: Palette, it: EditorItem): string {
  const fs = ft(it.fontSizeFt ?? 0.7);
  const fill = hex(it.colorTint) ?? p.text;
  return `<text x="${ft(it.xFt)}" y="${ft(it.yFt)}" font-size="${fs}" fill="${fill}" text-anchor="middle" dominant-baseline="central" font-weight="600">${esc(it.text || '')}</text>`;
}

/** Static SVG of the plot in stage-pixel space. */
export function buildStagePlotSvg(
  plot: EditorPlot,
  items: EditorItem[],
  customIcons?: Map<string, IconDescriptor>,
  opts: PlotSvgOptions = {},
): string {
  const p = PALETTE[opts.theme === 'dark' ? 'dark' : 'light'];
  const showGrid = opts.showGrid ?? plot.showGrid;
  const showRulers = opts.showRulers ?? plot.showRulers;
  const showLabels = opts.showLabels ?? true;
  const showChips = Boolean(opts.showChips && opts.channels && opts.channels.size > 0);
  const brand = hex(plot.brandColor) ?? '#6B7280';

  const stageW = ft(plot.widthFt);
  const stageH = ft(plot.depthFt);
  const gridFt = plot.gridSizeFt > 0 ? plot.gridSizeFt : 1;
  const g = ft(gridFt);
  // Room for SR/SL, US + rulers above, DS + AUDIENCE below (StageCanvas offsets).
  const mL = 34;
  const mR = 34;
  const mTop = 30;
  const mBot = 52;
  // Oct 2026 — the drawing area GROWS to whatever is placed. It used to be the
  // stage + these margins only, so anything off stage left / right (a drum
  // riser in the wings, side-fills, a monitor world) was cut off the export.
  const bounds = { x0: -mL, y0: -mTop, x1: stageW + mR, y1: stageH + mBot };
  const PAD = 10;
  const grow = (x0: number, y0: number, x1: number, y1: number) => {
    if (![x0, y0, x1, y1].every(Number.isFinite)) return;
    bounds.x0 = Math.min(bounds.x0, x0 - PAD);
    bounds.y0 = Math.min(bounds.y0, y0 - PAD);
    bounds.x1 = Math.max(bounds.x1, x1 + PAD);
    bounds.y1 = Math.max(bounds.y1, y1 + PAD);
  };

  const out: string[] = [];
  out.push(`<rect x="0" y="0" width="${stageW}" height="${stageH}" rx="4" fill="${p.stageFill}" stroke="${p.stageStroke}" stroke-width="1.5"/>`);

  if (showGrid) {
    // Explicit dots (not <pattern>, which needs a document-unique id and can
    // seam in PDF output). Fine = every half grid step, bold = every step.
    const fine: string[] = [];
    const bold: string[] = [];
    for (let x = 0; x <= stageW + 0.01; x += g / 2) {
      for (let y = 0; y <= stageH + 0.01; y += g / 2) {
        const onStep = Math.abs((x / g) - Math.round(x / g)) < 1e-6 && Math.abs((y / g) - Math.round(y / g)) < 1e-6;
        (onStep ? bold : fine).push(`M${x.toFixed(1)} ${y.toFixed(1)}h0`);
      }
    }
    out.push(`<path d="${fine.join('')}" stroke="${p.gridFine}" stroke-width="1.2" stroke-linecap="round"/>`);
    out.push(`<path d="${bold.join('')}" stroke="${p.gridBold}" stroke-width="2.8" stroke-linecap="round"/>`);
  }

  if (showRulers) {
    const labelEvery = Math.max(1, Math.round(4 / gridFt));
    const ticks: string[] = [];
    const labels: string[] = [];
    for (let i = 0; i <= Math.floor(plot.widthFt / gridFt); i++) {
      ticks.push(`M${i * g} -6V0`);
      if (i % labelEvery === 0) labels.push(`<text x="${i * g}" y="-9" text-anchor="middle">${+(i * gridFt).toFixed(2)}</text>`);
    }
    for (let i = 0; i <= Math.floor(plot.depthFt / gridFt); i++) {
      ticks.push(`M-6 ${i * g}H0`);
      if (i % labelEvery === 0) labels.push(`<text x="-9" y="${i * g + 3}" text-anchor="end">${+(i * gridFt).toFixed(2)}</text>`);
    }
    out.push(`<path d="${ticks.join('')}" stroke="${p.ruler}" stroke-width="1"/>`);
    out.push(`<g font-size="8" fill="${p.rulerText}">${labels.join('')}</g>`);
  }

  if (plot.showCenterLine) {
    out.push(`<line x1="${stageW / 2}" y1="0" x2="${stageW / 2}" y2="${stageH}" stroke="${p.centre}" stroke-width="1" stroke-dasharray="5 4"/>`);
  }
  if (plot.showDsCross) {
    out.push(
      `<g stroke="${p.text3}" stroke-width="1.25"><line x1="${stageW / 2 - ft(0.6)}" y1="${stageH}" x2="${stageW / 2 + ft(0.6)}" y2="${stageH}"/>` +
        `<line x1="${stageW / 2}" y1="${stageH - ft(0.6)}" x2="${stageW / 2}" y2="${stageH + ft(0.6)}"/></g>`,
    );
  }
  if (plot.showLateralMarkers) {
    const marks: string[] = [];
    for (let i = 1; i <= Math.floor(plot.widthFt / 4); i++) {
      const dd = i * 2;
      for (const x of [stageW / 2 - ft(dd), stageW / 2 + ft(dd)]) {
        marks.push(`<line x1="${x}" y1="${stageH}" x2="${x}" y2="${stageH + 5}" stroke="${p.ruler}" stroke-width="1"/><text x="${x}" y="${stageH + 12}" text-anchor="middle" font-size="8" fill="${p.rulerText}">${dd}</text>`);
      }
    }
    out.push(marks.join(''));
  }

  out.push(
    `<g font-size="10" fill="${p.text3}" text-anchor="middle">` +
      `<text x="${stageW / 2}" y="-18">US</text><text x="${stageW / 2}" y="${stageH + 22}">DS</text>` +
      `<text x="-22" y="${stageH / 2}">SR</text><text x="${stageW + 22}" y="${stageH / 2}">SL</text></g>` +
      `<text x="${stageW / 2}" y="${stageH + 40}" text-anchor="middle" font-size="11" fill="${p.text2}" letter-spacing="2.75">AUDIENCE</text>`,
  );

  // Items, in saved z-order (StageCanvas renders the array in order too).
  // Labels and chips go in a second pass so no later item paints over them.
  const overlay: string[] = [];
  for (const it of items) {
    if (it.kind === 'arrow') {
      out.push(arrow(p, it));
      const x1 = ft(it.xFt), y1 = ft(it.yFt), x2 = ft(it.x2Ft ?? it.xFt + 3), y2 = ft(it.y2Ft ?? it.yFt);
      const h = 3 + (it.weight ?? 2) * 1.2;
      grow(Math.min(x1, x2) - h, Math.min(y1, y2) - h, Math.max(x1, x2) + h, Math.max(y1, y2) + h);
      continue;
    }
    if (it.kind === 'text') {
      if (it.text) {
        out.push(textNote(p, it));
        const fs = ft(it.fontSizeFt ?? 0.7);
        const hw = (it.text.length * fs * 0.62) / 2;
        grow(ft(it.xFt) - hw, ft(it.yFt) - fs * 0.7, ft(it.xFt) + hw, ft(it.yFt) + fs * 0.7);
      }
      continue;
    }
    const icon = customIcons?.get(it.iconName) ?? getIcon(it.iconName);
    if (!icon) continue;
    const wFt = it.widthFt ?? icon.footprint.width_ft;
    const dFt = it.depthFt ?? icon.footprint.depth_ft;
    const wpx = ft(wFt);
    const hpx = ft(dFt);
    const cx = ft(it.xFt);
    const cy = ft(it.yFt);
    const deg = it.rotationDeg ?? 0;
    const isPerson = getCategory(icon.category).key === 'musicians';
    const isRiser = it.iconName.startsWith('infra-riser-');
    const tint = hex(it.colorTint);
    const stroke = tint ?? p.text2;
    // A tint colours the lines only (as the editor) — never a solid fill.
    const fill = icon.outline ? 'none' : `color-mix(in srgb, ${brand} ${ICON_BRAND_TINT_PCT}%, transparent)`;

    let body: string;
    if (isPerson) {
      body = `<circle cx="${cx}" cy="${cy}" r="5" fill="${p.text2}" stroke="${p.bg}" stroke-width="1.25"/>`;
    } else if (isRiser) {
      body =
        `<rect x="${cx - wpx / 2}" y="${cy - hpx / 2}" width="${wpx}" height="${hpx}" rx="6" fill="${brand}" fill-opacity="0.07" stroke="${brand}" stroke-opacity="0.45" stroke-width="1"/>` +
        `<text x="${cx}" y="${cy - hpx / 2 + 12}" font-size="11" fill="${p.text2}" text-anchor="middle" dominant-baseline="central" font-weight="600">${esc(`${wFt} × ${dFt} × ${it.heightFt ?? 1} ft`)}</text>`;
    } else {
      body = `<svg class="spi" x="${cx - wpx / 2}" y="${cy - hpx / 2}" width="${wpx}" height="${hpx}" viewBox="${esc(icon.viewBox ?? '0 0 100 100')}" preserveAspectRatio="xMidYMid meet" style="fill:${fill};stroke:${stroke};--lp-cat:${stroke}">${icon.body}</svg>`;
    }
    out.push(`<g transform="rotate(${deg} ${cx} ${cy})">${body}</g>`);

    const halfW = isPerson ? 5 : wpx / 2;
    const halfH = isPerson ? 5 : hpx / 2;
    // The rotated item's own box.
    const r = (deg * Math.PI) / 180;
    const ex = Math.abs(halfW * Math.cos(r)) + Math.abs(halfH * Math.sin(r));
    const ey = Math.abs(halfW * Math.sin(r)) + Math.abs(halfH * Math.cos(r));
    grow(cx - ex, cy - ey, cx + ex, cy + ey);
    const linked = showChips ? linkedChannels(it, opts.channels) : [];
    if (linked.length > 0) {
      const [x, y] = rot(cx + halfW, cy - halfH, cx, cy, deg);
      overlay.push(chip(p, x, y, linked));
      grow(x - 8, y - 7, x - 8 + chipWidth(chipText(linked.map((c) => c.number))), y + 5);
    }
    const labelPos = it.labelPosition ?? 'bottom';
    const labelText = it.label ?? icon.label;
    if (showLabels && labelPos !== 'hidden' && labelText) {
      const px = labelPx(it);
      overlay.push(labelPill(p, cx, cy, halfW, halfH, labelText, px, labelPos, isPerson));
      const b = labelBox(cx, cy, halfW, halfH, labelText, px, labelPos);
      grow(b.lx - b.pw / 2, b.ly - b.ph / 2, b.lx + b.pw / 2, b.ly + b.ph / 2);
    }
  }
  out.push(...overlay);
  const vb = [bounds.x0, bounds.y0, bounds.x1 - bounds.x0, bounds.y1 - bounds.y0].map((n) => +n.toFixed(1)).join(' ');

  return (
    `<svg class="lp-plot-svg" viewBox="${vb}" xmlns="http://www.w3.org/2000/svg" font-family="Inter, 'Helvetica Neue', Arial, sans-serif">` +
    `<style>` +
    `.lp-plot-svg .spi{stroke-width:1.75;stroke-linecap:round;stroke-linejoin:round}` +
    `.lp-plot-svg .spi *{vector-effect:non-scaling-stroke}` +
    `.lp-plot-svg .spi .lp-ico-detail{fill:none}` +
    `.lp-plot-svg .spi .lp-ico-label{stroke:none;fill:var(--lp-cat)}` +
    `</style>` +
    out.join('') +
    `</svg>`
  );
}
