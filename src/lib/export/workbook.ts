/* ============================================
   LOWPASS — Tour Accounting Workbook (X1-A)

   A six-sheet .xlsx an accountant can actually work in: Overview, Budget, Income,
   Settlements, Payroll, Per Diems. Reads like OUR budget grid (sections, mono
   numerics, provenance), not a generic dump. ExcelJS (the existing writer lib —
   only one that writes styles). Distinct from the per-surface /api/export/xlsx.

   PURE over already-loaded data (the route runs the loaders), so the XLS-01 smoke
   can build a buffer + parse it back with zero DB. Money math is NEVER recomputed:
   settlement rows come straight from the harness-proven computeWalk (via ShowWalk.
   walk); payroll totals from the SSOT loader.

   Net-new vs the old xlsx.ts: REAL =SUM() formulas (accountants edit rows and totals
   follow) and negative-red number formats.
   ============================================ */

import ExcelJS from 'exceljs';
import type { BudgetExportData } from '@/lib/export/budget-data';
import type { ShowWalk } from '@/lib/settlement/loadWalk';
import type { PayrollExportData } from '@/lib/export/payroll-data';
import type { BudgetLineItem } from '@/types';
import { isDerivedLine, perLineSourceLabel } from '@/lib/grid/budgetAdapter';
import { convertToTour } from '@/lib/budget/fxRates';

const CURRENCY_SYMBOL: Record<string, string> = { GBP: '£', USD: '$', EUR: '€', CAD: 'C$', AUD: 'A$', JPY: '¥' };

/** Money format with a negatives-in-red section (format, not a hardcoded colour). */
export function moneyFmtRed(ccy: string): string {
  const sym = CURRENCY_SYMBOL[ccy.toUpperCase()];
  const body = sym ? `"${sym}"#,##0` : `#,##0" ${ccy.toUpperCase()}"`;
  return `${body};[Red]-${body}`;
}
const QTY_FMT = '#,##0';
const num = (v: unknown): number => (Number(v) || 0);

/** A1 column letter for a 1-based column index (1→A, 27→AA). */
export function colLetter(n: number): string {
  let s = '';
  while (n > 0) {
    const m = (n - 1) % 26;
    s = String.fromCharCode(65 + m) + s;
    n = Math.floor((n - 1) / 26);
  }
  return s;
}

export interface WorkbookMeta {
  artistName: string | null;
  tourName: string;
  tourDates: string | null;
  currency: string;
  generatedOn: string;
}

export interface TourWorkbookInput {
  meta: WorkbookMeta;
  budget: BudgetExportData;
  shows: ShowWalk[];
  payroll: PayrollExportData | null;
  payrollFinalizedAt: string | null;
  /** Sheet toggles (all default true). */
  sheets?: Partial<Record<'overview' | 'budget' | 'income' | 'settlements' | 'payroll' | 'perdiems', boolean>>;
}

/** Style the header row: bold, brand fill, white, frozen (via ws views), autofilter. */
function styleHeader(ws: ExcelJS.Worksheet, cols: number): void {
  const hr = ws.getRow(1);
  hr.font = { bold: true, color: { argb: 'FFFFFFFF' } };
  hr.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFF4500' } };
  hr.alignment = { vertical: 'middle' };
  ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: cols } };
}
function autosize(ws: ExcelJS.Worksheet): void {
  ws.columns.forEach((col) => {
    let max = 9;
    col.eachCell?.({ includeEmpty: false }, (cell) => {
      const v = cell.value;
      const s = v == null ? '' : typeof v === 'object' ? String((v as { result?: unknown }).result ?? '') : String(v);
      if (s.length + 2 > max) max = Math.min(46, s.length + 2);
    });
    col.width = max;
  });
}

/* ---- 1. Overview ---- */
function overviewSheet(wb: ExcelJS.Workbook, input: TourWorkbookInput): void {
  const ws = wb.addWorksheet('Overview', { views: [{ state: 'frozen', ySplit: 1 }] });
  ws.columns = [{ key: 'k' }, { key: 'v' }];
  ws.addRow({ k: 'Field', v: 'Value' });
  styleHeader(ws, 2);
  const m = input.meta;
  const totalArtist = input.shows.reduce((s, sh) => s + sh.walk.artistTotal, 0);
  const totalOutstanding = input.shows.reduce((s, sh) => s + sh.walk.outstanding, 0);
  const rows: [string, string | number][] = [
    ['Artist', m.artistName ?? '—'],
    ['Tour', m.tourName],
    ['Dates', m.tourDates ?? '—'],
    ['Currency', m.currency],
    ['Shows', input.shows.length],
    ['Total artist settlement', totalArtist],
    ['Total outstanding', totalOutstanding],
    ['Payroll finalized', input.payrollFinalizedAt ? new Date(input.payrollFinalizedAt).toLocaleDateString('en-GB') : 'No'],
    ['Generated', m.generatedOn],
    ['Source', 'Lowpass — Tour Accounting Workbook'],
  ];
  for (const [k, v] of rows) ws.addRow({ k, v });
  ws.getColumn(2).numFmt = `General`;
  // money rows get the money format
  [6, 7].forEach((r) => (ws.getCell(`B${r + 1}`).numFmt = moneyFmtRed(m.currency)));
  autosize(ws);
}

