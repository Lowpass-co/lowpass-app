'use client';

/* ============================================
   LOWPASS — Copy Advance Modal

   Copy section layout and/or form data from one show to others.
   Trigger: "Copy advance..." (overview) or "Copy to other dates..." (per-show).
   ============================================ */

import { useState, useEffect } from 'react';
import { AlertTriangle, ArrowRight } from 'lucide-react';
import { parseRoutingDate, getAdvanceStatusInfo, cn } from '@/lib/utils';
import { BrandedSelect } from '@/components/ui/BrandedSelect';

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
    sections: { template_id: string; label: string; fields: unknown[]; order: number }[];
  } | null;
};

function sectionCount(d: AdvanceDateItem): number {
  return d.advance?.sections?.length ?? 0;
}

function completionPercent(d: AdvanceDateItem): number {
  if (!d.advance?.sections?.length) return 0;
  const statuses = d.advance.section_statuses ?? {};
  const sections = d.advance.sections;
  let complete = 0;
  for (const sec of sections) {
    const key = sec.template_id ?? sec.label;
    if (statuses[key]?.status === 'complete') complete += 1;
  }
  return Math.round((complete / sections.length) * 100);
}

function dateLabel(d: AdvanceDateItem): string {
  return parseRoutingDate(d.date).toLocaleDateString('en-GB', {
    weekday: 'short',
    day: '2-digit',
    month: 'short',
  });
}

