'use client';

/* ============================================
   LOWPASS — Advance Overview (client)

   Fetches advance data, filters, progress, modals.
   ============================================ */

import { useState, useEffect, useMemo, useRef } from 'react';
import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
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
  ListOrdered,
} from 'lucide-react';
import { parseRoutingDate, getDayTypeLabel, getDayTypeColor, getAdvanceStatusInfo, dayTypesInclude, cn } from '@/lib/utils';
import { formatRelativeTime } from '@/lib/format-relative';
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
  const [dayOffNotesItem, setDayOffNotesItem] = useState<AdvanceDateItem | null>(null);

  const copyFromUrl = initialCopyRoutingId ?? searchParams.get('copy');
  useEffect(() => {
    if (copyFromUrl && dates.length > 0) {
      /* react-hooks/set-state-in-effect: sync ?copy= from URL to modal */
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setCopySourceRoutingId(copyFromUrl);
      setCopyModalOpen(true);
    }
  }, [copyFromUrl, dates.length]);
  const [formTemplates, setFormTemplates] = useState<FormTemplate[]>([]);
  const [formTemplatesLoading, setFormTemplatesLoading] = useState(true);
  const [templateInitialId, setTemplateInitialId] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch('/api/advance/layout-templates')
      .then((r) => (r.ok ? r.json() : { templates: [] }))
      .then((j) => {
        if (!cancelled) setFormTemplates(j.templates ?? []);
      })
      .catch(() => {
        if (!cancelled) setFormTemplates([]);
      })
      .finally(() => {
        if (!cancelled) setFormTemplatesLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [tourId]);

  useEffect(() => {
    let cancelled = false;
    async function fetchAdvance() {
      const res = await fetch(`/api/tours/${tourId}/advance?all=true`);
      if (!res.ok) {
        if (!cancelled) setDates([]);
        return;
      }
      const json = await res.json();
      if (!cancelled) setDates(json.dates ?? []);
    }
    fetchAdvance();
    return () => { cancelled = true; };
  }, [tourId, pathname]);

  useEffect(() => {
    // Initial load: hide spinner once advance list has been fetched
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLoading(false);
  }, [dates]);

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
      list = list.filter((d) => {
        const full = [d.venue_name, d.city, d.address].filter(Boolean).join(' ').toLowerCase();
        return full.includes(q);
      });
    }
    return list;
  }, [dates, statusFilter, searchQuery]);

  const openCopyModal = () => setCopyModalOpen(true);
  const openTemplateModal = (presetTemplateId: string | null = null) => {
    setTemplateInitialId(presetTemplateId);
    setTemplateModalOpen(true);
  };

  return (
    <>
    <div className="grid gap-6 lg:grid-cols-[1fr_260px] lg:items-start">
      <div className="min-w-0 space-y-6">
      {/* Suggested layout templates (saved in this tour) */}
      {dates.length > 0 && (
        <div
          className="overflow-hidden rounded-xl border border-lp-border"
          style={{ backgroundColor: 'var(--lp-surface)' }}
        >
          <div className="border-b border-lp-border px-4 py-2.5">
            <h2 className="text-[10px] font-semibold uppercase tracking-widest text-lp-text-tertiary">
              Suggested form layouts · {tourName}
            </h2>
            <p className="mt-1 text-xs text-lp-text-secondary">
              Use a saved layout as a starting point for show advances — every section stays editable in the builder.
            </p>
          </div>
          {formTemplatesLoading ? (
            <div className="flex items-center gap-2 px-4 py-6 text-sm text-lp-text-tertiary">
              <Loader2 className="h-4 w-4 animate-spin" />
              Loading templates…
            </div>
          ) : formTemplates.length === 0 ? (
            <p className="px-4 py-5 text-sm text-lp-text-secondary">
              No saved layout templates yet. In any show&apos;s advance, open <strong>Setup</strong> and save the section layout
              as a template — it will show up here.
            </p>
          ) : (
            <div className="grid gap-2 p-4 sm:grid-cols-2">
              {formTemplates.slice(0, 6).map((t) => (
                <div
                  key={t.id}
                  className="flex flex-col rounded-lg border border-lp-border bg-lp-bg-secondary p-3"
                >
                  <div className="text-sm font-semibold text-lp-text">{t.name}</div>
                  <p className="mt-0.5 text-xs text-lp-text-tertiary">
                    {t.sections?.length ?? 0} section{(t.sections?.length ?? 0) === 1 ? '' : 's'}
                  </p>
                  <button
                    type="button"
                    onClick={() => openTemplateModal(t.id)}
                    className="mt-2 w-fit rounded-lg border border-lp-border bg-lp-surface px-2.5 py-1 text-xs font-medium text-lp-text hover:bg-lp-surface-hover"
                  >
                    Apply to shows…
                  </button>
                </div>
              ))}
            </div>
          )}
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
              placeholder="Search venue, city or full address..."
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
          {filteredDates.map((item) => {
            const isShowDay = dayTypesInclude(item.day_type ?? '', 'show') || dayTypesInclude(item.day_type ?? '', 'festival');
            if (isShowDay) {
              return (
                <ShowRow
                  key={item.routing_id}
                  tourId={tourId}
                  item={item}
                  onOpenCopyModal={(routingId) => {
                    setCopySourceRoutingId(routingId);
                    setCopyModalOpen(true);
                  }}
                  onPatched={() => {
                    void fetch(`/api/tours/${tourId}/advance?all=true`)
                      .then((r) => r.json())
                      .then((j) => setDates(j.dates ?? []));
                  }}
                  onDeleted={() => {
                    fetch(`/api/tours/${tourId}/advance?all=true`).then((r) => r.json()).then((j) => setDates(j.dates ?? []));
                  }}
                />
              );
            }
            return (
              <DayOffPill
                key={item.routing_id}
                tourId={tourId}
                item={item}
                onOpenNotes={() => setDayOffNotesItem(item)}
              />
            );
          })}
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
            onClick={() => openTemplateModal(null)}
            className="inline-flex items-center gap-2 rounded-xl border border-lp-border bg-lp-surface px-4 py-2 text-sm font-medium text-lp-text hover:bg-lp-surface-hover"
          >
            <LayoutTemplate size={16} />
            Apply template...
          </button>
        </div>
      )}

      </div>

      <aside className="space-y-4 lg:sticky lg:top-4">
        <div className="rounded-xl border border-lp-border bg-lp-surface p-4">
          <p className="text-[10px] font-semibold uppercase tracking-widest text-lp-text-tertiary">Last edit</p>
          <p className="mt-1 text-sm text-lp-text" title={tourLastUpdatedAt ?? undefined}>
            {formatRelativeTime(tourLastUpdatedAt)}
          </p>
          <p className="mt-1.5 text-[11px] text-lp-text-tertiary">Latest save across all show advances on this tour.</p>
        </div>
        <div className="rounded-xl border border-lp-border bg-lp-surface p-4">
          <p className="text-[10px] font-semibold uppercase tracking-widest text-lp-text-tertiary">Layout templates</p>
          <p className="mt-1 text-2xl font-bold tabular-nums text-lp-text">{formTemplates.length}</p>
          <p className="mt-0.5 text-xs text-lp-text-secondary">Saved in this tour (reuse on any show).</p>
          <button
            type="button"
            onClick={() => openTemplateModal(null)}
            className="mt-3 w-full rounded-lg border border-lp-border bg-lp-bg-secondary px-3 py-2 text-xs font-medium text-lp-text hover:bg-lp-surface-hover"
          >
            Open template manager
          </button>
        </div>
      </aside>
    </div>

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
          fetch(`/api/tours/${tourId}/advance?all=true`)
            .then((r) => r.json())
            .then((j) => setDates(j.dates ?? []));
        }}
      />

      {templateModalOpen && (
        <ApplyTemplateModal
          key={templateInitialId ?? 'all'}
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
            fetch(`/api/tours/${tourId}/advance?all=true`)
              .then((r) => r.json())
              .then((j) => setDates(j.dates ?? []));
          }}
        />
      )}

      {dayOffNotesItem && (
        <DayOffNotesModal
          tourId={tourId}
          item={dayOffNotesItem}
          onClose={() => setDayOffNotesItem(null)}
          onSaved={() => {
            setDayOffNotesItem(null);
            fetch(`/api/tours/${tourId}/advance?all=true`)
              .then((r) => r.json())
              .then((j) => setDates(j.dates ?? []));
          }}
        />
      )}
    </>
  );
}

