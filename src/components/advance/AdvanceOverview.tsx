'use client';

/* ============================================
   LOWPASS — Advance Overview (UX22 phase 1)

   Show list as the dominant element. Filter chips + search + ⋯ menu in
   a single toolbar; the legacy "Suggested form layouts" grid and the
   right-side Layout Templates / Last Edit aside are retired (the 5%
   information they carried moved into the toolbar text + ⋯ menu).

   Existing features preserved end-to-end:
   - Click row (show day) → /advance/[tourId]/[routingId]
   - Click row (off / travel / rehearsal) → DayOffNotesModal
   - Per-row context menu: Open advance / Copy advance / Mark
     complete-or-in-progress / Delete
   - Toolbar ⋯ menu: Apply template / Manage templates / Copy advance /
     Print
   - Copy-from-URL flow (?copy=routingId) still opens CopyAdvanceModal
   ============================================ */

import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import {
  ArrowRight,
  CheckCircle2,
  Copy,
  ExternalLink,
  LayoutTemplate,
  ListOrdered,
  Loader2,
  Printer,
  Search,
  Trash2,
} from 'lucide-react';
import {
  cn,
  dayTypesInclude,
  getAdvanceStatusInfo,
  getDayTypeLabel,
  parseRoutingDate,
} from '@/lib/utils';
import { formatRelativeTime } from '@/lib/format-relative';
import { colourForDayType } from '@/lib/routing/dayType';
import { useToast } from '@/components/ui/Toast';
import { CopyAdvanceModal } from '@/components/advance/CopyAdvanceModal';
import { ApplyAdvanceTemplateSlideOver } from '@/components/advance/ApplyAdvanceTemplateSlideOver';
import { BulkStatusUpdateSlideOver } from '@/components/advance/BulkStatusUpdateSlideOver';
import { ContextMenu, type ContextMenuItem } from '@/components/ui/ContextMenu';
import { DeleteConfirmationModal } from '@/components/ui/DeleteConfirmationModal';
import { DataTable } from '@/components/data-table/DataTable';
import type { ColumnDef } from '@/components/data-table/types';

export type AdvanceSection = {
  template_id: string;
  label: string;
  fields: { id: string; label: string; type: string; [key: string]: unknown }[];
  order: number;
};

export type AdvanceDateItem = {
  routing_id: string;
  date: string;
  day_type: string;
  city: string;
  venue_name: string | null;
  address?: string | null;
  advance: {
    instance_id: string;
    status: string;
    section_statuses: Record<string, { status: string; assigned_to?: string }>;
    form_config_id: string;
    sections: AdvanceSection[];
    last_updated_at?: string | null;
  } | null;
};

type StatusFilter = 'all' | 'not_started' | 'in_progress' | 'complete' | 'needs_review';

type FormTemplate = { id: string; name: string; sections: AdvanceSection[] };

const STATUS_FILTER_OPTIONS: ReadonlyArray<readonly [StatusFilter, string]> = [
  ['all', 'All'],
  ['not_started', 'Not started'],
  ['in_progress', 'In progress'],
  ['complete', 'Complete'],
  ['needs_review', 'Needs review'],
] as const;

const STATUS_TOKEN: Record<string, string> = {
  not_started: 'var(--color-lp-status-not-started)',
  in_progress: 'var(--color-lp-status-in-progress)',
  complete: 'var(--color-lp-status-complete)',
  needs_review: 'var(--color-lp-status-needs-review)',
};

function isShowDay(dayTypeCsv: string | null | undefined): boolean {
  if (!dayTypeCsv) return false;
  return dayTypesInclude(dayTypeCsv, 'show') || dayTypesInclude(dayTypeCsv, 'festival');
}

type Progress = {
  total: number;
  complete: number;
  inProgress: number;
};

function computeProgress(item: AdvanceDateItem): Progress {
  const sections = item.advance?.sections ?? [];
  const sectionStatuses = item.advance?.section_statuses ?? {};
  let complete = 0;
  let inProgress = 0;
  for (const sec of sections) {
    const key = (sec as { template_id?: string }).template_id ?? sec.label;
    if (!key) continue;
    const status = sectionStatuses[key]?.status;
    if (status === 'complete') complete++;
    else if (status === 'in_progress') inProgress++;
  }
  return { total: sections.length, complete, inProgress };
}

