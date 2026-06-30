/* ============================================
   LOWPASS — Export Excel builder (#8 Document Export, v2 Part C + v2.1 Part B)

   The Excel variant — a PROPER, send-ready data file (not a styled print doc):
   auto-sized columns (no truncation), REAL numeric cells with currency/number
   formats (so totals + filters work), a styled + frozen + auto-filtered header row,
   clean per-surface columns, and a totals row where the PDF has one. Built with
   ExcelJS (the community `xlsx` can't write cell styles). Reuses the SAME read-only
   loaders as the PDF path, so the numbers agree. Server-only.
   ============================================ */

import ExcelJS from 'exceljs';
import type { SupabaseClient } from '@supabase/supabase-js';
import { convertToCurrency } from '@/lib/budget/fx';
import { loadBudgetExportData } from '@/lib/export/budget-data';
import { loadRoomingExportData } from '@/lib/export/rooming-data';
import { loadPayrollExportData } from '@/lib/export/payroll-data';
import { loadRoutingExportData } from '@/lib/export/routing-data';
import type { ExportSurface, TemplateConfig } from '@/lib/export/template-config';
import type { BudgetExportData } from '@/lib/export/budget-data';
import type { RoomingExportData } from '@/lib/export/rooming-data';
import type { PayrollExportData } from '@/lib/export/payroll-data';
import type { RoutingExportData } from '@/lib/export/routing-data';

const num = (v: unknown): number => (Number.isFinite(Number(v)) ? Number(v) : 0);

function sanitize(s: string, fallback: string): string {
  return s.replace(/[^\w\s-]/g, '').replace(/\s+/g, ' ').trim().slice(0, 60) || fallback;
}

const CURRENCY_SYMBOL: Record<string, string> = { GBP: '£', USD: '$', EUR: '€', CAD: 'C$', AUD: 'A$', JPY: '¥' };
/** An Excel number format for a money column in `ccy` (real number, thousands sep). */
function moneyFmt(ccy: string): string {
  const sym = CURRENCY_SYMBOL[ccy.toUpperCase()] ?? '';
  return sym ? `"${sym}"#,##0` : `#,##0 "${ccy.toUpperCase()}"`;
}
const QTY_FMT = '#,##0';

// ---- generic styled-sheet builder ------------------------------------------

interface Col {
  header: string;
  key: string;
  numFmt?: string;
  /** Sum this column into a totals row. */
  total?: boolean;
}
interface SheetSpec {
  name: string;
  columns: Col[];
  rows: Array<Record<string, string | number | null>>;
  totalLabel?: string; // when set + any column has total, append a totals row
}

function addSheet(wb: ExcelJS.Workbook, spec: SheetSpec): void {
  const ws = wb.addWorksheet(spec.name, { views: [{ state: 'frozen', ySplit: 1 }] });
  ws.columns = spec.columns.map((c) => ({ header: c.header, key: c.key }));

  // Header row — bold, brand fill, white text, autofilter.
  const hr = ws.getRow(1);
  hr.font = { bold: true, color: { argb: 'FFFFFFFF' } };
  hr.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFF4500' } };
  hr.alignment = { vertical: 'middle' };
  ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: spec.columns.length } };

  for (const r of spec.rows) ws.addRow(r);

  // Number formats per column.
  spec.columns.forEach((c, i) => {
    if (c.numFmt) ws.getColumn(i + 1).numFmt = c.numFmt;
  });

  // Totals row (sum the flagged columns).
  if (spec.totalLabel && spec.columns.some((c) => c.total)) {
    const totalRow: Record<string, string | number | null> = {};
    totalRow[spec.columns[0].key] = spec.totalLabel;
    for (const c of spec.columns) {
      if (c.total) totalRow[c.key] = spec.rows.reduce((s, r) => s + num(r[c.key]), 0);
    }
    const tr = ws.addRow(totalRow);
    tr.font = { bold: true };
    tr.border = { top: { style: 'thin' } };
  }

  // Auto-size columns to content (header + cells), capped.
  spec.columns.forEach((c, i) => {
    let max = c.header.length;
    for (const r of spec.rows) {
      const v = r[c.key];
      const len = v == null ? 0 : String(typeof v === 'number' ? Math.round(v).toLocaleString('en-GB') : v).length;
      if (len > max) max = len;
    }
    ws.getColumn(i + 1).width = Math.min(46, Math.max(9, max + 2));
  });
}

