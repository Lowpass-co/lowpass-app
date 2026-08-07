'use client';

/* ============================================
   LOWPASS — <PayrollRatesSpreadsheet> (canonical flat-seven, 2026-08-07)

   Adam's pin: ONE flat rates surface. Every rate column is editable for every
   person — no per-person "Rate type" selector, no relevance gating, no custom
   type machinery. Fill in what applies; every filled rate bills independently
   (sum), and a row carrying BOTH a Flat day rate and a specific day rate
   (Show/Travel/Rehearsal/Press) gets a ⚠ conflict flag (it still bills — the
   flag is a "did you mean this?" cue, not a lock).

   Column run: Person · Role · Employment · [⚠] · Flat day · Flat tour · Show ·
   Travel · Rehearsal · Press/Radio · Per diem · Advance · ‖ · Days · Total fee
   · Total PD · Notes. The totals block reads EFFECTIVE day counts (painted +
   tour-default inherited) via countsFor — the same counting path as the Days
   matrix, so the two can never disagree (the pre-261 bug: this grid counted
   only persisted paints and showed US$0 against a fully-painted matrix).

   Zero amounts render blank (not $0.00 noise); cells stay editable.
   ============================================ */

import { useCallback, useMemo, useState } from 'react';

import { SpreadsheetGrid } from '@/components/spreadsheet-grid/SpreadsheetGrid';
import type { GridColumn, GridRow, SectionHeader } from '@/components/spreadsheet-grid/types';
import PersonSlideOver from '@/components/entity/person/PersonSlideOver';
import { useToast } from '@/components/ui/Toast';
import type { PersonnelRate } from '@/types';
import { cn } from '@/lib/utils';
import type { DayCounts } from '@/lib/payroll/fees';
import { hasStackingConflict, type RateTypeMeta } from '@/lib/payroll/rateLines';
import { amountOf, personTotals, type LineAmountMap } from './rateLinesClient';