/* ---- 2. Budget (sections + real =SUM() subtotals + grand total) ---- */
function budgetSheet(wb: ExcelJS.Workbook, input: TourWorkbookInput): void {
  const data = input.budget;
  const ccy = input.meta.currency;
  const sectionName = new Map(data.sections.map((s) => [s.id, s.name]));
  const isIncome = (l: { category?: string | null }) => (l.category ?? '').toLowerCase() === 'income';
  const lines = (data.lines as BudgetLineItem[]).filter((l) => !isIncome(l));

  const ws = wb.addWorksheet('Budget', { views: [{ state: 'frozen', ySplit: 1 }] });
  ws.columns = [
    { header: 'Section', key: 'section' },
    { header: 'Item', key: 'item' },
    { header: 'Vendor', key: 'vendor' },
    { header: 'Estimate', key: 'estimate' },
    { header: 'Actual', key: 'actual' },
    { header: 'Variance', key: 'variance' },
    { header: 'Status', key: 'status' },
    { header: 'Provenance', key: 'provenance' },
  ];
  styleHeader(ws, 8);
  const D = 'D', E = 'E', F = 'F'; // Estimate, Actual, Variance columns
  const money = moneyFmtRed(ccy);

  // Group lines by section (display name), preserving section order then leftovers.
  const groups = new Map<string, BudgetLineItem[]>();
  for (const l of lines) {
    const key = String((l.section_id ? sectionName.get(l.section_id) : null) || (l as { section?: string }).section || l.category || 'Uncategorised');
    (groups.get(key) ?? groups.set(key, []).get(key)!).push(l);
  }

  // ExcelJS only writes a formula cell when it carries a cached `result`; Excel
  // still recomputes the formula on open/edit, so the range stays live.
  const subtotalRowNumbers: number[] = [];
  const grand = { d: 0, e: 0, f: 0 };
  for (const [section, groupLines] of groups) {
    const firstDataRow = ws.rowCount + 1;
    const secSum = { d: 0, e: 0, f: 0 };
    for (const l of groupLines) {
      const lineCcy = ((l.currency as string) || ccy).toUpperCase();
      const lLock = num(l.locked_fx_rate) > 0 ? num(l.locked_fx_rate) : null;
      const estTour = convertToTour(num(l.proposed_cost), lineCcy, ccy, data.fxRates);
      const actTour = convertToTour(num(l.actual_cost), lineCcy, ccy, data.fxRates, lLock);
      const r = ws.addRow({
        section,
        item: l.label || '—',
        vendor: (l as { vendor?: string | null }).vendor ?? '',
        estimate: estTour,
        actual: actTour,
        variance: null,
        status: (l.status as string) ?? 'draft',
        provenance: isDerivedLine(l) ? `Auto · ${perLineSourceLabel(l)}` : 'Manual',
      });
      // Variance is a LIVE formula: Actual − Estimate (cached result for display).
      ws.getCell(`${F}${r.number}`).value = { formula: `${E}${r.number}-${D}${r.number}`, result: actTour - estTour };
      secSum.d += estTour; secSum.e += actTour; secSum.f += actTour - estTour;
    }
    const lastDataRow = ws.rowCount;
    if (lastDataRow >= firstDataRow) {
      const sub = ws.addRow({ section: `${section} — subtotal` });
      sub.font = { bold: true };
      sub.border = { top: { style: 'thin' } };
      const res: Record<string, number> = { D: secSum.d, E: secSum.e, F: secSum.f };
      for (const c of [D, E, F]) ws.getCell(`${c}${sub.number}`).value = { formula: `SUM(${c}${firstDataRow}:${c}${lastDataRow})`, result: res[c] };
      subtotalRowNumbers.push(sub.number);
      grand.d += secSum.d; grand.e += secSum.e; grand.f += secSum.f;
    }
  }
  // Grand total = SUM of the section subtotals (never double-counts data rows).
  if (subtotalRowNumbers.length > 0) {
    const gt = ws.addRow({ section: 'GRAND TOTAL' });
    gt.font = { bold: true };
    gt.border = { top: { style: 'double' } };
    const refs = (c: string) => subtotalRowNumbers.map((n) => `${c}${n}`).join(',');
    const gres: Record<string, number> = { D: grand.d, E: grand.e, F: grand.f };
    for (const c of [D, E, F]) ws.getCell(`${c}${gt.number}`).value = { formula: `SUM(${refs(c)})`, result: gres[c] };
  }
  for (const c of [D, E, F]) ws.getColumn(c).numFmt = money;
  autosize(ws);
}

