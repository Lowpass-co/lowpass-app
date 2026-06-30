/* ============================================
   LOWPASS — Rooming PDF body (#8 Document Export, Rooming slice)

   buildRoomingBodyHtml(data) → the per-surface BODY the shared shell (shell.ts)
   wraps. The standard hotel rooming-list you email a hotel: grouped by hotel
   (name · address · phone · date span), each a table of
   guest · room type · check-in · check-out · # nights.

   Pure (no I/O). Reuses the shell's shared table primitives + tokens; does NOT
   modify shell.ts (it stays generic for Payroll / Routing).
   ============================================ */

import { escapeHtml as esc } from '@/lib/export/shell';
import type { RoomingExportData, RoomingHotel } from '@/lib/export/rooming-data';
import type { TemplateConfig } from '@/lib/export/template-config';

function fmtDate(d: string | null): string {
  if (!d) return '—';
  const parsed = new Date(`${d}T12:00:00`);
  if (Number.isNaN(parsed.getTime())) return esc(d);
  return parsed.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' });
}
function dateSpan(start: string | null, end: string | null): string {
  if (!start && !end) return '';
  const f = (d: string | null) => (d ? new Date(`${d}T12:00:00`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : '—');
  return `${f(start)} → ${f(end)}`;
}

/** A small room-type chip (doc-local styling via the shell's tokens). */
function roomChip(t: string | null): string {
  if (!t) return '<span class="lp-native">—</span>';
  return `<span style="display:inline-block;padding:1px 7px;border-radius:9px;font-size:8px;font-weight:600;background:var(--lp-bg-subtle);border:1px solid var(--lp-border);color:var(--lp-text-secondary);">${esc(t)}</span>`;
}

function hotelBlock(h: RoomingHotel): string {
  const place = [h.city, h.country].filter(Boolean).map((s) => esc(String(s))).join(', ');
  const contact = [h.address ? esc(h.address) : '', place, h.phone ? esc(h.phone) : ''].filter(Boolean).join('  ·  ');
  const span = dateSpan(h.spanStart, h.spanEnd);
  const totalNights = h.rows.reduce((sum, r) => sum + r.nights, 0);
  const summary = h.rows.length
    ? `${h.rows.length} guest${h.rows.length === 1 ? '' : 's'} · ${totalNights} night${totalNights === 1 ? '' : 's'}${span ? ` · ${esc(span)}` : ''}`
    : 'No guests assigned';

  // Heading: the hotel name, but for an unnamed/"Unassigned" hotel fall back to
  // city/country (Part E) so the block still reads as a place.
  const named = h.name && h.name.trim() && h.name.trim().toLowerCase() !== 'unassigned hotel';
  const heading = named ? esc(h.name) : place || 'Hotel';

  // Branded hotel header band (orange left accent + contact + summary).
  const head = `
    <div style="border-left:3px solid var(--lp-orange);padding:5px 0 5px 10px;margin:16px 0 4px;">
      <div style="font-size:13px;font-weight:800;color:var(--lp-text);">${heading}</div>
      ${contact ? `<div style="font-size:9px;color:var(--lp-text-tertiary);margin-top:1px;">${contact}</div>` : ''}
      <div style="font-size:9px;color:var(--lp-text-secondary);margin-top:2px;font-weight:600;">${summary}</div>
    </div>`;

  if (h.rows.length === 0) return head;

  // Group guests sharing a room (rows are pre-sorted by roomKey) — the room-type
  // cell spans the sharers so the sharing is clear (Adam: keep the formatting).
  const groups: Array<{ key: string; items: typeof h.rows }> = [];
  for (const r of h.rows) {
    const last = groups[groups.length - 1];
    if (last && last.key === r.roomKey) last.items.push(r);
    else groups.push({ key: r.roomKey, items: [r] });
  }
  let body = '';
  groups.forEach((g, gi) => {
    const zebra = gi % 2 === 1 ? ' style="background:#faf8f5;"' : '';
    g.items.forEach((r, ri) => {
      const roomCell =
        ri === 0
          ? `<td rowspan="${g.items.length}" style="vertical-align:middle;">${roomChip(r.roomType)}${r.roomNumber ? ` <span class="lp-native">#${esc(r.roomNumber)}</span>` : ''}${g.items.length > 1 ? `<div class="lp-native" style="margin-top:2px;">shared · ${g.items.length}</div>` : ''}</td>`
          : '';
      body += `<tr${zebra}>
        <td>${esc(r.guest || '—')}</td>
        ${roomCell}
        <td>${fmtDate(r.checkIn)}</td>
        <td>${fmtDate(r.checkOut)}</td>
        <td class="num">${r.nights}</td>
      </tr>`;
    });
  });
  return `${head}
    <table class="lp-tbl">
      <thead><tr><th>Guest</th><th>Room type</th><th>Check-in</th><th>Check-out</th><th class="num">Nights</th></tr></thead>
      <tbody>
        ${body}
        <tr class="lp-subtotal"><td colspan="4">${h.rows.length} guest${h.rows.length === 1 ? '' : 's'}</td><td class="num">${totalNights}</td></tr>
      </tbody>
    </table>`;
}

/** P1 template builder. Rooming has one coarse section (`hotels`) for now — the
 *  config's show/hide toggles it; the order is trivial with a single section.
 *  DEFAULT (hotels shown) reproduces the pre-template output. Presentation only. */
export function buildRoomingBodyHtml(data: RoomingExportData, config: TemplateConfig): string {
  const sections: Record<string, () => string> = {
    hotels: () =>
      data.hotels.length === 0
        ? `<p class="lp-native">No hotels booked for this tour.</p>`
        : data.hotels.map(hotelBlock).join(''),
  };
  return config.sections
    .filter((s) => s.show)
    .map((s) => sections[s.id]?.() ?? '')
    .join('');
}
