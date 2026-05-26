/* ============================================
   LOWPASS — Budget · Spreadsheet view (Phase 3 §B + §D)

   The dense spreadsheet replacement for the prior <BudgetMainTable>
   on the Budget tab. Adopts the reference HTML aesthetic Adam sent:
   sticky stats above, filter bar, group headers spanning all
   columns, line numbers, mono numerics, sign-coloured variance,
   selected-row brand-orange left-border accent.

   Adam's product locks (do not relitigate):
   - Existing Lowpass categories stay (Production / Logistics /
     Travel / Crew / Accommodation / Catering / Marketing /
     Insurance / Contingency). Reference's category list ignored.
   - Phase tagging is additive — default grouping is Category.
   - Preserve every PR #6 + fix-up feature: BudgetLineSlideOver,
     Quick Add templates, status chips, bulk select, multi-currency
     display, duplicate-detection banner.
   - The Receipt Inbox stays as a sibling on the page; this
     component owns the line-item table only.

   §D wires the `groupBy` prop and the phase-tag chip column.
   ============================================ */

'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import {
  AlertTriangle,
  ArrowDown,
  ArrowUp,
  Columns3,
  Download,
  Filter,
  Paperclip,
  Plus,
  Search,
  Trash2,
  X,
} from 'lucide-react';
import { BudgetLineSlideOver } from '@/components/budget/BudgetLineSlideOver';
import { BudgetCellInput } from '@/components/budget/cells/BudgetCellInput';
import { useToast } from '@/components/ui/Toast';
import { convertToCurrency } from '@/lib/budget/fx';
import { getEffectiveActual, getActualState } from '@/lib/budget/transactions';
import { isIncomeRow, varianceColor } from '@/lib/budget/income-rows';
import { isUx14DerivedBudgetLine } from '@/lib/budget/budgetUx14Derived';
import { cn } from '@/lib/utils';
import type { BudgetLineItem } from '@/types';
import type { TourPhase, TourPhaseKey } from '@/server/budget/computeTourPhases';

const VALID_PHASES: ReadonlySet<TourPhaseKey> = new Set([
  'pre-prod',
  'rehearsals',
  'show-days',
  'wrap',
]);

type StatusValue = 'draft' | 'quoted' | 'approved' | 'paid' | 'disputed' | null;

const STATUS_OPTIONS: ReadonlyArray<{
  value: StatusValue;
  label: string;
  tone: string | null;
}> = [
  { value: null, label: 'All', tone: null },
  { value: 'draft', label: 'Draft', tone: 'var(--color-lp-status-not-started)' },
  { value: 'quoted', label: 'Quoted', tone: 'var(--color-lp-status-in-progress)' },
  { value: 'approved', label: 'Approved', tone: 'var(--color-lp-status-complete)' },
  { value: 'paid', label: 'Paid', tone: 'var(--color-lp-status-complete)' },
  { value: 'disputed', label: 'Disputed', tone: 'var(--color-lp-status-needs-review)' },
];

/** Adam's product lock — these are the canonical Lowpass categories. */
const CATEGORY_ORDER = [
  'production',
  'logistics',
  'travel',
  'crew',
  'accommodation',
  'catering',
  'marketing',
  'insurance',
  'contingency',
] as const;

const CATEGORY_LABEL: Record<string, string> = {
  production: 'Production',
  logistics: 'Logistics',
  travel: 'Travel',
  crew: 'Crew',
  accommodation: 'Accommodation',
  catering: 'Catering',
  marketing: 'Marketing',
  insurance: 'Insurance',
  contingency: 'Contingency',
};

/** §D — phase grouping in the order Adam asked for. Items with no
    phase_tag fall into "Unscoped" at the bottom. */
const PHASE_ORDER = ['pre_prod', 'rehearsals', 'show_days', 'wrap'] as const;
type PhaseTag = (typeof PHASE_ORDER)[number] | null;

const PHASE_LABEL: Record<NonNullable<PhaseTag>, string> = {
  pre_prod: 'Pre-prod',
  rehearsals: 'Rehearsals',
  show_days: 'Show days',
  wrap: 'Wrap',
};

const PHASE_TINT: Record<NonNullable<PhaseTag>, string> = {
  pre_prod: 'var(--color-lp-day-travel, #3B82F6)', // blue
  rehearsals: 'var(--color-lp-day-radio, #F59E0B)', // amber
  show_days: 'var(--color-lp-orange)', // brand orange
  wrap: 'var(--lp-text-tertiary)', // muted gray
};

const QUICK_ADD_TEMPLATES = [
  { label: 'Hotel Block', emoji: '🏨', category: 'accommodation', defaultLabel: 'Hotel block' },
  { label: 'Freight', emoji: '🚛', category: 'logistics', defaultLabel: 'Freight' },
  { label: 'Catering', emoji: '🍽', category: 'catering', defaultLabel: 'Catering' },
  { label: 'Local Crew', emoji: '👷', category: 'crew', defaultLabel: 'Local crew' },
] as const;

export type BudgetSpreadsheetGroupBy = 'category' | 'phase';

export interface BudgetSpreadsheetViewProps {
  lines: BudgetLineItem[];
  phases: TourPhase[];
  routingDateById: Record<string, string>;
  duplicateMap?: Record<string, string[]>;
  tourCurrency: string;
  tourId: string;
  /** §D: default grouping. The toggle inside this view persists
      changes per-tour via localStorage. */
  initialGroupBy?: BudgetSpreadsheetGroupBy;
}

function formatCurrency(value: number, currency: string): string {
  try {
    return value.toLocaleString('en-GB', {
      style: 'currency',
      currency: currency.toUpperCase(),
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    });
  } catch {
    return `${currency} ${Math.round(value)}`;
  }
}