/* ---- 3. Income (per-show actuals + FX + provenance) ---- */
function incomeSheet(wb: ExcelJS.Workbook, input: TourWorkbookInput): void {
  const ccy = input.meta.currency;
  const ws = wb.addWorksheet('Income', { views: [{ state: 'frozen', ySplit: 1 }] });
  ws.columns = [
    { header: 'Date', key: 'date' }, { header: 'Venue', key: 'venue' }, { header: 'City', key: 'city' },
    { header: 'Currency', key: 'cur' }, { header: 'FX rate', key: 'fx' }, { header: 'Locked', key: 'locked' },
    { header: 'Guarantee', key: 'guarantee' }, { header: 'Overage', key: 'overage' }, { header: 'Merch', key: 'merch' },
    { header: 'Deductions', key: 'deductions' }, { header: 'Provenance', key: 'provenance' },
  ];
  styleHeader(ws, 11);
  const money = moneyFmtRed(ccy);
  for (const i of input.budget.income) {
    // actuals_source rides on the raw budget_income row (select('*')) but isn't on
    // the IncomeInput TS shape — read it defensively.
    const src = (i as { actuals_source?: string | null }).actuals_source ?? null;
    ws.addRow({
      date: i.date ?? '', venue: i.venue_name ?? '', city: i.city ?? '',
      cur: ((i.currency as string) || ccy).toUpperCase(),
      fx: num(i.locked_fx_rate) || null, locked: i.locked_fx_rate != null ? 'Yes' : '',
      guarantee: num(i.actual_guarantee), overage: num(i.actual_overage), merch: num(i.actual_merch),
      deductions: num(i.actual_deductions),
      provenance: src === 'settlement' ? 'Auto · Settlement' : src === 'manual' ? 'Manual' : '',
    });
  }
  ['G', 'H', 'I', 'J'].forEach((c) => (ws.getColumn(c).numFmt = money));
  ws.getColumn('E').numFmt = '#,##0.0000';
  autosize(ws);
}

/* ---- 4. Settlements (from the harness-proven computeWalk — NEVER recomputed) ---- */
function settlementsSheet(wb: ExcelJS.Workbook, input: TourWorkbookInput): void {
  const ccy = input.meta.currency;
  const ws = wb.addWorksheet('Settlements', { views: [{ state: 'frozen', ySplit: 1 }] });
  ws.columns = [
    { header: 'Date', key: 'date' }, { header: 'Venue', key: 'venue' }, { header: 'City', key: 'city' },
    { header: 'Guarantee', key: 'guarantee' }, { header: 'Deductions', key: 'deductions' },
    { header: 'Adjusted gross', key: 'adjgross' }, { header: 'Expenses', key: 'expenses' },
    { header: 'Show net', key: 'shownet' }, { header: 'Artist total', key: 'artist' },
    { header: 'Payments', key: 'payments' }, { header: 'Outstanding', key: 'outstanding' },
    { header: 'Full & Final', key: 'ff' },
  ];
  styleHeader(ws, 12);
  const money = moneyFmtRed(ccy);
  for (const s of input.shows) {
    const w = s.walk;
    ws.addRow({
      date: s.date ?? '', venue: s.venue_name ?? '', city: s.city ?? '',
      guarantee: w.guarantee, deductions: w.deductionsTotal, adjgross: w.adjustedGross,
      expenses: w.expensesTotal, shownet: w.showNet, artist: w.artistTotal,
      payments: w.paymentsTotal, outstanding: w.outstanding, ff: s.fullAndFinal ? 'Yes' : '',
    });
  }
  ['D', 'E', 'F', 'G', 'H', 'I', 'J', 'K'].forEach((c) => (ws.getColumn(c).numFmt = money));
  autosize(ws);
}