/** Small, subtle pill for day off / travel. Opens notes modal (not full advance builder). */
function DayOffPill({ item, onOpenNotes }: { tourId?: string; item: AdvanceDateItem; onOpenNotes: () => void }) {
  const dateLabel = parseRoutingDate(item.date).toLocaleDateString('en-GB', { weekday: 'short', day: '2-digit', month: 'short' });
  const isTravel = dayTypesInclude(item.day_type ?? '', 'travel');
  const label = isTravel ? 'Travel' : 'Day Off';
  return (
    <li>
      <button
        type="button"
        onClick={onOpenNotes}
        className="w-full rounded-lg border border-lp-border/50 bg-lp-surface/50 py-1.5 px-3 text-left text-xs text-lp-text-tertiary hover:bg-lp-surface-hover hover:text-lp-text-secondary transition-colors flex items-center gap-2"
      >
        <span className="shrink-0 w-20">{dateLabel}</span>
        <span>{label}{item.city ? ` · ${item.city}` : ''}</span>
      </button>
    </li>
  );
}

/** Modal to add/edit a note for a day-off or travel date. Does not open full advance builder. */
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
          const dayOffNotes = (existingDataRef.current.day_off_notes as string) ?? '';
          setNotes(dayOffNotes);
        } else {
          setHasInstance(false);
          setNotes('');
        }
      })
      .catch(() => { if (!cancelled) setError('Could not load advance'); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
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

  const dateLabel = parseRoutingDate(item.date).toLocaleDateString('en-GB', { weekday: 'short', day: '2-digit', month: 'short' });
  const isTravel = dayTypesInclude(item.day_type ?? '', 'travel');
  const typeLabel = isTravel ? 'Travel' : 'Day Off';

  return (
    <div className="fixed inset-0 z-[2000] flex items-center justify-center bg-black/60 p-4" onClick={onClose}>
      <div className="w-full max-w-md rounded-xl border border-lp-border bg-lp-surface p-5 shadow-xl" onClick={(e) => e.stopPropagation()}>
        <h3 className="text-base font-semibold text-lp-text">Advance note — {typeLabel}</h3>
        <p className="mt-1 text-sm text-lp-text-tertiary">{dateLabel}{item.city ? ` · ${item.city}` : ''}</p>
        {loading ? (
          <p className="mt-4 text-sm text-lp-text-tertiary">Loading…</p>
        ) : (
          <>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Add a note for this date…"
              rows={4}
              className="mt-4 w-full rounded-xl border border-lp-border bg-lp-surface px-3 py-2 text-sm text-lp-text placeholder:text-lp-text-tertiary focus:border-lp-orange focus:outline-none focus:ring-2 focus:ring-lp-orange/20"
            />
            {error && <p className="mt-2 text-sm text-red-500">{error}</p>}
            <div className="mt-4 flex justify-end gap-2">
              <button type="button" onClick={onClose} className="rounded-xl border border-lp-border px-4 py-2 text-sm font-medium text-lp-text hover:bg-lp-surface-hover">
                Cancel
              </button>
              <button type="button" onClick={handleSave} disabled={saving} className="rounded-xl bg-lp-orange px-4 py-2 text-sm font-medium text-white hover:bg-lp-orange-hover disabled:opacity-50">
                {saving ? 'Saving…' : 'Save note'}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function ShowRow({
  tourId,
  item,
  onOpenCopyModal,
  onPatched,
  onDeleted,
}: {
  tourId: string;
  item: AdvanceDateItem;
  onOpenCopyModal?: (routingId: string) => void;
  onPatched?: () => void;
  onDeleted?: () => void;
}) {
  const router = useRouter();
  const { showToast } = useToast();
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deletingFade, setDeletingFade] = useState(false);

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
            try {
              const res = await fetch(`/api/tours/${tourId}/advance/${item.routing_id}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ status: 'complete' }),
              });
              if (res.ok) {
                showToast('Marked as complete');
                onPatched?.();
                router.refresh();
              }
            } catch {
              /* ignore */
            }
          },
        }]
      : []),
    ...(hasAdvance && isComplete
      ? [{
          label: 'Mark as in progress',
          icon: ListOrdered,
          onClick: async () => {
            try {
              const res = await fetch(`/api/tours/${tourId}/advance/${item.routing_id}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ status: 'in_progress' }),
              });
              if (res.ok) {
                showToast('Marked as in progress');
                onPatched?.();
                router.refresh();
              }
            } catch {
              /* ignore */
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
  initialTemplateId,
  onClose,
  onDone,
}: {
  tourId: string;
  dates: AdvanceDateItem[];
  templates: FormTemplate[];
  loading: boolean;
  initialTemplateId: string | null;
  onClose: () => void;
  onDone: () => void;
}) {
  const [templateId, setTemplateId] = useState(() => initialTemplateId ?? '');
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
                    className="lp-checkbox"
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
