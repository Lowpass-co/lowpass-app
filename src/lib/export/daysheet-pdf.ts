/* ============================================
   LOWPASS — Day Sheet PDF body (D1-2 · DAY-03)

   Renders a DayObject into the day-sheet body. Sections are dispatched over
   config.sections (the audience template's toggles); config.daysheet.bigType
   scales the type up (Driver preset). Pure HTML string — the shared export
   shell (renderDocument) wraps it with the letterhead. No app tokens here (PDF
   print context uses plain hex, like the other *-pdf.ts body builders).

   The day is loaded server-side with the full (tm) slice, so every enabled
   section has data; the template decides which sections print, not the security
   slice (that's the live Day surface + tokenized links).
   ============================================ */

import type { DayObject } from '@/lib/day/loadDay';
import type { TemplateConfig } from '@/lib/export/template-config';

const esc = (s: string): string =>
  s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] as string));

function fmtTime(iso: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return esc(iso);
  return d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', timeZone: 'UTC' });
}

function money(n: number | null, ccy: string): string {
  if (n == null) return '—';
  return new Intl.NumberFormat('en-GB', { style: 'currency', currency: ccy || 'GBP', maximumFractionDigits: 0 }).format(n);
}

export function buildDaySheetBodyHtml(day: DayObject, config: TemplateConfig): string {
  const shown = (id: string) => config.sections.find((s) => s.id === id)?.show !== false;
  const big = config.daysheet?.bigType ?? false;

  const baseSize = big ? 15 : 12;
  const labelSize = big ? 12 : 10;
  const headSize = big ? 20 : 16;

  const style = `<style>
    .lp-ds { font-size:${baseSize}px; color:#111; }
    .lp-ds-sec { margin:0 0 14px; break-inside:avoid; }
    .lp-ds-sec > h3 { margin:0 0 6px; font-size:${labelSize}px; text-transform:uppercase; letter-spacing:.07em; color:#888; font-weight:700; }
    .lp-ds-venue .n { font-size:${headSize}px; font-weight:800; }
    .lp-ds-venue .a { color:#444; }
    .lp-ds-meta { color:#666; font-size:${labelSize + 1}px; }
    table.lp-ds-t { width:100%; border-collapse:collapse; font-size:${baseSize}px; }
    table.lp-ds-t td { padding:${big ? 5 : 3}px 6px; vertical-align:top; border-bottom:1px solid #eee; }
    table.lp-ds-t td.tm { white-space:nowrap; font-variant-numeric:tabular-nums; font-weight:700; width:${big ? 90 : 70}px; }
    table.lp-ds-t td.src { text-align:right; color:#999; font-size:${labelSize - 1}px; text-transform:uppercase; letter-spacing:.05em; white-space:nowrap; }
    .lp-ds-note { white-space:pre-wrap; color:#222; }
    .lp-ds-empty { color:#aaa; font-style:italic; }
  </style>`;

  const parts: string[] = [];

  // Schedule
  if (shown('schedule') && day.schedule !== undefined) {
    const rows =
      (day.schedule ?? []).length > 0
        ? (day.schedule ?? [])
            .map(
              (s) =>
                `<tr><td class="tm">${s.approx && s.time ? '~' : ''}${esc(s.time ?? '—')}</td><td>${esc(s.label)}${s.detail ? ` <span style="color:#888">· ${esc(s.detail)}</span>` : ''}</td><td class="src">${s.source === 'labor_call' ? 'Call' : 'Advance'}</td></tr>`,
            )
            .join('')
        : `<tr><td colspan="3" class="lp-ds-empty">No calls or times.</td></tr>`;
    parts.push(`<div class="lp-ds-sec"><h3>Schedule</h3><table class="lp-ds-t">${rows}</table></div>`);
  }

  // Venue
  if (shown('venue') && day.venue !== undefined) {
    const v = day.venue;
    const body = v && v.name
      ? `<div class="n">${esc(v.name)}</div>${v.address ? `<div class="a">${esc(v.address)}</div>` : ''}<div class="lp-ds-meta">${[v.phone, v.capacity != null ? `Cap. ${v.capacity.toLocaleString()}` : null].filter(Boolean).map((x) => esc(String(x))).join(' &nbsp;·&nbsp; ')}</div>`
      : `<div class="lp-ds-empty">No venue set.</div>`;
    parts.push(`<div class="lp-ds-sec lp-ds-venue"><h3>Venue</h3>${body}</div>`);
  }

  // Hotel
  if (shown('hotel') && day.hotels !== undefined) {
    const body =
      (day.hotels ?? []).length > 0
        ? (day.hotels ?? [])
            .map(
              (h) =>
                `<div style="margin-bottom:6px"><strong>${esc(h.name)}</strong>${h.address ? `<div class="a" style="color:#444">${esc(h.address)}</div>` : ''}<div class="lp-ds-meta">${[h.checkInAt ? `In ${fmtTime(h.checkInAt)}` : null, h.checkOutAt ? `Out ${fmtTime(h.checkOutAt)}` : null, h.confirmationNumber ? `Conf. ${esc(h.confirmationNumber)}` : null, h.phone ? esc(h.phone) : null].filter(Boolean).join(' &nbsp;·&nbsp; ')}</div></div>`,
            )
            .join('')
        : `<div class="lp-ds-empty">No hotel for this night.</div>`;
    parts.push(`<div class="lp-ds-sec"><h3>Hotel</h3>${body}</div>`);
  }

  // Flights (named — no ground-transport model)
  if (shown('flights') && day.flights !== undefined) {
    const rows =
      (day.flights ?? []).length > 0
        ? (day.flights ?? [])
            .map((f) => {
              const who = f.passengers && f.passengers.length > 0 ? f.passengers.join(', ') : f.who;
              return `<tr><td class="tm">${fmtTime(f.departAt)}</td><td><strong>${esc(f.from)} → ${esc(f.to)}</strong>${who ? ` <span style="color:#888">· ${esc(who)}</span>` : ''}<div class="lp-ds-meta">${[[f.airline, f.flightNumber].filter(Boolean).join(' '), f.confirmation ? `Conf ${f.confirmation}` : f.pnr ? `PNR ${f.pnr}` : null, f.arriveAt ? `arr ${fmtTime(f.arriveAt)}` : null].filter(Boolean).map((x) => esc(String(x))).join(' · ')}</div></td></tr>`;
            })
            .join('')
        : `<tr><td colspan="2" class="lp-ds-empty">No flights on this date.</td></tr>`;
    parts.push(`<div class="lp-ds-sec"><h3>Flights</h3><table class="lp-ds-t">${rows}</table></div>`);
  }

  // Contacts
  if (shown('contacts') && day.contacts !== undefined) {
    const rows =
      (day.contacts ?? []).length > 0
        ? (day.contacts ?? [])
            .map(
              (c) =>
                `<tr><td>${esc(c.name)} <span style="color:#888">· ${esc(c.role)}</span></td><td class="src" style="text-align:right;color:#444;text-transform:none;letter-spacing:0">${esc(c.phone ?? c.email ?? '')}</td></tr>`,
            )
            .join('')
        : `<tr><td colspan="2" class="lp-ds-empty">No contacts listed.</td></tr>`;
    parts.push(`<div class="lp-ds-sec"><h3>Day-of contacts</h3><table class="lp-ds-t">${rows}</table></div>`);
  }

  // Notes (present only when the object carries the block — Standard template)
  if (shown('notes') && day.notes !== undefined) {
    parts.push(`<div class="lp-ds-sec"><h3>Notes</h3><div class="lp-ds-note">${day.notes ? esc(day.notes) : '<span class="lp-ds-empty">No notes.</span>'}</div></div>`);
  }

  // Money never prints on a day sheet — the P&L chip is screen-only. (No section.)

  return `${style}<div class="lp-ds">${parts.join('\n')}</div>`;
}

/** Small currency helper exported for callers that want the subtitle stamp. */
export function daySheetMoney(n: number | null, ccy: string): string {
  return money(n, ccy);
}
