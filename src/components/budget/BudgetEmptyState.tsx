/* ============================================
   LOWPASS — Budget empty-state template picker (Phase B)

   Shown on the Budget tab when a tour has zero sections AND zero line
   items. Replaces the old blank grid: a budget should start from a
   template, never blank. Lists system presets + this workspace's own
   templates; "Create from this template" clones it into the tour,
   "Start blank" scaffolds a single empty "General" section so the grid
   takes over.

   Token-clean; no hardcoded hex.
   ============================================ */

'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Check, FileStack, Layers, Loader2, Plus } from 'lucide-react';
import { useToast } from '@/components/ui/Toast';
import type { BudgetTemplate } from '@/types';

const TIER_LABEL: Record<string, string> = {
  club: 'Lean',
  headline: 'Mid',
  festival: 'Full',
};

export function BudgetEmptyState({ tourId }: { tourId: string }) {
  const router = useRouter();
  const { showToast } = useToast();
  const [templates, setTemplates] = useState<BudgetTemplate[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const res = await fetch('/api/budget/templates');
        if (!res.ok) throw new Error(`Failed to load templates (${res.status})`);
        const body = (await res.json()) as { templates?: BudgetTemplate[] };
        if (active) setTemplates(body.templates ?? []);
      } catch (err) {
        if (active) {
          setLoadError(err instanceof Error ? err.message : 'Failed to load templates');
        }
      }
    })();
    return () => {
      active = false;
    };
  }, []);

  const applyTemplate = async (templateId: string) => {
    setBusy(templateId);
    try {
      const res = await fetch('/api/budget/templates/apply', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tourId, templateId }),
      });
      if (!res.ok) {
        const b = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(b.error ?? `Apply failed (${res.status})`);
      }
      const b = (await res.json()) as { lines_added?: number };
      showToast(`Budget created — ${b.lines_added ?? 0} lines added`);
      router.refresh();
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Apply failed', 'error');
      setBusy(null);
    }
  };

  const startBlank = async () => {
    setBusy('__blank__');
    try {
      const res = await fetch('/api/budget/sections', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tour_id: tourId, name: 'General' }),
      });
      if (!res.ok) {
        const b = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(b.error ?? `Failed (${res.status})`);
      }
      router.refresh();
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Failed', 'error');
      setBusy(null);
    }
  };

  const cardBase =
    'flex flex-col gap-3 rounded-lg border p-4 text-left transition';

  return (
    <div className="mx-auto w-full max-w-[860px] py-6">
      <div className="mb-5 flex items-center gap-2">
        <Layers className="h-5 w-5" style={{ color: 'var(--color-lp-orange)' }} aria-hidden />
        <div>
          <h1 className="lp-h2">Start your budget from a template</h1>
          <p
            className="mt-1"
            style={{ fontSize: 'var(--lp-text-sm)', color: 'var(--lp-text-secondary)' }}
          >
            Pick a preset to scaffold sections and default line items. You can
            edit everything afterwards, or start blank.
          </p>
        </div>
      </div>

      {loadError ? (
        <div
          className="rounded-md border p-3"
          style={{
            borderColor: 'var(--color-lp-status-needs-review)',
            background:
              'color-mix(in srgb, var(--color-lp-status-needs-review) 10%, transparent)',
            color: 'var(--lp-text)',
            fontSize: 'var(--lp-text-sm)',
          }}
        >
          {loadError}
        </div>
      ) : templates === null ? (
        <div
          className="flex items-center gap-2 py-10"
          style={{ color: 'var(--lp-text-tertiary)', fontSize: 'var(--lp-text-sm)' }}
        >
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> Loading templates…
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {templates.map((t) => {
            const sectionNames = (t.sections ?? []).map((s) => s.name);
            const isBusy = busy === t.id;
            return (
              <div
                key={t.id}
                className={cardBase}
                style={{
                  borderColor: 'var(--lp-border-strong)',
                  background: 'var(--lp-surface)',
                }}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span
                        style={{
                          fontSize: 'var(--lp-text-base)',
                          fontWeight: 'var(--lp-weight-semibold)',
                          color: 'var(--lp-text)',
                        }}
                      >
                        {t.name}
                      </span>
                      {t.is_system ? (
                        <span
                          className="rounded-full px-1.5 py-0.5"
                          style={{
                            fontSize: 'var(--lp-text-2xs)',
                            fontWeight: 'var(--lp-weight-semibold)',
                            letterSpacing: 'var(--lp-tracking-caps)',
                            textTransform: 'uppercase',
                            color: 'var(--lp-text-tertiary)',
                            background: 'var(--lp-bg-deep)',
                          }}
                        >
                          {t.tier ? TIER_LABEL[t.tier] ?? t.tier : 'Preset'}
                        </span>
                      ) : (
                        <span
                          className="inline-flex items-center gap-1 rounded-full px-1.5 py-0.5"
                          style={{
                            fontSize: 'var(--lp-text-2xs)',
                            fontWeight: 'var(--lp-weight-semibold)',
                            color: 'var(--color-lp-orange)',
                            background:
                              'color-mix(in srgb, var(--color-lp-orange) 12%, transparent)',
                          }}
                        >
                          <FileStack className="h-3 w-3" aria-hidden /> Yours
                        </span>
                      )}
                    </div>
                    {t.description ? (
                      <p
                        className="mt-1"
                        style={{
                          fontSize: 'var(--lp-text-xs)',
                          color: 'var(--lp-text-secondary)',
                          lineHeight: 1.4,
                        }}
                      >
                        {t.description}
                      </p>
                    ) : null}
                  </div>
                </div>

                {sectionNames.length > 0 ? (
                  <div className="flex flex-wrap gap-1">
                    {sectionNames.slice(0, 8).map((name) => (
                      <span
                        key={name}
                        className="rounded px-1.5 py-0.5"
                        style={{
                          fontSize: 'var(--lp-text-2xs)',
                          color: 'var(--lp-text-secondary)',
                          background: 'var(--lp-bg-deep)',
                        }}
                      >
                        {name}
                      </span>
                    ))}
                    {sectionNames.length > 8 ? (
                      <span
                        style={{
                          fontSize: 'var(--lp-text-2xs)',
                          color: 'var(--lp-text-tertiary)',
                        }}
                      >
                        +{sectionNames.length - 8} more
                      </span>
                    ) : null}
                  </div>
                ) : null}

                <button
                  type="button"
                  disabled={busy !== null}
                  onClick={() => applyTemplate(t.id)}
                  className="btn-transition mt-auto inline-flex items-center justify-center gap-1.5 rounded-md px-3 py-2"
                  style={{
                    background: 'var(--color-lp-orange)',
                    color: 'var(--lp-text-inverse)',
                    fontSize: 'var(--lp-text-sm)',
                    fontWeight: 'var(--lp-weight-semibold)',
                    opacity: busy !== null && !isBusy ? 0.5 : 1,
                  }}
                >
                  {isBusy ? (
                    <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                  ) : (
                    <Check className="h-4 w-4" aria-hidden />
                  )}
                  Create budget from this template
                </button>
              </div>
            );
          })}
        </div>
      )}

      <div className="mt-5 flex items-center gap-3">
        <button
          type="button"
          disabled={busy !== null}
          onClick={startBlank}
          className="btn-transition inline-flex items-center gap-1.5 rounded-md border px-3 py-2"
          style={{
            borderColor: 'var(--lp-border)',
            background: 'var(--lp-surface)',
            color: 'var(--lp-text-secondary)',
            fontSize: 'var(--lp-text-sm)',
            fontWeight: 'var(--lp-weight-medium)',
            opacity: busy !== null && busy !== '__blank__' ? 0.5 : 1,
          }}
        >
          {busy === '__blank__' ? (
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
          ) : (
            <Plus className="h-4 w-4" aria-hidden />
          )}
          Start blank
        </button>
        <span style={{ fontSize: 'var(--lp-text-xs)', color: 'var(--lp-text-tertiary)' }}>
          Adds an empty section you can fill in yourself.
        </span>
      </div>
    </div>
  );
}
