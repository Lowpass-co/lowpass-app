'use client';

/* ============================================
   LOWPASS — Advance Overview (client)

   Fetches advance data, filters, progress, modals.
   ============================================ */

import { useState, useEffect, useMemo } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import {
  ChevronRight,
  Copy,
  LayoutTemplate,
  Search,
  ArrowRight,
  Loader2,
  CheckCircle2,
  Trash2,
  ExternalLink,
} from 'lucide-react';
import { parseRoutingDate, getDayTypeLabel, getDayTypeColor, getAdvanceStatusInfo, cn } from '@/lib/utils';
import { useToast } from '@/components/ui/Toast';
import { CopyAdvanceModal } from '@/components/advance/CopyAdvanceModal';
import { ContextMenu } from '@/components/ui/ContextMenu';
import { DeleteConfirmationModal } from '@/components/ui/DeleteConfirmationModal';

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
  advance: {
    instance_id: string;
    status: string;
    section_statuses: Record<string, { status: string; assigned_to?: string }>;
    form_config_id: string;
    sections: AdvanceSection[];
  } | null;
};

type StatusFilter = 'all' | 'not_started' | 'in_progress' | 'complete' | 'needs_review';

type FormTemplate = { id: string; name: string; sections: AdvanceSection[] };

export function AdvanceOverview({
  tourId,
  tourName,
  initialCopyRoutingId,
}: {
  tourId: string;
  tourName: string;
  /** When set (e.g. from ?copy=), open Copy Advance modal with this as source */
  initialCopyRoutingId?: string | null;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { showToast } = useToast();
  const [dates, setDates] = useState<AdvanceDateItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [copyModalOpen, setCopyModalOpen] = useState(false);
  const [copySourceRoutingId, setCopySourceRoutingId] = useState<string | null>(null);
  const [templateModalOpen, setTemplateModalOpen] = useState(false);

  const copyFromUrl = initialCopyRoutingId ?? searchParams.get('copy');
  useEffect(() => {
    if (copyFromUrl && dates.length > 0) {
      setCopySourceRoutingId(copyFromUrl);
      setCopyModalOpen(true);
    }
  }, [copyFromUrl, dates.length]);
  const [formTemplates, setFormTemplates] = useState<FormTemplate[]>([]);
  const [formTemplatesLoading, setFormTemplatesLoading] = useState(false);

  useEffect(() => {
    let cancelled = false;
    async function fetchAdvance() {
      const res = await fetch(`/api/tours/${tourId}/advance`);
      if (!res.ok) {
        if (!cancelled) setDates([]);
        return;
      }
      const json = await res.json();
      if (!cancelled) setDates(json.dates ?? []);
    }
    fetchAdvance();
    return () => { cancelled = true; };
  }, [tourId]);

  useEffect(() => {
    setLoading(false);
  }, [dates]);

  const filteredDates = useMemo(() => {
    let list = dates;
    if (statusFilter !== 'all') {
      list = list.filter((d) => {
        if (!d.advance) return statusFilter === 'not_started';
        return d.advance.status === statusFilter;
      });
    }
    if (searchQuery.trim()) {
      const q = searchQuery.trim().toLowerCase();
      list = list.filter(
        (d) =>
          (d.venue_name ?? '').toLowerCase().includes(q) ||
          (d.city ?? '').toLowerCase().includes(q)
      );
    }
    return list;
  }, [dates, statusFilter, searchQuery]);

  const { completeSections, totalSections } = useMemo(() => {
    let complete = 0;
    let total = 0;
    for (const d of dates) {
      if (!d.advance) continue;
      const sections = d.advance.sections ?? [];
      const statuses = d.advance.section_statuses ?? {};
      total += sections.length;
      for (const sec of sections) {
        const key = sec.template_id ?? sec.label;
        if (statuses[key]?.status === 'complete') complete += 1;
      }
    }
    return { completeSections: complete, totalSections: total };
  }, [dates]);

  const progressPercent = totalSections > 0 ? Math.round((completeSections / totalSections) * 100) : 0;

  const openCopyModal = () => setCopyModalOpen(true);
  const openTemplateModal = () => {
    setTemplateModalOpen(true);
    setFormTemplatesLoading(true);
    fetch('/api/advance/layout-templates')
      .then((r) => (r.ok ? r.json() : { templates: [] }))
      .then((j) => setFormTemplates(j.templates ?? []))
      .catch(() => setFormTemplates([]))
      .finally(() => setFormTemplatesLoading(false));
  };

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      {/* Progress bar */}
      {dates.length > 0 && (
        <div className="rounded-xl border border-lp-border bg-lp-surface p-4">
          <div className="mb-2 flex items-center justify-between text-sm">
            <span className="text-lp-text-secondary">Tour advance progress</span>
            <span className="font-medium text-lp-text">
              {completeSections} of {totalSections} sections complete
            </span>
          </div>
          <div className="h-2 w-full overflow-hidden rounded-full bg-lp-bg-tertiary">
            <div
              className="h-full rounded-full bg-lp-orange transition-all duration-300"
              style={{ width: `${progressPercent}%` }}
            />
          </div>
        </div>
      )}

      {/* Filter bar */}
      {dates.length > 0 && (
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex rounded-xl border border-lp-border bg-lp-surface">
            {(
              [
                ['all', 'All'],
                ['not_started', 'Not Started'],
                ['in_progress', 'In Progress'],
                ['complete', 'Complete'],
                ['needs_review', 'Needs Review'],
              ] as const
            ).map(([value, label]) => (
              <button
                key={value}
                type="button"
                onClick={() => setStatusFilter(value)}
                className={cn(
                  'px-3 py-2 text-sm font-medium transition-colors',
                  statusFilter === value
                    ? 'bg-lp-bg-tertiary text-lp-text'
                    : 'text-lp-text-secondary hover:text-lp-text'
                )}
              >
                {label}
              </button>
            ))}
          </div>
          <div className="relative flex-1 min-w-[200px]">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-lp-text-tertiary" />
            <input
              type="text"
              placeholder="Search venue or city..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full rounded-xl border border-lp-border bg-lp-surface py-2 pl-9 pr-3 text-sm text-lp-text placeholder:text-lp-text-tertiary focus:border-lp-orange focus:outline-none focus:ring-2 focus:ring-lp-orange/20"
            />
          </div>
        </div>
      )}

      {/* Show list */}
      {loading ? (
        <div className="flex items-center justify-center rounded-xl border border-lp-border bg-lp-surface py-16">
          <Loader2 className="h-8 w-8 animate-spin text-lp-text-tertiary" />
        </div>
      ) : filteredDates.length === 0 ? (
        <div className="rounded-xl border border-lp-border bg-lp-surface p-8 text-center">
          <p className="text-lp-text-secondary">
            {dates.length === 0
              ? 'No show dates in routing yet. Add shows to your routing first.'
              : 'No shows match the current filters.'}
          </p>
          {dates.length === 0 && (
            <Link
              href={`/tours/${tourId}`}
              className="mt-4 inline-flex items-center gap-2 text-sm font-medium text-lp-orange hover:text-lp-orange-hover"
            >
              Go to routing
              <ArrowRight size={16} />
            </Link>
          )}
        </div>
      ) : (
        <ul className="space-y-2">
          {filteredDates.map((item) => (
            <ShowRow
              key={item.routing_id}
              tourId={tourId}
              item={item}
              onOpenCopyModal={(routingId) => {
                setCopySourceRoutingId(routingId);
                setCopyModalOpen(true);
              }}
              onDeleted={() => {
                fetch(`/api/tours/${tourId}/advance`)
                  .then((r) => r.json())
                  .then((j) => setDates(j.dates ?? []));
              }}
            />
          ))}
        </ul>
      )}

      {/* Batch actions */}
      {dates.length > 0 && (
        <div className="flex flex-wrap justify-end gap-2">
          <button
            type="button"
            onClick={openCopyModal}
            className="inline-flex items-center gap-2 rounded-xl border border-lp-border bg-lp-surface px-4 py-2 text-sm font-medium text-lp-text hover:bg-lp-surface-hover"
          >
            <Copy size={16} />
            Copy advance...
          </button>
          <button
            type="button"
            onClick={openTemplateModal}
            className="inline-flex items-center gap-2 rounded-xl border border-lp-border bg-lp-surface px-4 py-2 text-sm font-medium text-lp-text hover:bg-lp-surface-hover"
          >
            <LayoutTemplate size={16} />
            Apply template...
          </button>
        </div>
      )}

      <CopyAdvanceModal
        tourId={tourId}
        dates={dates}
        initialSourceRoutingId={copySourceRoutingId ?? copyFromUrl ?? undefined}
        open={copyModalOpen}
        onClose={() => {
          setCopyModalOpen(false);
          setCopySourceRoutingId(null);
          if (copyFromUrl) router.replace(`/tours/${tourId}/advance`, { scroll: false });
        }}
        onSuccess={(copiedCount) => {
          showToast(`Advance copied to ${copiedCount} show${copiedCount !== 1 ? 's' : ''}`);
          fetch(`/api/tours/${tourId}/advance`)
            .then((r) => r.json())
            .then((j) => setDates(j.dates ?? []));
        }}
      />

      {templateModalOpen && (
        <ApplyTemplateModal
          tourId={tourId}
          dates={dates}
          templates={formTemplates}
          loading={formTemplatesLoading}
          onClose={() => setTemplateModalOpen(false)}
          onDone={() => {
            setTemplateModalOpen(false);
            router.refresh();
            fetch(`/api/tours/${tourId}/advance`)
              .then((r) => r.json())
              .then((j) => setDates(j.dates ?? []));
          }}
        />
      )}
    </div>
  );
}

