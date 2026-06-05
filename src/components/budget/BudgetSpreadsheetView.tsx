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
  Columns3,
  Download,
  ExternalLink,
  Filter,
  GripVertical,
  Paperclip,
  PanelRightOpen,
  Plus,
  Search,
  Trash2,
  X,
} from 'lucide-react';
import { BudgetLineSlideOver } from '@/components/budget/BudgetLineSlideOver';
import { BudgetCellInput } from '@/components/budget/cells/BudgetCellInput';
import { InlineSelectCell } from '@/components/budget/cells/InlineSelectCell';
import { useBudgetConfirm } from '@/components/budget/BudgetConfirmDialog';
import {
  useBudgetGridSizing,
  type GridColumnDef,
} from '@/components/budget/useBudgetGridSizing';
import { useToast } from '@/components/ui/Toast';
import { convertToCurrency } from '@/lib/budget/fx';
import { useBudgetDensity } from '@/components/budget/BudgetDensityContext';
import { getEffectiveActual, getActualState } from '@/lib/budget/transactions';
import { isIncomeRow, varianceColor } from '@/lib/budget/income-rows';
import { isUx14DerivedBudgetLine } from '@/lib/budget/budgetUx14Derived';
import type { BudgetLineItem, BudgetSection } from '@/types';
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

/* Fix-pack A Task 2 — the free-text `category` no longer drives grouping
   or labels (section_id → budget_sections is the single source), so the
   old CATEGORY_ORDER / CATEGORY_LABEL maps were removed. */

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

/* BUD-04 — InlineSelectCell (+ its OPTION_TONE) now lives in a shared
   module so the slide-over reuses the exact same custom dropdown. */

/* §B1.2 — vendor is encoded as the first line of `notes`
   ("Vendor: X") by the slide-over until a real column exists. Mirror
   that decode so the grid's Vendor column shows the saved value. */
function vendorFromNotes(notes?: string | null): string {
  const first = (notes ?? '').split('\n')[0] ?? '';
  return first.startsWith('Vendor: ') && first.length < 80
    ? first.slice('Vendor: '.length).trim()
    : '';
}

/* Budget ← Operations linking — a derived line's source badge + the
   Operations page to drill into. Returns null for manual lines (and for
   flights, which have no dedicated Operations page yet). */
function derivedSource(
  row: BudgetLineItem,
  tourId: string,
): { badge: string; href: string } | null {
  const t = row.source_entity_type;
  if (row.hotel_id || row.room_id || t === 'hotel_booking') {
    return { badge: 'from rooming', href: `/operations/${tourId}/rooming` };
  }
  if (t === 'payroll' || t === 'payroll_per_diem') {
    return { badge: 'from payroll', href: `/operations/${tourId}/payroll` };
  }
  if (row.gear_id || row.tour_gear_id || t === 'gear') {
    return { badge: 'from gear', href: `/operations/${tourId}/hire` };
  }
  return null;
}

/* Phase C — the default grouping is now Section (the budget backbone),
   replacing the old hardcoded category grouping. Phase grouping is kept
   as an option (gated behind the per-tour track_phases toggle). */
export type BudgetSpreadsheetGroupBy = 'section' | 'phase';

/* Phase C — the canonical column model. Drives the colgroup + header so
   columns are resizable (drag a header-edge handle) and widths persist
   per-tour. The Phase column is omitted from the visible set when the
   tour's track_phases toggle is off. */
const GRID_COLUMNS: GridColumnDef[] = [
  { key: 'select', width: 32, min: 32, resizable: false },
  { key: 'num', width: 40, min: 32, resizable: false },
  { key: 'item', width: 320, min: 160, resizable: true },
  { key: 'vendor', width: 160, min: 90, resizable: true },
  { key: 'phase', width: 96, min: 70, resizable: true },
  { key: 'estimate', width: 124, min: 90, resizable: true },
  { key: 'actual', width: 124, min: 90, resizable: true },
  { key: 'variance', width: 104, min: 72, resizable: true },
  { key: 'status', width: 104, min: 80, resizable: true },
];

const COLUMN_META: Record<
  string,
  { label: string; align?: 'left' | 'right' }
> = {
  select: { label: '' },
  num: { label: '#', align: 'right' },
  item: { label: 'Item' },
  vendor: { label: 'Vendor' },
  phase: { label: 'Phase' },
  estimate: { label: 'Estimate', align: 'right' },
  actual: { label: 'Actual', align: 'right' },
  variance: { label: 'Variance', align: 'right' },
  status: { label: 'Status' },
};

/** Default canvas cap — the grid reads as a focused sheet by default
 *  and can be dragged wider (persisted) via the right-edge handle. */
const DEFAULT_CANVAS_WIDTH = 1120;

