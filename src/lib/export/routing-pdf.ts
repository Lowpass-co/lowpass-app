/* ============================================
   LOWPASS — Routing PDF body (#8 Document Export, Routing slice)

   buildRoutingBodyHtml(data, config) → the per-surface BODY the shared shell wraps.
   The tour routing/itinerary: one row per day (date · day-type · city · venue ·
   capacity, address as a muted sub-line), ALL days (show + travel/off/etc. — D7).
   Plus an OPTIONAL per-day advance summary section (config toggle, OFF by default).

   NOT a daysheet (Adam uses Master Tour for those). Pure (no I/O); reuses the
   shell's table primitives. Presentation only.
   ============================================ */

import { escapeHtml as esc } from '@/lib/export/shell';
import type { RoutingExportData, RoutingDayRow } from '@/lib/export/routing-data';
import type { TemplateConfig } from '@/lib/export/template-config';

const DAY_TYPE_LABELS: Record<string, string> = {
  show: 'Show',
  off: 'Off',
  travel: 'Travel',
  rehearsal: 'Rehearsal',
  press: 'Press',
  radio: 'Radio',
  tv: 'TV',
  festival: 'Festival',
};
function dayTypeLabel(t: string): string {
  if (!t) return '—';
  return DAY_TYPE_LABELS[t] ?? t.charAt(0).toUpperCase() + t.slice(1);
}
function fmtDate(d: string): string {
  const parsed = new Date(`${d}T12:00:00`);
  if (Number.isNaN(parsed.getTime())) return esc(d);
  return parsed.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' });
}
const STATUS_LABELS: Record<string, string> = {
  not_started: 'Not started',
  in_progress: 'In progress',
  complete: 'Complete',
  needs_review: 'Needs review',
};

function renderDays(data: RoutingExportData): string {
  if (data.days.length === 0) return `<p class="lp-native">No routing for this tour.</p>`;
  const rows = data.days
    .map((d) => {
      const venueCell = d.venue
        ? `${esc(d.venue)}${d.address ? `<div class="lp-native">${esc(d.address)}</div>` : ''}`
        : '<span class="lp-native">—</span>';
      return `<tr>
        <td>${fmtDate(d.date)}</td>
        <td>${esc(dayTypeLabel(d.dayType))}</td>
        <td>${esc(d.city ?? '—')}</td>
        <td>${venueCell}</td>
        <td class="num">${d.capacity ? d.capacity.toLocaleString('en-GB') : '—'}</td>
      </tr>`;
    })
    .join('');
  const showCount = data.days.filter((d) => d.dayType === 'show').length;
  return `
    <div class="lp-sec-head">Routing</div>
    <div class="lp-native" style="margin:-2px 0 4px;">${data.days.length} day${data.days.length === 1 ? '' : 's'} · ${showCount} show${showCount === 1 ? '' : 's'}</div>
    <table class="lp-tbl">
      <thead><tr><th>Date</th><th>Day</th><th>City</th><th>Venue</th><th class="num">Capacity</th></tr></thead>
      <tbody>${rows}</tbody>
    </table>`;
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

/** Template builder. `config.sections` (order + visibility) drives WHICH blocks
 *  render. DEFAULT: the routing table only (advance summary off — D7). */
export function buildRoutingBodyHtml(data: RoutingExportData, config: TemplateConfig): string {
  const sections: Record<string, () => string> = {
    days: () => renderDays(data),
    'advance-summary': () => renderAdvanceSummary(data),
  };
  return config.sections
    .filter((s) => s.show)
    .map((s) => sections[s.id]?.() ?? '')
    .join('');
}
