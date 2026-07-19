'use client';

import { useCallback, useMemo, useState } from 'react';

import { SpreadsheetGrid } from '@/components/spreadsheet-grid/SpreadsheetGrid';
import type { GridColumn, GridRow, SectionHeader } from '@/components/spreadsheet-grid/types';
import PersonSlideOver from '@/components/entity/person/PersonSlideOver';
import { useToast } from '@/components/ui/Toast';
import type { PersonnelRate } from '@/types';
import { cn } from '@/lib/utils';
import { countDayStatuses } from '@/lib/payroll/fees';
import { type RateTypeMeta, isTypeRelevant } from '@/lib/payroll/rateLines';
import { amountOf, personTotals, type LineAmountMap } from './rateLinesClient';

/** Per-person day counts, aggregated from payroll_entries. `weeks` feeds the
 *  per_week basis (Weekly rate type) — dropping it renders a weekly fee as 0. */
type PersonTotals = { show: number; offTravel: number; rehearsal: number; active: number; weeks: number };

const PT_OPTIONS = [
  { value: 'principal', label: 'Principal / Mgmt' },
  { value: 'band', label: 'Band' },
  { value: 'crew', label: 'Crew' },
];

const RT_OPTIONS = [
  { value: 'day_rate', label: 'Day rate' },
  { value: 'split_rate', label: 'Split rate' },
  { value: 'flat_tour', label: 'Flat tour' },
  { value: 'weekly', label: 'Weekly' },
  { value: 'per_diem_only', label: 'Per diem only' },
];

/** A person's rate_type, normalised (default = split). */
const rateTypeOf = (r: PersonnelRate): string => String(r.rate_type ?? 'split_rate');

const SECTION_ORDER = ['principal', 'band', 'crew', 'other'] as const;
type GroupKey = (typeof SECTION_ORDER)[number];
const SECTION_LABEL: Record<GroupKey, string> = {
  principal: 'Principal / management',
  band: 'Band',
  crew: 'Crew',
  other: 'Other',
};

function groupKey(pt: string | undefined): GroupKey {
  const p = (pt ?? 'crew').toLowerCase();
  if (p === 'principal') return 'principal';
  if (p === 'band') return 'band';
  if (p === 'crew') return 'crew';
  return 'other';
}

/** rate_type column id ⇄ rate_type_id. */
const RT_COL_PREFIX = 'rt_';
const rtColId = (typeId: string) => `${RT_COL_PREFIX}${typeId}`;
const rtColTypeId = (colId: string) => (colId.startsWith(RT_COL_PREFIX) ? colId.slice(RT_COL_PREFIX.length) : null);

/** Identity/meta columns before the dynamic rate-type columns. */
function buildLeadColumns(canSeeCommission: boolean): GridColumn<PersonnelRate>[] {
  const cols: GridColumn<PersonnelRate>[] = [
    { id: 'person_name', header: 'Person', accessor: 'person_name', type: { kind: 'text' }, width: 160, flex: true },
    { id: 'role', header: 'Role', accessor: 'role', type: { kind: 'text' }, width: 128 },
    { id: 'person_type', header: 'Employment', accessor: 'person_type', type: { kind: 'select', options: PT_OPTIONS }, width: 144 },
    { id: 'rate_type', header: 'Rate type', accessor: 'rate_type', type: { kind: 'select', options: RT_OPTIONS }, width: 128 },
  ];
  if (canSeeCommission) {
    cols.push({ id: 'commission', header: 'Comm. %', accessor: 'commission', type: { kind: 'percent', decimals: 2 }, align: 'right', width: 80 });
  }
  return cols;
}

/** One editable currency column per rate type (fee bucket first, then per-diem;
 *  each in catalog order). Cells read/write personnel_rate_lines.amount. */
function buildRateTypeColumns(rateTypes: RateTypeMeta[], amountMap: LineAmountMap, ccy: string): GridColumn<PersonnelRate>[] {
  const ordered = [...rateTypes].sort((a, b) => {
    if (a.bucket !== b.bucket) return a.bucket === 'per_diem' ? 1 : -1; // fee cols first
    return a.orderIndex - b.orderIndex;
  });
  return ordered.map((t) => ({
    id: rtColId(t.id),
    header: t.name,
    // Rate-type-driven rendering (G2-1): a cell whose type doesn't apply to the
    // person's rate_type shows BLANK (null → '') instead of £0.00 noise, and is
    // locked (see cellReadOnly below). A day-rate person shows only their Day
    // rate + Per diem; a flat person only Flat tour + Per diem; etc.
    accessor: (r: PersonnelRate) => (isTypeRelevant(rateTypeOf(r), t.id) ? amountOf(amountMap, r.id, t.id) : null),
    type: { kind: 'currency', currency: ccy, decimals: 2 },
    align: 'right',
    width: 112,
  }));
}