export interface BudgetSpreadsheetViewProps {
  lines: BudgetLineItem[];
  /** Phase C — per-tour section headers (the grouping backbone). */
  sections?: BudgetSection[];
  /** Phase C — when false, the Phase column + grouping are hidden. */
  trackPhases?: boolean;
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
  sections = [],
  trackPhases = false,
  phases,
  routingDateById,
  duplicateMap,
  tourCurrency,
  tourId,
  initialGroupBy = 'section',
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
  /* Phase C — track in-flight section ops (add/rename/delete) so the
     toolbar + section headers can disable while a write is pending. */
  const [sectionBusy, setSectionBusy] = useState(false);
  /* Fix-pack A — optimistic line deletes (bulk delete + future single
     delete) hide rows instantly without a router.refresh(). Reconciled
     when fresh `lines` arrive. */
  const [deletedLineIds, setDeletedLineIds] = useState<string[]>([]);
  /* Fix-pack A — optimistic section CRUD, mirroring the line machinery.
     Sections render from `allSections` (server sections + these overlays)
     so add / rename / delete reflect instantly with NO full-page refresh.
     Cleared when the server `sections` prop changes (tab nav / refetch). */
  const [pendingSections, setPendingSections] = useState<BudgetSection[]>([]);
  const [sectionRenames, setSectionRenames] = useState<Record<string, string>>({});
  const [deletedSectionIds, setDeletedSectionIds] = useState<string[]>([]);
  /* Fix-pack B Task 2 — the section / line just created via "+", which
     should open straight into name-edit mode (focused + selected). Cleared
     once the inline editor consumes it. */
  const [autoEditSectionId, setAutoEditSectionId] = useState<string | null>(null);
  const [autoEditLineId, setAutoEditLineId] = useState<string | null>(null);
  // Fix-pack B Task 5b — branded confirm dialog (replaces window.confirm).
  const { requestConfirm, dialog: confirmDialog } = useBudgetConfirm();

