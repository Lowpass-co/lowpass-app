/* ============================================
   LOWPASS — Routing PDF body (#8 Document Export, Routing slice + v2 Part F)

   buildRoutingBodyHtml(data, config) → the per-surface BODY the shared shell wraps.
   The tour routing/itinerary, ALL days (show + travel/off/etc. — D7). Two views
   (config.routing.view): a restyled LIST (day-type chips, optional travel-time
   column) or a print-friendly CALENDAR month grid (light/dark). Plus an optional
   per-day advance summary section.

   NOT a daysheet (Adam uses Master Tour for those). Pure (no I/O); reuses the
   shell's table primitives. Presentation only.
   ============================================ */

import { escapeHtml as esc } from '@/lib/export/shell';
import type { RoutingExportData, RoutingDayRow } from '@/lib/export/routing-data';
import type { TemplateConfig } from '@/lib/export/template-config';

const DAY_TYPE_LABELS: Record<string, string> = {
  show: 'Show', off: 'Off', travel: 'Travel', rehearsal: 'Rehearsal', press: 'Press', radio: 'Radio', tv: 'TV', festival: 'Festival',
};
/** Day-type chip colours (text, bg) — doc-local (a standalone PDF, hex is fine). */
const DAY_TYPE_COLORS: Record<string, { fg: string; bg: string }> = {
  show: { fg: '#b4452f', bg: '#fdeee9' },
  festival: { fg: '#1f7a4d', bg: '#e8f5ee' },
  travel: { fg: '#2a5d9c', bg: '#e9f0f9' },
  off: { fg: '#6b6157', bg: '#f1ede8' },
  rehearsal: { fg: '#6b3fa0', bg: '#efe9f7' },
  press: { fg: '#9a6a14', bg: '#f8f0e2' },
  radio: { fg: '#9a6a14', bg: '#f8f0e2' },
  tv: { fg: '#9a6a14', bg: '#f8f0e2' },
};
function dayTypeLabel(t: string): string {
  if (!t) return '—';
  return DAY_TYPE_LABELS[t] ?? t.charAt(0).toUpperCase() + t.slice(1);
}
function dayChip(t: string): string {
  if (!t) return '<span class="lp-native">—</span>';
  const c = DAY_TYPE_COLORS[t] ?? { fg: '#46413c', bg: '#f1ede8' };
  return `<span style="display:inline-block;padding:1px 7px;border-radius:9px;font-size:8px;font-weight:700;color:${c.fg};background:${c.bg};">${esc(dayTypeLabel(t))}</span>`;
}
function fmtDate(d: string): string {
  const parsed = new Date(`${d}T12:00:00`);
  if (Number.isNaN(parsed.getTime())) return esc(d);
  return parsed.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' });
}
function fmtMins(mins: number): string {
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}
const STATUS_LABELS: Record<string, string> = {
  not_started: 'Not started', in_progress: 'In progress', complete: 'Complete', needs_review: 'Needs review',
};

interface RoutingViewOpts {
  travelTimes: boolean;
  columns: { country: boolean; capacity: boolean };
}

/** Mode-of-transport glyph for a leg (transport_to_next). */
function transportIcon(t: string): string {
  if (t === 'fly') return '✈ ';
  if (t === 'drive') return '🚐 ';
  return '';
}

/** The restyled itinerary list — day-type chips, zebra, config-driven columns
 *  (Country on / Capacity off by default), an optional travel column w/ transport
 *  icon. */