export function CopyAdvanceModal({
  tourId,
  dates,
  initialSourceRoutingId,
  open,
  onClose,
  onSuccess,
}: {
  tourId: string;
  dates: AdvanceDateItem[];
  /** Pre-select source when opened from per-show page */
  initialSourceRoutingId?: string | null;
  open: boolean;
  onClose: () => void;
  /** Called with number of shows copied; caller can show toast and refresh */
  onSuccess: (copiedCount: number) => void;
}) {
  const [sourceId, setSourceId] = useState('');
  const [targetIds, setTargetIds] = useState<Set<string>>(new Set());
  /** 'layout' = structure only; 'layout_and_data' = same as old both checkboxes on */
  const [copyMode, setCopyMode] = useState<'layout' | 'layout_and_data'>('layout_and_data');
  const copySections = true;
  const copyData = copyMode === 'layout_and_data';
  const [submitting, setSubmitting] = useState(false);
  const [confirming, setConfirming] = useState(false);

  useEffect(() => {
    if (open && initialSourceRoutingId && dates.some((d) => d.routing_id === initialSourceRoutingId)) {
      setSourceId(initialSourceRoutingId);
    } else if (open && !initialSourceRoutingId) {
      setSourceId('');
    }
  }, [open, initialSourceRoutingId, dates]);

  useEffect(() => {
    if (!open) {
      setConfirming(false);
      setTargetIds(new Set());
    }
  }, [open]);

  const targetCandidates = dates.filter((d) => d.routing_id !== sourceId);
  const selectedTargetsWithData = targetCandidates.filter(
    (d) => targetIds.has(d.routing_id) && d.advance != null
  );
  const needsConfirmation = selectedTargetsWithData.length > 0 && !confirming;

  const toggleTarget = (id: string) => {
    setTargetIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const selectAll = () => {
    setTargetIds(new Set(targetCandidates.map((d) => d.routing_id)));
  };

  const selectNone = () => {
    setTargetIds(new Set());
  };

  const handlePrimary = () => {
    if (!sourceId || targetIds.size === 0) return;
    if (needsConfirmation) {
      setConfirming(true);
      return;
    }
    doCopy();
  };

  const doCopy = async () => {
    if (!sourceId || targetIds.size === 0) return;
    setSubmitting(true);
    try {
      const res = await fetch(`/api/tours/${tourId}/advance/copy`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          source_routing_id: sourceId,
          target_routing_ids: Array.from(targetIds),
          copy_sections: copySections,
          copy_data: copyData,
        }),
      });
      const json = res.ok ? await res.json() : null;
      const copied = json?.copied ?? 0;
      if (res.ok && copied > 0) {
        onSuccess(copied);
        onClose();
      }
    } finally {
      setSubmitting(false);
      setConfirming(false);
    }
  };

  if (!open) return null;

  const sourceItem = dates.find((d) => d.routing_id === sourceId);
  const statusInfo = sourceItem?.advance
    ? getAdvanceStatusInfo(sourceItem.advance.status)
    : null;

  return (
    <div
      className="fixed inset-0 z-[2000] flex items-center justify-center bg-black/60 p-4 transition-opacity duration-150"
      onClick={onClose}
    >
      <div
        className="w-full max-w-lg rounded-xl border border-lp-border bg-lp-surface shadow-xl animate-scale-in"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="border-b border-lp-border px-6 py-4">
          <h3 className="text-lg font-semibold text-lp-text">Copy Advance</h3>
        </div>

        <div className="max-h-[70vh] overflow-y-auto px-6 py-4 space-y-4">
          {/* Source show */}
          <div>
            <label className="block text-xs font-medium text-lp-text-tertiary uppercase tracking-wide">
              Source show
            </label>
            <BrandedSelect
              value={sourceId}
              onChange={setSourceId}
              options={[
                { value: '', label: 'Select a show...' },
                ...dates.map((d) => ({
                  value: d.routing_id,
                  label: `${dateLabel(d)} — ${d.venue_name || d.city || '—'} (${sectionCount(d)} sections${
                    d.advance ? `, ${completionPercent(d)}% complete` : ''
                  })`,
                })),
              ]}
              placeholder="Select a show..."
              ariaLabel="Source show"
              className="mt-1.5 w-full"
            />
            {sourceItem && (
              <p className="mt-1.5 text-xs text-lp-text-tertiary">
                {dateLabel(sourceItem)} · {sourceItem.venue_name || '—'} · {sourceItem.city || '—'}
                {sourceItem.advance && (
                  <>
                    {' '}
                    · {sectionCount(sourceItem)} sections · {completionPercent(sourceItem)}% complete
                    {statusInfo && (
                      <span className={cn('ml-1.5 rounded-full px-1.5 py-0.5 text-xs font-medium', statusInfo.bg, statusInfo.color)}>
                        {statusInfo.label}
                      </span>
                    )}
                  </>
                )}
              </p>
            )}
          </div>

          {/* Copy mode: side-by-side (layout vs layout + data) + source → target flow */}
          <div className="space-y-3">
            <p className="text-xs font-medium text-lp-text-tertiary uppercase tracking-wide">What to copy</p>
            <div
              className="flex items-center justify-center gap-2 rounded-lg border border-lp-border-light bg-lp-bg px-3 py-2.5 text-center"
              role="img"
              aria-label="From source show to target shows"
            >
              <span className="min-w-0 text-xs font-medium text-lp-text">This side (source)</span>
              <ArrowRight className="h-4 w-4 shrink-0 text-lp-orange" strokeWidth={2.25} aria-hidden />
              <span className="min-w-0 text-xs font-medium text-lp-text">This side (targets you pick below)</span>
            </div>
            <fieldset>
              <legend className="sr-only">Copy mode</legend>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <label
                  className={cn(
                    'relative cursor-pointer rounded-xl border-2 p-3 transition-colors hover:bg-lp-surface-hover focus-within:ring-2 focus-within:ring-lp-orange/35 focus-within:ring-offset-2',
                    copyMode === 'layout' ? 'border-lp-orange bg-lp-surface' : 'border-lp-border'
                  )}
                >
                  <input
                    type="radio"
                    name="copyMode"
                    value="layout"
                    checked={copyMode === 'layout'}
                    onChange={() => setCopyMode('layout')}
                    className="sr-only"
                  />
                  <span className="block text-sm font-semibold text-lp-text">Layout</span>
                  <span className="mt-0.5 block text-xs text-lp-text-secondary leading-snug">
                    Same sections and fields on each target — answers stay empty (not started).
                  </span>
                </label>
                <label
                  className={cn(
                    'relative cursor-pointer rounded-xl border-2 p-3 transition-colors hover:bg-lp-surface-hover focus-within:ring-2 focus-within:ring-lp-orange/35 focus-within:ring-offset-2',
                    copyMode === 'layout_and_data' ? 'border-lp-orange bg-lp-surface' : 'border-lp-border'
                  )}
                >
                  <input
                    type="radio"
                    name="copyMode"
                    value="layout_and_data"
                    checked={copyMode === 'layout_and_data'}
                    onChange={() => setCopyMode('layout_and_data')}
                    className="sr-only"
                  />
                  <span className="block text-sm font-semibold text-lp-text">Layout + data</span>
                  <span className="mt-0.5 block text-xs text-lp-text-secondary leading-snug">
                    Same structure and all filled-in values, statuses, and progress from the source.
                  </span>
                </label>
              </div>
            </fieldset>
            <p className="text-xs text-lp-text-tertiary">
              Nothing is removed from the source. Targets you tick will be updated to match the option above.
            </p>
          </div>

          {/* Target shows */}
          <div>
            <div className="flex items-center justify-between">
              <label className="block text-xs font-medium text-lp-text-tertiary uppercase tracking-wide">
                Target shows
              </label>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={selectAll}
                  className="text-xs font-medium text-lp-orange hover:text-lp-orange-hover"
                >
                  Select all
                </button>
                <span className="text-lp-text-tertiary">·</span>
                <button
                  type="button"
                  onClick={selectNone}
                  className="text-xs font-medium text-lp-orange hover:text-lp-orange-hover"
                >
                  Select none
                </button>
              </div>
            </div>
            <div className="mt-2 max-h-48 overflow-y-auto rounded-xl border border-lp-border bg-lp-bg-secondary p-2 space-y-1">
              {targetCandidates.map((d) => {
                const hasExisting = d.advance != null;
                const statusInfoTarget = d.advance ? getAdvanceStatusInfo(d.advance.status) : null;
                return (
                  <label
                    key={d.routing_id}
                    className={cn(
                      'flex cursor-pointer items-center gap-3 rounded-lg px-3 py-2 hover:bg-lp-surface-hover',
                      targetIds.has(d.routing_id) && 'bg-lp-surface'
                    )}
                  >
                    <input
                      type="checkbox"
                      checked={targetIds.has(d.routing_id)}
                      onChange={() => toggleTarget(d.routing_id)}
                      className="lp-checkbox"
                    />
                    <div className="min-w-0 flex-1">
                      <span className="text-sm font-medium text-lp-text">
                        {dateLabel(d)} — {d.venue_name || d.city || '—'}
                      </span>
                      <span className="ml-2 text-xs text-lp-text-tertiary">
                        {d.city && d.venue_name ? ` · ${d.city}` : ''}
                      </span>
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                      {hasExisting && (
                        <span className="flex items-center gap-1 rounded bg-amber-500/10 px-1.5 py-0.5 text-xs text-amber-600 dark:text-amber-400" title="Has existing data — will be overwritten">
                          <AlertTriangle size={12} />
                          Has existing data
                        </span>
                      )}
                      {statusInfoTarget && (
                        <span className={cn('rounded-full px-2 py-0.5 text-xs font-medium', statusInfoTarget.bg, statusInfoTarget.color)}>
                          {statusInfoTarget.label}
                        </span>
                      )}
                      {!d.advance && (
                        <span className="text-xs text-lp-text-tertiary">Not started</span>
                      )}
                    </div>
                  </label>
                );
              })}
            </div>
          </div>

          {/* Confirmation message when targets have existing data */}
          {confirming && selectedTargetsWithData.length > 0 && (
            <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-lp-text">
              This will overwrite advance data for <strong>{selectedTargetsWithData.length} show{selectedTargetsWithData.length !== 1 ? 's' : ''}</strong>. Continue?
            </div>
          )}
        </div>

        <div className="flex justify-end gap-2 border-t border-lp-border px-6 py-4">
          <button
            type="button"
            onClick={onClose}
            className="btn-transition rounded-xl border border-lp-border px-4 py-2 text-sm font-medium text-lp-text hover:bg-lp-surface-hover"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handlePrimary}
            disabled={!sourceId || targetIds.size === 0 || (!copySections && !copyData) || submitting}
            className="btn-transition btn-primary-press rounded-xl bg-lp-orange px-4 py-2 text-sm font-medium text-white hover:bg-lp-orange-hover disabled:opacity-50"
          >
            {submitting
              ? 'Copying...'
              : confirming
                ? `Yes, copy to ${targetIds.size} show${targetIds.size !== 1 ? 's' : ''}`
                : needsConfirmation && selectedTargetsWithData.length > 0
                  ? `Copy to ${targetIds.size} show${targetIds.size !== 1 ? 's' : ''} (${selectedTargetsWithData.length} will be overwritten)`
                  : `Copy to ${targetIds.size} show${targetIds.size !== 1 ? 's' : ''}`}
          </button>
        </div>
      </div>
    </div>
  );
}