  // §D — restore per-tour group-by preference on mount. The legacy
  // 'category' value maps forward to the new 'section' grouping.
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const stored = window.localStorage.getItem(GROUP_BY_LS_PREFIX + tourId);
    if (stored === 'phase') setGroupBy('phase');
    else if (stored === 'section' || stored === 'category') setGroupBy('section');
  }, [tourId]);

  // When phases get toggled off, never leave the grid stuck on the
  // now-hidden Phase grouping.
  useEffect(() => {
    if (!trackPhases) setGroupBy((cur) => (cur === 'phase' ? 'section' : cur));
  }, [trackPhases]);

  const setGroupByPersisted = (next: BudgetSpreadsheetGroupBy) => {
    setGroupBy(next);
    if (typeof window !== 'undefined') {
      window.localStorage.setItem(GROUP_BY_LS_PREFIX + tourId, next);
    }
  };

  // Phase C — column / canvas sizing (persisted per tour).
  const sizing = useBudgetGridSizing(tourId, GRID_COLUMNS);
  const visibleColumns = useMemo(
    () => GRID_COLUMNS.filter((c) => trackPhases || c.key !== 'phase'),
    [trackPhases],
  );
  const colCount = visibleColumns.length;
  const tableWidth = useMemo(
    () => visibleColumns.reduce((sum, c) => sum + sizing.widthFor(c.key), 0),
    [visibleColumns, sizing],
  );

  const dateMap = useMemo(() => {
    const m = new Map<string, string>();
    for (const [k, v] of Object.entries(routingDateById)) m.set(k, v);
    return m;
  }, [routingDateById]);

  // Optimistic creations merge + optimistic field-edit overlay, minus
  // optimistically-deleted rows.
  const allLines = useMemo(() => {
    const base =
      pendingCreations.length === 0
        ? lines
        : (() => {
            const known = new Set(lines.map((l) => l.id));
            const extras = pendingCreations.filter((p) => !known.has(p.id));
            // Fix-pack B Task 1 — append new lines at the END so a freshly
            // created line lands at the BOTTOM of its section (where the
            // user clicked "+"), not jumping to the top.
            return extras.length > 0 ? [...lines, ...extras] : lines;
          })();
    const visible =
      deletedLineIds.length === 0
        ? base
        : base.filter((l) => !deletedLineIds.includes(l.id));
    if (Object.keys(optimistic).length === 0) return visible;
    return visible.map((l) =>
      optimistic[l.id]
        ? ({ ...l, ...optimistic[l.id] } as BudgetLineItem)
        : l,
    );
  }, [lines, pendingCreations, optimistic, deletedLineIds]);

  // Fix-pack A — sections to render: server sections (minus optimistic
  // deletes) + optimistic additions, with optimistic renames applied.
  const allSections = useMemo(() => {
    const merged: BudgetSection[] = [
      ...sections.filter((s) => !deletedSectionIds.includes(s.id)),
      ...pendingSections.filter(
        (p) =>
          !sections.some((s) => s.id === p.id) &&
          !deletedSectionIds.includes(p.id),
      ),
    ];
    return merged.map((s) =>
      sectionRenames[s.id] ? { ...s, name: sectionRenames[s.id] } : s,
    );
  }, [sections, pendingSections, sectionRenames, deletedSectionIds]);

  useEffect(() => {
    if (pendingCreations.length === 0) return;
    const known = new Set(lines.map((l) => l.id));
    const stillPending = pendingCreations.filter((p) => !known.has(p.id));
    if (stillPending.length !== pendingCreations.length) {
      setPendingCreations(stillPending);
    }
  }, [lines, pendingCreations]);

  // Fresh server rows supersede any optimistic patches + line deletes.
  useEffect(() => {
    setOptimistic((prev) => (Object.keys(prev).length ? {} : prev));
    setDeletedLineIds((prev) => (prev.length ? [] : prev));
  }, [lines]);

  // Fresh server sections supersede the optimistic section overlays.
  useEffect(() => {
    setPendingSections((prev) => (prev.length ? [] : prev));
    setSectionRenames((prev) => (Object.keys(prev).length ? {} : prev));
    setDeletedSectionIds((prev) => (prev.length ? [] : prev));
  }, [sections]);

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

  const sectionsSorted = useMemo(
    () =>
      [...allSections].sort(
        (a, b) =>
          (a.sort_order ?? 0) - (b.sort_order ?? 0) ||
          a.name.localeCompare(b.name),
      ),
    [allSections],
  );

  // Phase C group structure — produce { id, label, rows[], sectionId? }[].
  // Default grouping is now Section (the budget backbone). Empty sections
  // still render (so a freshly-scaffolded section shows its "+ Add line"
  // affordance). Phase grouping is retained as an option.
  type GridGroup = {
    id: string;
    label: string;
    rows: BudgetLineItem[];
    sectionId?: string | null;
  };
  const groups = useMemo<GridGroup[]>(() => {
    if (groupBy === 'phase') {
      const byPhase = new Map<string, BudgetLineItem[]>();
      for (const line of filtered) {
        const tag = phaseTagOf(line);
        const key = tag ?? 'unscoped';
        (byPhase.get(key) ?? byPhase.set(key, []).get(key)!).push(line);
      }
      const out: GridGroup[] = [];
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

    /* Section grouping (default + only). Lines bucket by section_id →
       budget_sections; the free-text `category` is NOT used for grouping
       or labels anymore (Fix-pack A Task 2). Sections render in sort
       order even when empty; any line with a null / stale section_id
       falls into a single "Uncategorised" bucket (which matches the
       Summary rollup 1:1). */
    const bySection = new Map<string, BudgetLineItem[]>();
    for (const line of filtered) {
      const key = line.section_id ?? '__none__';
      (bySection.get(key) ?? bySection.set(key, []).get(key)!).push(line);
    }
    const out: GridGroup[] = [];
    const known = new Set(sectionsSorted.map((s) => s.id));
    for (const s of sectionsSorted) {
      out.push({
        id: s.id,
        label: s.name,
        rows: bySection.get(s.id) ?? [],
        sectionId: s.id,
      });
    }
    const orphan: BudgetLineItem[] = [];
    for (const [key, rows] of bySection.entries()) {
      if (key === '__none__' || !known.has(key)) orphan.push(...rows);
    }
    if (orphan.length > 0) {
      out.push({
        id: '__uncategorised__',
        label: 'Uncategorised',
        rows: orphan,
        sectionId: null,
      });
    }
    return out;
  }, [filtered, groupBy, sectionsSorted]);

  /* Fix-pack A Task 3 — multi-select. `orderedRowIds` is the flat
     display order (group order, then row order) so shift-click can
     select a contiguous range; `lastSelectedIndexRef` anchors it. */
  const orderedRowIds = useMemo(
    () => groups.flatMap((g) => g.rows.map((r) => r.id)),
    [groups],
  );
  const lastSelectedIndexRef = useRef<number | null>(null);

  const toggleSelect = (rowId: string, _index: number, shiftKey: boolean) => {
    // Fix-pack B Task 3 — derive the flat index from orderedRowIds itself
    // (not the row's render-time index, which can drift). slice(lo, hi+1)
    // is inclusive of BOTH the anchor and the clicked row.
    const index = orderedRowIds.indexOf(rowId);
    if (shiftKey && lastSelectedIndexRef.current !== null && index >= 0) {
      const lo = Math.min(lastSelectedIndexRef.current, index);
      const hi = Math.max(lastSelectedIndexRef.current, index);
      const range = orderedRowIds.slice(lo, hi + 1);
      setSelectedIds((prev) => Array.from(new Set([...prev, ...range])));
    } else {
      setSelectedIds((prev) =>
        prev.includes(rowId)
          ? prev.filter((x) => x !== rowId)
          : [...prev, rowId],
      );
    }
    lastSelectedIndexRef.current = index;
  };

  const allSelected =
    orderedRowIds.length > 0 &&
    orderedRowIds.every((id) => selectedIds.includes(id));
  const someSelected =
    !allSelected && orderedRowIds.some((id) => selectedIds.includes(id));
  const toggleSelectAll = () => {
    setSelectedIds(allSelected ? [] : [...orderedRowIds]);
    lastSelectedIndexRef.current = null;
  };

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

  /* Fix-pack A Task 2 — every newly-created line takes a section_id
     (section_id is the single grouping source; the free-text category is
     no longer used for grouping). Default to the first REAL section (skip
     not-yet-persisted optimistic temps, whose ids would FK-fail). */
  const defaultSectionId =
    sectionsSorted.find((s) => !String(s.id).startsWith('pending-'))?.id ?? null;

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
      section_id: defaultSectionId,
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
      section_id: defaultSectionId,
      created_at: now,
      updated_at: now,
    } as BudgetLineItem);
  };

  /* Open the slide-over in create mode pre-seeded with a section. Used
     by the per-group "+ Add line" for non-section (phase) groups. */
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
      section_id: defaultSectionId,
      created_at: now,
      updated_at: now,
    } as BudgetLineItem);
  };

  /* Fix-pack A Task 1.2 — optimistic section CRUD. Apply locally first,
     fire the request, roll back + toast on failure, and DO NOT
     router.refresh() on success (that re-ran the whole server page and
     read as a full-page reload). `allSections` reflects the overlays
     instantly; the server reconciles on the next natural refetch. */
  const addSection = async () => {
    const tempId = `pending-sec-${Date.now()}`;
    const maxSort = sectionsSorted.reduce(
      (m, s) => Math.max(m, s.sort_order ?? 0),
      -1,
    );
    const temp: BudgetSection = {
      id: tempId,
      tour_id: tourId,
      workspace_id: '',
      name: 'New section',
      sort_order: maxSort + 1,
    };
    setPendingSections((prev) => [...prev, temp]);
    setSectionBusy(true);
    try {
      const res = await fetch('/api/budget/sections', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tour_id: tourId,
          name: 'New section',
          sort_order: maxSort + 1,
        }),
      });
      if (!res.ok) {
        const b = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(b.error ?? 'Could not add section');
      }
      const created = (await res.json()) as BudgetSection;
      // Swap the temp row for the real one (real id needed for adding lines).
      setPendingSections((prev) => prev.map((s) => (s.id === tempId ? created : s)));
      // Fix-pack B Task 2 — open the new section header in name-edit mode.
      setAutoEditSectionId(created.id);
    } catch (err) {
      setPendingSections((prev) => prev.filter((s) => s.id !== tempId));
      showToast(err instanceof Error ? err.message : 'Could not add section', 'error');
    } finally {
      setSectionBusy(false);
    }
  };

  const renameSection = async (sectionId: string, name: string) => {
    const prevName = allSections.find((s) => s.id === sectionId)?.name ?? '';
    setSectionRenames((prev) => ({ ...prev, [sectionId]: name }));
    setPendingSections((prev) =>
      prev.map((s) => (s.id === sectionId ? { ...s, name } : s)),
    );
    // A not-yet-persisted section carries the new name locally; the
    // pending create will POST it. Nothing to PATCH yet.
    if (String(sectionId).startsWith('pending-')) return;
    try {
      const res = await fetch('/api/budget/sections', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: sectionId, name }),
      });
      if (!res.ok) {
        const b = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(b.error ?? 'Rename failed');
      }
    } catch (err) {
      setSectionRenames((prev) => ({ ...prev, [sectionId]: prevName }));
      showToast(err instanceof Error ? err.message : 'Rename failed', 'error');
    }
  };

  const performDeleteSection = async (sectionId: string) => {
    // Optimistic-remove a not-yet-persisted section without a request.
    if (String(sectionId).startsWith('pending-')) {
      setPendingSections((prev) => prev.filter((s) => s.id !== sectionId));
      return;
    }
    setDeletedSectionIds((prev) => [...prev, sectionId]);
    try {
      const res = await fetch(
        `/api/budget/sections?id=${encodeURIComponent(sectionId)}`,
        { method: 'DELETE' },
      );
      if (!res.ok) {
        const b = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(b.error ?? 'Delete failed');
      }
    } catch (err) {
      setDeletedSectionIds((prev) => prev.filter((id) => id !== sectionId));
      showToast(err instanceof Error ? err.message : 'Delete failed', 'error');
    }
  };

  const deleteSection = (sectionId: string, label: string) => {
    requestConfirm({
      title: 'Delete section?',
      message: `Delete the "${label}" section? Its line items move to Uncategorised (they are not deleted).`,
      confirmLabel: 'Delete section',
      onConfirm: () => void performDeleteSection(sectionId),
    });
  };

  /* Fix-pack A — add a line straight into a section, optimistically.
     POST (fast), then push the created row into the pendingCreations
     overlay so it appears with NO router.refresh(). Inline rename lets
     the user retitle the placeholder immediately. */
  const addLineToSection = async (sectionId: string | null) => {
    if (sectionId && String(sectionId).startsWith('pending-')) {
      showToast('Section is still saving — try again in a moment', 'error');
      return;
    }
    try {
      const res = await fetch('/api/budget/line-items', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tour_id: tourId,
          category: 'misc',
          label: 'New line item',
          section_id: sectionId,
          currency: tourCurrency,
        }),
      });
      if (!res.ok) {
        const b = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(b.error ?? 'Could not add line');
      }
      const created = (await res.json()) as BudgetLineItem;
      setPendingCreations((prev) => [...prev, created]);
      // Fix-pack B Task 2 — drop the new line straight into name-edit mode.
      setAutoEditLineId(created.id);
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Could not add line', 'error');
    }
  };

  /* §B1.2 — inline-edit commit handler. Optimistic-only on success:
     the overlay already shows the saved value and section/summary
     totals derive from it, so we do NOT router.refresh() per edit
     (that re-ran the whole server page and caused a full-page reload
     flash). Server truth reconciles on the next natural refresh. Only
     failures refresh, to surface true state after a rejected write. */
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
      // Success — no refresh; optimistic overlay is the source of truth.
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
          {(['section', 'phase'] as const)
            .filter((opt) => opt !== 'phase' || trackPhases)
            .map((opt) => {
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
                  {opt === 'section' ? 'Section' : 'Phase'}
                </button>
              );
            })}
        </div>

        {/* BUD-15 — clear, labelled add-section button. */}
        <button
          type="button"
          onClick={() => void addSection()}
          disabled={sectionBusy}
          className="btn-transition inline-flex items-center gap-1 rounded-md border px-2.5 py-1"
          style={{
            borderColor: 'var(--lp-border-strong)',
            background: 'var(--lp-surface)',
            color: 'var(--lp-text)',
            fontSize: '12px',
            fontWeight: 600,
            opacity: sectionBusy ? 0.6 : 1,
          }}
          title="Add a new section"
        >
          <Plus className="h-3.5 w-3.5" />
          Add section
        </button>
        {sizing.isCustomised ? (
          <button
            type="button"
            onClick={sizing.reset}
            className="btn-transition inline-flex items-center gap-1 rounded-md border px-2 py-1"
            style={{
              borderColor: 'var(--lp-border)',
              background: 'var(--lp-bg)',
              color: 'var(--lp-text-tertiary)',
              fontSize: '12px',
            }}
            title="Reset column + canvas widths"
          >
            Reset widths
          </button>
        ) : null}

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

      {/* Phase C — resizable canvas (drag the right edge to widen) +
          dense spreadsheet with resizable columns. */}
      <div
        style={{
          position: 'relative',
          width: sizing.canvasWidth ?? DEFAULT_CANVAS_WIDTH,
          maxWidth: '100%',
        }}
      >
        <div
          className="overflow-x-auto rounded-md border"
          style={{
            borderColor: 'var(--lp-border-strong)',
            background: 'var(--lp-bg)',
          }}
        >
          <table
            className="lp-dense"
            style={{
              borderCollapse: 'separate',
              borderSpacing: 0,
              tableLayout: 'fixed',
              width: tableWidth,
            }}
          >
            <colgroup>
              {visibleColumns.map((c) => (
                <col key={c.key} style={{ width: sizing.widthFor(c.key) }} />
              ))}
            </colgroup>
            <thead
              className="sticky top-0 z-10"
              style={{
                background: 'var(--lp-panel)',
                borderBottom: '1px solid var(--lp-border-strong)',
              }}
            >
              <tr>
                {visibleColumns.map((c) => {
                  const meta = COLUMN_META[c.key];
                  return (
                    <th
                      key={c.key}
                      style={{
                        position: 'relative',
                        textAlign: meta?.align ?? 'left',
                        fontSize: '10px',
                        fontWeight: 600,
                        letterSpacing: '0.08em',
                        textTransform: 'uppercase',
                        color: 'var(--lp-text-tertiary)',
                        padding: '6px 8px',
                        borderBottom: '1px solid var(--lp-border-subtle)',
                      }}
                    >
                      {c.key === 'select' ? (
                        <input
                          type="checkbox"
                          className="lp-checkbox"
                          checked={allSelected}
                          ref={(el) => {
                            if (el) el.indeterminate = someSelected;
                          }}
                          onChange={toggleSelectAll}
                          aria-label="Select all line items"
                        />
                      ) : meta?.label ? (
                        meta.label
                      ) : (
                        <span aria-hidden> </span>
                      )}
                      {c.resizable ? (
                        <ColumnResizeHandle
                          label={`Resize ${meta?.label ?? c.key} column`}
                          onPointerDown={(e) => sizing.startColumnResize(c.key, e)}
                        />
                      ) : null}
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody>
              {groups.length === 0 ? (
                <tr>
                  <td
                    colSpan={colCount}
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
                      colCount={colCount}
                      trackPhases={trackPhases}
                      sectionBusy={sectionBusy}
                      tourId={tourId}
                      onNavigate={(href) => router.push(href)}
                      runningStart={runningIndex}
                      bumpRunning={(n) => {
                        runningIndex = n;
                      }}
                      selectedIds={selectedIds}
                      onToggleSelect={toggleSelect}
                      onOpenLine={setOpenLine}
                      duplicateMap={duplicateMap}
                      tourCurrency={tourCurrency}
                      displayCurrency={displayCurrency}
                      gProposed={gProposed}
                      gActual={gActual}
                      onCommitLine={commitLineEdit}
                      onAddRowToSection={handleAddToSection}
                      onAddLineToSection={addLineToSection}
                      onRenameSection={renameSection}
                      onDeleteSection={deleteSection}
                      autoEditSectionId={autoEditSectionId}
                      autoEditLineId={autoEditLineId}
                      onAutoEditConsumed={() => {
                        setAutoEditSectionId(null);
                        setAutoEditLineId(null);
                      }}
                    />
                  );
                })
              )}
            </tbody>
          </table>
        </div>
        {/* Canvas widen handle — drag the right edge. */}
        <CanvasResizeHandle onPointerDown={sizing.startCanvasResize} />
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
          sections={allSections}
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
                const ids = [...selectedIds];
                setBulkBusy('status');
                // Optimistic: apply the status to the overlay immediately.
                setOptimistic((prev) => {
                  const next = { ...prev };
                  for (const id of ids) next[id] = { ...next[id], status: s };
                  return next;
                });
                setSelectedIds([]);
                try {
                  const results = await Promise.all(
                    ids.map((id) =>
                      fetch('/api/budget/line-items', {
                        method: 'PATCH',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ id, status: s }),
                      }),
                    ),
                  );
                  if (results.some((r) => !r.ok)) {
                    throw new Error('Some updates failed');
                  }
                  showToast(`Marked ${ids.length} as ${s}`);
                  // No router.refresh() on success — the overlay matches.
                } catch (err) {
                  showToast(
                    err instanceof Error ? err.message : 'Bulk update failed',
                    'error',
                  );
                  // Resync truth; the [lines] effect clears the overlay.
                  router.refresh();
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
            onClick={() => {
              const ids = [...selectedIds];
              const count = ids.length;
              requestConfirm({
                title: 'Delete line items?',
                message: `Delete ${count} budget ${count === 1 ? 'line' : 'lines'}? This can't be undone.`,
                confirmLabel: `Delete ${count}`,
                onConfirm: () => {
                  setBulkBusy('delete');
                  // Optimistic: hide the rows immediately (the route accepts
                  // ?id=, which is why this delete actually fires now).
                  setDeletedLineIds((prev) => [...prev, ...ids]);
                  setPendingCreations((prev) => prev.filter((p) => !ids.includes(p.id)));
                  setSelectedIds([]);
                  void (async () => {
                    try {
                      const results = await Promise.all(
                        ids.map((id) =>
                          fetch(`/api/budget/line-items?id=${encodeURIComponent(id)}`, {
                            method: 'DELETE',
                          }),
                        ),
                      );
                      if (results.some((r) => !r.ok)) {
                        throw new Error('Some deletes failed');
                      }
                      showToast(`Deleted ${count} lines`);
                      // No router.refresh() on success — rows already hidden.
                    } catch (err) {
                      // Roll back the optimistic hide + resync truth.
                      setDeletedLineIds((prev) => prev.filter((id) => !ids.includes(id)));
                      showToast(
                        err instanceof Error ? err.message : 'Bulk delete failed',
                        'error',
                      );
                      router.refresh();
                    } finally {
                      setBulkBusy(null);
                    }
                  })();
                },
              });
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

      {/* Fix-pack B Task 5b — branded delete confirms. */}
      {confirmDialog}
    </section>
  );
}

/* ============================================
   Sub-components — kept inline so the spreadsheet view stays a
   single-file unit (the file is already a known surgical area).
   ============================================ */

/* BUD-17 — discoverable column-resize handle. At rest a faint vertical
   divider line (reads as a column gridline); on hover it thickens to a
   brand-orange bar with a grab cursor. */
function ColumnResizeHandle({
  label,
  onPointerDown,
}: {
  label: string;
  onPointerDown: (e: React.PointerEvent) => void;
}) {
  const [hover, setHover] = useState(false);
  return (
    <span
      role="separator"
      aria-orientation="vertical"
      aria-label={label}
      title="Drag to resize column"
      onPointerDown={onPointerDown}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        position: 'absolute',
        top: 0,
        right: -4,
        height: '100%',
        width: 9,
        cursor: 'col-resize',
        touchAction: 'none',
        zIndex: 2,
        display: 'flex',
        justifyContent: 'center',
      }}
    >
      <span
        aria-hidden
        style={{
          width: hover ? 2 : 1,
          margin: '5px 0',
          borderRadius: 2,
          background: hover
            ? 'var(--color-lp-orange)'
            : 'var(--lp-border-strong)',
          opacity: hover ? 1 : 0.4,
          transition: 'width 120ms ease, opacity 120ms ease, background 120ms ease',
        }}
      />
    </span>
  );
}

