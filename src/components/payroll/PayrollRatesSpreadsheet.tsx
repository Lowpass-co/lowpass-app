'use client';

import { useCallback, useMemo, useState } from 'react';

import { SpreadsheetGrid } from '@/components/spreadsheet-grid/SpreadsheetGrid';
import type { GridColumn, GridRow, SectionHeader } from '@/components/spreadsheet-grid/types';
import PersonSlideOver from '@/components/entity/person/PersonSlideOver';
import { useToast } from '@/components/ui/Toast';
import type { PersonnelRate } from '@/types';
import { cn } from '@/lib/utils';

const PT_OPTIONS = [
  { value: 'principal', label: 'Principal / Mgmt' },
  { value: 'band', label: 'Band' },
  { value: 'crew', label: 'Crew' },
];

const RT_OPTIONS = [
  { value: 'day_rate', label: 'Day rate' },
  { value: 'split_rate', label: 'Split rate' },
];

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

function buildPayrollColumns(
  currency: string,
  canSeeCommission: boolean,
): GridColumn<PersonnelRate>[] {
  const ccy = currency.trim().toUpperCase() || 'GBP';
  const cols: GridColumn<PersonnelRate>[] = [
    { id: 'person_name', header: 'Person', accessor: 'person_name', type: { kind: 'text' }, width: 160 },
    { id: 'role', header: 'Role', accessor: 'role', type: { kind: 'text' }, width: 128 },
    {
      id: 'person_type',
      header: 'Employment',
      accessor: 'person_type',
      type: { kind: 'select', options: PT_OPTIONS },
      width: 144,
    },
    {
      id: 'rate_type',
      header: 'Rate type',
      accessor: 'rate_type',
      type: { kind: 'select', options: RT_OPTIONS },
      width: 128,
    },
    { id: 'show_rate', header: 'Show', accessor: 'show_rate', type: { kind: 'currency', currency: ccy, decimals: 2 }, align: 'right', width: 112 },
    { id: 'off_rate', header: 'Off', accessor: 'off_rate', type: { kind: 'currency', currency: ccy, decimals: 2 }, align: 'right', width: 112 },
    { id: 'rehearsal_rate', header: 'Reh.', accessor: 'rehearsal_rate', type: { kind: 'currency', currency: ccy, decimals: 2 }, align: 'right', width: 112 },
    { id: 'per_diem', header: 'PD', accessor: 'per_diem', type: { kind: 'currency', currency: ccy, decimals: 2 }, align: 'right', width: 112 },
  ];
  if (canSeeCommission) {
    cols.push({
      id: 'commission',
      header: 'Comm. %',
      accessor: 'commission',
      type: { kind: 'percent', decimals: 2 },
      align: 'right',
      width: 80,
    });
  }
  cols.push({
    id: 'base_rate_note',
    header: 'Notes',
    accessor: 'base_rate_note',
    type: { kind: 'text' },
    width: 192,
  });
  return cols;
}

/** UX15 — tour personnel rate cards (edit source for Budget payroll mirror). */
export function PayrollRatesSpreadsheet({
  currency,
  initialRates,
  canSeeCommission,
}: {
  currency: string;
  initialRates: PersonnelRate[];
  canSeeCommission?: boolean;
}) {
  const { showToast } = useToast();
  const [rates, setRates] = useState<PersonnelRate[]>(initialRates);
  const [personOpen, setPersonOpen] = useState<string | null>(null);

  const columns = useMemo(
    () => buildPayrollColumns(currency, !!canSeeCommission),
    [currency, canSeeCommission],
  );

  // Sort rows by group then keep insertion order within group; build section headers.
  const { gridRows, sectionHeaders } = useMemo(() => {
    const buckets: Record<GroupKey, PersonnelRate[]> = {
      principal: [],
      band: [],
      crew: [],
      other: [],
    };
    for (const r of rates) {
      buckets[groupKey(r.person_type)].push(r);
    }
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
      const patch: Record<string, unknown> = {};
      const asString = (v: unknown): string => (v === null || v === undefined ? '' : String(v));
      const asNumber = (v: unknown): number => (typeof v === 'number' ? v : Number(v) || 0);
      switch (columnId) {
        case 'person_name': patch.person_name = asString(raw).trim(); break;
        case 'role': patch.role = raw === '' || raw === null ? null : asString(raw); break;
        case 'person_type': patch.person_type = asString(raw) || 'crew'; break;
        case 'rate_type': patch.rate_type = asString(raw) || 'day_rate'; break;
        case 'show_rate': patch.show_rate = asNumber(raw); break;
        case 'off_rate': patch.off_rate = asNumber(raw); break;
        case 'rehearsal_rate': patch.rehearsal_rate = asNumber(raw); break;
        case 'per_diem': patch.per_diem = asNumber(raw); break;
        case 'commission':
          if (canSeeCommission) patch.commission = asNumber(raw);
          break;
        case 'base_rate_note': patch.base_rate_note = raw === null || raw === '' ? null : asString(raw); break;
        default: return;
      }

      setRates((prev) =>
        prev.map((r) =>
          r.id === rowId
            ? ({ ...r, ...(patch as Partial<PersonnelRate>), updated_at: new Date().toISOString() } as PersonnelRate)
            : r,
        ),
      );

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
    [showToast, canSeeCommission],
  );

  const onRowOpen = useCallback(
    (row: PersonnelRate) => {
      if (row.roster_personnel_id) {
        setPersonOpen(row.roster_personnel_id);
      } else {
        showToast('Link this row to a roster person to open their profile.', 'error');
      }
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
    <div className={cn('rounded-xl border border-lp-border bg-lp-surface shadow-sm', 'print:break-inside-avoid print:border-lp-border')}>
      <SpreadsheetGrid<PersonnelRate>
        columns={columns}
        rows={gridRows}
        sectionHeaders={sectionHeaders}
        onCommitCell={onCommitCell}
        onRowOpen={onRowOpen}
        ariaLabel="Personnel rate cards"
        columnWidthsKey="lp-cols-payroll"
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
      <p className="mb-2 px-2 text-[10px] font-semibold uppercase tracking-wider lp-table-header-text">
        Groups
      </p>
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
