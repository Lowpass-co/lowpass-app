/* ============================================
   LOWPASS — Export Excel builder (#8 Document Export v2, Part C)

   The Excel variant of the export: a FLAT, machine-readable data grid (one row per
   line) — NOT a styled print doc. Reuses the SAME read-only loaders as the PDF path
   (so the data agrees), then emits an .xlsx workbook via SheetJS. Server-only.

   Presentation differs by format: the PDF is a branded print document; the Excel is
   a clean tabular dump for the recipient to sort/filter/total. The NUMBERS are the
   same loader output (no re-derivation).
   ============================================ */

import * as XLSX from 'xlsx';
import type { SupabaseClient } from '@supabase/supabase-js';
import { loadBudgetExportData } from '@/lib/export/budget-data';
import { loadRoomingExportData } from '@/lib/export/rooming-data';
import { loadPayrollExportData } from '@/lib/export/payroll-data';
import { loadRoutingExportData } from '@/lib/export/routing-data';
import type { ExportSurface, TemplateConfig } from '@/lib/export/template-config';
import type { BudgetExportData } from '@/lib/export/budget-data';
import type { RoomingExportData } from '@/lib/export/rooming-data';
import type { PayrollExportData } from '@/lib/export/payroll-data';
import type { RoutingExportData } from '@/lib/export/routing-data';

type Row = Array<string | number>;
type Sheet = { name: string; rows: Row[] };

const num = (v: unknown): number => (Number.isFinite(Number(v)) ? Number(v) : 0);

function sanitize(s: string, fallback: string): string {
  return s.replace(/[^\w\s-]/g, '').replace(/\s+/g, ' ').trim().slice(0, 60) || fallback;
}

// ---- per-surface flat sheets ------------------------------------------------

function budgetSheets(data: BudgetExportData): Sheet[] {
  const ccy = data.tour.currency;
  const sectionName = new Map(data.sections.map((s) => [s.id, s.name]));
  const isIncome = (l: { category?: string | null }) => (l.category ?? '').toLowerCase() === 'income';
  const rows: Row[] = [['Section', 'Item', 'Quantity', 'Currency', `Projected (${ccy})`, `Actual (${ccy})`, `Variance (${ccy})`]];
  for (const l of data.lines) {
    if (isIncome(l)) continue;
    const section = (l.section_id ? sectionName.get(l.section_id) : null) || l.section || l.category || 'Uncategorised';
    const proj = num(l.proposed_cost);
    const act = num(l.actual_cost);
    rows.push([String(section), l.label || '—', num(l.quantity), (l.currency || ccy).toUpperCase(), proj, act, act - proj]);
  }
  return [{ name: 'Budget', rows }];
}

function roomingSheets(data: RoomingExportData): Sheet[] {
  const rows: Row[] = [['Hotel', 'Address', 'City', 'Guest', 'Room type', 'Room #', 'Check-in', 'Check-out', 'Nights']];
  for (const h of data.hotels) {
    for (const r of h.rows) {
      rows.push([h.name || '—', h.address || '', h.city || '', r.guest || '—', r.roomType || '', r.roomNumber || '', r.checkIn || '', r.checkOut || '', r.nights]);
    }
  }
  return [{ name: 'Rooming', rows }];
}

function payrollSheets(data: PayrollExportData): Sheet[] {
  const ccy = data.currency;
  // EXCLUDE internal_rate (never loaded) — the flat grid carries only crew-facing rates.
  const rows: Row[] = [['Crew', 'Role', 'Show days', 'Off/Travel days', 'Rehearsal days', `Show rate (${ccy})`, `Off rate (${ccy})`, `Rehearsal rate (${ccy})`, `Per diem (${ccy})`, `Fee (${ccy})`, `Per diem total (${ccy})`, `Total (${ccy})`]];
  for (const p of data.persons) {
    rows.push([p.name, p.role || '', p.days.show, p.days.offTravel, p.days.rehearsal, p.showRate, p.offRate, p.rehearsalRate, p.perDiemRate, p.fee, p.perDiemTotal, p.total]);
  }
  rows.push(['Grand total', '', '', '', '', '', '', '', '', data.grandFee, data.grandPerDiem, data.grandTotal]);
  return [{ name: 'Payroll', rows }];
}

function routingSheets(data: RoutingExportData): Sheet[] {
  const rows: Row[] = [['Date', 'Day type', 'City', 'Venue', 'Address', 'Capacity', 'Advance status', 'Advance fields']];
  for (const d of data.days) {
    rows.push([d.date, d.dayType || '', d.city || '', d.venue || '', d.address || '', d.capacity ?? '', d.advance?.status ?? '', d.advance?.filledFields ?? '']);
  }
  return [{ name: 'Routing', rows }];
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
  let sheets: Sheet[];
  let artistName: string | null = null;
  let label: string;

  if (surface === 'budget') {
    const data = await loadBudgetExportData(supabase, tour, workspaceId, { versionId });
    sheets = budgetSheets(data);
    artistName = data.artist?.name ?? null;
    label = 'Budget';
  } else if (surface === 'rooming') {
    const data = await loadRoomingExportData(supabase, tour, workspaceId);
    sheets = roomingSheets(data);
    artistName = data.artist?.name ?? null;
    label = 'Rooming';
  } else if (surface === 'payroll') {
    const data = await loadPayrollExportData(supabase, tour, workspaceId);
    sheets = payrollSheets(data);
    artistName = data.artist?.name ?? null;
    label = 'Payroll';
  } else {
    const data = await loadRoutingExportData(supabase, tour);
    sheets = routingSheets(data);
    artistName = data.artist?.name ?? null;
    label = 'Routing';
  }

  const wb = XLSX.utils.book_new();
  for (const sheet of sheets) {
    const ws = XLSX.utils.aoa_to_sheet(sheet.rows);
    XLSX.utils.book_append_sheet(wb, ws, sheet.name);
  }
  const buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }) as Buffer;
  const filename = `${sanitize(artistName ?? '', '')} — ${sanitize(tour.name, label)} — ${label}.xlsx`.replace(/^ — /, '');
  return { buffer, filename };
}