/** Read-only computed totals (days + fee + per-diem) from the rate lines. */
function buildTotalsColumns(
  currency: string,
  rateTypes: RateTypeMeta[],
  amountMap: LineAmountMap,
  countsByPerson: Map<string, PersonTotals>,
): GridColumn<PersonnelRate>[] {
  const ccy = currency.trim().toUpperCase() || 'GBP';
  const money = new Intl.NumberFormat('en-GB', { style: 'currency', currency: ccy, minimumFractionDigits: 0 });
  const countsOf = (id: string): PersonTotals => countsByPerson.get(id) ?? { show: 0, offTravel: 0, rehearsal: 0, active: 0, weeks: 0 };
  return [
    { id: 'show_days', header: 'Show days', accessor: (r) => countsOf(r.id).show, align: 'right', width: 90, type: { kind: 'computed', render: (r) => String(countsOf((r as PersonnelRate).id).show || '—') } },
    { id: 'off_days', header: 'Off/Travel', accessor: (r) => countsOf(r.id).offTravel, align: 'right', width: 96, type: { kind: 'computed', render: (r) => String(countsOf((r as PersonnelRate).id).offTravel || '—') } },
    { id: 'total_fee', header: 'Total fee', accessor: (r) => personTotals(amountMap, r.id, rateTypes, countsOf(r.id)).totalFee, align: 'right', width: 120, type: { kind: 'computed', render: (r) => { const row = r as PersonnelRate; return money.format(personTotals(amountMap, row.id, rateTypes, countsOf(row.id)).totalFee); } } },
    { id: 'total_pd', header: 'Total PD', accessor: (r) => personTotals(amountMap, r.id, rateTypes, countsOf(r.id)).totalPerDiem, align: 'right', width: 110, type: { kind: 'computed', render: (r) => { const row = r as PersonnelRate; return money.format(personTotals(amountMap, row.id, rateTypes, countsOf(row.id)).totalPerDiem); } } },
  ];
}

/** b2 — tour personnel rate cards. Rate amounts now live in
 *  personnel_rate_lines (dynamic columns from the workspace catalog); the
 *  legacy show/off/reh/per_diem/advance columns are frozen. */