// ---- per-surface sheets -----------------------------------------------------

function budgetSheet(data: BudgetExportData): SheetSpec {
  const ccy = data.tour.currency;
  const sectionName = new Map(data.sections.map((s) => [s.id, s.name]));
  const isIncome = (l: { category?: string | null }) => (l.category ?? '').toLowerCase() === 'income';
  const rows = data.lines
    .filter((l) => !isIncome(l))
    .map((l) => {
      const lineCcy = (l.currency || ccy).toUpperCase();
      const proj = num(l.proposed_cost);
      const act = num(l.actual_cost);
      const projTour = convertToCurrency(proj, lineCcy, ccy);
      const actTour = convertToCurrency(act, lineCcy, ccy);
      return {
        section: String((l.section_id ? sectionName.get(l.section_id) : null) || l.section || l.category || 'Uncategorised'),
        item: l.label || '—',
        qty: num(l.quantity),
        ccy: lineCcy,
        projNative: proj,
        actNative: act,
        projTour,
        actTour,
        varTour: actTour - projTour,
      };
    });
  return {
    name: 'Budget',
    columns: [
      { header: 'Section', key: 'section' },
      { header: 'Item', key: 'item' },
      { header: 'Quantity', key: 'qty', numFmt: QTY_FMT },
      { header: 'Currency', key: 'ccy' },
      { header: 'Projected (native)', key: 'projNative', numFmt: QTY_FMT },
      { header: 'Actual (native)', key: 'actNative', numFmt: QTY_FMT },
      { header: `Projected (${ccy})`, key: 'projTour', numFmt: moneyFmt(ccy), total: true },
      { header: `Actual (${ccy})`, key: 'actTour', numFmt: moneyFmt(ccy), total: true },
      { header: `Variance (${ccy})`, key: 'varTour', numFmt: moneyFmt(ccy), total: true },
    ],
    rows,
    totalLabel: 'TOTAL',
  };
}

function roomingSheet(data: RoomingExportData): SheetSpec {
  const rows = data.hotels.flatMap((h) =>
    h.rows.map((r) => ({
      hotel: h.name || '—',
      city: h.city || '',
      guest: r.guest || '—',
      roomType: r.roomType || '',
      roomNumber: r.roomNumber || '',
      checkIn: r.checkIn || '',
      checkOut: r.checkOut || '',
      nights: r.nights,
    })),
  );
  return {
    name: 'Rooming',
    columns: [
      { header: 'Hotel', key: 'hotel' },
      { header: 'City', key: 'city' },
      { header: 'Guest', key: 'guest' },
      { header: 'Room type', key: 'roomType' },
      { header: 'Room #', key: 'roomNumber' },
      { header: 'Check-in', key: 'checkIn' },
      { header: 'Check-out', key: 'checkOut' },
      { header: 'Nights', key: 'nights', numFmt: QTY_FMT, total: true },
    ],
    rows,
    totalLabel: 'TOTAL',
  };
}

function payrollSheet(data: PayrollExportData): SheetSpec {
  const ccy = data.currency;
  const m = moneyFmt(ccy);
  // internal_rate is never loaded (D5) — crew-facing rates only.
  const rows = data.persons.map((p) => ({
    crew: p.name,
    role: p.role || '',
    showDays: p.days.show,
    offDays: p.days.offTravel,
    rehDays: p.days.rehearsal,
    showRate: p.showRate,
    offRate: p.offRate,
    rehRate: p.rehearsalRate,
    perDiem: p.perDiemRate,
    fee: p.fee,
    perDiemTotal: p.perDiemTotal,
    total: p.total,
  }));
  return {
    name: 'Payroll',
    columns: [
      { header: 'Crew', key: 'crew' },
      { header: 'Role', key: 'role' },
      { header: 'Show days', key: 'showDays', numFmt: QTY_FMT },
      { header: 'Off/Travel days', key: 'offDays', numFmt: QTY_FMT },
      { header: 'Rehearsal days', key: 'rehDays', numFmt: QTY_FMT },
      { header: `Show rate (${ccy})`, key: 'showRate', numFmt: m },
      { header: `Off rate (${ccy})`, key: 'offRate', numFmt: m },
      { header: `Rehearsal rate (${ccy})`, key: 'rehRate', numFmt: m },
      { header: `Per diem (${ccy})`, key: 'perDiem', numFmt: m },
      { header: `Fee (${ccy})`, key: 'fee', numFmt: m, total: true },
      { header: `Per diem total (${ccy})`, key: 'perDiemTotal', numFmt: m, total: true },
      { header: `Total (${ccy})`, key: 'total', numFmt: m, total: true },
    ],
    rows,
    totalLabel: 'GRAND TOTAL',
  };
}

