'use client';

/* ============================================
   LOWPASS — Bulk status update (UX22 phase 5 §7.4)

   <SlideOver> primitive (UX03) — multi-select shows, pick a status,
   apply. Useful for end-of-tour reconciliation or bulk in-progress
   sweeps after a routing change.

   Not destructive — patches public.advance_instances.status only.
   Per-section statuses are untouched (those are tracked separately
   and need their own bulk surface; out of scope for this phase).

   Same /api/tours/[id]/advance/[routingId] PATCH body as the per-row
   "Mark as complete" / "Mark as in progress" actions in the overview's
   row context menu.
   ============================================ */

import { useMemo, useState } from 'react';
import { CheckCircle2, Circle, Loader2 } from 'lucide-react';
import { SlideOver } from '@/components/shell/SlideOver';
import { cn, parseRoutingDate, dayTypesInclude, getAdvanceStatusInfo } from '@/lib/utils';
import type { AdvanceDateItem } from './ApplyAdvanceTemplateSlideOver';

type StatusKey = 'not_started' | 'in_progress' | 'needs_review' | 'complete';

const STATUS_TOKEN: Record<StatusKey, string> = {
  not_started: 'var(--color-lp-status-not-started)',
  in_progress: 'var(--color-lp-status-in-progress)',
  needs_review: 'var(--color-lp-status-needs-review)',
  complete: 'var(--color-lp-status-complete)',
};

const STATUS_LABEL: Record<StatusKey, string> = {
  not_started: 'Not started',
  in_progress: 'In progress',
  needs_review: 'Needs review',
  complete: 'Complete',
};

const STATUS_OPTIONS: ReadonlyArray<StatusKey> = ['not_started', 'in_progress', 'needs_review', 'complete'];

function dateLabelOf(item: AdvanceDateItem): string {
  return parseRoutingDate(item.date).toLocaleDateString('en-GB', {
    weekday: 'short',
    day: '2-digit',
    month: 'short',
  });
}

export type BulkStatusUpdateSlideOverProps = {
  open: boolean;
  tourId: string;
  dates: AdvanceDateItem[];
  onClose: () => void;
  onDone: () => void;
};