function renderList(data: RoutingExportData, opts: RoutingViewOpts): string {
  if (data.days.length === 0) return `<p class="lp-native">No routing for this tour.</p>`;
  const cols = opts.columns;
  const heads = [
    '<th>Date</th>', '<th>Day</th>', '<th>City</th>',
    cols.country ? '<th>Country</th>' : '',
    '<th>Venue</th>',
    cols.capacity ? '<th class="num">Capacity</th>' : '',
    opts.travelTimes ? '<th>To next</th>' : '',
  ].join('');
  const rows = data.days
    .map((d, idx) => {
      const venueCell = d.venue
        ? `${esc(d.venue)}${d.address ? `<div class="lp-native">${esc(d.address)}</div>` : ''}`
        : '<span class="lp-native">—</span>';
      const travelCell = opts.travelTimes
        ? `<td class="lp-native">${d.legMins != null ? `${transportIcon(d.transportToNext)}${d.legApprox ? '~' : ''}${esc(fmtMins(d.legMins))}` : '—'}</td>`
        : '';
      const zebra = idx % 2 === 1 ? ' style="background:#faf8f5;"' : '';
      return `<tr${zebra}>
        <td>${fmtDate(d.date)}</td>
        <td>${dayChip(d.dayType)}</td>
        <td>${esc(d.city ?? '—')}</td>
        ${cols.country ? `<td>${esc(d.country ?? '—')}</td>` : ''}
        <td>${venueCell}</td>
        ${cols.capacity ? `<td class="num">${d.capacity ? d.capacity.toLocaleString('en-GB') : '—'}</td>` : ''}
        ${travelCell}
      </tr>`;
    })
    .join('');
  const showCount = data.days.filter((d) => d.dayType === 'show').length;
  return `
    <div class="lp-sec-head">Routing</div>
    <div class="lp-native" style="margin:-2px 0 4px;">${data.days.length} day${data.days.length === 1 ? '' : 's'} · ${showCount} show${showCount === 1 ? '' : 's'}${opts.travelTimes ? ' · travel times (~ = approx)' : ''}</div>
    <table class="lp-tbl">
      <thead><tr>${heads}</tr></thead>
      <tbody>${rows}</tbody>
    </table>`;
}

/** A self-contained SVG dot-and-line route map from the routing lat/lng (migration
 *  009) — NO live Google / static-map calls (cost-hardening). Points are projected
 *  with a simple equirectangular projection (longitude scaled by cos(mean latitude)
 *  so regional tours aren't stretched), connected in date order. Show/festival days
 *  get a filled orange dot + city label; other coordinate-bearing days a small grey
 *  dot. A richer tiled basemap is a flagged follow-up. Pure; hex colours (doc-local,
 *  matching the day chips). */
