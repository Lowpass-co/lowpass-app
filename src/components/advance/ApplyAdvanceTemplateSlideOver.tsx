'use client';

/* ============================================
   LOWPASS — Apply Advance Template (UX22 phase 4)

   Was a rolled-own modal nested inside AdvanceOverview.tsx; now uses the
   <SlideOver> primitive (UX03) at width="wide" so the layout preview +
   per-show after-state can breathe. Same API surface as before; the
   parent (AdvanceOverview) imports + mounts unchanged.

   Three body sections:
     1. Layout — pick a saved template (with section preview)
     2. Apply to shows — multi-select with each row showing
        date · venue · current state · would-be-state-after
     3. Conflict warning — any selected show that already has advance
        data flagged (replacing layout may discard existing form data
        in those slots)

   Footer:
     Cancel  ·  Apply to N shows  (gated until template + ≥1 show picked)

   ============================================ */

import { useMemo, useState } from 'react';
import { AlertTriangle, Check, FileText } from 'lucide-react';
import { SlideOver } from '@/components/shell/SlideOver';
import { cn, parseRoutingDate } from '@/lib/utils';

export type AdvanceSection = {
  template_id: string;
  label: string;
  fields: { id: string; label: string; type: string; [key: string]: unknown }[];
  order: number;
};

export type FormTemplate = { id: string; name: string; sections: AdvanceSection[] };

export type AdvanceDateItem = {
  routing_id: string;
  date: string;
  day_type: string;
  city: string;
  venue_name: string | null;
  advance: {
    sections: AdvanceSection[];
    [k: string]: unknown;
  } | null;
};

export type ApplyAdvanceTemplateSlideOverProps = {
  open: boolean;
  tourId: string;
  dates: AdvanceDateItem[];
  templates: FormTemplate[];
  loading: boolean;
  initialTemplateId?: string | null;
  onClose: () => void;
  onDone: () => void;
};

function dateLabelOf(d: AdvanceDateItem): string {
  return parseRoutingDate(d.date).toLocaleDateString('en-GB', {
    weekday: 'short',
    day: '2-digit',
    month: 'short',
  });
}

