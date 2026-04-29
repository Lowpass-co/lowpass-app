/* ============================================
   LOWPASS — Budget main table (Phase C budget redesign)

   Unified DataTable view of every budget_line_items row for the tour.
   Replaces the eight legacy tabs (now in src/_legacy/budget/) with a
   single primitives-driven surface filterable by phase, status, and
   free-text search. Row click opens BudgetLineSlideOver — already
   wraps the SlideOver primitive, so no chrome reinvention here.

   Phase filter reads ?phase= from URL state (set by the
   BudgetPhaseStripClient in Phase A); status chips hold local state.
   Both filters compose with the search box.

   Bulk-edit and variance / duplicate-detection callouts land in
   Phase E layered on this same component.
   ============================================ */

'use client';

import { useMemo, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { ArrowDown, ArrowUp, Paperclip, Plus } from 'lucide-react';
import { DataTable } from '@/components/data-table/DataTable';
import { BudgetLineSlideOver } from '@/components/budget/BudgetLineSlideOver';
import type { ColumnDef } from '@/components/data-table/types';
import type { BudgetLineItem } from '@/types';
import type {
  TourPhase,
  TourPhaseKey,
} from '@/server/budget/computeTourPhases';
import { cn } from '@/lib/utils';

const VALID_PHASES: ReadonlySet<TourPhaseKey> = new Set([
  'pre-prod',
  'rehearsals',
  'show-days',
  'wrap',
]);

type StatusValue = 'draft' | 'pending' | 'approved' | 'paid' | 'rejected' | null;

const STATUS_OPTIONS: ReadonlyArray<{
  value: StatusValue;
  label: string;
  tone: string | null;
}> = [
  { value: null, label: 'All', tone: null },
  { value: 'draft', label: 'Draft', tone: 'var(--color-lp-status-not-started)' },
  { value: 'pending', label: 'Pending', tone: 'var(--color-lp-status-in-progress)' },
  { value: 'approved', label: 'Approved', tone: 'var(--color-lp-status-complete)' },
  { value: 'paid', label: 'Paid', tone: 'var(--color-lp-status-complete)' },
  { value: 'rejected', label: 'Rejected', tone: 'var(--color-lp-status-needs-review)' },
];

const QUICK_ADD_TEMPLATES: Array<{
  label: string;
  emoji: string;
  category: string;
  defaultLabel: string;
}> = [
  { label: 'Hotel Block', emoji: '🏨', category: 'accommodation', defaultLabel: 'Hotel block' },
  { label: 'Freight', emoji: '🚛', category: 'logistics', defaultLabel: 'Freight' },
  { label: 'Catering', emoji: '🍽', category: 'catering', defaultLabel: 'Catering' },
  { label: 'Local Crew', emoji: '👷', category: 'crew', defaultLabel: 'Local crew' },
];

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

function variance(line: BudgetLineItem): { pct: number | null; delta: number } {
  const proposed = Number(line.proposed_cost ?? 0);
  const actual = Number(line.actual_cost ?? 0);
  const delta = actual - proposed;
  if (!Number.isFinite(proposed) || proposed === 0) return { pct: null, delta };
  return { pct: (delta / proposed) * 100, delta };
}

/** Best-effort phase membership: line items with a routing_id resolve
 *  via routingDateById; those without fall back to created_at. */
function phaseFor(
  line: BudgetLineItem,
  routingDateById: Map<string, string>,
  phases: TourPhase[],
): TourPhaseKey | null {
  const fallback = line.created_at?.slice(0, 10) ?? null;
  const date = (line.routing_id && routingDateById.get(line.routing_id)) || fallback;
  if (!date) return null;
  for (const p of phases) {
    if (p.startDate <= date && date <= p.endDate) return p.key;
  }
  return null;
}

export type BudgetMainTableProps = {
  lines: BudgetLineItem[];
  phases: TourPhase[];
  routingDateById: Record<string, string>;
  tourCurrency: string;
  tourId: string;
};

export function BudgetMainTable({
  lines,
  phases,
  routingDateById,
  tourCurrency,
  tourId,
}: BudgetMainTableProps) {
  const searchParams = useSearchParams();
  const rawPhase = searchParams.get('phase');
  const phaseFilter: TourPhaseKey | null =
    rawPhase && VALID_PHASES.has(rawPhase as TourPhaseKey)
      ? (rawPhase as TourPhaseKey)
      : null;

  const [statusFilter, setStatusFilter] = useState<StatusValue>(null);
  const [openLine, setOpenLine] = useState<BudgetLineItem | null>(null);

  const dateMap = useMemo(() => {
    const m = new Map<string, string>();
    for (const [k, v] of Object.entries(routingDateById)) m.set(k, v);
    return m;
  }, [routingDateById]);

  const filtered = useMemo(() => {
    return lines.filter((line) => {
      if (phaseFilter) {
        if (phaseFor(line, dateMap, phases) !== phaseFilter) return false;
      }
      if (statusFilter) {
        if ((line.status ?? '').toLowerCase() !== statusFilter) return false;
      }
      return true;
    });
  }, [lines, phaseFilter, statusFilter, dateMap, phases]);

  const totals = useMemo(() => {
    let proposed = 0;
    let actual = 0;
    for (const line of filtered) {
      proposed += Number(line.proposed_cost ?? 0) || 0;
      actual += Number(line.actual_cost ?? 0) || 0;
    }
    return { proposed, actual };
  }, [filtered]);

  const columns: ColumnDef<BudgetLineItem>[] = useMemo(
    () => [
      {
        id: 'label',
        header: 'Item',
        accessor: (row) => row.label ?? '',
        cell: (_value, row) => {
          const phase = phaseFor(row, dateMap, phases);
          const phaseLabel = phase
            ? phases.find((p) => p.key === phase)?.label
            : null;
          return (
            <div className="flex min-w-0 flex-col">
              <span
                className="truncate"
                style={{
                  color: 'var(--lp-text)',
                  fontWeight: 'var(--lp-weight-medium)',
                }}
              >
                {row.label || '(untitled)'}
              </span>
              <span
                className="truncate text-xs"
                style={{ color: 'var(--lp-text-tertiary)' }}
              >
                {(row.category ?? '—').toString()}
                {phaseLabel ? ` · ${phaseLabel}` : ''}
              </span>
            </div>
          );
        },
      },
      {
        id: 'proposed_cost',
        header: 'Estimated',
        align: 'right',
        accessor: (row) => Number(row.proposed_cost ?? 0),
        cell: (_value, row) => (
          <span className="tabular-nums">
            {formatCurrency(
              Number(row.proposed_cost ?? 0),
              row.currency || tourCurrency,
            )}
          </span>
        ),
      },
      {
        id: 'actual_cost',
        header: 'Actual',
        align: 'right',
        accessor: (row) => Number(row.actual_cost ?? 0),
        cell: (_value, row) => (
          <span className="tabular-nums">
            {formatCurrency(
              Number(row.actual_cost ?? 0),
              row.currency || tourCurrency,
            )}
          </span>
        ),
      },
      {
        id: 'variance',
        header: 'Variance',
        align: 'right',
        accessor: (row) => variance(row).pct ?? 0,
        cell: (_value, row) => {
          const { pct, delta } = variance(row);
          if (pct === null) return <span style={{ color: 'var(--lp-text-tertiary)' }}>—</span>;
          const tone =
            pct > 5
              ? 'var(--color-lp-status-needs-review)'
              : pct < -5
                ? 'var(--color-lp-status-complete)'
                : 'var(--lp-text-tertiary)';
          const Icon = delta >= 0 ? ArrowUp : ArrowDown;
          return (
            <span
              className="inline-flex items-center gap-1 tabular-nums"
              style={{ color: tone }}
            >
              <Icon className="h-3 w-3" aria-hidden />
              {pct.toFixed(1)}%
            </span>
          );
        },
      },
      {
        id: 'receipts',
        header: 'Receipts',
        align: 'right',
        accessor: (row) => {
          const count = (row as BudgetLineItem & { _attachment_count?: number })._attachment_count ?? 0;
          return count;
        },
        cell: (_value, row) => {
          // budget_line_item_attachments count isn't on the row by
          // default; this is a placeholder slot. Phase D wires the real
          // count through.
          const count = (row as BudgetLineItem & { _attachment_count?: number })._attachment_count ?? 0;
          return count > 0 ? (
            <span
              className="inline-flex items-center gap-1 text-xs"
              style={{ color: 'var(--lp-text-secondary)' }}
            >
              <Paperclip className="h-3 w-3" aria-hidden />
              {count}
            </span>
          ) : (
            <span style={{ color: 'var(--lp-text-tertiary)' }}>—</span>
          );
        },
      },
      {
        id: 'status',
        header: 'Status',
        accessor: (row) => row.status ?? '',
        cell: (_value, row) => {
          const status = (row.status ?? '').toLowerCase();
          const opt = STATUS_OPTIONS.find((o) => o.value === status);
          if (!opt || !opt.tone) {
            return <span style={{ color: 'var(--lp-text-tertiary)' }}>—</span>;
          }
          return (
            <span
              className="inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs"
              style={{
                background: `color-mix(in srgb, ${opt.tone} 15%, transparent)`,
                color: opt.tone,
                fontWeight: 'var(--lp-weight-medium)',
              }}
            >
              <span
                aria-hidden
                className="h-1.5 w-1.5 rounded-full"
                style={{ background: opt.tone }}
              />
              {opt.label}
            </span>
          );
        },
      },
    ],
    [dateMap, phases, tourCurrency],
  );

  const handleQuickAdd = (template: (typeof QUICK_ADD_TEMPLATES)[number]) => {
    // Open the slide-over with a synthetic seed line. The slide-over's
    // existing save flow promotes it to a real row.
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

  return (
    <section className="space-y-3">
      {/* Status filter chips */}
      <div className="flex flex-wrap items-center gap-2">
        {STATUS_OPTIONS.map((opt) => {
          const active = statusFilter === opt.value;
          const tone = opt.tone ?? 'var(--lp-text-secondary)';
          return (
            <button
              key={String(opt.value ?? 'all')}
              type="button"
              onClick={() => setStatusFilter(opt.value)}
              className={cn(
                'btn-transition inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs',
              )}
              style={{
                borderColor: active ? tone : 'var(--lp-border)',
                background: active
                  ? `color-mix(in srgb, ${tone} 15%, transparent)`
                  : 'var(--lp-surface)',
                color: active ? tone : 'var(--lp-text-secondary)',
                fontWeight: 'var(--lp-weight-medium)',
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
        <span
          className="ml-auto text-xs tabular-nums"
          style={{ color: 'var(--lp-text-tertiary)' }}
        >
          {filtered.length} of {lines.length} · est{' '}
          {formatCurrency(totals.proposed, tourCurrency)} · actual{' '}
          {formatCurrency(totals.actual, tourCurrency)}
        </span>
      </div>

      <DataTable<BudgetLineItem>
        rows={filtered}
        columns={columns}
        rowKey={(row) => row.id}
        density="comfortable"
        searchable
        searchPlaceholder="Search items, vendors, notes…"
        onRowClick={(row) => setOpenLine(row)}
      />

      {/* Quick Add templates strip */}
      <div className="flex flex-wrap items-center gap-2">
        <span
          className="text-xs"
          style={{
            color: 'var(--lp-text-tertiary)',
            fontWeight: 'var(--lp-weight-semibold)',
            letterSpacing: 'var(--lp-tracking-caps)',
            textTransform: 'uppercase',
          }}
        >
          Quick add
        </span>
        {QUICK_ADD_TEMPLATES.map((t) => (
          <button
            key={t.category}
            type="button"
            onClick={() => handleQuickAdd(t)}
            className="btn-transition inline-flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-sm"
            style={{
              borderColor: 'var(--lp-border)',
              background: 'var(--lp-surface)',
              color: 'var(--lp-text)',
              fontWeight: 'var(--lp-weight-medium)',
            }}
          >
            <span aria-hidden className="text-base leading-none">
              {t.emoji}
            </span>
            {t.label}
          </button>
        ))}
        <span
          className="inline-flex items-center gap-1 text-xs"
          style={{ color: 'var(--lp-text-tertiary)' }}
        >
          <Plus className="h-3 w-3" aria-hidden />
          opens slide-over with the template pre-filled
        </span>
      </div>

      {openLine ? (
        <BudgetLineSlideOver
          line={openLine}
          tourId={tourId}
          tourCurrency={tourCurrency}
          onClose={() => setOpenLine(null)}
          onApplyAmount={() => {
            // Math scratchpad output is owned by the slide-over; we
            // close on save so the page-level data refetches.
            setOpenLine(null);
          }}
        />
      ) : null}
    </section>
  );
}
