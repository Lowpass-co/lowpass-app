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

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useSearchParams } from 'next/navigation';
import { AlertTriangle, ArrowDown, ArrowUp, Paperclip, Plus, Trash2, X } from 'lucide-react';
import { DataTable } from '@/components/data-table/DataTable';
import { BudgetLineSlideOver } from '@/components/budget/BudgetLineSlideOver';
import { useToast } from '@/components/ui/Toast';
import { convertToCurrency } from '@/lib/budget/fx';
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

// Round 2 F1.1: status enum aligned with /api/budget/line-items
// validation. Previous values ('pending'/'rejected') triggered 400
// responses that blocked the entire batched auto-save.
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
  /** Phase E: line item id → list of OTHER ids it possibly duplicates.
   *  Computed server-side via detectDuplicates(). */
  duplicateMap?: Record<string, string[]>;
  tourCurrency: string;
  tourId: string;
};

export function BudgetMainTable({
  lines,
  phases,
  routingDateById,
  duplicateMap,
  tourCurrency,
  tourId,
}: BudgetMainTableProps) {
  const router = useRouter();
  const { showToast } = useToast();
  const searchParams = useSearchParams();
  const rawPhase = searchParams.get('phase');
  const phaseFilter: TourPhaseKey | null =
    rawPhase && VALID_PHASES.has(rawPhase as TourPhaseKey)
      ? (rawPhase as TourPhaseKey)
      : null;
  // Phase F: display currency (?display=USD) overrides the visible
  // formatting; underlying line.currency stays the source of truth.
  const displayCurrency = (
    searchParams.get('display') ?? tourCurrency
  ).toUpperCase();

  const [statusFilter, setStatusFilter] = useState<StatusValue>(null);
  const [openLine, setOpenLine] = useState<BudgetLineItem | null>(null);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [bulkBusy, setBulkBusy] = useState<null | 'status' | 'delete'>(null);
  // Round 2 F1.2: optimistic prepend for Quick Add. router.refresh()
  // fires from the slide-over for canonical sync, but Next 16 can
  // take a moment to re-stream RSC data; keeping a local cache of
  // newly-created rows means the table updates instantly on save.
  // Rows are deduped against the parent `lines` prop on every render
  // (see allLines below) so once the server data arrives, the local
  // cache transparently steps aside.
  const [pendingCreations, setPendingCreations] = useState<BudgetLineItem[]>([]);

  const dateMap = useMemo(() => {
    const m = new Map<string, string>();
    for (const [k, v] of Object.entries(routingDateById)) m.set(k, v);
    return m;
  }, [routingDateById]);

  // Merge optimistic creations with parent-supplied lines, deduped
  // by id so that as soon as router.refresh() lands the server-side
  // version, our local copy steps aside.
  const allLines = useMemo(() => {
    if (pendingCreations.length === 0) return lines;
    const known = new Set(lines.map((l) => l.id));
    const extras = pendingCreations.filter((p) => !known.has(p.id));
    return extras.length > 0 ? [...extras, ...lines] : lines;
  }, [lines, pendingCreations]);

  // Once a pending row appears in the parent `lines` (server caught
  // up), drop it from local state so we don't carry stale data.
  useEffect(() => {
    if (pendingCreations.length === 0) return;
    const known = new Set(lines.map((l) => l.id));
    const stillPending = pendingCreations.filter((p) => !known.has(p.id));
    if (stillPending.length !== pendingCreations.length) {
      setPendingCreations(stillPending);
    }
  }, [lines, pendingCreations]);

  const filtered = useMemo(() => {
    return allLines.filter((line) => {
      if (phaseFilter) {
        if (phaseFor(line, dateMap, phases) !== phaseFilter) return false;
      }
      if (statusFilter) {
        if ((line.status ?? '').toLowerCase() !== statusFilter) return false;
      }
      return true;
    });
  }, [allLines, phaseFilter, statusFilter, dateMap, phases]);

  const totals = useMemo(() => {
    let proposed = 0;
    let actual = 0;
    for (const line of filtered) {
      const rowCurrency = (line.currency || tourCurrency).toUpperCase();
      proposed +=
        convertToCurrency(
          Number(line.proposed_cost ?? 0) || 0,
          rowCurrency,
          displayCurrency,
        ) || 0;
      actual +=
        convertToCurrency(
          Number(line.actual_cost ?? 0) || 0,
          rowCurrency,
          displayCurrency,
        ) || 0;
    }
    return { proposed, actual };
  }, [filtered, tourCurrency, displayCurrency]);

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
          const dupes = duplicateMap?.[row.id] ?? [];
          return (
            <div className="flex min-w-0 flex-col">
              <span className="inline-flex items-center gap-1.5">
                {dupes.length > 0 ? (
                  <AlertTriangle
                    className="h-3.5 w-3.5 shrink-0"
                    style={{ color: 'var(--color-lp-status-needs-review)' }}
                    aria-label={`Possible duplicate of ${dupes.length} other line${dupes.length === 1 ? '' : 's'}`}
                  />
                ) : null}
                <span
                  className="truncate"
                  style={{
                    color: 'var(--lp-text)',
                    fontWeight: 'var(--lp-weight-medium)',
                  }}
                >
                  {row.label || '(untitled)'}
                </span>
              </span>
              <span
                className="truncate text-xs"
                style={{ color: 'var(--lp-text-tertiary)' }}
              >
                {(row.category ?? '—').toString()}
                {phaseLabel ? ` · ${phaseLabel}` : ''}
                {dupes.length > 0
                  ? ` · ${dupes.length} possible duplicate${dupes.length === 1 ? '' : 's'}`
                  : ''}
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
        cell: (_value, row) => {
          const native = Number(row.proposed_cost ?? 0);
          const rowCurrency = (row.currency || tourCurrency).toUpperCase();
          const converted = convertToCurrency(native, rowCurrency, displayCurrency);
          const showFootnote = rowCurrency !== displayCurrency.toUpperCase();
          return (
            <div className="flex flex-col items-end">
              <span className="tabular-nums">
                {formatCurrency(converted, displayCurrency)}
              </span>
              {showFootnote ? (
                <span
                  className="text-xs tabular-nums"
                  style={{ color: 'var(--lp-text-tertiary)' }}
                >
                  {formatCurrency(native, rowCurrency)}
                </span>
              ) : null}
            </div>
          );
        },
      },
      {
        id: 'actual_cost',
        header: 'Actual',
        align: 'right',
        accessor: (row) => Number(row.actual_cost ?? 0),
        cell: (_value, row) => {
          const native = Number(row.actual_cost ?? 0);
          const rowCurrency = (row.currency || tourCurrency).toUpperCase();
          const converted = convertToCurrency(native, rowCurrency, displayCurrency);
          const showFootnote = rowCurrency !== displayCurrency.toUpperCase();
          return (
            <div className="flex flex-col items-end">
              <span className="tabular-nums">
                {formatCurrency(converted, displayCurrency)}
              </span>
              {showFootnote ? (
                <span
                  className="text-xs tabular-nums"
                  style={{ color: 'var(--lp-text-tertiary)' }}
                >
                  {formatCurrency(native, rowCurrency)}
                </span>
              ) : null}
            </div>
          );
        },
      },
      {
        id: 'variance',
        header: 'Variance',
        align: 'right',
        accessor: (row) => variance(row).pct ?? 0,
        cell: (_value, row) => {
          const { pct, delta } = variance(row);
          if (pct === null) return <span style={{ color: 'var(--lp-text-tertiary)' }}>—</span>;
          // Escalation: >5% over → amber tint; >10% over → red tint;
          // negative deltas (under-budget) read green; near-zero stays
          // neutral.
          const isOver10 = pct > 10;
          const isOver5 = pct > 5;
          const isUnder = pct < -5;
          const tone = isOver10
            ? 'var(--color-lp-error, #EF4444)'
            : isOver5
              ? 'var(--color-lp-status-needs-review)'
              : isUnder
                ? 'var(--color-lp-status-complete)'
                : 'var(--lp-text-tertiary)';
          const wrapBg =
            isOver10
              ? 'color-mix(in srgb, var(--color-lp-error, #EF4444) 12%, transparent)'
              : isOver5
                ? 'color-mix(in srgb, var(--color-lp-status-needs-review) 12%, transparent)'
                : 'transparent';
          const Icon = delta >= 0 ? ArrowUp : ArrowDown;
          const tooltip = isOver5
            ? `${delta >= 0 ? '+' : ''}${formatCurrency(delta, row.currency || tourCurrency)} · ${pct.toFixed(1)}% over estimate`
            : isUnder
              ? `${formatCurrency(delta, row.currency || tourCurrency)} · ${pct.toFixed(1)}% under estimate`
              : `${pct.toFixed(1)}% variance`;
          return (
            <span
              className="inline-flex items-center gap-1 rounded-md px-2 py-0.5 tabular-nums"
              style={{ color: tone, background: wrapBg }}
              title={tooltip}
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
    [dateMap, phases, tourCurrency, displayCurrency, duplicateMap],
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

  // X2.3 summary: count of distinct rows that have at least one
  // possible-duplicate. Shown as a banner above the filter chips so
  // operators see the signal without scanning for icons.
  const duplicateCount = duplicateMap
    ? Object.keys(duplicateMap).length
    : 0;

  return (
    <section className="space-y-3">
      {duplicateCount > 0 ? (
        <div
          className="flex items-center gap-2 rounded-md border px-3 py-2 text-sm"
          style={{
            borderColor: 'var(--color-lp-status-needs-review)',
            background:
              'color-mix(in srgb, var(--color-lp-status-needs-review) 10%, transparent)',
            color: 'var(--lp-text)',
          }}
        >
          <AlertTriangle
            className="h-4 w-4 shrink-0"
            style={{ color: 'var(--color-lp-status-needs-review)' }}
            aria-hidden
          />
          <span>
            {duplicateCount} {duplicateCount === 1 ? 'row' : 'rows'} flagged as possible duplicates — same category or vendor, amount within 5%, created within 7 days. Look for the warning icon next to the item label.
          </span>
        </div>
      ) : null}

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
          {filtered.length} of {allLines.length} · est{' '}
          {formatCurrency(totals.proposed, displayCurrency)} · actual{' '}
          {formatCurrency(totals.actual, displayCurrency)}
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
        selectable
        selectedIds={selectedIds}
        onSelectionChange={(ids) => setSelectedIds(ids)}
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
          onSaved={(savedLine) => {
            // F1.2 round 2: optimistic prepend so Quick-Add rows
            // appear in the table without waiting for router.refresh().
            // The slide-over also calls router.refresh() in parallel
            // for canonical sync; the dedup useEffect drops local
            // copies once the server data lands.
            if (!savedLine?.id || savedLine.id.startsWith('pending-')) return;
            setPendingCreations((prev) => {
              const filtered = prev.filter((p) => p.id !== savedLine.id);
              return [savedLine, ...filtered];
            });
          }}
          onApplyAmount={() => {
            setOpenLine(null);
          }}
        />
      ) : null}

      {/* Phase E: bulk-edit sticky bar — appears when ≥1 row selected. */}
      {selectedIds.length > 0 ? (
        <div
          className="sticky bottom-3 z-30 mx-auto flex max-w-3xl items-center gap-3 rounded-full border px-4 py-2 shadow-lg"
          style={{
            borderColor: 'var(--lp-border)',
            background: 'var(--lp-surface)',
          }}
        >
          <span
            className="text-sm tabular-nums"
            style={{ color: 'var(--lp-text)', fontWeight: 'var(--lp-weight-medium)' }}
          >
            {selectedIds.length} selected
          </span>
          <span
            className="text-xs"
            style={{ color: 'var(--lp-text-tertiary)' }}
          >
            ·
          </span>
          {(['approved', 'paid', 'pending'] as const).map((s) => (
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
              className="btn-transition rounded-md border px-2 py-1 text-xs"
              style={{
                borderColor: 'var(--lp-border)',
                background: 'var(--lp-bg-secondary)',
                color: 'var(--lp-text)',
                fontWeight: 'var(--lp-weight-medium)',
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
              if (!window.confirm(`Delete ${selectedIds.length} budget lines?`)) return;
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
            className="btn-transition inline-flex items-center gap-1 rounded-md border px-2 py-1 text-xs"
            style={{
              borderColor: 'var(--color-lp-status-needs-review)',
              color: 'var(--color-lp-status-needs-review)',
              background: 'transparent',
              fontWeight: 'var(--lp-weight-medium)',
              opacity: bulkBusy === null ? 1 : 0.6,
            }}
          >
            <Trash2 className="h-3 w-3" aria-hidden />
            Delete
          </button>
          <button
            type="button"
            onClick={() => setSelectedIds([])}
            className="btn-transition ml-auto rounded-md p-1"
            style={{ color: 'var(--lp-text-tertiary)' }}
            aria-label="Clear selection"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      ) : null}
    </section>
  );
}
