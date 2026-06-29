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

function hotelBlock(h: RoomingHotel): string {
  const contact = [h.address, h.city, h.phone].filter(Boolean).map((s) => esc(String(s))).join(' · ');
  const span = dateSpan(h.spanStart, h.spanEnd);
  const head = `
    <div class="lp-sec-head">${esc(h.name || 'Hotel')}</div>
    <div class="lp-native" style="margin:-2px 0 4px;">${[contact, span ? `Stay: ${esc(span)}` : ''].filter(Boolean).join('  ·  ')}</div>`;

  if (h.rows.length === 0) {
    return `${head}<p class="lp-native">No guests assigned.</p>`;
  }
  const rows = h.rows
    .map(
      (r) => `<tr>
        <td>${esc(r.guest || '—')}</td>
        <td>${esc(r.roomType || '—')}${r.roomNumber ? ` <span class="lp-native">#${esc(r.roomNumber)}</span>` : ''}</td>
        <td>${fmtDate(r.checkIn)}</td>
        <td>${fmtDate(r.checkOut)}</td>
        <td class="num">${r.nights}</td>
      </tr>`,
    )
    .join('');
  const totalNights = h.rows.reduce((sum, r) => sum + r.nights, 0);
  return `${head}
    <table class="lp-tbl">
      <thead><tr><th>Guest</th><th>Room type</th><th>Check-in</th><th>Check-out</th><th class="num">Nights</th></tr></thead>
      <tbody>
        ${rows}
        <tr class="lp-subtotal"><td colspan="4">${h.rows.length} guest${h.rows.length === 1 ? '' : 's'}</td><td class="num">${totalNights}</td></tr>
      </tbody>
    </table>`;
}

export function buildRoomingBodyHtml(data: RoomingExportData): string {
  if (data.hotels.length === 0) {
    return `<p class="lp-native">No hotels booked for this tour.</p>`;
  }
  return data.hotels.map(hotelBlock).join('');
}