/* BUD-17 — canvas widen handle on the grid's right edge. A small grip
   pill, subtle at rest, brand-orange on hover. */
function CanvasResizeHandle({
  onPointerDown,
}: {
  onPointerDown: (e: React.PointerEvent) => void;
}) {
  const [hover, setHover] = useState(false);
  return (
    <span
      role="separator"
      aria-orientation="vertical"
      aria-label="Widen the grid (drag)"
      title="Drag to widen the grid"
      onPointerDown={onPointerDown}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        position: 'absolute',
        top: 0,
        right: -7,
        height: '100%',
        width: 14,
        cursor: 'col-resize',
        touchAction: 'none',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 2,
      }}
    >
      <span
        aria-hidden
        className="btn-transition"
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          height: 34,
          width: 14,
          borderRadius: 7,
          border: '1px solid',
          borderColor: hover ? 'var(--color-lp-orange)' : 'var(--lp-border-strong)',
          background: hover
            ? 'color-mix(in srgb, var(--color-lp-orange) 14%, var(--lp-surface))'
            : 'var(--lp-surface)',
          color: hover ? 'var(--color-lp-orange)' : 'var(--lp-text-tertiary)',
          boxShadow: 'var(--lp-shadow-sm)',
        }}
      >
        <GripVertical className="h-3.5 w-3.5" />
      </span>
    </span>
  );
}

