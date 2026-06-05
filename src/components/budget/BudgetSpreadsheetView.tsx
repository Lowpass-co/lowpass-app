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

import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import {
  AlertTriangle,
  ArrowDown,
  ArrowUp,
  Check,
  Columns3,
  Download,
  Filter,
  Paperclip,
  PanelRightOpen,
  Plus,
  Search,
  Trash2,
  X,
} from 'lucide-react';
import { BudgetLineSlideOver } from '@/components/budget/BudgetLineSlideOver';
import { BudgetCellInput } from '@/components/budget/cells/BudgetCellInput';
import { useToast } from '@/components/ui/Toast';
import { convertToCurrency } from '@/lib/budget/fx';
import { useBudgetDensity } from '@/components/budget/BudgetDensityContext';
import { getEffectiveActual, getActualState } from '@/lib/budget/transactions';
import { isIncomeRow, varianceColor } from '@/lib/budget/income-rows';
import { isUx14DerivedBudgetLine } from '@/lib/budget/budgetUx14Derived';
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

/* §B1.2 — inline-edit option lists. Status can't be cleared back
   to null via the PATCH route (it validates against the 5 values),
   so the empty entry is a disabled placeholder only. Phase is
   nullable (unscoped), so its empty entry commits null. */
const STATUS_EDIT_OPTIONS: { value: string; label: string; disabled?: boolean }[] = [
  { value: '', label: '—', disabled: true },
  { value: 'draft', label: 'Draft' },
  { value: 'quoted', label: 'Quoted' },
  { value: 'approved', label: 'Approved' },
  { value: 'paid', label: 'Paid' },
  { value: 'disputed', label: 'Disputed' },
];

const PHASE_EDIT_OPTIONS: { value: string; label: string }[] = [
  { value: '', label: '—' },
  { value: 'pre_prod', label: 'Pre-prod' },
  { value: 'rehearsals', label: 'Rehearsals' },
  { value: 'show_days', label: 'Show days' },
  { value: 'wrap', label: 'Wrap' },
];

/* §B1.2 — tone lookup for the custom dropdown menu so each option
   carries the same colour dot as its rendered chip. Keyed by option
   value; status tones mirror STATUS_OPTIONS, phase tones mirror
   PHASE_TINT. Unknown / placeholder values render no dot. */
const OPTION_TONE: Record<string, string> = {
  draft: 'var(--color-lp-status-not-started)',
  quoted: 'var(--color-lp-status-in-progress)',
  approved: 'var(--color-lp-status-complete)',
  paid: 'var(--color-lp-status-complete)',
  disputed: 'var(--color-lp-status-needs-review)',
  pre_prod: PHASE_TINT.pre_prod,
  rehearsals: PHASE_TINT.rehearsals,
  show_days: PHASE_TINT.show_days,
  wrap: PHASE_TINT.wrap,
};

/* §B1.2 — vendor is encoded as the first line of `notes`
   ("Vendor: X") by the slide-over until a real column exists. Mirror
   that decode so the grid's Vendor column shows the saved value. */