function StatusPill({ status }: { status: string }) {
  const info = getAdvanceStatusInfo(status);
  const dotColour = STATUS_TOKEN[status] ?? STATUS_TOKEN.not_started;
  return (
    <span
      className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium"
      style={{
        background: `color-mix(in srgb, ${dotColour} 12%, transparent)`,
        color: dotColour,
      }}
    >
      <span
        aria-hidden
        className="h-1.5 w-1.5 rounded-full"
        style={{ background: dotColour }}
      />
      {info.label}
    </span>
  );
}

function ProgressBar({ progress }: { progress: Progress }) {
  const { total, complete, inProgress } = progress;
  if (total === 0) {
    return <span className="text-xs text-lp-text-tertiary tabular-nums">0/0</span>;
  }
  const completePct = Math.round((complete / total) * 100);
  const inProgressPct = Math.round((inProgress / total) * 100);
  return (
    <div className="flex items-center gap-2">
      <div
        className="h-1.5 w-16 overflow-hidden rounded-full"
        style={{ background: 'var(--lp-bg-tertiary)' }}
        aria-hidden
      >
        <div className="flex h-full">
          <div style={{ width: `${completePct}%`, background: 'var(--color-lp-status-complete)' }} />
          <div
            style={{
              width: `${inProgressPct}%`,
              background: 'var(--color-lp-status-in-progress)',
              opacity: 0.45,
            }}
          />
        </div>
      </div>
      <span className="text-xs text-lp-text-secondary tabular-nums">
        {complete}/{total}
      </span>
    </div>
  );
}

type RowVm = AdvanceDateItem & {
  /** Pre-computed for table cells / filter / search. */
  isShow: boolean;
  effectiveStatus: StatusFilter;
  progress: Progress;
  searchHaystack: string;
  dateLabel: string;
};

function buildRowVm(item: AdvanceDateItem): RowVm {
  const isShow = isShowDay(item.day_type);
  const status = (item.advance?.status as StatusFilter | undefined) ?? 'not_started';
  return {
    ...item,
    isShow,
    effectiveStatus: status,
    progress: computeProgress(item),
    searchHaystack: [item.venue_name, item.city, item.address].filter(Boolean).join(' ').toLowerCase(),
    dateLabel: parseRoutingDate(item.date).toLocaleDateString('en-GB', {
      weekday: 'short',
      day: '2-digit',
      month: 'short',
    }),
  };
}