interface GroupRowsProps {
  group: {
    id: string;
    label: string;
    rows: BudgetLineItem[];
    /** Phase C — present when grouping by Section. null = the
     *  "Uncategorised" bucket; undefined = phase/legacy grouping. */
    sectionId?: string | null;
  };
  /** Number of visible columns (drives every full-row colSpan). */
  colCount: number;
  /** When false, the Phase column is omitted. */
  trackPhases: boolean;
  /** Disables section header controls while a section write is pending. */
  sectionBusy: boolean;
  /** For derived-line drill links to the source Operations page. */
  tourId: string;
  onNavigate: (href: string) => void;
  runningStart: number;
  bumpRunning: (n: number) => void;
  selectedIds: string[];
  /** §B1.2 — inline-edit commit. Caller wraps the network
   *  write + toast + router.refresh. */
  onCommitLine: (id: string, patch: Record<string, unknown>) => Promise<void>;
  /** §B1.5 — open create slide with section + category
   *  pre-filled (legacy / phase groups). */
  onAddRowToSection: (section: string | null, defaultCategory: string) => void;
  /** Phase C — add a line straight into a budget_section (direct POST). */
  onAddLineToSection: (sectionId: string | null) => void | Promise<void>;
  /** Phase C — rename a budget_section from its header. */
  onRenameSection: (sectionId: string, name: string) => void | Promise<void>;
  /** Phase C — delete a budget_section from its header. */
  onDeleteSection: (sectionId: string, label: string) => void | Promise<void>;
  /** Fix-pack A — toggle a row's selection, with shift-click range
   *  support; `index` is the row's flat display index. */
  onToggleSelect: (rowId: string, index: number, shiftKey: boolean) => void;
  onOpenLine: (line: BudgetLineItem) => void;
  duplicateMap?: Record<string, string[]>;
  tourCurrency: string;
  displayCurrency: string;
  gProposed: number;
  gActual: number;
  /** Fix-pack B Task 2 — the section / line that should auto-open in
   *  name-edit mode, and a callback to clear that state once consumed. */
  autoEditSectionId: string | null;
  autoEditLineId: string | null;
  onAutoEditConsumed: () => void;
}