function renderRouteMap(data: RoutingExportData): string {
  const pts = data.days
    .filter((d) => d.lat != null && d.lng != null)
    .map((d) => ({ lat: d.lat as number, lng: d.lng as number, city: d.city, dayType: d.dayType, date: d.date, venue: d.venue }));
  const total = data.days.length;

  if (pts.length < 2) {
    return `
    <div class="lp-sec-head">Route map</div>
    <div class="lp-native" style="margin:-2px 0 8px;">${pts.length} of ${total} day${total === 1 ? '' : 's'} have coordinates — at least two are needed to draw a route. Use the list / calendar views.</div>`;
  }

  const W = 760;
  const H = 380;
  const pad = 46;
  const meanLatRad = (pts.reduce((a, p) => a + p.lat, 0) / pts.length) * (Math.PI / 180);
  const cosLat = Math.max(0.2, Math.cos(meanLatRad));
  const xs = pts.map((p) => p.lng * cosLat);
  const ys = pts.map((p) => p.lat);
  const minX = Math.min(...xs), maxX = Math.max(...xs);
  const minY = Math.min(...ys), maxY = Math.max(...ys);
  const spanX = Math.max(1e-4, maxX - minX);
  const spanY = Math.max(1e-4, maxY - minY);
  // Preserve aspect ratio: use the tighter scale so the route isn't distorted.
  const scale = Math.min((W - pad * 2) / spanX, (H - pad * 2) / spanY);
  const drawnW = spanX * scale;
  const drawnH = spanY * scale;
  const offX = (W - drawnW) / 2;
  const offY = (H - drawnH) / 2;
  const project = (p: { lat: number; lng: number }) => ({
    x: offX + (p.lng * cosLat - minX) * scale,
    // SVG y is top-down; north (max latitude) sits at the top.
    y: offY + (maxY - p.lat) * scale,
  });

  const projected = pts.map(project);
  const path = projected.map((q, i) => `${i === 0 ? 'M' : 'L'}${q.x.toFixed(1)} ${q.y.toFixed(1)}`).join(' ');

  const isShow = (t: string) => t === 'show' || t === 'festival';
  // Dots + labels. Label only show/festival days, and dedupe a city repeated on
  // consecutive points so a multi-night run isn't stamped twice.
  let lastLabel = '';
  const markers = pts
    .map((p, i) => {
      const q = projected[i];
      const show = isShow(p.dayType);
      const r = show ? 4 : 2.4;
      const fill = show ? '#FF4500' : '#b8b1a8';
      const stroke = show ? '#7a2200' : '#8a837b';
      const dot = `<circle cx="${q.x.toFixed(1)}" cy="${q.y.toFixed(1)}" r="${r}" fill="${fill}" stroke="${stroke}" stroke-width="0.8"/>`;
      let label = '';
      const city = (p.city ?? '').trim();
      if (show && city && city !== lastLabel) {
        lastLabel = city;
        // Nudge the label above the dot; anchor middle.
        label = `<text x="${q.x.toFixed(1)}" y="${(q.y - r - 3).toFixed(1)}" text-anchor="middle" font-size="9" fill="#3a342e">${esc(city)}</text>`;
      }
      if (!show) lastLabel = '';
      return dot + label;
    })
    .join('');

  // Start/end emphasis ring.
  const start = projected[0];
  const end = projected[projected.length - 1];
  const showCount = pts.filter((p) => isShow(p.dayType)).length;

  const svg =
    `<svg viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg" style="width:100%;height:auto;max-height:200mm;display:block;">` +
    `<rect x="0.5" y="0.5" width="${W - 1}" height="${H - 1}" rx="8" fill="#faf8f5" stroke="#e4ded6" stroke-width="1"/>` +
    `<path d="${path}" fill="none" stroke="#c97a5c" stroke-width="1.6" stroke-linejoin="round" stroke-linecap="round" stroke-dasharray="5 3"/>` +
    `<circle cx="${start.x.toFixed(1)}" cy="${start.y.toFixed(1)}" r="7" fill="none" stroke="#1f7a4d" stroke-width="1.4"/>` +
    `<circle cx="${end.x.toFixed(1)}" cy="${end.y.toFixed(1)}" r="7" fill="none" stroke="#b4452f" stroke-width="1.4"/>` +
    markers +
    `</svg>`;

  return `
    <div class="lp-sec-head">Route map</div>
    <div class="lp-native" style="margin:-2px 0 8px;">${pts.length} of ${total} day${total === 1 ? '' : 's'} mapped · ${showCount} show${showCount === 1 ? '' : 's'} · green ring = start, red ring = end. Schematic (no basemap) — straight-line legs.</div>
    ${svg}`;
}