export function PayrollRatesSpreadsheet({
  currency,
  initialRates,
  canSeeCommission,
  payrollEntries,
  rateTypes,
  amountMap,
  onRateLineCommit,
  highlightRowId,
}: {
  currency: string;
  initialRates: PersonnelRate[];
  canSeeCommission?: boolean;
  payrollEntries?: Record<string, unknown>[];
  rateTypes: RateTypeMeta[];
  amountMap: LineAmountMap;
  /** Persist one cell edit (person × type). Returns after the PATCH resolves. */
  onRateLineCommit: (personnelRateId: string, rateTypeId: string, amount: number) => Promise<void>;
  /** PAY-09 deep-link — the rate card to flash on landing (Personnel → ?focus). */
  highlightRowId?: string | null;
}) {
  const { showToast } = useToast();
  const [rates, setRates] = useState<PersonnelRate[]>(initialRates);
  const [personOpen, setPersonOpen] = useState<string | null>(null);
  const ccy = currency.trim().toUpperCase() || 'GBP';

  // Per-person day counts from payroll_entries (for the totals cols).
  const countsByPerson = useMemo(() => {
    const m = new Map<string, PersonTotals>();
    for (const e of payrollEntries ?? []) {
      const pid = e.personnel_id as string;
      const c = countDayStatuses((e.day_statuses as Record<string, string>) ?? {});
      const acc = m.get(pid) ?? { show: 0, offTravel: 0, rehearsal: 0, active: 0, weeks: 0 };
      acc.show += c.show; acc.offTravel += c.offTravel; acc.rehearsal += c.rehearsal; acc.active += c.active;
      acc.weeks += c.weeks ?? 0;
      m.set(pid, acc);
    }
    return m;
  }, [payrollEntries]);

  const columns = useMemo(() => {
    const lead = buildLeadColumns(!!canSeeCommission);
    const rtCols = buildRateTypeColumns(rateTypes, amountMap, ccy);
    const totals = payrollEntries ? buildTotalsColumns(currency, rateTypes, amountMap, countsByPerson) : [];
    const notes: GridColumn<PersonnelRate> = { id: 'base_rate_note', header: 'Notes', accessor: 'base_rate_note', type: { kind: 'text' }, width: 192 };
    return [...lead, ...rtCols, ...totals, notes];
  }, [currency, ccy, canSeeCommission, payrollEntries, countsByPerson, rateTypes, amountMap]);

  // Sort rows by group; build section headers.
  const { gridRows, sectionHeaders } = useMemo(() => {
    const buckets: Record<GroupKey, PersonnelRate[]> = { principal: [], band: [], crew: [], other: [] };
    for (const r of rates) buckets[groupKey(r.person_type)].push(r);
    const sorted: PersonnelRate[] = [];
    const headers: SectionHeader[] = [];
    let prevTrailingId: string | null = null;
    for (const sid of SECTION_ORDER) {
      const list = buckets[sid];
      if (list.length === 0) continue;
      headers.push({ afterRowId: prevTrailingId, label: SECTION_LABEL[sid], collapsible: true });
      for (const r of list) sorted.push(r);
      prevTrailingId = list[list.length - 1].id;
    }
    const rowsOut: GridRow<PersonnelRate>[] = sorted.map((r) => ({ id: r.id, data: r }));
    return { gridRows: rowsOut, sectionHeaders: headers };
  }, [rates]);

  const onCommitCell = useCallback(
    async (rowId: string, columnId: string, raw: unknown): Promise<void> => {
      const asString = (v: unknown): string => (v === null || v === undefined ? '' : String(v));
      const asNumber = (v: unknown): number => (typeof v === 'number' ? v : Number(v) || 0);

      // Dynamic rate-type column → write personnel_rate_lines.amount.
      const typeId = rtColTypeId(columnId);
      if (typeId) {
        try {
          await onRateLineCommit(rowId, typeId, asNumber(raw));
        } catch (e) {
          showToast(e instanceof Error ? e.message : 'Save failed', 'error');
        }
        return;
      }

      // Otherwise a personnel_rates.* field (identity / employment / notes).
      const patch: Record<string, unknown> = {};
      switch (columnId) {
        case 'person_name': patch.person_name = asString(raw).trim(); break;
        case 'role': patch.role = raw === '' || raw === null ? null : asString(raw); break;
        case 'person_type': patch.person_type = asString(raw) || 'crew'; break;
        case 'rate_type': patch.rate_type = asString(raw) || 'day_rate'; break;
        case 'commission': if (canSeeCommission) patch.commission = asNumber(raw); break;
        case 'base_rate_note': patch.base_rate_note = raw === null || raw === '' ? null : asString(raw); break;
        default: return;
      }
      setRates((prev) => prev.map((r) => (r.id === rowId ? ({ ...r, ...(patch as Partial<PersonnelRate>), updated_at: new Date().toISOString() } as PersonnelRate) : r)));
      try {
        const res = await fetch('/api/budget/personnel-rates', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id: rowId, ...patch }),
        });
        if (!res.ok) {
          const j = await res.json().catch(() => ({}));
          throw new Error(typeof j.error === 'string' ? j.error : 'Save failed');
        }
      } catch (e) {
        showToast(e instanceof Error ? e.message : 'Save failed', 'error');
      }
    },
    [showToast, canSeeCommission, onRateLineCommit],
  );

  const onRowOpen = useCallback(
    (row: PersonnelRate) => {
      if (row.roster_personnel_id) setPersonOpen(row.roster_personnel_id);
      else showToast('Link this row to a roster person to open their profile.', 'error');
    },
    [showToast],
  );

  if (gridRows.length === 0) {
    return (
      <p className="rounded-xl border border-dashed border-lp-border bg-lp-surface/60 px-4 py-8 text-center text-sm text-lp-text-secondary">
        No personnel rate cards yet.
      </p>
    );
  }

  return (
    <div
      className={cn('rounded-xl border border-lp-border shadow-sm', 'print:break-inside-avoid print:border-lp-border')}
      style={{ background: 'var(--lp-panel)' }}
    >
      <SpreadsheetGrid<PersonnelRate>
        columns={columns}
        rows={gridRows}
        sectionHeaders={sectionHeaders}
        onCommitCell={onCommitCell}
        onRowOpen={onRowOpen}
        cellReadOnly={(row, col) => {
          const typeId = rtColTypeId(col.id);
          return typeId ? !isTypeRelevant(rateTypeOf(row.data), typeId) : false;
        }}
        ariaLabel="Personnel rate cards"
        columnWidthsKey="lp-cols-payroll"
        highlightRowId={highlightRowId}
      />
      {personOpen ? <PersonSlideOver id={personOpen} onClose={() => setPersonOpen(null)} /> : null}
    </div>
  );
}

/** Sticky left nav for employment sections (UX15). */
export function PayrollSectionNav() {
  return (
    <nav
      className={cn(
        'print:hidden top-20 z-20 h-fit shrink-0 self-start rounded-xl border border-lp-border bg-lp-surface/95 p-2 text-sm shadow-sm backdrop-blur',
        'lg:min-w-[11rem] print:hidden',
      )}
      aria-label="Payroll groups"
    >
      <p className="mb-2 px-2 text-[10px] font-semibold uppercase tracking-wider lp-table-header-text">Groups</p>
      <ul className="flex flex-col gap-0.5">
        {SECTION_ORDER.filter((sid) => sid !== 'other').map((sid) => (
          <li key={sid}>
            <a className="block rounded-md px-3 py-1.5 text-lp-text-secondary hover:bg-lp-orange/[0.06]" href={`#payroll-${sid}`}>
              {SECTION_LABEL[sid]}
            </a>
          </li>
        ))}
      </ul>
    </nav>
  );
}
