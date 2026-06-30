/* ============================================
   LOWPASS — Payroll PDF body (#8 Document Export, Payroll slice)

   buildPayrollBodyHtml(data, config) → the per-surface BODY the shared shell wraps.
   Two coarse, config-toggleable/reorderable sections:

     - run-sheet  — one table, every crew member: role, day-type rates, day counts,
                    fee, per-diem, total, + a grand-total row.
     - statements — one page per person (lp-page-break): their weekly schedule, the
                    rate breakdown (days × rate), advance (if any), per-diem, and the
                    amount due.

   SECURITY (D5): internal_rate is never in `data` (the loader excludes it) — it can
   never reach this builder. Pure (no I/O); reuses the shell's table primitives.
   Presentation only: every number comes from the fees.ts math in the loader.
   ============================================ */

import { escapeHtml as esc } from '@/lib/export/shell';
import type { PayrollExportData, PayrollPerson } from '@/lib/export/payroll-data';
import type { TemplateConfig } from '@/lib/export/template-config';

function money(value: number, ccy: string): string {
  try {
    return new Intl.NumberFormat('en-GB', { style: 'currency', currency: ccy.toUpperCase(), maximumFractionDigits: 0 }).format(Math.round(value));
  } catch {
    return `${ccy.toUpperCase()} ${Math.round(value).toLocaleString('en-GB')}`;
  }
}
function fmtWeek(d: string): string {
  const parsed = new Date(`${d}T12:00:00`);
  if (Number.isNaN(parsed.getTime())) return esc(d);
  return parsed.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

/** The run sheet — every crew member in one table. */
function renderRunSheet(data: PayrollExportData): string {
  const ccy = data.currency;
  if (data.persons.length === 0) return `<p class="lp-native">No crew on this tour's payroll.</p>`;
  const rows = data.persons
    .map((p) => {
      const rates = `${money(p.showRate, ccy)} / ${money(p.offRate, ccy)} / ${money(p.rehearsalRate, ccy)}`;
      const days = `${p.days.show} / ${p.days.offTravel} / ${p.days.rehearsal}`;
      return `<tr>
        <td>${esc(p.name)}</td>
        <td>${esc(p.role ?? '—')}</td>
        <td class="num">${esc(rates)}</td>
        <td class="num">${esc(days)}</td>
        <td class="num">${esc(money(p.fee, ccy))}</td>
        <td class="num">${esc(money(p.perDiemTotal, ccy))}</td>
        <td class="num">${esc(money(p.total, ccy))}</td>
      </tr>`;
    })
    .join('');
  return `
    <div class="lp-sec-head">Run sheet</div>
    <div class="lp-native" style="margin:-2px 0 4px;">Rates &amp; days shown as Show / Off-travel / Rehearsal · ${esc(ccy)}</div>
    <table class="lp-tbl">
      <thead><tr>
        <th>Crew</th><th>Role</th>
        <th class="num">Rate (S/O/R)</th><th class="num">Days (S/O/R)</th>
        <th class="num">Fee</th><th class="num">Per diem</th><th class="num">Total</th>
      </tr></thead>
      <tbody>
        ${rows}
        <tr class="lp-subtotal">
          <td colspan="4">Grand total — ${data.persons.length} crew</td>
          <td class="num">${esc(money(data.grandFee, ccy))}</td>
          <td class="num">${esc(money(data.grandPerDiem, ccy))}</td>
          <td class="num">${esc(money(data.grandTotal, ccy))}</td>
        </tr>
      </tbody>
    </table>`;
}

/** One person's statement page (name, schedule, rate breakdown, amount due). */
interface StatementOpts {
  daysGrid: boolean;
  venuePerDay: boolean;
  advance: boolean;
}

const STATUS_LABEL: Record<string, string> = { show: 'Show', off_travel: 'Off / Travel', rehearsal: 'Rehearsal' };
function fmtDay(d: string): string {
  const parsed = new Date(`${d}T12:00:00`);
  if (Number.isNaN(parsed.getTime())) return esc(d);
  return parsed.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' });
}

function renderStatement(p: PayrollPerson, ccy: string, opts: StatementOpts): string {
  const baseFee = p.days.show * p.showRate + p.days.offTravel * p.offRate + p.days.rehearsal * p.rehearsalRate;
  const advance = p.fee - baseFee;

  const scheduleRows = p.weeks.length
    ? p.weeks
        .map(
          (w) => `<tr>
          <td>${fmtWeek(w.weekStart)}</td>
          <td class="num">${w.counts.show}</td>
          <td class="num">${w.counts.offTravel}</td>
          <td class="num">${w.counts.rehearsal}</td>
          <td class="num">${esc(money(w.fee, ccy))}</td>
          <td class="num">${esc(money(w.perDiem, ccy))}</td>
        </tr>`,
        )
        .join('')
    : `<tr><td colspan="6" class="lp-native">No weeks scheduled.</td></tr>`;

  const breakdown = [
    p.days.show ? ['Show days', `${p.days.show} × ${money(p.showRate, ccy)}`, p.days.show * p.showRate] : null,
    p.days.offTravel ? ['Off / travel days', `${p.days.offTravel} × ${money(p.offRate, ccy)}`, p.days.offTravel * p.offRate] : null,
    p.days.rehearsal ? ['Rehearsal days', `${p.days.rehearsal} × ${money(p.rehearsalRate, ccy)}`, p.days.rehearsal * p.rehearsalRate] : null,
    opts.advance && Math.abs(advance) >= 1 ? ['Advance', '', advance] : null,
    p.perDiemTotal ? ['Per diem', `${p.days.active} × ${money(p.perDiemRate, ccy)}`, p.perDiemTotal] : null,
  ]
    .filter((r): r is [string, string, number] => r !== null)
    .map(
      (r) => `<tr>
        <td>${esc(r[0])}</td>
        <td class="lp-native">${esc(r[1])}</td>
        <td class="num">${esc(money(r[2], ccy))}</td>
      </tr>`,
    )
    .join('');

  // Optional weekly schedule grid.
  const scheduleBlock = opts.daysGrid
    ? `
    <table class="lp-tbl">
      <thead><tr><th>Week starting</th><th class="num">Show</th><th class="num">Off/Travel</th><th class="num">Rehearsal</th><th class="num">Fee</th><th class="num">Per diem</th></tr></thead>
      <tbody>${scheduleRows}</tbody>
    </table>`
    : '';

  // Optional per-day "where we were" list (date · status · city · venue).
  const venueBlock =
    opts.venuePerDay && p.dayRows.length
      ? `
    <div class="lp-sec-head" style="font-size:11px;">Where we were</div>
    <table class="lp-tbl">
      <thead><tr><th>Date</th><th>Type</th><th>City</th><th>Venue</th></tr></thead>
      <tbody>${p.dayRows
        .map(
          (d) => `<tr><td>${fmtDay(d.date)}</td><td>${esc(STATUS_LABEL[d.status] ?? d.status)}</td><td>${esc(d.city ?? '—')}</td><td>${esc(d.venue ?? '—')}</td></tr>`,
        )
        .join('')}</tbody>
    </table>`
      : '';

  // Days worked summary line (always — invoice clarity).
  const worked = `${p.days.show + p.days.offTravel + p.days.rehearsal} day${p.days.show + p.days.offTravel + p.days.rehearsal === 1 ? '' : 's'} worked`;

  return `
    <div class="lp-page-break"></div>
    <div class="lp-sec-head">${esc(p.name)}</div>
    <div class="lp-native" style="margin:-2px 0 6px;">${[esc(p.role ?? 'Crew'), esc(ccy), esc(worked)].join('  ·  ')}</div>${scheduleBlock}${venueBlock}
    <table class="lp-tbl">
      <thead><tr><th>Breakdown</th><th></th><th class="num">Amount</th></tr></thead>
      <tbody>
        ${breakdown}
        <tr class="lp-subtotal"><td colspan="2">Amount due</td><td class="num">${esc(money(p.total, ccy))}</td></tr>
      </tbody>
    </table>`;
}

function renderStatements(data: PayrollExportData, opts: StatementOpts): string {
  if (data.persons.length === 0) return '';
  return data.persons.map((p) => renderStatement(p, data.currency, opts)).join('');
}

/** Template builder. `config.sections` drives WHICH blocks render; `config.payroll`
 *  adds the mode (combined = run sheet + statements; individual = statements only)
 *  + the invoice-clarity toggles. DEFAULT (combined, all toggles on) is the standard
 *  payroll PDF — byte-for-byte unchanged. */
export function buildPayrollBodyHtml(data: PayrollExportData, config: TemplateConfig): string {
  const opts: StatementOpts = { daysGrid: config.payroll.daysGrid, venuePerDay: config.payroll.venuePerDay, advance: config.payroll.advance };
  const sections: Record<string, () => string> = {
    'run-sheet': () => renderRunSheet(data),
    statements: () => renderStatements(data, opts),
  };
  // Individual mode → statements only (the run sheet is the combined master view).
  const visible = config.sections.filter((s) => s.show && (config.payroll.mode !== 'individual' || s.id !== 'run-sheet'));
  return visible.map((s) => sections[s.id]?.() ?? '').join('');
}