function GroupRows({
  group,
  colCount,
  trackPhases,
  sectionBusy,
  tourId,
  onNavigate,
  runningStart,
  bumpRunning,
  selectedIds,
  onToggleSelect,
  onOpenLine,
  duplicateMap,
  tourCurrency,
  displayCurrency,
  gProposed,
  gActual,
  onCommitLine,
  onAddRowToSection,
  onAddLineToSection,
  onRenameSection,
  onDeleteSection,
  autoEditSectionId,
  autoEditLineId,
  onAutoEditConsumed,
}: GroupRowsProps) {
  const isSectionGroup = group.sectionId !== undefined;
  const isRealSection =
    typeof group.sectionId === 'string' && group.sectionId.length > 0;
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
          colSpan={colCount}
          style={{
            padding: '6px 12px',
          }}
        >
          <div className="flex items-center justify-between gap-3">
            <div className="flex min-w-0 items-center gap-1.5">
              {/* Phase C — real sections get an inline-editable name +
                  delete; phase / legacy buckets stay read-only. */}
              {isRealSection ? (
                <InlineSectionName
                  value={group.label}
                  onCommit={(name) =>
                    void onRenameSection(group.sectionId as string, name)
                  }
                  autoEdit={
                    group.sectionId != null && group.sectionId === autoEditSectionId
                  }
                  onAutoEditConsumed={onAutoEditConsumed}
                />
              ) : (
                <span
                  style={{
                    fontSize: '11px',
                    fontWeight: 700,
                    letterSpacing: '0.12em',
                    textTransform: 'uppercase',
                    color: 'var(--lp-text)',
                  }}
                >
                  {group.label}
                </span>
              )}
              <span
                className="lp-mono"
                style={{
                  color: 'var(--lp-text-tertiary)',
                  fontWeight: 500,
                  fontSize: '11px',
                }}
              >
                · {group.rows.length}
              </span>
              {isRealSection ? (
                /* BUD-15 — delete-section: compact icon, but a clear
                   red-tinted hover pill, and guarded by a confirm in
                   onDeleteSection. */
                <button
                  type="button"
                  disabled={sectionBusy}
                  onClick={() =>
                    void onDeleteSection(group.sectionId as string, group.label)
                  }
                  className="btn-transition inline-flex items-center gap-1 rounded"
                  title="Delete section"
                  aria-label={`Delete ${group.label} section`}
                  style={{
                    color: 'var(--lp-text-tertiary)',
                    background: 'transparent',
                    border: '1px solid transparent',
                    padding: '1px 4px',
                    opacity: sectionBusy ? 0.5 : 1,
                  }}
                  onMouseEnter={(e) => {
                    // Fix-pack B Task 5a — danger RED on hover, not amber.
                    e.currentTarget.style.color = 'var(--color-lp-error)';
                    e.currentTarget.style.borderColor =
                      'color-mix(in srgb, var(--color-lp-error) 45%, transparent)';
                    e.currentTarget.style.background =
                      'color-mix(in srgb, var(--color-lp-error) 10%, transparent)';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.color = 'var(--lp-text-tertiary)';
                    e.currentTarget.style.borderColor = 'transparent';
                    e.currentTarget.style.background = 'transparent';
                  }}
                >
                  <Trash2 className="h-3 w-3" aria-hidden />
                </button>
              ) : null}
            </div>
            <span
              className="lp-mono"
              style={{
                fontSize: '11px',
                color: 'var(--lp-text-tertiary)',
                whiteSpace: 'nowrap',
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
        // Budget ← Operations — derived (rooming / payroll / gear) lines
        // are read-only + drill to source.
        const derivedSrc = derivedSource(row, tourId);
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
                readOnly
                /* onClick (not onChange) so we can read shiftKey for range
                   selection; `checked` is driven by state. Keyboard space
                   fires a synthetic click → single toggle. */
                onClick={(e) =>
                  onToggleSelect(row.id, runningStart + i, e.shiftKey)
                }
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
                {derivedSrc ? (
                  /* Budget ← Operations — derived line: read-only label,
                     a "from rooming / payroll / gear" badge, and a drill
                     link to the source Operations page (no inline rename,
                     no slide-over). */
                  <>
                    <span
                      className="truncate"
                      style={{ color: 'var(--lp-text)', fontWeight: 500 }}
                      title={row.label || '(untitled)'}
                    >
                      {row.label || '(untitled)'}
                    </span>
                    <span
                      className="shrink-0 rounded-full px-1.5 py-0.5"
                      style={{
                        fontSize: '9px',
                        fontWeight: 700,
                        letterSpacing: '0.04em',
                        textTransform: 'uppercase',
                        color: 'var(--lp-text-tertiary)',
                        background: 'var(--lp-bg-deep)',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {derivedSrc.badge}
                    </span>
                    <button
                      type="button"
                      onClick={() => onNavigate(derivedSrc.href)}
                      title={`Edit at source — ${derivedSrc.badge.replace('from ', '')}`}
                      aria-label={`Open ${derivedSrc.badge.replace('from ', '')} in Operations`}
                      className="btn-transition inline-flex shrink-0 items-center justify-center rounded"
                      style={{
                        height: 22,
                        width: 22,
                        border: '1px solid var(--lp-border)',
                        background: 'var(--lp-surface)',
                        color: 'var(--lp-text-secondary)',
                        cursor: 'pointer',
                      }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.color = 'var(--color-lp-orange)';
                        e.currentTarget.style.borderColor = 'var(--color-lp-orange)';
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.color = 'var(--lp-text-secondary)';
                        e.currentTarget.style.borderColor = 'var(--lp-border)';
                      }}
                    >
                      <ExternalLink className="h-3.5 w-3.5" aria-hidden />
                    </button>
                  </>
                ) : (
                  <>
                    {/* §B1.2 — manual line: inline-editable title +
                        dedicated open-detail button. */}
                    <InlineLabelCell
                      value={row.label ?? ''}
                      onCommit={(label) => void onCommitLine(row.id, { label })}
                      autoEdit={row.id === autoEditLineId}
                      onAutoEditConsumed={onAutoEditConsumed}
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
                  </>
                )}
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
            {trackPhases ? (
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
                        whiteSpace: 'nowrap',
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
            ) : null}
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
        // Section groups (incl. empty ones) get a direct "+ Add line"
        // that POSTs into the section. Phase / legacy groups fall back
        // to the slide-over create flow seeded from the first row.
        const firstRow = group.rows[0];
        if (!isSectionGroup && !firstRow) return null;
        const handleAdd = () => {
          if (isSectionGroup) {
            void onAddLineToSection(group.sectionId ?? null);
          } else if (firstRow) {
            const section = (firstRow.section ?? null) as string | null;
            const defaultCategory = (firstRow.category ?? 'production').toString();
            onAddRowToSection(section, defaultCategory);
          }
        };
        return (
          <tr>
            <td
              colSpan={colCount}
              style={{
                padding: '4px 12px',
                background: 'var(--lp-bg)',
                borderBottom: '1px solid var(--lp-border-subtle)',
              }}
            >
              {/* BUD-15 — clear, labelled, discoverable add-line pill. */}
              <button
                type="button"
                onClick={handleAdd}
                className="btn-transition"
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 5,
                  fontSize: '11px',
                  fontWeight: 600,
                  color: 'var(--lp-text-secondary)',
                  background: 'var(--lp-surface)',
                  border: '1px solid var(--lp-border)',
                  borderRadius: 6,
                  padding: '3px 9px',
                  cursor: 'pointer',
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.color = 'var(--color-lp-orange)';
                  e.currentTarget.style.borderColor = 'var(--color-lp-orange)';
                  e.currentTarget.style.background =
                    'color-mix(in srgb, var(--color-lp-orange) 10%, transparent)';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.color = 'var(--lp-text-secondary)';
                  e.currentTarget.style.borderColor = 'var(--lp-border)';
                  e.currentTarget.style.background = 'var(--lp-surface)';
                }}
              >
                <Plus className="h-3 w-3" aria-hidden />
                Add line
              </button>
            </td>
          </tr>
        );
      })()}
    </>
  );
}