function variance(line: BudgetLineItem, displayCurrency: string, tourCurrency: string) {
  const cur = (line.currency || tourCurrency).toUpperCase();
  const proposed = convertToCurrency(
    Number(line.proposed_cost ?? 0),
    cur,
    displayCurrency,
  );
  /* Budget Phase A §A2 — effective actual = sum of
     budget_line_item_transactions when present, else
     actual_cost fallback (§A1 derivation rule). */
  const actual = convertToCurrency(
    getEffectiveActual(line),
    cur,
    displayCurrency,
  );
  // §B spec: variance = actual − proposed. Negative reads as
  // under-budget (good, green); positive reads as over-budget (bad).
  const delta = actual - proposed;
  const pct = proposed === 0 ? null : (delta / proposed) * 100;
  return { delta, pct };
}

function phaseFor(
  line: BudgetLineItem,
  routingDateById: Map<string, string>,
  phases: TourPhase[],
): TourPhaseKey | null {
  const fallback = line.created_at?.slice(0, 10) ?? null;
  const date =
    (line.routing_id && routingDateById.get(line.routing_id)) || fallback;
  if (!date) return null;
  for (const p of phases) {
    if (p.startDate <= date && date <= p.endDate) return p.key;
  }
  return null;
}

/** §D — phase_tag is on the row directly. Cast tolerantly because
    the type wasn't extended at the time this was written. */
function phaseTagOf(line: BudgetLineItem): PhaseTag {
  const raw = (line as BudgetLineItem & { phase_tag?: string | null }).phase_tag;
  if (raw === 'pre_prod' || raw === 'rehearsals' || raw === 'show_days' || raw === 'wrap') {
    return raw;
  }
  return null;
}

const GROUP_BY_LS_PREFIX = 'lp-budget-group-by:';

