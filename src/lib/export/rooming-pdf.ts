/* ============================================
   LOWPASS — Rooming PDF body (#8 Document Export, Rooming slice)

   buildRoomingBodyHtml(data) → the per-surface BODY the shared shell (shell.ts)
   wraps: the rooming list you email a hotel.

   Oct 2026 rework (Adam: "a really clear rooming list"). Per hotel:
     - a header card: name, address, phone, confirmation, dates, and the
       counts a hotel books by — people, rooms (peak night), room-nights —
       with the rooms needed each night when it changes;
     - one line per ROOM per stay (data from src/lib/rooming/stays.ts): room
       type, the guest(s) in it, arrive, depart, nights. A single is one
       person's room; sharers sit together in one line.
   Nights nobody stays never print. Unbooked nights (no hotel yet) are grouped
   by city under "No hotel booked yet".

   Pure (no I/O). Reuses the shell's table primitives + tokens.
   ============================================ */

import { escapeHtml as esc } from '@/lib/export/shell';
import { roomLabel } from '@/lib/rooming/stays';
import type { RoomingExportData, RoomingHotel } from '@/lib/export/rooming-data';
import type { TemplateConfig } from '@/lib/export/template-config';

const STYLE = `<style>
.rl-hotel { margin: 0 0 20px; }
.rl-head { display: flex; gap: 16px; align-items: stretch; padding: 11px 14px; border: 1px solid var(--lp-border); border-left: 3px solid var(--lp-orange); border-radius: 8px; background: var(--lp-bg-subtle); break-inside: avoid; break-after: avoid; }
.rl-head-main { flex: 1 1 auto; min-width: 0; }
.rl-name { font-size: 14px; font-weight: 800; color: var(--lp-text); line-height: 1.2; }
.rl-name.rl-unbooked { color: var(--lp-text-secondary); }
.rl-meta { font-size: 9px; color: var(--lp-text-tertiary); margin-top: 2px; }
.rl-dates { font-size: 9.5px; font-weight: 600; color: var(--lp-text-secondary); margin-top: 4px; }
.rl-counts { flex: 0 0 auto; display: flex; gap: 14px; align-items: center; padding-left: 14px; border-left: 1px solid var(--lp-border); }
.rl-count { text-align: center; }
.rl-count b { display: block; font-size: 16px; font-weight: 800; line-height: 1; color: var(--lp-text); font-variant-numeric: tabular-nums; }
.rl-count span { font-size: 7.5px; font-weight: 700; letter-spacing: 0.5px; text-transform: uppercase; color: var(--lp-text-tertiary); }
.rl-nightly { font-size: 8.5px; color: var(--lp-text-tertiary); margin: 5px 2px 0; }
.rl-tbl { margin-top: 6px; }
.rl-tbl td { vertical-align: top; }
.rl-room { font-weight: 700; white-space: nowrap; }
.rl-guest { display: block; }
.rl-guest + .rl-guest { margin-top: 2px; }
.rl-tbl tbody tr { break-inside: avoid; }
</style>`;

function fmtDate(d: string | null): string {
  if (!d) return '—';
  const parsed = new Date(`${d}T12:00:00Z`);
  if (Number.isNaN(parsed.getTime())) return esc(d);
  return parsed.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' });
}
function longDate(d: string | null): string {
  if (!d) return '';
  const parsed = new Date(`${d}T12:00:00Z`);
  return Number.isNaN(parsed.getTime()) ? '' : parsed.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });
}
const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

function hotelBlock(h: RoomingHotel): string {
  const place = [h.city, h.country].filter(Boolean).join(', ');
  const heading = h.name ? esc(h.name) : `No hotel booked yet${place ? ` — ${esc(place)}` : ''}`;
  const meta = [h.address, h.name ? place : null, h.phone].filter(Boolean).map((x) => esc(String(x))).join('  ·  ');
  const conf = h.confirmation ? `Confirmation ${esc(h.confirmation)}` : '';
  const dates = h.spanStart ? `Arrive ${esc(longDate(h.spanStart))}  →  Depart ${esc(longDate(h.spanEnd))}` : '';
  const s = h.summary;
  const varies = s.perNight.length > 1 && s.perNight.some((n) => n.rooms !== s.peakRooms);
  const nightly = varies
    ? `<div class="rl-nightly">Rooms each night: ${s.perNight.map((n) => `${esc(fmtDate(n.night))} <b>${n.rooms}</b>`).join(' · ')}</div>`
    : '';

  const head = `<div class="rl-head">
      <div class="rl-head-main">
        <div class="rl-name${h.name ? '' : ' rl-unbooked'}">${heading}</div>
        ${meta ? `<div class="rl-meta">${meta}</div>` : ''}
        ${conf ? `<div class="rl-meta">${conf}</div>` : ''}
        ${dates ? `<div class="rl-dates">${dates}</div>` : ''}
      </div>
      <div class="rl-counts">
        <div class="rl-count"><b>${s.people}</b><span>${s.people === 1 ? 'Person' : 'People'}</span></div>
        <div class="rl-count"><b>${s.peakRooms}</b><span>${s.peakRooms === 1 ? 'Room' : 'Rooms'}</span></div>
        <div class="rl-count"><b>${s.roomNights}</b><span>Room-nights</span></div>
      </div>
    </div>${nightly}`;

  const rows = h.stays
    .map(
      (st) => `<tr>
        <td class="rl-room">${esc(roomLabel(st.roomType, st.roomNumber))}</td>
        <td>${st.guests.map((g) => `<span class="rl-guest">${esc(g)}</span>`).join('')}</td>
        <td>${fmtDate(st.checkIn)}</td>
        <td>${fmtDate(st.checkOut)}</td>
        <td class="num">${st.nights}</td>
      </tr>`,
    )
    .join('');

  return `<div class="rl-hotel">${head}
    <table class="lp-tbl rl-tbl">
      <thead><tr><th style="width:18%">Room</th><th>Guest${h.stays.some((x) => x.guests.length > 1) ? 's' : ''}</th><th style="width:15%">Arrive</th><th style="width:15%">Depart</th><th class="num" style="width:9%">Nights</th></tr></thead>
      <tbody>
        ${rows}
        <tr class="lp-subtotal"><td colspan="4">${plural(h.stays.length, 'room booking')} · ${plural(s.people, 'person', 'people')}</td><td class="num">${s.roomNights}</td></tr>
      </tbody>
    </table></div>`;
}

/** Rooming has one coarse section (`hotels`); the config's show/hide toggles it. */
export function buildRoomingBodyHtml(data: RoomingExportData, config: TemplateConfig): string {
  const sections: Record<string, () => string> = {
    hotels: () => (data.hotels.length === 0 ? `<p class="lp-native">Nobody is booked into a hotel on these dates.</p>` : data.hotels.map(hotelBlock).join('')),
  };
  return (
    STYLE +
    config.sections
      .filter((s) => s.show)
      .map((s) => sections[s.id]?.() ?? '')
      .join('')
  );
}