export function BulkStatusUpdateSlideOver({
  open,
  tourId,
  dates,
  onClose,
  onDone,
}: BulkStatusUpdateSlideOverProps) {
  const [targetIds, setTargetIds] = useState<Set<string>>(() => new Set());
  const [status, setStatus] = useState<StatusKey>('complete');
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  // Only show-day rows can take a status; off / travel / rehearsal
  // never had an advance instance to begin with.
  const eligibleDates = useMemo(
    () =>
      dates.filter((d) => {
        if (!d.day_type) return false;
        return dayTypesInclude(d.day_type, 'show') || dayTypesInclude(d.day_type, 'festival');
      }),
    [dates],
  );

  const toggleTarget = (id: string) => {
    setTargetIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const selectAll = () => setTargetIds(new Set(eligibleDates.map((d) => d.routing_id)));
  const clearAll = () => setTargetIds(new Set());
  const selectIncomplete = () =>
    setTargetIds(
      new Set(
        eligibleDates
          .filter((d) => !d.advance || (d.advance as { status?: string }).status !== 'complete')
          .map((d) => d.routing_id),
      ),
    );

  const handleSubmit = async () => {
    if (targetIds.size === 0) return;
    setSubmitting(true);
    setSubmitError(null);
    try {
      const failures: string[] = [];
      for (const routingId of targetIds) {
        const res = await fetch(`/api/tours/${tourId}/advance/${routingId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ status }),
        });
        if (!res.ok) failures.push(routingId);
      }
      if (failures.length > 0) {
        setSubmitError(
          `Failed to update ${failures.length} of ${targetIds.size} show${targetIds.size === 1 ? '' : 's'}.`,
        );
        return;
      }
      onDone();
    } catch (e) {
      setSubmitError(e instanceof Error ? e.message : 'Could not update');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <SlideOver
      open={open}
      onClose={onClose}
      title="Bulk update status"
      subtitle={
        <span className="text-xs" style={{ color: 'var(--lp-text-secondary)' }}>
          Set the advance status across multiple shows at once. Per-section statuses are
          unchanged.
        </span>
      }
      width="default"
      backdrop
      footer={
        <div className="flex items-center justify-between gap-3">
          <span className="text-xs text-lp-text-tertiary">
            {targetIds.size === 0
              ? 'No shows selected'
              : `${targetIds.size} show${targetIds.size === 1 ? '' : 's'} → ${STATUS_LABEL[status]}`}
          </span>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              disabled={submitting}
              className="rounded-lg border border-lp-border px-3 py-1.5 text-sm font-medium text-lp-text hover:bg-lp-surface-hover disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleSubmit}
              disabled={targetIds.size === 0 || submitting}
              className="inline-flex items-center gap-1.5 rounded-lg bg-lp-orange px-4 py-1.5 text-sm font-medium text-white hover:bg-lp-orange-hover disabled:opacity-50"
            >
              {submitting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
              {submitting
                ? 'Updating…'
                : `Apply to ${targetIds.size} show${targetIds.size === 1 ? '' : 's'}`}
            </button>
          </div>
        </div>
      }
    >
      <div className="space-y-6">
        {/* Status picker */}
        <section className="space-y-2">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-lp-text-tertiary">
            New status
          </h3>
          <div className="grid grid-cols-2 gap-2">
            {STATUS_OPTIONS.map((s) => {
              const active = status === s;
              const colour = STATUS_TOKEN[s];
              return (
                <button
                  key={s}
                  type="button"
                  onClick={() => setStatus(s)}
                  aria-pressed={active}
                  className="flex items-center gap-2 rounded-lg border px-3 py-2 text-left text-sm"
                  style={{
                    borderColor: active ? colour : 'var(--lp-border)',
                    background: active
                      ? `color-mix(in srgb, ${colour} 10%, transparent)`
                      : 'var(--lp-surface)',
                    color: active ? colour : 'var(--lp-text)',
                  }}
                >
                  <span
                    aria-hidden
                    className="h-2 w-2 shrink-0 rounded-full"
                    style={{ background: colour }}
                  />
                  <span className="font-medium">{STATUS_LABEL[s]}</span>
                </button>
              );
            })}
          </div>
        </section>

        {/* Show selection */}
        <section className="space-y-2">
          <div className="flex items-baseline justify-between">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-lp-text-tertiary">
              Apply to shows
            </h3>
            <div className="flex items-center gap-3 text-xs">
              <button
                type="button"
                onClick={selectAll}
                className="font-medium text-lp-text-tertiary hover:text-lp-text"
              >
                All
              </button>
              <button
                type="button"
                onClick={selectIncomplete}
                className="font-medium text-lp-text-tertiary hover:text-lp-text"
              >
                Incomplete only
              </button>
              <button
                type="button"
                onClick={clearAll}
                className="font-medium text-lp-text-tertiary hover:text-lp-text"
              >
                Clear
              </button>
            </div>
          </div>
          {eligibleDates.length === 0 ? (
            <p className="rounded-lg border border-dashed border-lp-border bg-lp-bg-secondary px-3 py-3 text-sm text-lp-text-secondary">
              No show-day rows in this tour. Add shows in Routing first.
            </p>
          ) : (
            <ul className="max-h-72 space-y-1 overflow-y-auto rounded-lg border border-lp-border bg-lp-bg-secondary p-2">
              {eligibleDates.map((d) => {
                const checked = targetIds.has(d.routing_id);
                const currentStatus = (d.advance as { status?: string } | null)?.status ?? 'not_started';
                const currentInfo = getAdvanceStatusInfo(currentStatus);
                return (
                  <li key={d.routing_id}>
                    <label
                      className={cn(
                        'flex cursor-pointer items-center gap-3 rounded-md px-3 py-2 text-sm',
                        checked ? 'bg-lp-surface' : 'hover:bg-lp-surface-hover',
                      )}
                    >
                      <span aria-hidden className="shrink-0">
                        {checked ? (
                          <CheckCircle2
                            className="h-4 w-4"
                            style={{ color: 'var(--color-lp-orange)' }}
                          />
                        ) : (
                          <Circle className="h-4 w-4 text-lp-text-tertiary" />
                        )}
                      </span>
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => toggleTarget(d.routing_id)}
                        className="sr-only"
                      />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate font-medium text-lp-text">
                          {dateLabelOf(d)} — {d.venue_name || d.city || '—'}
                        </span>
                        <span className="block truncate text-xs text-lp-text-tertiary">
                          Currently: {currentInfo.label}
                        </span>
                      </span>
                    </label>
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        {submitError ? (
          <p
            className="rounded-lg border px-3 py-2 text-sm"
            style={{
              borderColor: 'color-mix(in srgb, #EF4444 40%, transparent)',
              background: 'color-mix(in srgb, #EF4444 8%, transparent)',
              color: '#EF4444',
            }}
          >
            {submitError}
          </p>
        ) : null}
      </div>
    </SlideOver>
  );
}
