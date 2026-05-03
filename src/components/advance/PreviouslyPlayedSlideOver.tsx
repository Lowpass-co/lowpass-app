/* ============================================
   LOWPASS — Previously Played slide-over (Phase 2 §C)

   Per-show advance side surface. Lists past shows at the same
   venue across the workspace's tour history. Click a show →
   inline preview (read-only) of its sections. Tick the sections
   to import → POST /api/advance/previously-played/import.

   Detection: same venue_id (preferred), then fuzzy (venue_name +
   city). The API returns a `match` flag so the slide-over labels
   each row honestly.

   Import is additive (doesn't overwrite filled fields). On success
   we refresh the page so the read view picks up the new data.
   ============================================ */

'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { History, Loader2, RefreshCw } from 'lucide-react';
import { SlideOver } from '@/components/shell/SlideOver';
import { useToast } from '@/components/ui/Toast';
import { FieldTypeIcon } from './FieldTypeIcon';

type SectionDef = {
  template_id: string;
  label: string;
  order?: number;
};

type PastShow = {
  routingId: string;
  date: string;
  tourId: string;
  tourName: string;
  venueName: string | null;
  city: string | null;
  matchType: 'venue_id' | 'name_city';
  sectionsCount: number;
  lastUpdatedAt: string | null;
  data?: Record<string, unknown>;
};

interface PreviouslyPlayedSlideOverProps {
  open: boolean;
  onClose: () => void;
  /** The current show's routing id (the import target). */
  routingId: string;
  /** Section list of the CURRENT advance, used to label sections in
   *  the past shows' data. Falls back to the section_id key when a
   *  template_id isn't recognised locally. */
  currentSections: SectionDef[];
}

function formatDate(iso: string): string {
  try {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return iso;
    return d.toLocaleDateString('en-GB', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    });
  } catch {
    return iso;
  }
}