const PT_OPTIONS = [
  { value: 'principal', label: 'Principal / Mgmt' },
  { value: 'band', label: 'Band' },
  { value: 'crew', label: 'Crew' },
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

/** rate_type column id ⇄ rate_type_id. */
const RT_COL_PREFIX = 'rt_';
const rtColId = (typeId: string) => `${RT_COL_PREFIX}${typeId}`;
const rtColTypeId = (colId: string) => (colId.startsWith(RT_COL_PREFIX) ? colId.slice(RT_COL_PREFIX.length) : null);

/** Identity/meta columns before the rate columns. */
function buildLeadColumns(canSeeCommission: boolean): GridColumn<PersonnelRate>[] {
  const cols: GridColumn<PersonnelRate>[] = [
    { id: 'person_name', header: 'Person', accessor: 'person_name', type: { kind: 'text' }, width: 160, flex: true },
    { id: 'role', header: 'Role', accessor: 'role', type: { kind: 'text' }, width: 128 },
    { id: 'person_type', header: 'Employment', accessor: 'person_type', type: { kind: 'select', options: PT_OPTIONS }, width: 144 },
  ];
  if (canSeeCommission) {
    cols.push({ id: 'commission', header: 'Comm. %', accessor: 'commission', type: { kind: 'percent', decimals: 2 }, align: 'right', width: 80 });
  }
  return cols;
}

/** One editable currency column per canonical rate type, in the catalog's
 *  (already canonical) order. Cells read/write personnel_rate_lines.amount.
 *  Zero renders blank — a sea of $0.00 is noise, an empty cell is a prompt. */
function buildRateTypeColumns(rateTypes: RateTypeMeta[], amountMap: LineAmountMap, ccy: string): GridColumn<PersonnelRate>[] {
  return [...rateTypes]
    .sort((a, b) => a.orderIndex - b.orderIndex)
    .map((t) => ({
      id: rtColId(t.id),
      header: t.name,
      accessor: (r: PersonnelRate) => {
        const v = amountOf(amountMap, r.id, t.id);
        return v === 0 ? null : v;
      },
      type: { kind: 'currency' as const, currency: ccy, decimals: 2 },
      align: 'right' as const,
      width: 104,
    }));
}

/** Compact day-count summary: "9S · 4T · 2R · 1P · 3O · 2PD". */
function daysSummary(c: DayCounts): string {
  const bits = [
    c.show ? `${c.show}S` : null,
    c.offTravel ? `${c.offTravel}T` : null,
    c.rehearsal ? `${c.rehearsal}R` : null,
    c.promo ? `${c.promo}P` : null,
    c.off ? `${c.off}O` : null,
    c.pdOnly ? `${c.pdOnly}PD` : null,
  ].filter(Boolean);
  return bits.length ? bits.join(' · ') : '—';
}

const EMPTY_COUNTS: DayCounts = { show: 0, offTravel: 0, rehearsal: 0, promo: 0, off: 0, pdOnly: 0, active: 0, assigned: 0, weeks: 0 };

/** Read-only computed totals from the EFFECTIVE day counts + the rate lines. */
function buildTotalsColumns(
  currency: string,
  rateTypes: RateTypeMeta[],
  amountMap: LineAmountMap,
  countsFor: (personnelRateId: string) => DayCounts,
): GridColumn<PersonnelRate>[] {
  const ccy = currency.trim().toUpperCase() || 'GBP';
  const money = new Intl.NumberFormat('en-GB', { style: 'currency', currency: ccy, minimumFractionDigits: 0 });
  return [
    {
      id: 'days', header: 'Days', accessor: (r) => countsFor(r.id).assigned ?? 0, align: 'right', width: 110,
      type: { kind: 'computed', render: (r) => daysSummary(countsFor((r as PersonnelRate).id)) },
    },
    {
      id: 'total_fee', header: 'Total fee', accessor: (r) => personTotals(amountMap, r.id, rateTypes, countsFor(r.id)).totalFee, align: 'right', width: 120,
      type: { kind: 'computed', render: (r) => { const row = r as PersonnelRate; return money.format(personTotals(amountMap, row.id, rateTypes, countsFor(row.id)).totalFee); } },
    },
    {
      id: 'total_pd', header: 'Total PD', accessor: (r) => personTotals(amountMap, r.id, rateTypes, countsFor(r.id)).totalPerDiem, align: 'right', width: 110,
      type: { kind: 'computed', render: (r) => { const row = r as PersonnelRate; return money.format(personTotals(amountMap, row.id, rateTypes, countsFor(row.id)).totalPerDiem); } },
    },
  ];
}

export function PayrollRatesSpreadsheet({
  currency,
  initialRates,
  canSeeCommission,
  rateTypes,
  amountMap,
  countsFor,
  onRateLineCommit,
  highlightRowId,
  finalized = false,
}: {
  currency: string;
  initialRates: PersonnelRate[];
  canSeeCommission?: boolean;
  /** The canonical rate-type catalog (already filtered + ordered by the loader). */
  rateTypes: RateTypeMeta[];
  amountMap: LineAmountMap;
  /** EFFECTIVE day counts per person (painted + tour-default) — the shared
   *  counting path (usePayrollGrid.effectiveCountsFor). */
  countsFor: (personnelRateId: string) => DayCounts;
  /** Persist one cell edit (person × type). Optimistic upstream; may reject. */
  onRateLineCommit: (personnelRateId: string, rateTypeId: string, amount: number) => Promise<void>;
  /** PAY-09 deep-link — the rate card to flash on landing (Personnel → ?focus). */
  highlightRowId?: string | null;
  /** M1-C — payroll finalized: every cell read-only (the server also rejects). */
  finalized?: boolean;
}) {
  const { showToast } = useToast();
  const [rates, setRates] = useState<PersonnelRate[]>(initialRates);
  const [personOpen, setPersonOpen] = useState<string | null>(null);
  const ccy = currency.trim().toUpperCase() || 'GBP';

  const safeCountsFor = useCallback(
    (id: string): DayCounts => countsFor(id) ?? EMPTY_COUNTS,
    [countsFor],
  );

  // ⚠ Flat-day + specific-rate conflict (Adam's "warn on conflict" ruling).
  const conflictOf = useCallback(
    (personnelRateId: string): boolean =>
      hasStackingConflict((typeId) => amountOf(amountMap, personnelRateId, typeId)),
    [amountMap],
  );

  const columns = useMemo(() => {
    const lead = buildLeadColumns(!!canSeeCommission);
    const flag: GridColumn<PersonnelRate> = {
      id: 'rate_conflict',
      header: '',
      accessor: (r) => (conflictOf(r.id) ? '⚠' : ''),
      align: 'center',
      width: 36,
      type: {
        kind: 'computed',
        render: (r) =>
          conflictOf((r as PersonnelRate).id) ? (
            <span
              title="Flat day AND a specific day rate are both set — both bill (they sum). Clear one if that's not intended."
              style={{ color: 'var(--color-lp-warning)', fontStyle: 'normal', cursor: 'help' }}
            >
              ⚠
            </span>
          ) : (
            ''
          ),
      },
    };
    const rtCols = buildRateTypeColumns(rateTypes, amountMap, ccy);
    const totals = buildTotalsColumns(currency, rateTypes, amountMap, safeCountsFor);
    const notes: GridColumn<PersonnelRate> = { id: 'base_rate_note', header: 'Notes', accessor: 'base_rate_note', type: { kind: 'text' }, width: 192 };
    return [...lead, flag, ...rtCols, ...totals, notes];
  }, [currency, ccy, canSeeCommission, rateTypes, amountMap, safeCountsFor, conflictOf]);

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

      // Rate-type column → write personnel_rate_lines.amount.
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
        cellReadOnly={() => finalized /* M1-C — whole grid read-only when finalized. */}
        ariaLabel="Personnel rate cards"
        columnWidthsKey="lp-cols-payroll-v2"
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