const DAY_TYPE_LABELS: Record<string, string> = {
  show: 'Show', off: 'Off', travel: 'Travel', rehearsal: 'Rehearsal', press: 'Press', radio: 'Radio', tv: 'TV', festival: 'Festival',
};
function fmtMins(mins: number | null): string {
  if (mins == null) return '';
  const h = Math.floor(mins / 60);
  const mm = mins % 60;
  return h > 0 ? `${h}h ${mm}m` : `${mm}m`;
}

function routingSheet(data: RoutingExportData): SheetSpec {
  // Clean columns: drop capacity + the raw advance fields; add Country + Travel.
  const rows = data.days.map((d) => ({
    date: d.date,
    dayType: d.dayType ? (DAY_TYPE_LABELS[d.dayType] ?? d.dayType) : '',
    city: d.city || '',
    country: d.country || '',
    venue: d.venue || '',
    address: d.address || '',
    travel: `${d.legApprox && d.legMins != null ? '~' : ''}${fmtMins(d.legMins)}`,
  }));
  return {
    name: 'Routing',
    columns: [
      { header: 'Date', key: 'date' },
      { header: 'Day type', key: 'dayType' },
      { header: 'City', key: 'city' },
      { header: 'Country', key: 'country' },
      { header: 'Venue', key: 'venue' },
      { header: 'Address', key: 'address' },
      { header: 'Travel to next', key: 'travel' },
    ],
    rows,
  };
}

export interface XlsxBuild {
  buffer: Buffer;
  filename: string;
}

/** Load the surface's data (RLS already scoped by the route) + emit an .xlsx. */
export async function buildXlsxExport(
  surface: ExportSurface,
  supabase: SupabaseClient,
  tour: { id: string; name: string; currency: string | null; start_date: string | null; end_date: string | null; artist_id: string | null },
  workspaceId: string,
  config: TemplateConfig,
  versionId: string | null,
): Promise<XlsxBuild> {
  let spec: SheetSpec;
  let artistName: string | null = null;
  let label: string;

  if (surface === 'budget') {
    const data = await loadBudgetExportData(supabase, tour, workspaceId, { versionId });
    spec = budgetSheet(data);
    artistName = data.artist?.name ?? null;
    label = 'Budget';
  } else if (surface === 'rooming') {
    const data = await loadRoomingExportData(supabase, tour, workspaceId, { range: config.dateRange });
    spec = roomingSheet(data);
    artistName = data.artist?.name ?? null;
    label = 'Rooming';
  } else if (surface === 'payroll') {
    const data = await loadPayrollExportData(supabase, tour, workspaceId, {
      range: config.dateRange,
      personId: config.payroll.mode === 'individual' ? config.payroll.personId : null,
    });
    spec = payrollSheet(data);
    artistName = data.artist?.name ?? null;
    label = 'Payroll';
  } else {
    const data = await loadRoutingExportData(supabase, tour, { range: config.dateRange, travelTimes: config.routing.travelTimes });
    spec = routingSheet(data);
    artistName = data.artist?.name ?? null;
    label = 'Routing';
  }

  const wb = new ExcelJS.Workbook();
  wb.creator = 'Lowpass';
  addSheet(wb, spec);
  const buffer = Buffer.from(await wb.xlsx.writeBuffer());
  const filename = `${sanitize(artistName ?? '', '')} — ${sanitize(tour.name, label)} — ${label}.xlsx`.replace(/^ — /, '');
  return { buffer, filename };
}