/* ---- 5. Payroll (SSOT loader; finalize note in header) ---- */
function payrollSheet(wb: ExcelJS.Workbook, input: TourWorkbookInput): void {
  const ccy = input.meta.currency;
  const ws = wb.addWorksheet('Payroll', { views: [{ state: 'frozen', ySplit: 1 }] });
  ws.columns = [
    { header: 'Person', key: 'person' }, { header: 'Role', key: 'role' },
    { header: 'Show rate', key: 'showRate' }, { header: 'Off rate', key: 'offRate' }, { header: 'Reh rate', key: 'rehRate' },
    { header: 'Show days', key: 'showDays' }, { header: 'Off days', key: 'offDays' }, { header: 'Reh days', key: 'rehDays' },
    { header: 'Fee', key: 'fee' }, { header: 'Per diem', key: 'perDiem' }, { header: 'Total', key: 'total' },
  ];
  styleHeader(ws, 11);
  const money = moneyFmtRed(ccy);
  const persons = input.payroll?.persons ?? [];
  for (const p of persons) {
    ws.addRow({
      person: p.name, role: p.role ?? '',
      showRate: p.showRate, offRate: p.offRate, rehRate: p.rehearsalRate,
      showDays: p.days.show, offDays: p.days.offTravel, rehDays: p.days.rehearsal,
      fee: p.fee, perDiem: p.perDiemTotal, total: p.total,
    });
  }
  ['C', 'D', 'E', 'I', 'J', 'K'].forEach((c) => (ws.getColumn(c).numFmt = money));
  // Grand total row (SUM formulas over Fee/PerDiem/Total).
  if (persons.length > 0) {
    const first = 2, last = persons.length + 1;
    const gt = ws.addRow({ person: input.payrollFinalizedAt ? 'TOTAL (finalized)' : 'TOTAL' });
    gt.font = { bold: true };
    gt.border = { top: { style: 'thin' } };
    const res: Record<string, number> = {
      I: persons.reduce((s, p) => s + p.fee, 0),
      J: persons.reduce((s, p) => s + p.perDiemTotal, 0),
      K: persons.reduce((s, p) => s + p.total, 0),
    };
    for (const c of ['I', 'J', 'K']) ws.getCell(`${c}${gt.number}`).value = { formula: `SUM(${c}${first}:${c}${last})`, result: res[c] };
  }
  autosize(ws);
}

/* ---- 6. Per Diems (per-person rollup) ---- */
function perDiemsSheet(wb: ExcelJS.Workbook, input: TourWorkbookInput): void {
  const ccy = input.meta.currency;
  const ws = wb.addWorksheet('Per Diems', { views: [{ state: 'frozen', ySplit: 1 }] });
  ws.columns = [
    { header: 'Person', key: 'person' }, { header: 'Per diem rate', key: 'rate' },
    { header: 'Active days', key: 'days' }, { header: 'Per diem total', key: 'total' },
  ];
  styleHeader(ws, 4);
  const money = moneyFmtRed(ccy);
  const persons = input.payroll?.persons ?? [];
  for (const p of persons) {
    ws.addRow({ person: p.name, rate: p.perDiemRate, days: p.days.active, total: p.perDiemTotal });
  }
  ['B', 'D'].forEach((c) => (ws.getColumn(c).numFmt = money));
  ws.getColumn('C').numFmt = QTY_FMT;
  if (persons.length > 0) {
    const gt = ws.addRow({ person: 'TOTAL' });
    gt.font = { bold: true };
    gt.border = { top: { style: 'thin' } };
    ws.getCell(`D${gt.number}`).value = { formula: `SUM(D2:D${persons.length + 1})`, result: persons.reduce((s, p) => s + p.perDiemTotal, 0) };
  }
  autosize(ws);
}

export async function buildTourWorkbookBuffer(input: TourWorkbookInput): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'Lowpass';
  wb.created = new Date(input.meta.generatedOn);
  const on = (k: keyof NonNullable<TourWorkbookInput['sheets']>) => input.sheets?.[k] !== false;

  if (on('overview')) overviewSheet(wb, input);
  if (on('budget')) budgetSheet(wb, input);
  if (on('income')) incomeSheet(wb, input);
  if (on('settlements')) settlementsSheet(wb, input);
  if (on('payroll')) payrollSheet(wb, input);
  if (on('perdiems')) perDiemsSheet(wb, input);

  return Buffer.from(await wb.xlsx.writeBuffer());
}