export function ApplyAdvanceTemplateSlideOver({
  open,
  tourId,
  dates,
  templates,
  loading,
  initialTemplateId,
  onClose,
  onDone,
}: ApplyAdvanceTemplateSlideOverProps) {
  const [templateId, setTemplateId] = useState<string>(() => initialTemplateId ?? '');
  const [targetIds, setTargetIds] = useState<Set<string>>(() => new Set());
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [showPreview, setShowPreview] = useState(true);

  const selectedTemplate = useMemo(
    () => templates.find((t) => t.id === templateId) ?? null,
    [templates, templateId],
  );

  const selectedTargetsHaveData = useMemo(
    () =>
      Array.from(targetIds).some((id) => {
        const d = dates.find((x) => x.routing_id === id);
        return d?.advance != null;
      }),
    [targetIds, dates],
  );

  const toggleTarget = (id: string) => {
    setTargetIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const selectAll = () => setTargetIds(new Set(dates.map((d) => d.routing_id)));
  const clearAll = () => setTargetIds(new Set());

  const handleSubmit = async () => {
    if (!selectedTemplate || targetIds.size === 0) return;
    setSubmitting(true);
    setSubmitError(null);
    try {
      const failures: string[] = [];
      for (const routingId of targetIds) {
        const res = await fetch(`/api/tours/${tourId}/advance`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ routing_id: routingId, sections: selectedTemplate.sections }),
        });
        if (!res.ok) failures.push(routingId);
      }
      if (failures.length > 0) {
        setSubmitError(
          `Failed to apply to ${failures.length} of ${targetIds.size} show${targetIds.size === 1 ? '' : 's'}.`,
        );
        return;
      }
      onDone();
    } catch (e) {
      setSubmitError(e instanceof Error ? e.message : 'Could not apply template');
    } finally {
      setSubmitting(false);
    }
  };

  const previewSections = selectedTemplate?.sections ?? [];

  const subtitle = selectedTemplate
    ? `Will apply "${selectedTemplate.name}" (${previewSections.length} section${previewSections.length === 1 ? '' : 's'}) to selected shows`
    : 'Pick a layout, then choose which shows to apply it to.';

  return (
    <SlideOver
      open={open}
      onClose={onClose}
      title="Apply layout to shows"
      subtitle={<span className="text-xs" style={{ color: 'var(--lp-text-secondary)' }}>{subtitle}</span>}
      width="wide"
      backdrop
      footer={
        <div className="flex items-center justify-between gap-3">
          <span className="text-xs text-lp-text-tertiary">
            {targetIds.size === 0
              ? 'No shows selected'
              : `${targetIds.size} show${targetIds.size === 1 ? '' : 's'} selected`}
            {selectedTargetsHaveData ? ' · existing data may be replaced' : ''}
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
              disabled={!selectedTemplate || targetIds.size === 0 || submitting}
              className="rounded-lg bg-lp-orange px-4 py-1.5 text-sm font-medium text-white hover:bg-lp-orange-hover disabled:opacity-50"
            >
              {submitting
                ? 'Applying…'
                : `Apply to ${targetIds.size} show${targetIds.size === 1 ? '' : 's'}`}
            </button>
          </div>
        </div>
      }
    >
      <div className="space-y-6">
        {/* 1. Layout selection */}
        <section className="space-y-2">
          <div className="flex items-baseline justify-between">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-lp-text-tertiary">
              Layout
            </h3>
            {selectedTemplate ? (
              <button
                type="button"
                onClick={() => setShowPreview((p) => !p)}
                className="text-xs font-medium text-lp-text-tertiary hover:text-lp-text"
              >
                {showPreview ? 'Hide' : 'Show'} preview
              </button>
            ) : null}
          </div>
          {loading ? (
            <p className="text-sm text-lp-text-tertiary">Loading templates…</p>
          ) : templates.length === 0 ? (
            <p className="rounded-lg border border-dashed border-lp-border bg-lp-bg-secondary px-3 py-3 text-sm text-lp-text-secondary">
              No saved templates. Save a layout as a template from the advance editor (Setup
              mode), then come back here to apply it across shows.
            </p>
          ) : (
            <ul className="max-h-48 space-y-1 overflow-y-auto rounded-lg border border-lp-border bg-lp-bg-secondary p-2">
              {templates.map((t) => {
                const active = templateId === t.id;
                return (
                  <li key={t.id}>
                    <button
                      type="button"
                      onClick={() => setTemplateId(t.id)}
                      className={cn(
                        'w-full rounded-md px-3 py-2 text-left text-sm',
                        active
                          ? 'bg-lp-orange/10 font-medium text-lp-orange'
                          : 'text-lp-text hover:bg-lp-surface-hover',
                      )}
                    >
                      <span className="flex items-center gap-2">
                        {active ? (
                          <Check className="h-4 w-4 shrink-0" style={{ color: 'var(--color-lp-orange)' }} />
                        ) : (
                          <span aria-hidden className="block h-4 w-4 shrink-0" />
                        )}
                        <span className="min-w-0 truncate">{t.name}</span>
                        <span className="ml-auto shrink-0 text-xs text-lp-text-tertiary">
                          {t.sections?.length ?? 0} section{(t.sections?.length ?? 0) === 1 ? '' : 's'}
                        </span>
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}

          {/* Preview of the selected template's section list */}
          {selectedTemplate && showPreview ? (
            <div className="rounded-lg border border-lp-border bg-lp-surface px-3 py-2">
              <div className="mb-1 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-lp-text-tertiary">
                <FileText className="h-3 w-3" /> Preview
              </div>
              {previewSections.length === 0 ? (
                <p className="text-xs text-lp-text-tertiary">Template has no sections.</p>
              ) : (
                <ol className="list-decimal space-y-0.5 pl-5 text-xs text-lp-text-secondary">
                  {previewSections.map((s, i) => (
                    <li key={`${s.template_id ?? s.label}-${i}`}>
                      {s.label || `Section ${i + 1}`}
                      {s.fields?.length ? (
                        <span className="text-lp-text-tertiary">
                          {' '}
                          · {s.fields.length} field{s.fields.length === 1 ? '' : 's'}
                        </span>
                      ) : null}
                    </li>
                  ))}
                </ol>
              )}
            </div>
          ) : null}
        </section>

        {/* 2. Show selection */}
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
                Select all
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
          {dates.length === 0 ? (
            <p className="rounded-lg border border-dashed border-lp-border bg-lp-bg-secondary px-3 py-3 text-sm text-lp-text-secondary">
              No show dates in routing yet.
            </p>
          ) : (
            <ul className="max-h-72 space-y-1 overflow-y-auto rounded-lg border border-lp-border bg-lp-bg-secondary p-2">
              {dates.map((d) => {
                const checked = targetIds.has(d.routing_id);
                const currentSectionCount = d.advance?.sections?.length ?? 0;
                const hasData = d.advance != null;
                const newCount = previewSections.length;
                return (
                  <li key={d.routing_id}>
                    <label
                      className={cn(
                        'flex cursor-pointer items-center gap-3 rounded-md px-3 py-2 text-sm',
                        checked ? 'bg-lp-surface' : 'hover:bg-lp-surface-hover',
                      )}
                    >
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => toggleTarget(d.routing_id)}
                        className="lp-checkbox"
                      />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate font-medium text-lp-text">
                          {dateLabelOf(d)} — {d.venue_name || d.city || '—'}
                        </span>
                        <span className="block truncate text-xs text-lp-text-tertiary">
                          {hasData
                            ? `Currently has ${currentSectionCount} section${currentSectionCount === 1 ? '' : 's'}`
                            : 'No advance set up'}
                          {selectedTemplate ? (
                            <>
                              {' → '}
                              <span style={{ color: 'var(--color-lp-orange)' }}>
                                {newCount} from {selectedTemplate.name}
                              </span>
                            </>
                          ) : null}
                        </span>
                      </span>
                      {hasData ? (
                        <span
                          className="shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider"
                          style={{
                            background: 'color-mix(in srgb, var(--color-lp-warning, #F59E0B) 12%, transparent)',
                            color: 'var(--color-lp-warning, #F59E0B)',
                          }}
                          title="Has existing data; applying will replace section layout"
                        >
                          Has data
                        </span>
                      ) : null}
                    </label>
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        {/* 3. Conflict warning */}
        {selectedTargetsHaveData ? (
          <div
            className="flex items-start gap-2 rounded-lg border px-3 py-2 text-sm"
            style={{
              borderColor: 'color-mix(in srgb, var(--color-lp-warning, #F59E0B) 40%, transparent)',
              background: 'color-mix(in srgb, var(--color-lp-warning, #F59E0B) 8%, transparent)',
              color: 'var(--lp-text)',
            }}
          >
            <AlertTriangle
              className="mt-0.5 h-4 w-4 shrink-0"
              style={{ color: 'var(--color-lp-warning, #F59E0B)' }}
            />
            <span>
              Some selected shows already have advance data. Applying this layout replaces their
              section list — existing form data tied to sections that aren&apos;t in the new layout
              may be discarded.
            </span>
          </div>
        ) : null}

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