function vendorFromNotes(notes?: string | null): string {
  const first = (notes ?? '').split('\n')[0] ?? '';
  return first.startsWith('Vendor: ') && first.length < 80
    ? first.slice('Vendor: '.length).trim()
    : '';
}

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
  /* Keep the slide-over mounted through its exit animation. `openLine`
     drives the open/closed state; when it goes null the panel must
     still render its last content so SlideOver can animate
     translateX(100%) out. We cache that last line in a ref (updated
     during render) and only drop it — unmounting the slide-over — once
     onExitComplete fires. The tick state forces that final unmount. */
  const lastLineRef = useRef<BudgetLineItem | null>(null);
  const [, setExitTick] = useState(0);
  if (openLine) lastLineRef.current = openLine;
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [bulkBusy, setBulkBusy] = useState<null | 'status' | 'delete'>(null);
  const [pendingCreations, setPendingCreations] = useState<BudgetLineItem[]>([]);
  /* §B1.2 — optimistic field patches keyed by line id, applied over
     `lines` so an inline commit shows instantly. Without this the cell
     flashes back to the stale server value (e.g. 0) until the
     router.refresh() round-trip lands. Cleared when fresh `lines`
     arrive from the refetch. */
  const [optimistic, setOptimistic] = useState<
    Record<string, Record<string, unknown>>
  >({});
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

  // Optimistic creations merge + optimistic field-edit overlay.
  const allLines = useMemo(() => {
    const base =
      pendingCreations.length === 0
        ? lines
        : (() => {
            const known = new Set(lines.map((l) => l.id));
            const extras = pendingCreations.filter((p) => !known.has(p.id));
            return extras.length > 0 ? [...extras, ...lines] : lines;
          })();
    if (Object.keys(optimistic).length === 0) return base;
    return base.map((l) =>
      optimistic[l.id]
        ? ({ ...l, ...optimistic[l.id] } as BudgetLineItem)
        : l,
    );
  }, [lines, pendingCreations, optimistic]);

  useEffect(() => {
    if (pendingCreations.length === 0) return;
    const known = new Set(lines.map((l) => l.id));
    const stillPending = pendingCreations.filter((p) => !known.has(p.id));
    if (stillPending.length !== pendingCreations.length) {
      setPendingCreations(stillPending);
    }
  }, [lines, pendingCreations]);

  // Fresh server rows supersede any optimistic patches.
  useEffect(() => {
    setOptimistic((prev) => (Object.keys(prev).length ? {} : prev));
  }, [lines]);

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
    const rollback = () =>
      setOptimistic((prev) => {
        const next = { ...prev };
        delete next[id];
        return next;
      });
    // Show the edit immediately (no flash back to the stale value)
    // and keep an open slide-over for this row in sync.
    setOptimistic((prev) => ({
      ...prev,
      [id]: { ...prev[id], ...patch },
    }));
    setOpenLine((cur) =>
      cur && cur.id === id
        ? ({ ...cur, ...patch } as BudgetLineItem)
        : cur,
    );
    try {
      const res = await fetch('/api/budget/line-items', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, ...patch }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        showToast(body.error ?? 'Save failed', 'error');
        rollback();
        router.refresh();
        return;
      }
      router.refresh();
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Save failed', 'error');
      rollback();
      router.refresh();
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
              <Th width={360}>Item</Th>
              <Th>Vendor</Th>
              <Th width={80}>Phase</Th>
              <Th align="right" width={120}>Estimate</Th>
              <Th align="right" width={120}>Actual</Th>
              <Th align="right" width={96}>Variance</Th>
              <Th width={92}>Status</Th>
            </tr>
          </thead>
          <tbody>
            {groups.length === 0 ? (
              <tr>
                <td
                  colSpan={9}
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

      {openLine || lastLineRef.current ? (
        <BudgetLineSlideOver
          /* open follows the live state; the rendered `line` falls
             back to the cached one so content stays put while the
             panel slides out. */
          open={!!openLine}
          line={openLine ?? lastLineRef.current!}
          tourId={tourId}
          tourCurrency={tourCurrency}
          onClose={() => setOpenLine(null)}
          onExitComplete={() => {
            // Exit transform finished — drop the cached line and force
            // the final unmount.
            lastLineRef.current = null;
            setExitTick((t) => t + 1);
          }}
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
            /* Reflect slide-over edits of existing lines back into
               the grid — pendingCreations only adds NEW rows, so
               edits to a row already in `lines` need a refetch. */
            router.refresh();
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
          colSpan={9}
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
        const rowBg =
          i % 2 === 0 ? 'var(--lp-bg)' : 'var(--lp-bg-deep)';
        return (
          <tr
            key={row.id}
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
                {/* §B1.2 — split affordances: the title TEXT is
                    inline-editable in place (click → rename, Enter/
                    blur commits, Escape cancels). The slide-over now
                    lives behind a dedicated, larger open-detail
                    button so renaming never opens the panel and
                    vice-versa. The row itself is not a click target. */}
                <InlineLabelCell
                  value={row.label ?? ''}
                  onCommit={(label) => void onCommitLine(row.id, { label })}
                />
                <button
                  type="button"
                  onClick={() => onOpenLine(row)}
                  title="Open detail"
                  aria-label={`Open ${row.label || 'line item'} detail`}
                  className="btn-transition btn-primary-press inline-flex shrink-0 items-center gap-1"
                  style={{
                    height: 24,
                    padding: '0 9px',
                    borderRadius: 6,
                    border: '1px solid var(--lp-border)',
                    background: 'var(--lp-surface)',
                    color: 'var(--lp-text-secondary)',
                    fontSize: '11px',
                    fontWeight: 600,
                    letterSpacing: '0.02em',
                    cursor: 'pointer',
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.background =
                      'color-mix(in srgb, var(--color-lp-orange) 14%, transparent)';
                    e.currentTarget.style.color = 'var(--color-lp-orange)';
                    e.currentTarget.style.borderColor = 'var(--color-lp-orange)';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.background = 'var(--lp-surface)';
                    e.currentTarget.style.color = 'var(--lp-text-secondary)';
                    e.currentTarget.style.borderColor = 'var(--lp-border)';
                  }}
                >
                  <PanelRightOpen className="h-3.5 w-3.5" aria-hidden />
                  Open
                </button>
              </div>
            </Td>
            <Td>
              <span
                className="truncate"
                style={{ color: 'var(--lp-text-secondary)' }}
              >
                {vendorFromNotes(row.notes) || '—'}
              </span>
            </Td>
            <Td>
              <InlineSelectCell
                value={phaseTag ?? ''}
                options={PHASE_EDIT_OPTIONS}
                ariaLabel="Phase"
                onCommit={(next) =>
                  void onCommitLine(row.id, {
                    phase_tag: next === '' ? null : next,
                  })
                }
              >
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
              </InlineSelectCell>
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
            <Td>
              <InlineSelectCell
                value={status}
                options={STATUS_EDIT_OPTIONS}
                ariaLabel="Status"
                onCommit={(next) => {
                  if (next && next !== status) {
                    void onCommitLine(row.id, { status: next });
                  }
                }}
              >
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
              </InlineSelectCell>
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
              colSpan={9}
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
  /* §B4 — pull vertical padding + font size from the density
     tokens. The mode-specific values live in globals.css; we
     just bind them here. Horizontal padding stays at 8px
     across modes (column widths are fixed). The .lp-mono
     class on numeric cells will pick up the larger numeric
     size from globals.css's .lp-mono override (see below). */
  const { density } = useBudgetDensity();
  return (
    <td
      onClick={onClick}
      className={className}
      data-density={density}
      style={{
        textAlign: align ?? 'left',
        verticalAlign: 'middle',
        padding: `var(--lp-row-cell-padding-y-${density}) 8px`,
        borderBottom: '1px solid var(--lp-border-subtle)',
        fontSize: `var(--lp-cell-font-size-${density})`,
        ...style,
      }}
    >
      {children}
    </td>
  );
}

/* §B1.2 — inline-editable line-item title. Closed state is a
   text-styled button (same weight/colour as the old label) with a
   subtle hover wash signalling "click to rename". Clicking swaps to
   a focused input; Enter or blur commits via onCommit, Escape
   cancels. The commit is skipped when the value is unchanged or
   empty (after trim), matching the numeric cells' optimistic path
   (the caller wires onCommit → onCommitLine(id, { label })).
   Token-clean. */
function InlineLabelCell({
  value,
  onCommit,
}: {
  value: string;
  onCommit: (next: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editing && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [editing]);

  const commit = () => {
    const trimmed = draft.trim();
    if (trimmed && trimmed !== value) onCommit(trimmed);
    setEditing(false);
  };

  const cancel = () => {
    setDraft(value);
    setEditing(false);
  };

  if (editing) {
    return (
      <input
        ref={inputRef}
        type="text"
        value={draft}
        aria-label="Edit line item name"
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            commit();
          } else if (e.key === 'Escape') {
            e.preventDefault();
            cancel();
          }
        }}
        className="min-w-0 flex-1"
        style={{
          font: 'inherit',
          fontWeight: 500,
          width: '100%',
          color: 'var(--lp-text)',
          background: 'var(--lp-surface)',
          border: '1px solid var(--color-lp-orange)',
          borderRadius: 4,
          padding: '1px 5px',
          outline: 'none',
        }}
      />
    );
  }

  return (
    <button
      type="button"
      onClick={() => {
        setDraft(value);
        setEditing(true);
      }}
      title="Click to rename"
      aria-label={`Rename ${value || 'line item'}`}
      className="btn-transition min-w-0 flex-1 truncate text-left"
      style={{
        font: 'inherit',
        fontWeight: 500,
        color: 'var(--lp-text)',
        background: 'transparent',
        border: '1px solid transparent',
        borderRadius: 4,
        padding: '1px 5px',
        margin: '-1px -5px',
        cursor: 'text',
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.background = 'var(--lp-bg-deep)';
        e.currentTarget.style.borderColor = 'var(--lp-border)';
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.background = 'transparent';
        e.currentTarget.style.borderColor = 'transparent';
      }}
    >
      {value || '(untitled)'}
    </button>
  );
}

/* §B1.2 — inline select editor for the Status + Phase cells.
   Closed display is whatever the caller passes as children (the
   coloured chip), so the at-a-glance read is preserved. Clicking
   opens a custom popover menu (not a native <select>) styled to
   match the chips — rounded, tokenised, with a tone dot per option
   and a check on the current value. The menu is fixed-positioned
   (anchored to the trigger via getBoundingClientRect) so it escapes
   the table's overflow clip. Closes on outside-click, Escape, or
   scroll/resize; arrow keys move the active option, Enter selects.
   Props + the onCommit(value) contract are unchanged. */
function InlineSelectCell({
  value,
  options,
  onCommit,
  ariaLabel,
  readOnly = false,
  children,
}: {
  value: string;
  options: { value: string; label: string; disabled?: boolean }[];
  onCommit: (next: string) => void;
  ariaLabel: string;
  readOnly?: boolean;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const [coords, setCoords] = useState<{
    top: number;
    left: number;
    width: number;
  } | null>(null);
  const [activeIndex, setActiveIndex] = useState(-1);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  // Selectable options exclude the disabled placeholder (e.g. the
  // status "—" that the PATCH route won't accept).
  const selectable = options.filter((o) => !o.disabled);

  const closeMenu = () => {
    setOpen(false);
    setActiveIndex(-1);
  };

  const openMenu = () => {
    const rect = buttonRef.current?.getBoundingClientRect();
    if (rect) {
      setCoords({
        top: rect.bottom + 4,
        left: rect.left,
        width: Math.max(rect.width, 150),
      });
    }
    const idx = selectable.findIndex((o) => o.value === value);
    setActiveIndex(idx >= 0 ? idx : 0);
    setOpen(true);
  };

  const choose = (next: string) => {
    onCommit(next);
    closeMenu();
    buttonRef.current?.focus();
  };

  // Outside-click + scroll/resize dismissal. Escape is handled on
  // the focused menu so it can also restore trigger focus.
  useEffect(() => {
    if (!open) return;
    const onPointerDown = (e: MouseEvent) => {
      const t = e.target as Node;
      if (buttonRef.current?.contains(t) || menuRef.current?.contains(t)) return;
      closeMenu();
    };
    const dismiss = () => closeMenu();
    document.addEventListener('mousedown', onPointerDown);
    window.addEventListener('scroll', dismiss, true);
    window.addEventListener('resize', dismiss);
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      window.removeEventListener('scroll', dismiss, true);
      window.removeEventListener('resize', dismiss);
    };
  }, [open]);

  // Move keyboard focus onto the menu when it opens.
  useEffect(() => {
    if (open && menuRef.current) menuRef.current.focus();
  }, [open]);

  if (readOnly) return <>{children}</>;

  return (
    <>
      <button
        ref={buttonRef}
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={ariaLabel}
        title="Click to edit"
        onClick={() => (open ? closeMenu() : openMenu())}
        onKeyDown={(e) => {
          if (!open && (e.key === 'ArrowDown' || e.key === 'Enter' || e.key === ' ')) {
            e.preventDefault();
            openMenu();
          }
        }}
        className="btn-transition"
        style={{
          background: 'transparent',
          border: 0,
          padding: 0,
          cursor: 'pointer',
          font: 'inherit',
          color: 'inherit',
          display: 'inline-flex',
          alignItems: 'center',
          borderRadius: 999,
        }}
      >
        {children}
      </button>
      {open && coords ? (
        <div
          ref={menuRef}
          role="listbox"
          aria-label={ariaLabel}
          tabIndex={-1}
          onKeyDown={(e) => {
            if (e.key === 'Escape') {
              e.preventDefault();
              closeMenu();
              buttonRef.current?.focus();
            } else if (e.key === 'ArrowDown') {
              e.preventDefault();
              setActiveIndex((i) => (i + 1) % selectable.length);
            } else if (e.key === 'ArrowUp') {
              e.preventDefault();
              setActiveIndex((i) => (i - 1 + selectable.length) % selectable.length);
            } else if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              const opt = selectable[activeIndex];
              if (opt) choose(opt.value);
            }
          }}
          style={{
            position: 'fixed',
            top: coords.top,
            left: coords.left,
            minWidth: coords.width,
            zIndex: 50,
            background: 'var(--lp-surface)',
            border: '1px solid var(--lp-border-strong)',
            borderRadius: 8,
            boxShadow: 'var(--lp-shadow-popover)',
            padding: 4,
            outline: 'none',
          }}
        >
          {selectable.map((o, idx) => {
            const isSelected = o.value === value;
            const isActive = idx === activeIndex;
            const tone = OPTION_TONE[o.value];
            return (
              <button
                key={o.value || 'empty'}
                type="button"
                role="option"
                aria-selected={isSelected}
                onClick={() => choose(o.value)}
                onMouseEnter={() => setActiveIndex(idx)}
                className="btn-transition"
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  width: '100%',
                  textAlign: 'left',
                  fontSize: '12px',
                  fontWeight: isSelected ? 600 : 500,
                  padding: '5px 8px',
                  borderRadius: 5,
                  border: 0,
                  cursor: 'pointer',
                  background: isActive
                    ? 'color-mix(in srgb, var(--color-lp-orange) 12%, transparent)'
                    : 'transparent',
                  color: isActive ? 'var(--color-lp-orange)' : 'var(--lp-text)',
                }}
              >
                <span
                  aria-hidden
                  className="h-1.5 w-1.5 shrink-0 rounded-full"
                  style={{ background: tone ?? 'var(--lp-border-strong)' }}
                />
                <span className="min-w-0 flex-1 truncate">{o.label}</span>
                {isSelected ? (
                  <Check
                    className="h-3.5 w-3.5 shrink-0"
                    style={{ color: 'var(--color-lp-orange)' }}
                    aria-hidden
                  />
                ) : null}
              </button>
            );
          })}
        </div>
      ) : null}
    </>
  );
}