function ShowRow({
  tourId,
  item,
  onOpenCopyModal,
  onDeleted,
}: {
  tourId: string;
  item: AdvanceDateItem;
  onOpenCopyModal?: (routingId: string) => void;
  onDeleted?: () => void;
}) {
  const router = useRouter();
  const { showToast } = useToast();
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deletingFade, setDeletingFade] = useState(false);
  const [markingComplete, setMarkingComplete] = useState(false);

  const dateLabel = parseRoutingDate(item.date).toLocaleDateString('en-GB', {
    weekday: 'short',
    day: '2-digit',
    month: 'short',
  });
  const dayTypeColors = item.day_type ? getDayTypeColor(item.day_type) : null;
  const hasAdvance = !!item.advance;
  const sectionCount = item.advance?.sections?.length ?? 0;
  const sectionStatuses = item.advance?.section_statuses ?? {};
  const completeCount = item.advance?.sections?.reduce((n, sec) => {
    const key = (sec as { template_id?: string }).template_id ?? (sec as { label?: string }).label;
    if (!key) return n;
    return n + (sectionStatuses[key]?.status === 'complete' ? 1 : 0);
  }, 0) ?? 0;
  const inProgressCount = item.advance?.sections?.reduce((n, sec) => {
    const key = (sec as { template_id?: string }).template_id ?? (sec as { label?: string }).label;
    if (!key) return n;
    return n + (sectionStatuses[key]?.status === 'in_progress' ? 1 : 0);
  }, 0) ?? 0;
  const notStartedCount = Math.max(0, sectionCount - completeCount - inProgressCount);
  const statusInfo = hasAdvance ? getAdvanceStatusInfo(item.advance!.status) : getAdvanceStatusInfo('not_started');
  const isComplete = item.advance?.status === 'complete';
  const rowLabel = [dateLabel, item.venue_name || item.city || '—'].filter(Boolean).join(' — ') || 'this advance';

  const handleClick = (e: React.MouseEvent) => {
    const target = e.target as HTMLElement;
    if (target.closest('button') || target.closest('a') || target.closest('[data-context-menu]')) return;
    router.push(`/tours/${tourId}/advance/${item.routing_id}`);
  };

  const menuItems = [
    {
      label: 'Open advance',
      icon: ExternalLink,
      onClick: () => router.push(`/tours/${tourId}/advance/${item.routing_id}`),
    },
    ...(onOpenCopyModal
      ? [{ label: 'Copy advance...', icon: Copy, onClick: () => onOpenCopyModal(item.routing_id) }]
      : []),
    ...(hasAdvance && !isComplete
      ? [{
          label: 'Mark as complete',
          icon: CheckCircle2,
          onClick: async () => {
            setMarkingComplete(true);
            try {
              const res = await fetch(`/api/tours/${tourId}/advance/${item.routing_id}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ status: 'complete' }),
              });
              if (res.ok) {
                showToast('Marked as complete');
                router.refresh();
              }
            } finally {
              setMarkingComplete(false);
            }
          },
        }]
      : []),
    ...(hasAdvance
      ? [{
          label: 'Delete advance',
          icon: Trash2,
          variant: 'danger' as const,
          onClick: () => setDeleteOpen(true),
        }]
      : []),
  ].filter(Boolean) as { label: string; icon: typeof ExternalLink; onClick: () => void; variant?: 'danger' }[];

  return (
    <li className={cn(deletingFade && 'opacity-0 bg-red-500/10 transition-all duration-200')}>
      <div
        role="button"
        tabIndex={0}
        onClick={handleClick}
        onKeyDown={(e) => e.key === 'Enter' && handleClick(e as unknown as React.MouseEvent)}
        className="flex cursor-pointer items-center gap-4 rounded-xl border border-lp-border bg-lp-surface p-4 transition-colors hover:border-lp-border-light hover:bg-lp-surface-hover"
      >
        <div className="flex shrink-0 items-center gap-3">
          <span className="w-24 text-sm font-medium text-lp-text">{dateLabel}</span>
          {dayTypeColors && (
            <span
              className={cn(
                'rounded-full px-2.5 py-0.5 text-xs font-medium',
                dayTypeColors.bg,
                dayTypeColors.text
              )}
            >
              {getDayTypeLabel(item.day_type)}
            </span>
          )}
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium text-lp-text">
            {item.venue_name || '—'}
          </p>
          <p className="truncate text-xs text-lp-text-tertiary">{item.city || '—'}</p>
        </div>
        <div className="flex shrink-0 items-center gap-3">
          {!hasAdvance ? (
            <>
              <span className="rounded-full bg-gray-500/10 px-2.5 py-0.5 text-xs font-medium text-gray-500">
                Not started
              </span>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  router.push(`/tours/${tourId}/advance/${item.routing_id}`);
                }}
                className="inline-flex items-center gap-1 text-sm font-medium text-lp-orange hover:text-lp-orange-hover"
              >
                Set up advance
                <ArrowRight size={14} />
              </button>
            </>
          ) : (
            <>
              <div className="flex items-center gap-2">
                <ProgressRing complete={completeCount} inProgress={inProgressCount} notStarted={notStartedCount} max={sectionCount} />
                <span className="text-xs text-lp-text-secondary">
                  {completeCount}/{sectionCount}
                </span>
              </div>
              <span
                className={cn(
                  'rounded-full px-2.5 py-0.5 text-xs font-medium',
                  statusInfo.bg,
                  statusInfo.color
                )}
              >
                {statusInfo.label}
              </span>
            </>
          )}
        </div>
        <div data-context-menu className="shrink-0" onClick={(e) => e.stopPropagation()}>
          <ContextMenu items={menuItems} align="right" />
        </div>
        <ChevronRight className="h-4 w-4 shrink-0 text-lp-text-tertiary" />
      </div>

      <DeleteConfirmationModal
        open={deleteOpen}
        itemName={rowLabel}
        onClose={() => setDeleteOpen(false)}
        onConfirm={async () => {
          const res = await fetch(`/api/tours/${tourId}/advance/${item.routing_id}`, { method: 'DELETE' });
          if (!res.ok) {
            const data = await res.json().catch(() => ({}));
            throw new Error(data.error ?? 'Failed to delete advance');
          }
          showToast('Advance deleted');
        }}
        onDeleted={() => {
          setDeletingFade(true);
          setTimeout(() => onDeleted?.(), 200);
        }}
      />
    </li>
  );
}

function ProgressRing({
  complete,
  inProgress,
  notStarted,
  max,
}: { complete: number; inProgress: number; notStarted: number; max: number }) {
  const radius = 14;
  const stroke = 3;
  const circumference = 2 * Math.PI * (radius - stroke / 2);
  const total = max > 0 ? max : 1;
  const grayLen = (notStarted / total) * circumference;
  const blueLen = (inProgress / total) * circumference;
  const orangeLen = (complete / total) * circumference;
  return (
    <svg width={28} height={28} className="-rotate-90" style={{ transition: 'cubic-bezier(0.4, 0, 0.2, 1)' }}>
      <circle
        cx={14}
        cy={14}
        r={radius - stroke / 2}
        fill="none"
        stroke="currentColor"
        strokeWidth={stroke}
        className="text-gray-500/60"
        strokeDasharray={`${grayLen} ${circumference - grayLen}`}
        strokeDashoffset={-(blueLen + orangeLen)}
        strokeLinecap="round"
      />
      <circle
        cx={14}
        cy={14}
        r={radius - stroke / 2}
        fill="none"
        stroke="currentColor"
        strokeWidth={stroke}
        className="text-blue-500/30"
        strokeDasharray={`${blueLen} ${circumference - blueLen}`}
        strokeDashoffset={0}
        strokeLinecap="round"
      />
      <circle
        cx={14}
        cy={14}
        r={radius - stroke / 2}
        fill="none"
        stroke="currentColor"
        strokeWidth={stroke}
        className="text-lp-orange"
        strokeDasharray={`${orangeLen} ${circumference - orangeLen}`}
        strokeDashoffset={-blueLen}
        strokeLinecap="round"
      />
    </svg>
  );
}

function ApplyTemplateModal({
  tourId,
  dates,
  templates,
  loading,
  onClose,
  onDone,
}: {
  tourId: string;
  dates: AdvanceDateItem[];
  templates: FormTemplate[];
  loading: boolean;
  onClose: () => void;
  onDone: () => void;
}) {
  const [templateId, setTemplateId] = useState('');
  const [targetIds, setTargetIds] = useState<Set<string>>(new Set());
  const [submitting, setSubmitting] = useState(false);
  const [previewId, setPreviewId] = useState<string | null>(null);

  const selectedTemplate = templates.find((t) => t.id === templateId);
  const selectedTargetsHaveData = Array.from(targetIds).some((id) => {
    const d = dates.find((x) => x.routing_id === id);
    return d?.advance != null;
  });

  const toggleTarget = (id: string) => {
    setTargetIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleSubmit = async () => {
    if (!selectedTemplate || targetIds.size === 0) return;
    setSubmitting(true);
    try {
      let ok = true;
      for (const routingId of targetIds) {
        const res = await fetch(`/api/tours/${tourId}/advance`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ routing_id: routingId, sections: selectedTemplate.sections }),
        });
        if (!res.ok) ok = false;
      }
      if (ok) onDone();
    } finally {
      setSubmitting(false);
    }
  };

  const dateLabel = (d: AdvanceDateItem) =>
    parseRoutingDate(d.date).toLocaleDateString('en-GB', { weekday: 'short', day: '2-digit', month: 'short' });

  return (
    <div
      className="fixed inset-0 z-[2000] flex items-center justify-center bg-black/60 p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-lg rounded-xl border border-lp-border bg-lp-surface p-6 shadow-xl max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="text-lg font-semibold text-lp-text">Apply template</h3>
        <p className="mt-1 text-sm text-lp-text-secondary">
          Apply a saved layout to one or more shows. This replaces the current section layout.
        </p>
        <div className="mt-4 space-y-4">
          <div>
            <label className="block text-xs font-medium text-lp-text-tertiary">Template</label>
            {loading ? (
              <p className="mt-1 text-sm text-lp-text-tertiary">Loading...</p>
            ) : (
              <ul className="mt-2 space-y-1 max-h-48 overflow-y-auto rounded-xl border border-lp-border bg-lp-bg-secondary p-2">
                {templates.map((t) => (
                  <li key={t.id} className="rounded-lg border border-lp-border bg-lp-surface">
                    <button
                      type="button"
                      onClick={() => setTemplateId(t.id)}
                      className={cn(
                        'w-full px-3 py-2.5 text-left text-sm',
                        templateId === t.id ? 'bg-lp-orange/10 text-lp-orange font-medium' : 'text-lp-text hover:bg-lp-surface-hover'
                      )}
                    >
                      <span className="block">{t.name}</span>
                      <span className="text-xs text-lp-text-tertiary">
                        {t.sections?.length ?? 0} sections
                        {t.sections?.length ? `: ${(t.sections as { label?: string }[]).map((s) => s.label || 'Section').join(', ')}` : ''}
                      </span>
                    </button>
                    {templateId === t.id && (
                      <div className="border-t border-lp-border px-3 py-2">
                        <button
                          type="button"
                          onClick={() => setPreviewId(previewId === t.id ? null : t.id)}
                          className="text-xs font-medium text-lp-text-tertiary hover:text-lp-text"
                        >
                          {previewId === t.id ? 'Hide' : 'Show'} section list
                        </button>
                        {previewId === t.id && t.sections?.length ? (
                          <ol className="mt-1.5 list-decimal pl-4 text-xs text-lp-text-secondary space-y-0.5">
                            {(t.sections as { label?: string }[]).map((s, i) => (
                              <li key={i}>{s.label || `Section ${i + 1}`}</li>
                            ))}
                          </ol>
                        ) : null}
                      </div>
                    )}
                  </li>
                ))}
              </ul>
            )}
            {templates.length === 0 && !loading && (
              <p className="mt-1 text-xs text-lp-text-tertiary">No saved templates. Save a layout as a template from the advance editor (Setup mode).</p>
            )}
          </div>
          <div>
            <label className="block text-xs font-medium text-lp-text-tertiary">Apply to shows</label>
            <div className="mt-2 max-h-40 overflow-y-auto rounded-xl border border-lp-border bg-lp-bg-secondary p-2 space-y-1">
              {dates.map((d) => (
                <label key={d.routing_id} className="flex cursor-pointer items-center gap-2">
                  <input
                    type="checkbox"
                    checked={targetIds.has(d.routing_id)}
                    onChange={() => toggleTarget(d.routing_id)}
                    className="rounded border-lp-border"
                  />
                  <span className="text-sm text-lp-text">
                    {dateLabel(d)} — {d.venue_name || d.city || '—'}
                    {d.advance && <span className="text-amber-600 dark:text-amber-400 ml-1">(has data)</span>}
                  </span>
                </label>
              ))}
            </div>
          </div>
          {selectedTargetsHaveData && (
            <p className="rounded-lg border border-amber-200 bg-amber-50/50 dark:border-amber-800 dark:bg-amber-950/20 px-3 py-2 text-sm text-amber-800 dark:text-amber-200">
              Some selected shows already have advance data. Applying will replace their section layout; existing form data may be lost.
            </p>
          )}
        </div>
        <div className="mt-6 flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl border border-lp-border px-4 py-2 text-sm font-medium text-lp-text hover:bg-lp-surface-hover"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={!selectedTemplate || targetIds.size === 0 || submitting}
            className="rounded-xl bg-lp-orange px-4 py-2 text-sm font-medium text-white hover:bg-lp-orange-hover disabled:opacity-50"
          >
            {submitting ? 'Applying...' : 'Apply'}
          </button>
        </div>
      </div>
    </div>
  );
}