/** A print-friendly month-grid calendar (light or dark). */
function renderCalendar(data: RoutingExportData, theme: 'light' | 'dark'): string {
  if (data.days.length === 0) return `<p class="lp-native">No routing for this tour.</p>`;
  const dark = theme === 'dark';
  const ink = dark ? '#f1ede8' : '#14110f';
  const muted = dark ? '#9a938b' : '#8a837b';
  const cellBg = dark ? '#1c1a17' : '#ffffff';
  const cellBorder = dark ? '#33302b' : '#e4ded6';
  const gridBg = dark ? '#0f0e0c' : '#faf8f5';

  const byDate = new Map(data.days.map((d) => [d.date, d]));
  // Months present in the data, in order.
  const months = Array.from(new Set(data.days.map((d) => d.date.slice(0, 7)))).sort();
  const WD = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

  const monthBlocks = months
    .map((ym) => {
      const [y, m] = ym.split('-').map(Number);
      const first = new Date(Date.UTC(y, m - 1, 1));
      const daysInMonth = new Date(Date.UTC(y, m, 0)).getUTCDate();
      const leadBlanks = (first.getUTCDay() + 6) % 7; // Mon=0
      const monthLabel = first.toLocaleDateString('en-GB', { month: 'long', year: 'numeric', timeZone: 'UTC' });

      const cells: string[] = [];
      for (let i = 0; i < leadBlanks; i++) cells.push(`<td style="border:1px solid ${cellBorder};background:${gridBg};"></td>`);
      for (let day = 1; day <= daysInMonth; day++) {
        const dateStr = `${ym}-${String(day).padStart(2, '0')}`;
        const d = byDate.get(dateStr);
        const chip = d && d.dayType ? `<div style="margin-top:2px;">${dayChip(d.dayType)}</div>` : '';
        const place = d && (d.city || d.venue)
          ? `<div style="font-size:8px;color:${ink};line-height:1.25;margin-top:2px;">${esc(d.city ?? '')}${d.venue ? `<div style="color:${muted};">${esc(d.venue)}</div>` : ''}</div>`
          : '';
        cells.push(`<td style="vertical-align:top;border:1px solid ${cellBorder};background:${cellBg};height:62px;width:14.28%;padding:3px 4px;">
          <div style="font-size:9px;font-weight:700;color:${d ? ink : muted};">${day}</div>${chip}${place}
        </td>`);
      }
      // pad the final row
      while (cells.length % 7 !== 0) cells.push(`<td style="border:1px solid ${cellBorder};background:${gridBg};"></td>`);
      const rows: string[] = [];
      for (let i = 0; i < cells.length; i += 7) rows.push(`<tr>${cells.slice(i, i + 7).join('')}</tr>`);

      return `
    <div class="lp-sec-head" style="color:${ink};">${esc(monthLabel)}</div>
    <table style="width:100%;border-collapse:collapse;margin:4px 0 14px;table-layout:fixed;">
      <thead><tr>${WD.map((w) => `<th style="font-size:8px;text-transform:uppercase;letter-spacing:0.5px;color:${muted};text-align:left;padding:3px 4px;border:1px solid ${cellBorder};background:${gridBg};">${w}</th>`).join('')}</tr></thead>
      <tbody>${rows.join('')}</tbody>
    </table>`;
    })
    .join('');

  const wrapStyle = dark ? ` style="background:#0f0e0c;padding:10px;border-radius:6px;"` : '';
  return `<div${wrapStyle}>${monthBlocks}</div>`;
}

function advanceLine(d: RoutingDayRow): string {
  const a = d.advance;
  if (!a) return '';
  const status = STATUS_LABELS[a.status] ?? a.status;
  const fill = a.filledFields > 0 ? ` · ${a.filledFields} field${a.filledFields === 1 ? '' : 's'} across ${a.sections} section${a.sections === 1 ? '' : 's'}` : '';
  return `<tr>
    <td>${fmtDate(d.date)}</td>
    <td>${esc(d.city ?? '—')}${d.venue ? ` <span class="lp-native">· ${esc(d.venue)}</span>` : ''}</td>
    <td>${esc(status)}${esc(fill)}</td>
  </tr>`;
}

function renderAdvanceSummary(data: RoutingExportData): string {
  const withAdvance = data.days.filter((d) => d.advance !== null);
  if (withAdvance.length === 0) {
    return `
    <div class="lp-sec-head">Advance summary</div>
    <p class="lp-native">No advances started for this tour.</p>`;
  }
  const rows = withAdvance.map(advanceLine).join('');
  return `
    <div class="lp-page-break"></div>
    <div class="lp-sec-head">Advance summary</div>
    <div class="lp-native" style="margin:-2px 0 4px;">Best-effort status per day (the advance form is free-form).</div>
    <table class="lp-tbl">
      <thead><tr><th>Date</th><th>City / venue</th><th>Advance</th></tr></thead>
      <tbody>${rows}</tbody>
    </table>`;
}

/** Template builder. `config.sections` drives WHICH blocks render; `config.routing`
 *  picks the view (list / calendar) + travel times. DEFAULT: the list view, no
 *  travel times, advance summary off (D7). */
export function buildRoutingBodyHtml(data: RoutingExportData, config: TemplateConfig): string {
  const r = config.routing;
  const list = () => renderList(data, { travelTimes: r.travelTimes, columns: r.columns });
  const renderDays = () => {
    if (r.view === 'calendar') return renderCalendar(data, r.calendarTheme);
    if (r.view === 'map') return renderRouteMap(data);
    if (r.view === 'both') return `${list()}\n    <div class="lp-page-break"></div>${renderRouteMap(data)}`;
    return list();
  };
  const sections: Record<string, () => string> = {
    days: renderDays,
    'advance-summary': () => renderAdvanceSummary(data),
  };
  return config.sections
    .filter((s) => s.show)
    .map((s) => sections[s.id]?.() ?? '')
    .join('');
}