export function BudgetSpreadsheetView({
  lines,
  phases,
  routingDateById,
  duplicateMap,
  tourCurrency,
  tourId,
  initialGroupBy = 'category',
}: BudgetSpreadsheetViewProps) {
  const router = useRouter();
  const { showToast } = useToast();
  const searchParams = useSearchParams();
  const rawPhase = searchParams.get('phase');
  const phaseFilter: TourPhaseKey | null =
    rawPhase && VALID_PHASES.has(rawPhase as TourPhaseKey)
      ? (rawPhase as TourPhaseKey)
      : null;
  const displayCurrency = (
    searchParams.get('display') ?? tourCurrency
  ).toUpperCase();
  const categoryFilter = searchParams.get('category');

  const [statusFilter, setStatusFilter] = useState<StatusValue>(null);
  const [search, setSearch] = useState('');
  const [openLine, setOpenLine] = useState<BudgetLineItem | null>(null);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [bulkBusy, setBulkBusy] = useState<null | 'status' | 'delete'>(null);
  const [pendingCreations, setPendingCreations] = useState<BudgetLineItem[]>([]);
  const [groupBy, setGroupBy] = useState<BudgetSpreadsheetGroupBy>(initialGroupBy);

  // §D — restore per-tour group-by preference on mount.
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const stored = window.localStorage.getItem(GROUP_BY_LS_PREFIX + tourId);
    if (stored === 'category' || stored === 'phase') setGroupBy(stored);
  }, [tourId]);

  const setGroupByPersisted = (next: BudgetSpreadsheetGroupBy) => {
    setGroupBy(next);
    if (typeof window !== 'undefined') {
      window.localStorage.setItem(GROUP_BY_LS_PREFIX + tourId, next);
    }
  };

  const dateMap = useMemo(() => {
    const m = new Map<string, string>();
    for (const [k, v] of Object.entries(routingDateById)) m.set(k, v);
    return m;
  }, [routingDateById]);

  // Optimistic creations merge.
  const allLines = useMemo(() => {
    if (pendingCreations.length === 0) return lines;
    const known = new Set(lines.map((l) => l.id));
    const extras = pendingCreations.filter((p) => !known.has(p.id));
    return extras.length > 0 ? [...extras, ...lines] : lines;
  }, [lines, pendingCreations]);

  useEffect(() => {
    if (pendingCreations.length === 0) return;
    const known = new Set(lines.map((l) => l.id));
    const stillPending = pendingCreations.filter((p) => !known.has(p.id));
    if (stillPending.length !== pendingCreations.length) {
      setPendingCreations(stillPending);
    }
  }, [lines, pendingCreations]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return allLines.filter((line) => {
      if (phaseFilter && phaseFor(line, dateMap, phases) !== phaseFilter) return false;
      if (statusFilter && (line.status ?? '').toLowerCase() !== statusFilter) {
        return false;
      }
      if (categoryFilter && (line.category ?? '').toLowerCase() !== categoryFilter.toLowerCase()) {
        return false;
      }
      if (q) {
        const hay = [
          line.label,
          line.category,
          line.notes,
          (line as BudgetLineItem & { vendor?: string }).vendor,
        ]
          .filter(Boolean)
          .join(' ')
          .toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [allLines, phaseFilter, statusFilter, categoryFilter, search, dateMap, phases]);

  // §B group structure — produce { group label, rows[] }[] in the
  // documented order. Categories not in the canonical list fall to
  // "Other" at the bottom; same for unscoped phase tags.
  const groups = useMemo(() => {
    if (groupBy === 'phase') {
      const byPhase = new Map<string, BudgetLineItem[]>();
      for (const line of filtered) {
        const tag = phaseTagOf(line);
        const key = tag ?? 'unscoped';
        (byPhase.get(key) ?? byPhase.set(key, []).get(key)!).push(line);
      }
      const out: { id: string; label: string; rows: BudgetLineItem[] }[] = [];
      for (const key of PHASE_ORDER) {
        const rows = byPhase.get(key);
        if (rows && rows.length > 0) {
          out.push({ id: key, label: PHASE_LABEL[key], rows });
        }
      }
      const unscoped = byPhase.get('unscoped');
      if (unscoped && unscoped.length > 0) {
        out.push({ id: 'unscoped', label: 'Unscoped', rows: unscoped });
      }
      return out;
    }
    // Default: group by category in canonical Lowpass order.
    const byCat = new Map<string, BudgetLineItem[]>();
    for (const line of filtered) {
      const cat = (line.category ?? 'other').toLowerCase();
      (byCat.get(cat) ?? byCat.set(cat, []).get(cat)!).push(line);
    }
    const out: { id: string; label: string; rows: BudgetLineItem[] }[] = [];
    for (const key of CATEGORY_ORDER) {
      const rows = byCat.get(key);
      if (rows && rows.length > 0) {
        out.push({ id: key, label: CATEGORY_LABEL[key], rows });
      }
    }
    // Tail catch — anything outside the canonical order.
    for (const [key, rows] of byCat.entries()) {
      if (!CATEGORY_ORDER.includes(key as (typeof CATEGORY_ORDER)[number])) {
        out.push({
          id: key,
          label: key.charAt(0).toUpperCase() + key.slice(1) + ' (other)',
          rows,
        });
      }
    }
    return out;
  }, [filtered, groupBy]);

  const totals = useMemo(() => {
    let proposed = 0;
    let actual = 0;
    for (const line of filtered) {
      const cur = (line.currency || tourCurrency).toUpperCase();
      proposed += convertToCurrency(
        Number(line.proposed_cost ?? 0),
        cur,
        displayCurrency,
      );
      actual += convertToCurrency(
        getEffectiveActual(line),
        cur,
        displayCurrency,
      );
    }
    return { proposed, actual };
  }, [filtered, tourCurrency, displayCurrency]);

  const duplicateCount = duplicateMap ? Object.keys(duplicateMap).length : 0;

  const handleQuickAdd = (template: (typeof QUICK_ADD_TEMPLATES)[number]) => {
    const now = new Date().toISOString();
    setOpenLine({
      id: `pending-${template.category}-${Date.now()}`,
      tour_id: tourId,
      workspace_id: '',
      category: template.category,
      label: template.defaultLabel,
      quantity: 1,
      proposed_cost: 0,
      actual_cost: 0,
      currency: tourCurrency,
      receipt_id: null,
      routing_id: null,
      notes: null,
      order_index: 0,
      created_at: now,
      updated_at: now,
    } as BudgetLineItem);
  };

  const handleNewLineItem = () => {
    const now = new Date().toISOString();
    setOpenLine({
      id: `pending-new-${Date.now()}`,
      tour_id: tourId,
      workspace_id: '',
      category: 'production',
      label: '',
      quantity: 1,
      proposed_cost: 0,
      actual_cost: 0,
      currency: tourCurrency,
      receipt_id: null,
      routing_id: null,
      notes: null,
      order_index: 0,
      created_at: now,
      updated_at: now,
    } as BudgetLineItem);
  };

  /* §B1.5 — open the slide-over in create mode with section
     + category pre-filled from the group the user clicked.
     The global "Add line item" button still opens a
     section-less new row. */
  const handleAddToSection = (section: string | null, defaultCategory: string) => {
    const now = new Date().toISOString();
    setOpenLine({
      id: `pending-section-${section ?? 'all'}-${Date.now()}`,
      tour_id: tourId,
      workspace_id: '',
      category: defaultCategory,
      label: '',
      quantity: 1,
      proposed_cost: 0,
      actual_cost: 0,
      currency: tourCurrency,
      receipt_id: null,
      routing_id: null,
      notes: null,
      order_index: 0,
      section: section ?? undefined,
      created_at: now,
      updated_at: now,
    } as BudgetLineItem);
  };

  /* §B1.2 — inline-edit commit handler. Used by Proposed +
     Actual cell edits in the grid. Fire-and-refresh; toast on
     failure. router.refresh re-fetches the page so the auto-
     synced actual_cost + override flag come back fresh. */
  const commitLineEdit = async (
    id: string,
    patch: Record<string, unknown>,
  ): Promise<void> => {
    try {
      const res = await fetch('/api/budget/line-items', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, ...patch }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        showToast(body.error ?? 'Save failed', 'error');
        return;
      }
      router.refresh();
    } catch (err) {
      showToast(
        err instanceof Error ? err.message : 'Save failed',
        'error',
      );
    }
  };

  const totalRowCount = filtered.length;
  let runningIndex = 0;

  return (
    <section className="space-y-3">
      {duplicateCount > 0 ? (
        <div
          className="flex items-center gap-2 rounded-md border px-3 py-2"
          style={{
            borderColor: 'var(--color-lp-status-needs-review)',
            background:
              'color-mix(in srgb, var(--color-lp-status-needs-review) 10%, transparent)',
            color: 'var(--lp-text)',
            fontSize: '13px',
          }}
        >
          <AlertTriangle
            className="h-4 w-4 shrink-0"
            style={{ color: 'var(--color-lp-status-needs-review)' }}
            aria-hidden
          />
          <span>
            {duplicateCount} {duplicateCount === 1 ? 'row' : 'rows'} flagged as
            possible duplicates — same category or vendor, amount within 5%,
            created within 7 days.
          </span>
        </div>
      ) : null}

      {/* §B.3 filter bar */}
      <div
        className="flex flex-wrap items-center gap-2 rounded-md border px-2 py-1.5"
        style={{
          borderColor: 'var(--lp-border-strong)',
          background: 'var(--lp-panel)',
        }}
      >
        <div
          className="flex flex-1 items-center gap-2 rounded-md border px-2 py-1"
          style={{
            borderColor: 'var(--lp-border)',
            background: 'var(--lp-bg)',
            minWidth: 220,
            maxWidth: 360,
          }}
        >
          <Search
            className="h-3.5 w-3.5"
            style={{ color: 'var(--lp-text-tertiary)' }}
          />
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search items, vendors, notes…"
            className="w-full bg-transparent outline-none"
            style={{
              fontSize: '13px',
              color: 'var(--lp-text)',
            }}
            aria-label="Search budget lines"
          />
        </div>

        {/* §D group-by toggle */}
        <div
          className="inline-flex items-center gap-1 rounded-md border px-1 py-0.5"
          style={{
            borderColor: 'var(--lp-border)',
            background: 'var(--lp-bg)',
          }}
          role="tablist"
          aria-label="Group by"
        >
          <span
            style={{
              fontSize: '10px',
              fontWeight: 600,
              letterSpacing: '0.08em',
              textTransform: 'uppercase',
              color: 'var(--lp-text-tertiary)',
              padding: '0 6px',
            }}
          >
            Group
          </span>
          {(['category', 'phase'] as const).map((opt) => {
            const active = groupBy === opt;
            return (
              <button
                key={opt}
                type="button"
                role="tab"
                aria-selected={active}
                onClick={() => setGroupByPersisted(opt)}
                className="btn-transition rounded px-2 py-1"
                style={{
                  fontSize: '11px',
                  fontWeight: 500,
                  background: active
                    ? 'color-mix(in srgb, var(--color-lp-orange) 12%, transparent)'
                    : 'transparent',
                  color: active
                    ? 'var(--color-lp-orange)'
                    : 'var(--lp-text-secondary)',
                }}
              >
                {opt === 'category' ? 'Category' : 'Phase'}
              </button>
            );
          })}
        </div>

        <button
          type="button"
          className="btn-transition inline-flex items-center gap-1 rounded-md border px-2 py-1"
          style={{
            borderColor: 'var(--lp-border)',
            background: 'var(--lp-bg)',
            color: 'var(--lp-text-secondary)',
            fontSize: '12px',
          }}
          title="Filter (status, phase, owner)"
        >
          <Filter className="h-3.5 w-3.5" />
          Filter
        </button>
        <button
          type="button"
          className="btn-transition inline-flex items-center gap-1 rounded-md border px-2 py-1"
          style={{
            borderColor: 'var(--lp-border)',
            background: 'var(--lp-bg)',
            color: 'var(--lp-text-secondary)',
            fontSize: '12px',
          }}
          title="Toggle column visibility"
        >
          <Columns3 className="h-3.5 w-3.5" />
          Columns
        </button>

        <span className="flex-1" />

        <span
          className="lp-mono"
          style={{
            fontSize: '11px',
            color: 'var(--lp-text-tertiary)',
          }}
        >
          {totalRowCount}/{allLines.length} · est{' '}
          {formatCurrency(totals.proposed, displayCurrency)} · act{' '}
          {formatCurrency(totals.actual, displayCurrency)}
        </span>

        <button
          type="button"
          className="btn-transition inline-flex items-center gap-1 rounded-md border px-2 py-1"
          style={{
            borderColor: 'var(--lp-border)',
            background: 'var(--lp-bg)',
            color: 'var(--lp-text-secondary)',
            fontSize: '12px',
          }}
          title="Open Reports tab for export"
        >
          <Download className="h-3.5 w-3.5" />
          Export
        </button>
        <button
          type="button"
          onClick={handleNewLineItem}
          className="btn-transition inline-flex items-center gap-1 rounded-md px-3 py-1"
          style={{
            background: 'var(--color-lp-orange)',
            color: 'var(--lp-text-inverse, #fff)',
            fontSize: '12px',
            fontWeight: 600,
          }}
        >
          <Plus className="h-3.5 w-3.5" />
          Line item
        </button>
      </div>

      {/* Status chips */}
      <div className="flex flex-wrap items-center gap-1.5">
        {STATUS_OPTIONS.map((opt) => {
          const active = statusFilter === opt.value;
          const tone = opt.tone ?? 'var(--lp-text-secondary)';
          return (
            <button
              key={String(opt.value ?? 'all')}
              type="button"
              onClick={() => setStatusFilter(opt.value)}
              className="btn-transition inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5"
              style={{
                fontSize: '11px',
                borderColor: active ? tone : 'var(--lp-border)',
                background: active
                  ? `color-mix(in srgb, ${tone} 15%, transparent)`
                  : 'var(--lp-surface)',
                color: active ? tone : 'var(--lp-text-secondary)',
                fontWeight: 500,
              }}
              aria-pressed={active}
            >
              {opt.value ? (
                <span
                  aria-hidden
                  className="h-1.5 w-1.5 rounded-full"
                  style={{ background: tone }}
                />
              ) : null}
              {opt.label}
            </button>
          );
        })}
      </div>

      {/* §B.2 dense table */}
      <div
        className="overflow-x-auto rounded-md border"
        style={{
          borderColor: 'var(--lp-border-strong)',
          background: 'var(--lp-bg)',
        }}
      >
        <table className="lp-dense w-full" style={{ borderCollapse: 'separate', borderSpacing: 0 }}>
          <thead
            className="sticky top-0 z-10"
            style={{
              background: 'var(--lp-panel)',
              borderBottom: '1px solid var(--lp-border-strong)',
            }}
          >
            <tr>
              <Th width={28}>
                <span aria-hidden> </span>
              </Th>
              <Th align="right" width={36}>#</Th>
              <Th>Item</Th>
              <Th>Vendor</Th>
              <Th width={80}>Phase</Th>
              <Th align="right" width={48}>Qty</Th>
              <Th align="right" width={92}>Est unit</Th>
              <Th align="right" width={104}>Est total</Th>
              <Th align="right" width={112}>Actual</Th>
              <Th align="right" width={96}>Variance</Th>
              <Th align="right" width={56}>Rcpts</Th>
              <Th width={92}>Status</Th>
            </tr>
          </thead>
          <tbody>
            {groups.length === 0 ? (
              <tr>
                <td
                  colSpan={12}
                  className="px-4 py-8 text-center"
                  style={{ color: 'var(--lp-text-tertiary)' }}
                >
                  No line items match the current filter.
                </td>
              </tr>
            ) : (
              groups.map((group) => {
                // Group totals computed in display currency.
                let gProposed = 0;
                let gActual = 0;
                for (const r of group.rows) {
                  const cur = (r.currency || tourCurrency).toUpperCase();
                  gProposed += convertToCurrency(
                    Number(r.proposed_cost ?? 0),
                    cur,
                    displayCurrency,
                  );
                  gActual += convertToCurrency(
                    getEffectiveActual(r),
                    cur,
                    displayCurrency,
                  );
                }
                return (
                  <GroupRows
                    key={group.id}
                    group={group}
                    runningStart={runningIndex}
                    bumpRunning={(n) => {
                      runningIndex = n;
                    }}
                    selectedIds={selectedIds}
                    setSelectedIds={setSelectedIds}
                    onOpenLine={setOpenLine}
                    duplicateMap={duplicateMap}
                    tourCurrency={tourCurrency}
                    displayCurrency={displayCurrency}
                    gProposed={gProposed}
                    gActual={gActual}
                    onCommitLine={commitLineEdit}
                    onAddRowToSection={handleAddToSection}
                  />
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* Quick Add */}
      <div className="flex flex-wrap items-center gap-2">
        <span
          style={{
            fontSize: '10px',
            fontWeight: 600,
            letterSpacing: '0.08em',
            textTransform: 'uppercase',
            color: 'var(--lp-text-tertiary)',
          }}
        >
          Quick add
        </span>
        {QUICK_ADD_TEMPLATES.map((t) => (
          <button
            key={t.category}
            type="button"
            onClick={() => handleQuickAdd(t)}
            className="btn-transition inline-flex items-center gap-1.5 rounded-md border px-2 py-1"
            style={{
              borderColor: 'var(--lp-border)',
              background: 'var(--lp-surface)',
              color: 'var(--lp-text)',
              fontSize: '12px',
              fontWeight: 500,
            }}
          >
            <span aria-hidden className="text-base leading-none">
              {t.emoji}
            </span>
            {t.label}
          </button>
        ))}
      </div>

      {openLine ? (
        <BudgetLineSlideOver
          line={openLine}
          tourId={tourId}
          tourCurrency={tourCurrency}
          onClose={() => setOpenLine(null)}
          onSaved={(savedLine) => {
            if (!savedLine?.id || savedLine.id.startsWith('pending-')) return;
            setPendingCreations((prev) => {
              const next = prev.filter((p) => p.id !== savedLine.id);
              return [savedLine, ...next];
            });
            /* §B1.1 — swap the open line so the slide-over
               transitions create → edit in place (isCreate
               flips to false, Transactions section unlocks). */
            setOpenLine(savedLine);
          }}
          onApplyAmount={() => setOpenLine(null)}
        />
      ) : null}

      {selectedIds.length > 0 ? (
        <div
          className="sticky bottom-3 z-30 mx-auto flex max-w-3xl items-center gap-3 rounded-full border px-4 py-2 shadow-lg"
          style={{
            borderColor: 'var(--lp-border-strong)',
            background: 'var(--lp-surface)',
          }}
        >
          <span
            className="lp-mono"
            style={{
              fontSize: '13px',
              color: 'var(--lp-text)',
              fontWeight: 600,
            }}
          >
            {selectedIds.length} selected
          </span>
          <span style={{ color: 'var(--lp-text-tertiary)', fontSize: '12px' }}>·</span>
          {(['approved', 'paid', 'draft'] as const).map((s) => (
            <button
              key={s}
              type="button"
              disabled={bulkBusy !== null}
              onClick={async () => {
                setBulkBusy('status');
                try {
                  await Promise.all(
                    selectedIds.map((id) =>
                      fetch('/api/budget/line-items', {
                        method: 'PATCH',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ id, status: s }),
                      }),
                    ),
                  );
                  showToast(`Marked ${selectedIds.length} as ${s}`);
                  setSelectedIds([]);
                  router.refresh();
                } catch (err) {
                  showToast(
                    err instanceof Error ? err.message : 'Bulk update failed',
                    'error',
                  );
                } finally {
                  setBulkBusy(null);
                }
              }}
              className="btn-transition rounded-md border px-2 py-1"
              style={{
                fontSize: '11px',
                borderColor: 'var(--lp-border)',
                background: 'var(--lp-bg-secondary)',
                color: 'var(--lp-text)',
                fontWeight: 500,
                opacity: bulkBusy === null ? 1 : 0.6,
              }}
            >
              Mark {s}
            </button>
          ))}
          <button
            type="button"
            disabled={bulkBusy !== null}
            onClick={async () => {
              if (!window.confirm(`Delete ${selectedIds.length} budget lines?`))
                return;
              setBulkBusy('delete');
              try {
                await Promise.all(
                  selectedIds.map((id) =>
                    fetch(`/api/budget/line-items?id=${encodeURIComponent(id)}`, {
                      method: 'DELETE',
                    }),
                  ),
                );
                showToast(`Deleted ${selectedIds.length} lines`);
                setSelectedIds([]);
                router.refresh();
              } catch (err) {
                showToast(
                  err instanceof Error ? err.message : 'Bulk delete failed',
                  'error',
                );
              } finally {
                setBulkBusy(null);
              }
            }}
            className="btn-transition inline-flex items-center gap-1 rounded-md border px-2 py-1"
            style={{
              fontSize: '11px',
              borderColor: 'var(--color-lp-status-needs-review)',
              color: 'var(--color-lp-status-needs-review)',
              background: 'transparent',
              fontWeight: 500,
              opacity: bulkBusy === null ? 1 : 0.6,
            }}
          >
            <Trash2 className="h-3 w-3" />
            Delete
          </button>
          <button
            type="button"
            onClick={() => setSelectedIds([])}
            className="btn-transition ml-auto rounded-md p-1"
            style={{ color: 'var(--lp-text-tertiary)' }}
            aria-label="Clear selection"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      ) : null}
    </section>
  );
}

/* ============================================
   Sub-components — kept inline so the spreadsheet view stays a
   single-file unit (the file is already a known surgical area).
   ============================================ */

function Th({
  children,
  align,
  width,
}: {
  children: React.ReactNode;
  align?: 'left' | 'right';
  width?: number;
}) {
  return (
    <th
      style={{
        textAlign: align ?? 'left',
        fontSize: '10px',
        fontWeight: 600,
        letterSpacing: '0.08em',
        textTransform: 'uppercase',
        color: 'var(--lp-text-tertiary)',
        padding: '6px 8px',
        borderBottom: '1px solid var(--lp-border-subtle)',
        width,
      }}
    >
      {children}
    </th>
  );
}

interface GroupRowsProps {
  group: { id: string; label: string; rows: BudgetLineItem[] };
  runningStart: number;
  bumpRunning: (n: number) => void;
  selectedIds: string[];
  /** §B1.2 — inline-edit commit. Caller wraps the network
   *  write + toast + router.refresh. */
  onCommitLine: (id: string, patch: Record<string, unknown>) => Promise<void>;
  /** §B1.5 — open create slide with section + category
   *  pre-filled from this group's row context. */
  onAddRowToSection: (section: string | null, defaultCategory: string) => void;
  setSelectedIds: (ids: string[]) => void;
  onOpenLine: (line: BudgetLineItem) => void;
  duplicateMap?: Record<string, string[]>;
  tourCurrency: string;
  displayCurrency: string;
  gProposed: number;
  gActual: number;
}

function GroupRows({
  group,
  runningStart,
  bumpRunning,
  selectedIds,
  setSelectedIds,
  onOpenLine,
  duplicateMap,
  tourCurrency,
  displayCurrency,
  gProposed,
  gActual,
  onCommitLine,
  onAddRowToSection,
}: GroupRowsProps) {
  const gDelta = gActual - gProposed;
  /* §B1.3 — group total inherits income semantics when every
     row in the group is income. Mixed groups fall back to
     expense semantics (over = bad red). */
  const groupIsIncome = group.rows.length > 0 && group.rows.every(isIncomeRow);
  const gVarPct = gProposed > 0 ? (gDelta / gProposed) * 100 : null;
  const gVarColor = varianceColor(gVarPct, groupIsIncome);
  return (
    <>
      <tr
        style={{
          background: 'var(--lp-bg-deep)',
          borderTop: '1px solid var(--lp-border-subtle)',
          borderBottom: '1px solid var(--lp-border-subtle)',
        }}
      >
        <td
          colSpan={12}
          style={{
            padding: '6px 12px',
          }}
        >
          <div className="flex items-baseline justify-between gap-3">
            <span
              style={{
                fontSize: '11px',
                fontWeight: 700,
                letterSpacing: '0.12em',
                textTransform: 'uppercase',
                color: 'var(--lp-text)',
              }}
            >
              {group.label}{' '}
              <span
                className="lp-mono"
                style={{ color: 'var(--lp-text-tertiary)', fontWeight: 500 }}
              >
                · {group.rows.length}
              </span>
            </span>
            <span
              className="lp-mono"
              style={{
                fontSize: '11px',
                color: 'var(--lp-text-tertiary)',
              }}
            >
              est {' '}
              {formatCurrency(gProposed, displayCurrency)} · act{' '}
              {formatCurrency(gActual, displayCurrency)}
              {gProposed > 0 ? (
                <>
                  {' '}· var{' '}
                  <span style={{ color: gVarColor }}>
                    {gDelta >= 0 ? '+' : ''}
                    {formatCurrency(gDelta, displayCurrency)}
                  </span>
                </>
              ) : null}
            </span>
          </div>
        </td>
      </tr>
      {group.rows.map((row, i) => {
        const lineNumber = runningStart + i + 1;
        bumpRunning(runningStart + group.rows.length);
        const selected = selectedIds.includes(row.id);
        const dupes = duplicateMap?.[row.id] ?? [];
        const cur = (row.currency || tourCurrency).toUpperCase();
        const proposed = convertToCurrency(
          Number(row.proposed_cost ?? 0),
          cur,
          displayCurrency,
        );
        const actual = convertToCurrency(
          getEffectiveActual(row),
          cur,
          displayCurrency,
        );
        /* Budget Phase A §A2 — indicator next to the Actual cell
           when 2+ transactions exist. Signals "click the row to
           open the slide-over to edit the breakdown" since the
           grid cell renders the sum of all transactions.
           §A3 — separate override marker when actual_cost
           diverges from the transaction sum. Both indicators
           can render together (e.g., a 3-txn line with a manual
           override active). */
        const actualState = getActualState(row);
        const txnCount = actualState.transactionCount;
        const hasMultiTxns = txnCount >= 2;
        const isOverride = actualState.isOverride;
        const v = variance(row, displayCurrency, tourCurrency);
        /* §B1.3 — variance color through the income-aware
           helper. Expense rows: over budget = red. Income
           rows: over forecast = green. Helper handles the
           threshold ladder + null case. */
        const varColor = varianceColor(v.pct, isIncomeRow(row));
        /* §B1.3 — Arrow icon direction reflects the
           sign-flip too: income row over-forecast = up = good
           (matches the green tone); expense over = up = bad. */
        const Icon = v.delta > 0 ? ArrowUp : v.delta < 0 ? ArrowDown : null;
        const status = (row.status ?? '').toLowerCase();
        const statusOpt = STATUS_OPTIONS.find((o) => o.value === status);
        const phaseTag = phaseTagOf(row);
        const phaseTone = phaseTag ? PHASE_TINT[phaseTag] : null;
        const attachmentCount =
          (row as BudgetLineItem & { _attachment_count?: number })
            ._attachment_count ?? 0;
        const rowBg =
          i % 2 === 0 ? 'var(--lp-bg)' : 'var(--lp-bg-deep)';
        return (
          <tr
            key={row.id}
            onClick={() => onOpenLine(row)}
            className="cursor-pointer"
            style={{
              background: rowBg,
              borderLeft: selected
                ? '2px solid var(--color-lp-orange)'
                : '2px solid transparent',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = 'var(--lp-surface)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = rowBg;
            }}
          >
            <Td onClick={(e) => e.stopPropagation()}>
              <input
                type="checkbox"
                className="lp-checkbox"
                checked={selected}
                onChange={(e) => {
                  if (e.target.checked) {
                    setSelectedIds([...selectedIds, row.id]);
                  } else {
                    setSelectedIds(selectedIds.filter((x) => x !== row.id));
                  }
                }}
                aria-label={`Select ${row.label || 'line item'}`}
              />
            </Td>
            <Td
              align="right"
              className="lp-mono"
              style={{ color: 'var(--lp-text-tertiary)', fontSize: '11px' }}
            >
              {lineNumber}
            </Td>
            <Td>
              <div className="flex min-w-0 items-center gap-1.5">
                {dupes.length > 0 ? (
                  <AlertTriangle
                    className="h-3.5 w-3.5 shrink-0"
                    style={{ color: 'var(--color-lp-status-needs-review)' }}
                    aria-label={`Possible duplicate of ${dupes.length} other line${dupes.length === 1 ? '' : 's'}`}
                  />
                ) : null}
                <span
                  className="truncate"
                  style={{ color: 'var(--lp-text)', fontWeight: 500 }}
                >
                  {row.label || '(untitled)'}
                </span>
              </div>
            </Td>
            <Td>
              <span
                className="truncate"
                style={{ color: 'var(--lp-text-secondary)' }}
              >
                {(row as BudgetLineItem & { vendor?: string }).vendor ?? '—'}
              </span>
            </Td>
            <Td>
              {phaseTag ? (
                <span
                  className="inline-flex items-center rounded px-1.5 py-0.5"
                  style={{
                    fontSize: '10px',
                    fontWeight: 600,
                    letterSpacing: '0.04em',
                    color: phaseTone ?? 'var(--lp-text-secondary)',
                    background: phaseTone
                      ? `color-mix(in srgb, ${phaseTone} 12%, transparent)`
                      : 'transparent',
                  }}
                >
                  {PHASE_LABEL[phaseTag]}
                </span>
              ) : (
                <span style={{ color: 'var(--lp-text-tertiary)' }}>—</span>
              )}
            </Td>
            <Td align="right" className="lp-mono">
              {Number(row.quantity ?? 0)}
            </Td>
            <Td align="right" className="lp-mono">
              {row.quantity && row.quantity > 0
                ? formatCurrency(proposed / Number(row.quantity), displayCurrency)
                : '—'}
            </Td>
            <Td align="right" className="lp-mono" style={{ color: 'var(--lp-text)' }}>
              {/* §B1.2 — inline-edit Proposed. Derived rows
                  (flight / hotel / gear-link) are read-only;
                  the slide-over surfaces a hint for those. */}
              <BudgetCellInput
                value={Number(row.proposed_cost ?? 0)}
                currency={(row.currency || tourCurrency).toUpperCase()}
                formatDisplay={(n) =>
                  formatCurrency(
                    convertToCurrency(
                      n,
                      (row.currency || tourCurrency).toUpperCase(),
                      displayCurrency,
                    ),
                    displayCurrency,
                  )
                }
                onCommit={(next) =>
                  void onCommitLine(row.id, { proposed_cost: next })
                }
                readOnly={isUx14DerivedBudgetLine(row)}
              />
            </Td>
            <Td
              align="right"
              className="lp-mono"
              style={{
                background: 'var(--lp-panel)',
                color: 'var(--lp-text)',
                fontWeight: 500,
              }}
            >
              {/* §B1.2 — inline-edit Actual with §B0 override
                  rules. The displayPrefix slot carries the
                  override + multi-txn indicators so they
                  render in front of the editable value (and
                  disappear cleanly during edit mode since the
                  input takes the full cell width). */}
              <BudgetCellInput
                value={Number(actualState.value ?? 0)}
                currency={(row.currency || tourCurrency).toUpperCase()}
                formatDisplay={(n) =>
                  formatCurrency(
                    convertToCurrency(
                      n,
                      (row.currency || tourCurrency).toUpperCase(),
                      displayCurrency,
                    ),
                    displayCurrency,
                  )
                }
                onCommit={(next) => {
                  /* §B0 flag rules: 0 txns → no override.
                     N>0 + value===sum → clear. N>0 + value!==sum
                     → set. Same logic as the slide-over's
                     applyActualEdit. */
                  const patch: Record<string, unknown> = { actual_cost: next };
                  if (txnCount === 0) {
                    patch.actual_cost_override = false;
                  } else {
                    const sumStr = actualState.transactionSum.toFixed(2);
                    patch.actual_cost_override = next.toFixed(2) !== sumStr;
                  }
                  void onCommitLine(row.id, patch);
                }}
                readOnly={isUx14DerivedBudgetLine(row)}
                displayPrefix={
                  <>
                    {isOverride ? (
                      <span
                        aria-label={`Manual override — does not match transactions sum (${actualState.transactionSum.toFixed(2)})`}
                        title={`Manual override — does not match transactions sum (${actualState.transactionSum.toFixed(2)})`}
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          color: 'var(--color-lp-status-needs-review)',
                          marginRight: 4,
                        }}
                      >
                        <AlertTriangle className="h-3 w-3" aria-hidden />
                      </span>
                    ) : null}
                    {hasMultiTxns ? (
                      <span
                        aria-label={`${txnCount} transactions — open detail to edit`}
                        title={`${txnCount} transactions — open detail to edit`}
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          color: 'var(--lp-text-tertiary)',
                          marginRight: 4,
                        }}
                      >
                        <Paperclip className="h-3 w-3" aria-hidden />
                      </span>
                    ) : null}
                  </>
                }
              />
            </Td>
            <Td align="right" className="lp-mono">
              {v.pct === null ? (
                <span style={{ color: 'var(--lp-text-tertiary)' }}>—</span>
              ) : (
                <span
                  className="inline-flex items-center gap-1"
                  style={{ color: varColor }}
                >
                  {Icon ? <Icon className="h-3 w-3" aria-hidden /> : null}
                  {v.pct >= 0 ? '+' : ''}
                  {v.pct.toFixed(1)}%
                </span>
              )}
            </Td>
            <Td align="right">
              {attachmentCount > 0 ? (
                <span
                  className={cn('inline-flex items-center gap-1 lp-mono')}
                  style={{
                    color: 'var(--lp-text-secondary)',
                    fontSize: '11px',
                  }}
                >
                  <Paperclip className="h-3 w-3" aria-hidden />
                  {attachmentCount}
                </span>
              ) : (
                <span style={{ color: 'var(--lp-text-tertiary)' }}>—</span>
              )}
            </Td>
            <Td>
              {statusOpt && statusOpt.tone ? (
                <span
                  className="inline-flex items-center gap-1.5 rounded-full px-2 py-0.5"
                  style={{
                    fontSize: '10px',
                    background: `color-mix(in srgb, ${statusOpt.tone} 15%, transparent)`,
                    color: statusOpt.tone,
                    fontWeight: 500,
                  }}
                >
                  <span
                    aria-hidden
                    className="h-1.5 w-1.5 rounded-full"
                    style={{ background: statusOpt.tone }}
                  />
                  {statusOpt.label}
                </span>
              ) : (
                <span style={{ color: 'var(--lp-text-tertiary)' }}>—</span>
              )}
            </Td>
          </tr>
        );
      })}

      {/* §B1.5 — per-section "+ Add row" affordance. Inherits
          section + category from the group's first row so the
          new line lands in the right bucket. Muted styling
          (matches the spec — discoverable, not noisy). The
          global "Add line item" button at the top stays for
          users who want to add a line without committing to a
          section yet. */}
      {(() => {
        const firstRow = group.rows[0];
        if (!firstRow) return null;
        const section = (firstRow.section ?? null) as string | null;
        const defaultCategory = (firstRow.category ?? 'production').toString();
        return (
          <tr>
            <td
              colSpan={12}
              style={{
                padding: '4px 12px',
                background: 'var(--lp-bg)',
                borderBottom: '1px solid var(--lp-border-subtle)',
              }}
            >
              <button
                type="button"
                onClick={() => onAddRowToSection(section, defaultCategory)}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 6,
                  fontSize: '11px',
                  color: 'var(--lp-text-tertiary)',
                  background: 'transparent',
                  border: 0,
                  padding: '2px 0',
                  cursor: 'pointer',
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.color = 'var(--color-lp-orange)';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.color = 'var(--lp-text-tertiary)';
                }}
              >
                <Plus className="h-3 w-3" aria-hidden />
                Add row to {group.label.toLowerCase()}
              </button>
            </td>
          </tr>
        );
      })()}
    </>
  );
}

function Td({
  children,
  align,
  onClick,
  className,
  style,
}: {
  children: React.ReactNode;
  align?: 'left' | 'right';
  onClick?: (e: React.MouseEvent<HTMLTableCellElement>) => void;
  className?: string;
  style?: React.CSSProperties;
}) {
  return (
    <td
      onClick={onClick}
      className={className}
      style={{
        textAlign: align ?? 'left',
        verticalAlign: 'middle',
        padding: '6px 8px',
        borderBottom: '1px solid var(--lp-border-subtle)',
        fontSize: '12px',
        ...style,
      }}
    >
      {children}
    </td>
  );
}