export function AdvanceOverview({
  tourId,
  initialCopyRoutingId,
}: {
  tourId: string;
  /** When set (e.g. from ?copy=), open Copy Advance modal with this as source */
  initialCopyRoutingId?: string | null;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { showToast } = useToast();
  const [dates, setDates] = useState<AdvanceDateItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [copyModalOpen, setCopyModalOpen] = useState(false);
  const [copySourceRoutingId, setCopySourceRoutingId] = useState<string | null>(null);
  const [templateModalOpen, setTemplateModalOpen] = useState(false);
  const [templateInitialId, setTemplateInitialId] = useState<string | null>(null);
  const [dayOffNotesItem, setDayOffNotesItem] = useState<AdvanceDateItem | null>(null);
  const [formTemplates, setFormTemplates] = useState<FormTemplate[]>([]);
  const [formTemplatesLoading, setFormTemplatesLoading] = useState(true);
  const [bulkRow, setBulkRow] = useState<AdvanceDateItem | null>(null);
  const [bulkStatusOpen, setBulkStatusOpen] = useState(false);

  const copyFromUrl = initialCopyRoutingId ?? searchParams.get('copy');
  useEffect(() => {
    if (copyFromUrl && dates.length > 0) {
      setCopySourceRoutingId(copyFromUrl);
      setCopyModalOpen(true);
    }
  }, [copyFromUrl, dates.length]);

  useEffect(() => {
    let cancelled = false;
    fetch('/api/advance/layout-templates')
      .then((r) => (r.ok ? r.json() : { templates: [] }))
      .then((j) => {
        if (cancelled) return;
        setFormTemplates(j.templates ?? []);
        setFormTemplatesLoading(false);
      })
      .catch(() => {
        if (cancelled) return;
        setFormTemplates([]);
        setFormTemplatesLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [tourId]);

  const fetchDates = (signal?: AbortSignal) =>
    fetch(`/api/tours/${tourId}/advance?all=true`, { signal })
      .then((r) => (r.ok ? r.json() : { dates: [] }))
      .then((j) => {
        setDates(j.dates ?? []);
        setLoading(false);
      })
      .catch(() => {
        if (signal?.aborted) return;
        setDates([]);
        setLoading(false);
      });

  useEffect(() => {
    const ac = new AbortController();
    void fetchDates(ac.signal);
    return () => ac.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tourId, pathname]);

  const tourLastUpdatedAt = useMemo(() => {
    let maxMs = 0;
    for (const d of dates) {
      const iso = d.advance?.last_updated_at;
      if (!iso) continue;
      const t = new Date(iso).getTime();
      if (Number.isFinite(t) && t > maxMs) maxMs = t;
    }
    return maxMs > 0 ? new Date(maxMs).toISOString() : null;
  }, [dates]);

  const showRowVms = useMemo<RowVm[]>(() => dates.map(buildRowVm), [dates]);

  const filteredRows = useMemo<RowVm[]>(() => {
    let list = showRowVms;
    if (statusFilter !== 'all') {
      list = list.filter((r) => {
        // Off-day rows fall under "not_started" by virtue of having no advance.
        if (!r.isShow && statusFilter !== 'not_started') return false;
        if (!r.advance) return statusFilter === 'not_started';
        return r.advance.status === statusFilter;
      });
    }
    if (searchQuery.trim()) {
      const q = searchQuery.trim().toLowerCase();
      list = list.filter((r) => r.searchHaystack.includes(q));
    }
    return list;
  }, [showRowVms, statusFilter, searchQuery]);

  const showCount = useMemo(() => showRowVms.filter((r) => r.isShow).length, [showRowVms]);

  const onPatched = () => {
    void fetchDates();
  };

  const buildRowMenu = (row: RowVm): ContextMenuItem[] => {
    const items: ContextMenuItem[] = [];
    if (row.isShow) {
      items.push({
        label: 'Open advance',
        icon: ExternalLink,
        onClick: () => router.push(`/advance/${tourId}/${row.routing_id}`),
      });
      items.push({
        label: 'Copy advance…',
        icon: Copy,
        onClick: () => {
          setCopySourceRoutingId(row.routing_id);
          setCopyModalOpen(true);
        },
      });
      if (row.advance && row.advance.status !== 'complete') {
        items.push({
          label: 'Mark as complete',
          icon: CheckCircle2,
          onClick: () => {
            void fetch(`/api/tours/${tourId}/advance/${row.routing_id}`, {
              method: 'PATCH',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ status: 'complete' }),
            }).then((r) => {
              if (r.ok) {
                showToast('Marked as complete');
                onPatched();
                router.refresh();
              }
            });
          },
        });
      }
      if (row.advance && row.advance.status === 'complete') {
        items.push({
          label: 'Mark as in progress',
          icon: ListOrdered,
          onClick: () => {
            void fetch(`/api/tours/${tourId}/advance/${row.routing_id}`, {
              method: 'PATCH',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ status: 'in_progress' }),
            }).then((r) => {
              if (r.ok) {
                showToast('Marked as in progress');
                onPatched();
                router.refresh();
              }
            });
          },
        });
      }
      if (row.advance) {
        items.push({
          label: 'Delete advance',
          icon: Trash2,
          variant: 'danger',
          onClick: () => setBulkRow(row),
        });
      }
    } else {
      items.push({
        label: 'Edit note',
        icon: ExternalLink,
        onClick: () => setDayOffNotesItem(row),
      });
    }
    return items;
  };

  const columns = useMemo<ColumnDef<RowVm>[]>(
    () => [
      {
        id: 'date',
        header: 'Date',
        accessor: (r) => r.date,
        sortable: true,
        width: 168,
        cell: (_v, r) => (
          <div className="flex items-center gap-3">
            <span
              aria-hidden
              className="block h-8 w-1 shrink-0 rounded-sm"
              style={{ background: colourForDayType(r.day_type) }}
            />
            <div className="min-w-0">
              <div className="text-sm font-medium text-lp-text">{r.dateLabel}</div>
              {r.day_type ? (
                <div className="text-xs capitalize text-lp-text-tertiary">
                  {getDayTypeLabel(r.day_type)}
                </div>
              ) : null}
            </div>
          </div>
        ),
      },
      {
        id: 'venue',
        header: 'Venue',
        accessor: (r) => r.venue_name ?? '',
        sortable: true,
        flex: true,
        cell: (_v, r) => (
          <span className={cn('truncate', !r.isShow && 'text-lp-text-secondary')}>
            {r.isShow
              ? r.venue_name || '—'
              : `${getDayTypeLabel(r.day_type) || 'Off'}${r.city ? ` · ${r.city}` : ''}`}
          </span>
        ),
      },
      {
        id: 'city',
        header: 'City',
        accessor: (r) => r.city ?? '',
        sortable: true,
        cell: (_v, r) => <span className="truncate text-sm text-lp-text-secondary">{r.isShow ? r.city || '—' : ''}</span>,
      },
      {
        id: 'status',
        header: 'Status',
        accessor: (r) => r.effectiveStatus,
        width: 132,
        cell: (_v, r) => (r.isShow ? <StatusPill status={r.effectiveStatus} /> : null),
      },
      {
        id: 'progress',
        header: 'Sections',
        accessor: (r) => r.progress.complete,
        sortable: true,
        width: 136,
        cell: (_v, r) => (r.isShow ? <ProgressBar progress={r.progress} /> : null),
      },
      {
        id: 'actions',
        header: '',
        accessor: () => '',
        width: 48,
        cell: (_v, r) => (
          <div onClick={(e) => e.stopPropagation()}>
            <ContextMenu items={buildRowMenu(r)} align="right" />
          </div>
        ),
      },
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [tourId, router, showToast],
  );

  const onRowClick = (row: RowVm) => {
    if (row.isShow) {
      router.push(`/advance/${tourId}/${row.routing_id}`);
    } else {
      setDayOffNotesItem(row);
    }
  };

  const overflowMenuItems: ContextMenuItem[] = [
    {
      label: 'Apply layout to shows…',
      icon: LayoutTemplate,
      onClick: () => {
        setTemplateInitialId(null);
        setTemplateModalOpen(true);
      },
    },
    {
      label: 'Manage templates',
      icon: ExternalLink,
      onClick: () => router.push('/templates?type=advance'),
    },
    {
      label: 'Copy advance content…',
      icon: Copy,
      onClick: () => {
        setCopySourceRoutingId(null);
        setCopyModalOpen(true);
      },
    },
    {
      label: 'Bulk update status…',
      icon: CheckCircle2,
      onClick: () => setBulkStatusOpen(true),
    },
    {
      label: 'Print overview',
      icon: Printer,
      onClick: () => window.print(),
    },
  ];

  if (loading) {
    return (
      <div className="flex items-center justify-center rounded-xl border border-lp-border bg-lp-surface py-16">
        <Loader2 className="h-8 w-8 animate-spin text-lp-text-tertiary" />
      </div>
    );
  }

  if (dates.length === 0) {
    return (
      <div className="rounded-xl border border-lp-border bg-lp-surface p-8 text-center">
        <p className="text-lp-text-secondary">
          No show dates in routing yet. Add shows to your routing first.
        </p>
        <Link
          href={`/tours/${tourId}`}
          className="mt-4 inline-flex items-center gap-2 text-sm font-medium text-lp-orange hover:text-lp-orange-hover"
        >
          Go to routing
          <ArrowRight size={16} />
        </Link>
      </div>
    );
  }

  return (
    <>
      <div className="space-y-4">
        {/* Toolbar */}
        <div className="flex flex-wrap items-center gap-3">
          <div
            className="flex flex-wrap items-stretch overflow-hidden rounded-xl border"
            style={{ borderColor: 'var(--lp-border)', background: 'var(--lp-surface)' }}
            role="tablist"
            aria-label="Filter by status"
          >
            {STATUS_FILTER_OPTIONS.map(([value, label]) => {
              const active = statusFilter === value;
              return (
                <button
                  key={value}
                  type="button"
                  role="tab"
                  aria-selected={active}
                  onClick={() => setStatusFilter(value)}
                  className={cn(
                    'px-3 py-2 text-sm font-medium transition-colors',
                    active
                      ? 'bg-lp-bg-tertiary text-lp-text'
                      : 'text-lp-text-secondary hover:text-lp-text',
                  )}
                >
                  {label}
                </button>
              );
            })}
          </div>

          <div className="relative min-w-[200px] flex-1">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-lp-text-tertiary" />
            <input
              type="text"
              placeholder="Search venue, city or address…"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full rounded-xl border border-lp-border bg-lp-surface py-2 pl-9 pr-3 text-sm text-lp-text placeholder:text-lp-text-tertiary focus:border-lp-orange focus:outline-none focus:ring-2"
              style={{ ['--tw-ring-color' as string]: 'color-mix(in srgb, var(--color-lp-orange) 20%, transparent)' }}
            />
          </div>

          <div className="ml-auto flex shrink-0 items-center gap-3 text-xs text-lp-text-tertiary">
            <span title={tourLastUpdatedAt ?? undefined}>
              {showCount} show{showCount === 1 ? '' : 's'} ·{' '}
              <span className="text-lp-text-secondary">Last edit {formatRelativeTime(tourLastUpdatedAt)}</span>
              {formTemplatesLoading ? null : ` · ${formTemplates.length} template${formTemplates.length === 1 ? '' : 's'}`}
            </span>
            <div>
              <ContextMenu items={overflowMenuItems} align="right" />
            </div>
          </div>
        </div>

        {/* Show list */}
        <DataTable<RowVm>
          rows={filteredRows}
          columns={columns}
          rowKey={(r) => r.routing_id}
          searchable={false}
          onRowClick={onRowClick}
          rowClassName={(r) => (r.isShow ? '' : 'opacity-70')}
          columnWidthsKey={`lp-cols-advance:${tourId}`}
          emptyState={
            <div className="px-3 py-8 text-center text-sm" style={{ color: 'var(--lp-text-tertiary)' }}>
              No shows match the current filters.
            </div>
          }
        />
      </div>

      <CopyAdvanceModal
        tourId={tourId}
        dates={dates}
        initialSourceRoutingId={copySourceRoutingId ?? copyFromUrl ?? undefined}
        open={copyModalOpen}
        onClose={() => {
          setCopyModalOpen(false);
          setCopySourceRoutingId(null);
          if (copyFromUrl) router.replace(`/advance/${tourId}`, { scroll: false });
        }}
        onSuccess={(copiedCount) => {
          showToast(`Advance copied to ${copiedCount} show${copiedCount !== 1 ? 's' : ''}`);
          void fetchDates();
        }}
      />

      <ApplyAdvanceTemplateSlideOver
        key={templateInitialId ?? 'all'}
        open={templateModalOpen}
        tourId={tourId}
        dates={dates}
        templates={formTemplates}
        loading={formTemplatesLoading}
        initialTemplateId={templateInitialId}
        onClose={() => {
          setTemplateModalOpen(false);
          setTemplateInitialId(null);
        }}
        onDone={() => {
          setTemplateModalOpen(false);
          setTemplateInitialId(null);
          router.refresh();
          void fetchDates();
        }}
      />

      <BulkStatusUpdateSlideOver
        open={bulkStatusOpen}
        tourId={tourId}
        dates={dates}
        onClose={() => setBulkStatusOpen(false)}
        onDone={() => {
          setBulkStatusOpen(false);
          showToast('Statuses updated');
          router.refresh();
          void fetchDates();
        }}
      />

      {dayOffNotesItem && (
        <DayOffNotesModal
          tourId={tourId}
          item={dayOffNotesItem}
          onClose={() => setDayOffNotesItem(null)}
          onSaved={() => {
            setDayOffNotesItem(null);
            void fetchDates();
          }}
        />
      )}

      {bulkRow ? (
        <DeleteConfirmationModal
          open
          itemName={`${parseRoutingDate(bulkRow.date).toLocaleDateString('en-GB', { weekday: 'short', day: '2-digit', month: 'short' })} — ${bulkRow.venue_name || bulkRow.city || ''}`}
          onClose={() => setBulkRow(null)}
          onConfirm={async () => {
            const res = await fetch(`/api/tours/${tourId}/advance/${bulkRow.routing_id}`, {
              method: 'DELETE',
            });
            if (!res.ok) {
              const data = await res.json().catch(() => ({}));
              throw new Error(data.error ?? 'Failed to delete advance');
            }
            showToast('Advance deleted');
          }}
          onDeleted={() => {
            setBulkRow(null);
            void fetchDates();
          }}
        />
      ) : null}
    </>
  );
}

/* ──────────────────────────────────────────────────────────────────────────
   DayOffNotesModal — unchanged from the prior implementation, just lifted
   into its own block for readability. Will move into the SlideOver primitive
   in a later UX22 polish pass; for now the lightweight popover is fine.
   ────────────────────────────────────────────────────────────────────────── */

function DayOffNotesModal({
  tourId,
  item,
  onClose,
  onSaved,
}: {
  tourId: string;
  item: AdvanceDateItem;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [notes, setNotes] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hasInstance, setHasInstance] = useState(false);
  const existingDataRef = useRef<Record<string, unknown>>({});

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    fetch(`/api/tours/${tourId}/advance/${item.routing_id}`)
      .then((r) => {
        if (r.ok) return r.json();
        if (r.status === 404) return null;
        throw new Error('Failed to load');
      })
      .then((data) => {
        if (cancelled) return;
        if (data?.advance?.data) {
          setHasInstance(true);
          existingDataRef.current = (data.advance.data as Record<string, unknown>) ?? {};
          setNotes(((existingDataRef.current.day_off_notes as string) ?? ''));
        } else {
          setHasInstance(false);
          setNotes('');
        }
      })
      .catch(() => {
        if (!cancelled) setError('Could not load advance');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [tourId, item.routing_id]);

  const handleSave = async () => {
    setSaving(true);
    setError(null);
    try {
      if (!hasInstance) {
        const createRes = await fetch(`/api/tours/${tourId}/advance`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ routing_id: item.routing_id, sections: [] }),
        });
        if (!createRes.ok) throw new Error('Could not create advance');
        setHasInstance(true);
      }
      const nextData = { ...existingDataRef.current, day_off_notes: notes };
      const patchRes = await fetch(`/api/tours/${tourId}/advance/${item.routing_id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ data: nextData }),
      });
      if (!patchRes.ok) throw new Error('Could not save note');
      onSaved();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save');
    } finally {
      setSaving(false);
    }
  };

  const dateLabel = parseRoutingDate(item.date).toLocaleDateString('en-GB', {
    weekday: 'short',
    day: '2-digit',
    month: 'short',
  });
  const isTravel = dayTypesInclude(item.day_type ?? '', 'travel');
  const typeLabel = isTravel ? 'Travel' : 'Day Off';

  return (
    <div className="fixed inset-0 z-[2000] flex items-center justify-center bg-black/60 p-4" onClick={onClose}>
      <div
        className="w-full max-w-md rounded-xl border border-lp-border bg-lp-surface p-5 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="text-base font-semibold text-lp-text">Advance note — {typeLabel}</h3>
        <p className="mt-1 text-sm text-lp-text-tertiary">
          {dateLabel}
          {item.city ? ` · ${item.city}` : ''}
        </p>
        {loading ? (
          <p className="mt-4 text-sm text-lp-text-tertiary">Loading…</p>
        ) : (
          <>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Add a note for this date…"
              rows={4}
              className="mt-4 w-full rounded-xl border border-lp-border bg-lp-surface px-3 py-2 text-sm text-lp-text placeholder:text-lp-text-tertiary focus:border-lp-orange focus:outline-none"
            />
            {error ? <p className="mt-2 text-sm text-red-500">{error}</p> : null}
            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                onClick={onClose}
                className="rounded-xl border border-lp-border px-4 py-2 text-sm font-medium text-lp-text hover:bg-lp-surface-hover"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSave}
                disabled={saving}
                className="rounded-xl bg-lp-orange px-4 py-2 text-sm font-medium text-white hover:bg-lp-orange-hover disabled:opacity-50"
              >
                {saving ? 'Saving…' : 'Save note'}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