export function PreviouslyPlayedSlideOver({
  open,
  onClose,
  routingId,
  currentSections,
}: PreviouslyPlayedSlideOverProps) {
  const router = useRouter();
  const { showToast } = useToast();

  const [loading, setLoading] = useState(false);
  const [shows, setShows] = useState<PastShow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [match, setMatch] = useState<'venue_id' | 'name_city' | 'none' | null>(null);
  const [activeShow, setActiveShow] = useState<PastShow | null>(null);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [importing, setImporting] = useState(false);

  const lastFetchedFor = useRef<string | null>(null);

  useEffect(() => {
    if (!open) return;
    if (lastFetchedFor.current === routingId && shows.length > 0) return;
    setLoading(true);
    setError(null);
    fetch(
      `/api/advance/previously-played?routingId=${encodeURIComponent(routingId)}&withData=1`,
    )
      .then(async (res) => {
        if (!res.ok) {
          const j = await res.json().catch(() => ({}));
          throw new Error(
            (j as { error?: string }).error ?? 'Failed to load past shows',
          );
        }
        return res.json() as Promise<{
          shows: PastShow[];
          match: 'venue_id' | 'name_city' | 'none';
        }>;
      })
      .then((data) => {
        setShows(data.shows);
        setMatch(data.match);
        lastFetchedFor.current = routingId;
      })
      .catch((e: Error) => setError(e.message))
      .finally(() => setLoading(false));
  }, [open, routingId, shows.length]);

  // Reset selection when switching active show.
  useEffect(() => {
    setPicked(new Set());
  }, [activeShow?.routingId]);

  const sectionLabelById = useMemo(() => {
    const m = new Map<string, string>();
    for (const s of currentSections) {
      m.set(s.template_id, s.label);
    }
    return m;
  }, [currentSections]);

  const togglePick = (sectionId: string) => {
    setPicked((prev) => {
      const next = new Set(prev);
      if (next.has(sectionId)) next.delete(sectionId);
      else next.add(sectionId);
      return next;
    });
  };

  const handleImport = async () => {
    if (!activeShow || picked.size === 0) return;
    setImporting(true);
    try {
      const res = await fetch('/api/advance/previously-played/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          targetRoutingId: routingId,
          sourceRoutingId: activeShow.routingId,
          sectionIds: Array.from(picked),
        }),
      });
      const json = (await res.json()) as {
        imported?: number;
        skipped?: number;
        fields?: number;
        error?: string;
      };
      if (!res.ok) {
        throw new Error(json.error ?? 'Import failed');
      }
      const imported = json.imported ?? 0;
      const fields = json.fields ?? 0;
      if (imported === 0) {
        showToast(
          'Nothing to import — all selected sections already had values.',
        );
      } else {
        showToast(
          `Imported ${imported} section${imported === 1 ? '' : 's'} (${fields} field${fields === 1 ? '' : 's'}).`,
        );
        onClose();
        router.refresh();
      }
    } catch (e) {
      showToast((e as Error).message ?? 'Import failed', 'error');
    } finally {
      setImporting(false);
    }
  };

  const sourceSections = useMemo<{ id: string; label: string; fieldCount: number }[]>(() => {
    if (!activeShow?.data) return [];
    const out: { id: string; label: string; fieldCount: number }[] = [];
    for (const [sectionId, val] of Object.entries(activeShow.data)) {
      if (!val || typeof val !== 'object' || Array.isArray(val)) continue;
      const fieldCount = Object.values(val as Record<string, unknown>).filter((v) => {
        if (v === null || v === undefined) return false;
        if (typeof v === 'string') return v.trim().length > 0;
        if (Array.isArray(v)) return v.length > 0;
        if (typeof v === 'object')
          return Object.keys(v as Record<string, unknown>).length > 0;
        return true;
      }).length;
      if (fieldCount === 0) continue;
      out.push({
        id: sectionId,
        label: sectionLabelById.get(sectionId) ?? sectionId,
        fieldCount,
      });
    }
    return out.sort((a, b) => a.label.localeCompare(b.label));
  }, [activeShow, sectionLabelById]);

  return (
    <SlideOver
      open={open}
      onClose={onClose}
      title="Previously played"
      subtitle={
        match === 'venue_id'
          ? 'Same venue_id match'
          : match === 'name_city'
            ? 'Fuzzy match (venue name + city)'
            : null
      }
      width="wide"
      footer={
        activeShow ? (
          <div className="flex items-center justify-between">
            <button
              type="button"
              onClick={() => setActiveShow(null)}
              className="btn-transition rounded-md border px-3 py-1.5"
              style={{
                fontSize: '13px',
                borderColor: 'var(--lp-border)',
                color: 'var(--lp-text-secondary)',
              }}
            >
              ← Back to list
            </button>
            <button
              type="button"
              onClick={handleImport}
              disabled={picked.size === 0 || importing}
              className="btn-transition flex items-center gap-1.5 rounded-md px-3 py-1.5"
              style={{
                fontSize: '13px',
                fontWeight: 500,
                background:
                  picked.size === 0 || importing
                    ? 'var(--lp-bg-tertiary)'
                    : 'var(--color-lp-orange)',
                color:
                  picked.size === 0 || importing
                    ? 'var(--lp-text-tertiary)'
                    : 'var(--lp-text-inverse, #fff)',
                cursor: picked.size === 0 || importing ? 'not-allowed' : 'pointer',
              }}
            >
              {importing ? (
                <>
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  Importing…
                </>
              ) : (
                <>
                  Import {picked.size}{' '}
                  {picked.size === 1 ? 'section' : 'sections'}
                </>
              )}
            </button>
          </div>
        ) : null
      }
    >
      {loading ? (
        <div className="flex items-center gap-2 px-1 py-6 text-sm text-lp-text-secondary">
          <Loader2 className="h-4 w-4 animate-spin" />
          Looking up past shows at this venue…
        </div>
      ) : error ? (
        <div
          className="rounded-md border px-3 py-2"
          style={{
            borderColor: 'var(--lp-border)',
            background: 'var(--lp-surface)',
            color: 'var(--lp-text-secondary)',
            fontSize: '13px',
          }}
        >
          {error}
        </div>
      ) : activeShow ? (
        /* === Selected past show — section picker === */
        <div className="space-y-3">
          <h3
            style={{
              fontSize: '12px',
              fontWeight: 600,
              letterSpacing: '0.06em',
              textTransform: 'uppercase',
              color: 'var(--lp-text-tertiary)',
            }}
          >
            Import sections from this advance
          </h3>
          <div
            className="rounded-md border px-3 py-2"
            style={{
              borderColor: 'var(--lp-border)',
              background: 'var(--lp-surface)',
            }}
          >
            <div
              className="lp-mono"
              style={{
                fontSize: '11px',
                color: 'var(--lp-text-tertiary)',
              }}
            >
              {formatDate(activeShow.date)} · {activeShow.tourName}
            </div>
            <div
              style={{
                fontSize: '14px',
                fontWeight: 500,
                color: 'var(--lp-text)',
              }}
            >
              {activeShow.venueName || activeShow.city || '—'}
            </div>
          </div>

          <p
            style={{
              fontSize: '13px',
              color: 'var(--lp-text-secondary)',
              lineHeight: 1.5,
            }}
          >
            Tick the sections you want to import. Imports are additive —
            fields you&apos;ve already filled on the current show are
            never overwritten.
          </p>

          <ul className="space-y-1">
            {sourceSections.length === 0 ? (
              <li
                className="rounded-md border px-3 py-2"
                style={{
                  borderColor: 'var(--lp-border-subtle)',
                  fontSize: '13px',
                  color: 'var(--lp-text-tertiary)',
                }}
              >
                No filled sections in that show&apos;s advance.
              </li>
            ) : (
              sourceSections.map((s) => {
                const checked = picked.has(s.id);
                return (
                  <li key={s.id}>
                    <label
                      className="flex cursor-pointer items-center gap-3 rounded-md border px-3 py-2 transition-colors"
                      style={{
                        borderColor: checked
                          ? 'var(--color-lp-orange)'
                          : 'var(--lp-border)',
                        background: checked
                          ? 'color-mix(in srgb, var(--color-lp-orange) 6%, transparent)'
                          : 'var(--lp-surface)',
                      }}
                    >
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => togglePick(s.id)}
                        className="lp-checkbox"
                      />
                      <span className="min-w-0 flex-1">
                        <span
                          className="block"
                          style={{
                            fontSize: '14px',
                            fontWeight: 500,
                            color: 'var(--lp-text)',
                          }}
                        >
                          {s.label}
                        </span>
                        <span
                          className="lp-mono"
                          style={{
                            fontSize: '11px',
                            color: 'var(--lp-text-tertiary)',
                          }}
                        >
                          {s.fieldCount} field
                          {s.fieldCount === 1 ? '' : 's'}
                        </span>
                      </span>
                    </label>
                  </li>
                );
              })
            )}
          </ul>
        </div>
      ) : (
        /* === Past shows list === */
        <div className="space-y-3">
          <p
            style={{
              fontSize: '13px',
              color: 'var(--lp-text-secondary)',
              lineHeight: 1.5,
            }}
          >
            Past shows in your workspace at this venue. Click one to
            preview its advance and import sections into the current
            show.
          </p>
          {shows.length === 0 ? (
            <div
              className="rounded-md border px-3 py-3"
              style={{
                borderColor: 'var(--lp-border)',
                background: 'var(--lp-surface)',
                color: 'var(--lp-text-secondary)',
                fontSize: '13px',
              }}
            >
              <div className="flex items-center gap-2">
                <History
                  className="h-4 w-4"
                  style={{ color: 'var(--lp-text-tertiary)' }}
                />
                Nothing played here yet across your other tours.
              </div>
            </div>
          ) : (
            <ul className="space-y-1">
              {shows.map((s) => (
                <li key={s.routingId}>
                  <button
                    type="button"
                    onClick={() => setActiveShow(s)}
                    className="btn-transition flex w-full items-center gap-3 rounded-md border px-3 py-2 text-left"
                    style={{
                      borderColor: 'var(--lp-border)',
                      background: 'var(--lp-surface)',
                    }}
                  >
                    <span className="min-w-0 flex-1">
                      <span
                        className="block truncate"
                        style={{
                          fontSize: '14px',
                          fontWeight: 500,
                          color: 'var(--lp-text)',
                        }}
                      >
                        {s.venueName || s.city || '—'}
                      </span>
                      <span
                        className="lp-mono block truncate"
                        style={{
                          fontSize: '11px',
                          color: 'var(--lp-text-tertiary)',
                        }}
                      >
                        {formatDate(s.date)} · {s.tourName}
                      </span>
                    </span>
                    <span
                      className="lp-mono shrink-0"
                      style={{
                        fontSize: '11px',
                        color: 'var(--lp-text-tertiary)',
                      }}
                    >
                      {s.sectionsCount} section
                      {s.sectionsCount === 1 ? '' : 's'}
                    </span>
                    <FieldTypeIcon type="file" decorative />
                  </button>
                </li>
              ))}
            </ul>
          )}
          {shows.length > 0 ? (
            <button
              type="button"
              onClick={() => {
                lastFetchedFor.current = null;
                setShows([]);
              }}
              className="btn-transition flex items-center gap-1.5 text-xs"
              style={{ color: 'var(--lp-text-tertiary)' }}
            >
              <RefreshCw className="h-3 w-3" />
              Refresh
            </button>
          ) : null}
        </div>
      )}
    </SlideOver>
  );
}