/* Phase C — inline-editable section name in the group header. Mirrors
   InlineLabelCell but styled as the bold uppercase section title.
   Enter / blur commits via onCommit; Escape cancels; unchanged or empty
   values are skipped. */
function InlineSectionName({
  value,
  onCommit,
  autoEdit = false,
  onAutoEditConsumed,
}: {
  value: string;
  onCommit: (next: string) => void;
  autoEdit?: boolean;
  onAutoEditConsumed?: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  const inputRef = useRef<HTMLInputElement>(null);
  const autoEditDone = useRef(false);

  // Fix-pack B Task 2 — a just-created section opens straight into edit.
  useEffect(() => {
    if (autoEdit && !autoEditDone.current) {
      autoEditDone.current = true;
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setEditing(true);
      onAutoEditConsumed?.();
    }
  }, [autoEdit, onAutoEditConsumed]);

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

  const titleStyle: React.CSSProperties = {
    fontSize: '11px',
    fontWeight: 700,
    letterSpacing: '0.12em',
    textTransform: 'uppercase',
    color: 'var(--lp-text)',
  };

  if (editing) {
    return (
      <input
        ref={inputRef}
        type="text"
        value={draft}
        aria-label="Section name"
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            commit();
          } else if (e.key === 'Escape') {
            e.preventDefault();
            setDraft(value);
            setEditing(false);
          }
        }}
        style={{
          ...titleStyle,
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
      title="Click to rename section"
      className="btn-transition truncate text-left"
      style={{
        ...titleStyle,
        background: 'transparent',
        border: '1px solid transparent',
        borderRadius: 4,
        padding: '1px 5px',
        margin: '-1px -5px',
        cursor: 'text',
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.background = 'var(--lp-surface)';
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.background = 'transparent';
      }}
    >
      {value}
    </button>
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
  autoEdit = false,
  onAutoEditConsumed,
}: {
  value: string;
  onCommit: (next: string) => void;
  autoEdit?: boolean;
  onAutoEditConsumed?: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  const inputRef = useRef<HTMLInputElement>(null);
  const autoEditDone = useRef(false);

  // Fix-pack B Task 2 — a just-created line opens straight into edit.
  useEffect(() => {
    if (autoEdit && !autoEditDone.current) {
      autoEditDone.current = true;
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setEditing(true);
      onAutoEditConsumed?.();
    }
  }, [autoEdit, onAutoEditConsumed]);

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

