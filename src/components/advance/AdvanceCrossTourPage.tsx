/* ============================================
   LOWPASS — Advance Overview Page

   Cross-tour advance: needs attention, upcoming, all tours progress.
   ============================================ */

'use client';

/* eslint-disable react-hooks/set-state-in-effect -- Migrated from app/(app)/advance/page (UX04); same fetch+loading. */

import { Suspense, useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { parseRoutingDate, cn } from '@/lib/utils';
import { ArrowRight, AlertTriangle, Calendar, ClipboardList, Loader2 } from 'lucide-react';

type TourStat = {
  tour_id: string;
  tour_name: string;
  artist_name: string;
  advance_count: number;
  total_shows: number;
  percent: number;
};

type NeedsAttentionItem = {
  tour_id: string;
  tour_name: string;
  artist_name: string;
  routing_id: string;
  date: string;
  venue_name: string | null;
  city: string;
  reason: string;
};

type UpcomingItem = {
  tour_id: string;
  tour_name: string;
  artist_name: string;
  routing_id: string;
  date: string;
  venue_name: string | null;
  city: string;
  status: string;
};

type SuggestionItem = {
  tour_id: string;
  tour_name: string;
  routing_id: string;
  date: string;
  venue_name: string | null;
  city: string;
  section_id: string;
  section_label: string;
  field_id: string;
  field_label: string;
  importance: number;
  importance_badge: 'High' | 'Medium';
};

type Overview = {
  tours: TourStat[];
  needsAttention: NeedsAttentionItem[];
  upcoming: UpcomingItem[];
};

function AdvanceOverviewContent() {
  const searchParams = useSearchParams();
  const artistIdInUrl = searchParams.get('artist_id');
  const advanceApiQuery = artistIdInUrl ? `?artist_id=${encodeURIComponent(artistIdInUrl)}` : '';

  const [data, setData] = useState<Overview | null>(null);
  const [suggestions, setSuggestions] = useState<SuggestionItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [suggestionsLoading, setSuggestionsLoading] = useState(true);
  const [inlineEditSuggestion, setInlineEditSuggestion] = useState<SuggestionItem | null>(null);

  useEffect(() => {
    setLoading(true);
    fetch(`/api/advance/overview${advanceApiQuery}`)
      .then((r) => (r.ok ? r.json() : { tours: [], needsAttention: [], upcoming: [] }))
      .then(setData)
      .catch(() => setData({ tours: [], needsAttention: [], upcoming: [] }))
      .finally(() => setLoading(false));
  }, [advanceApiQuery]);

  useEffect(() => {
    setSuggestionsLoading(true);
    fetch(`/api/advance/suggestions${advanceApiQuery}`)
      .then((r) => (r.ok ? r.json() : { suggestions: [] }))
      .then((j) => setSuggestions(j.suggestions ?? []))
      .catch(() => setSuggestions([]))
      .finally(() => setSuggestionsLoading(false));
  }, [advanceApiQuery]);

  if (loading) {
    return (
      <div className="mx-auto max-w-4xl">
        <div className="flex items-center gap-2 text-lp-text-secondary">
          <Loader2 className="h-5 w-5 animate-spin" />
          Loading advance overview…
        </div>
      </div>
    );
  }

  const { tours = [], needsAttention = [], upcoming = [] } = data ?? {};

  return (
    <div className="mx-auto max-w-5xl">
      <div className="flex gap-8">
        <div className="min-w-0 flex-1 space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-lp-text">Advance</h1>
        <p className="mt-1 text-sm text-lp-text-secondary">
          {advanceApiQuery
            ? 'Advance progress and shows needing attention for the selected artist.'
            : 'Advance progress and shows needing attention across all artists and tours.'}
        </p>
      </div>

      {needsAttention.length > 0 && (
        <section className="rounded-xl border border-amber-200 bg-amber-50/50 dark:border-amber-800 dark:bg-amber-950/20">
          <h2 className="flex items-center gap-2 px-4 pt-4 text-lg font-semibold text-lp-text">
            <AlertTriangle className="h-5 w-5 text-amber-500" />
            Needs attention
          </h2>
          <p className="px-4 pb-3 text-sm text-lp-text-secondary">
            Shows with unresolved flags or blockers
          </p>
          <ul className="divide-y divide-lp-border px-4 pb-4">
            {needsAttention.map((item) => (
              <li key={item.routing_id}>
                <Link
                  href={`/advance/${item.tour_id}/${item.routing_id}`}
                  className="flex flex-wrap items-center justify-between gap-2 py-3 text-sm hover:bg-amber-100/50 dark:hover:bg-amber-900/20"
                >
                  <div>
                    <span className="font-medium text-lp-text">{item.tour_name}</span>
                    <span className="text-lp-text-tertiary"> · {item.artist_name}</span>
                    <span className="ml-2 text-lp-text-secondary">
                      {parseRoutingDate(item.date).toLocaleDateString('en-GB', { weekday: 'short', day: '2-digit', month: 'short' })}
                      {' — '}
                      {item.venue_name || item.city || '—'}
                    </span>
                  </div>
                  <span className="rounded-full bg-amber-500/20 px-2 py-0.5 text-xs font-medium text-amber-700 dark:text-amber-400">
                    {item.reason}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      {upcoming.length > 0 && (
        <section className="rounded-xl border border-lp-border bg-lp-surface p-4">
          <h2 className="flex items-center gap-2 text-lg font-semibold text-lp-text">
            <Calendar className="h-5 w-5 text-lp-text-tertiary" />
            Upcoming — need advancing (next 14 days)
          </h2>
          <ul className="mt-3 space-y-1.5">
            {upcoming.slice(0, 20).map((item) => (
              <li key={item.routing_id}>
                <Link
                  href={`/advance/${item.tour_id}/${item.routing_id}`}
                  className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-lp-border px-3 py-2 text-sm text-lp-text hover:bg-lp-surface-hover"
                >
                  <span>
                    {parseRoutingDate(item.date).toLocaleDateString('en-GB', { weekday: 'short', day: '2-digit', month: 'short' })}
                    {' · '}
                    {item.tour_name}
                    {' — '}
                    {item.venue_name || item.city || '—'}
                  </span>
                  <span className="text-xs text-lp-text-tertiary">{item.status.replace('_', ' ')}</span>
                </Link>
              </li>
            ))}
          </ul>
          {upcoming.length > 20 && (
            <p className="mt-2 text-xs text-lp-text-tertiary">Showing first 20 of {upcoming.length}</p>
          )}
        </section>
      )}

      <section className="rounded-xl border border-lp-border bg-lp-surface p-4">
        <h2 className="flex items-center gap-2 text-lg font-semibold text-lp-text">
          <ClipboardList className="h-5 w-5 text-lp-text-tertiary" />
          All tours
        </h2>
        {tours.length === 0 ? (
          <p className="mt-3 text-sm text-lp-text-secondary">No tours yet. Create a tour to see advance progress here.</p>
        ) : (
          <ul className="mt-3 space-y-2">
            {tours.map((t) => (
              <li key={t.tour_id}>
                <Link
                  href={`/advance/${t.tour_id}`}
                  className="flex flex-wrap items-center justify-between gap-4 rounded-lg border border-lp-border px-4 py-3 text-sm hover:bg-lp-surface-hover"
                >
                  <div>
                    <span className="font-medium text-lp-text">{t.tour_name}</span>
                    <span className="text-lp-text-tertiary"> · {t.artist_name}</span>
                  </div>
                  <div className="flex flex-1 min-w-0 items-center gap-3 sm:flex-initial">
                    <span className="text-lp-text-secondary shrink-0">
                      {t.advance_count} of {t.total_shows} shows advanced
                    </span>
                    <div className="hidden h-2 flex-1 max-w-[120px] overflow-hidden rounded-full bg-lp-bg-tertiary sm:block">
                      <div
                        className="h-full rounded-full bg-lp-orange transition-all duration-300"
                        style={{ width: `${Math.min(100, t.percent)}%`, transitionTimingFunction: 'cubic-bezier(0.4, 0, 0.2, 1)' }}
                      />
                    </div>
                    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-lp-border bg-lp-bg-secondary text-xs font-medium text-lp-text">
                      {t.total_shows > 0 ? `${t.percent}%` : '—'}
                    </div>
                    <ArrowRight className="h-4 w-4 shrink-0 text-lp-text-tertiary" />
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
        </div>

        <aside className="w-72 shrink-0">
          <section className="sticky top-24 rounded-xl border border-lp-border bg-lp-surface p-4">
            <h2 className="mb-3 flex items-center gap-2 text-base font-semibold text-lp-text">
              <AlertTriangle className="h-4 w-4 text-amber-500" />
              Urgent unfilled
            </h2>
            <p className="mb-3 text-xs text-lp-text-tertiary">
              Shows in the next 30 days · high‑importance empty fields
            </p>
            {suggestionsLoading ? (
              <div className="flex items-center gap-2 py-4 text-sm text-lp-text-tertiary">
                <Loader2 className="h-4 w-4 animate-spin" />
                Loading…
              </div>
            ) : suggestions.length === 0 ? (
              <p className="py-4 text-sm text-lp-text-tertiary">Nothing urgent. Good job!</p>
            ) : (
              <div className="max-h-[320px] overflow-y-auto">
                <ul className="space-y-2">
                  {suggestions.map((s, i) => (
                  <li key={`${s.routing_id}-${s.section_id}-${s.field_id}-${i}`}>
                    <button
                      type="button"
                      onClick={() => setInlineEditSuggestion(s)}
                      className="w-full rounded-lg border border-lp-border p-2.5 text-left text-sm hover:bg-lp-surface-hover transition-colors duration-200"
                      style={{ transitionTimingFunction: 'cubic-bezier(0.4, 0, 0.2, 1)' }}
                    >
                      <div className="mb-1 font-medium text-lp-text">
                        {parseRoutingDate(s.date).toLocaleDateString('en-GB', { weekday: 'short', day: '2-digit', month: 'short' })}
                        {' · '}
                        {s.venue_name || s.city || '—'}
                      </div>
                      <div className="text-xs text-lp-text-secondary">{s.field_label}</div>
                      <span
                        className={cn(
                          'mt-1.5 inline-block rounded px-1.5 py-0.5 text-xs font-medium',
                          s.importance_badge === 'High' ? 'bg-amber-500/20 text-amber-700 dark:text-amber-400' : 'bg-blue-500/20 text-blue-700 dark:text-blue-400'
                        )}
                      >
                        {s.importance_badge}
                      </span>
                    </button>
                  </li>
                  ))}
                </ul>
              </div>
            )}
            {inlineEditSuggestion && (
              <InlineAdvanceEditModal
                suggestion={inlineEditSuggestion}
                onClose={() => setInlineEditSuggestion(null)}
                onSaved={() => {
                  setInlineEditSuggestion(null);
                  fetch(`/api/advance/suggestions${advanceApiQuery}`)
                    .then((r) => (r.ok ? r.json() : { suggestions: [] }))
                    .then((j) => setSuggestions(j.suggestions ?? []));
                }}
              />
            )}
          </section>
        </aside>
      </div>
    </div>
  );
}

export default function AdvanceCrossTourPage() {
  return (
    <Suspense
      fallback={
        <div className="mx-auto max-w-4xl">
          <div className="flex items-center gap-2 text-lp-text-secondary">
            <Loader2 className="h-5 w-5 animate-spin" />
            Loading advance overview…
          </div>
        </div>
      }
    >
      <AdvanceOverviewContent />
    </Suspense>
  );
}

function InlineAdvanceEditModal({
  suggestion,
  onClose,
  onSaved,
}: {
  suggestion: SuggestionItem;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [value, setValue] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const advanceDataRef = useRef<Record<string, Record<string, unknown>> | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    fetch(`/api/tours/${suggestion.tour_id}/advance/${suggestion.routing_id}`)
      .then((r) => {
        if (!r.ok) throw new Error('Failed to load');
        return r.json();
      })
      .then((res) => {
        if (cancelled) return;
        const data = res.advance?.data ?? {};
        advanceDataRef.current = data;
        const sectionData = data[suggestion.section_id] ?? {};
        const current = sectionData[suggestion.field_id];
        setValue(current != null ? String(current) : '');
      })
      .catch(() => { if (!cancelled) setError('Could not load advance'); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [suggestion.tour_id, suggestion.routing_id, suggestion.section_id, suggestion.field_id]);

  const handleSave = () => {
    setSaving(true);
    setError(null);
    const currentData = advanceDataRef.current ?? {};
    const sectionData = { ...(currentData[suggestion.section_id] ?? {}) };
    sectionData[suggestion.field_id] = value.trim() || null;
    const nextData = { ...currentData, [suggestion.section_id]: sectionData };

    fetch(`/api/tours/${suggestion.tour_id}/advance/${suggestion.routing_id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ data: nextData }),
    })
      .then((r) => {
        if (!r.ok) throw new Error('Save failed');
        onSaved();
        onClose();
      })
      .catch(() => setError('Failed to save'))
      .finally(() => setSaving(false));
  };

  return (
    <div
      className="fixed inset-0 z-[200] flex items-center justify-center bg-black/50 p-4"
      onClick={(e) => e.target === e.currentTarget && onClose()}
      role="dialog"
      aria-modal="true"
      aria-labelledby="inline-advance-modal-title"
    >
      <div
        className="w-full max-w-md rounded-xl border border-lp-border bg-lp-surface p-4 shadow-xl transition-opacity duration-200"
        style={{ transitionTimingFunction: 'cubic-bezier(0.4, 0, 0.2, 1)' }}
        onClick={(e) => e.stopPropagation()}
      >
        <h3 id="inline-advance-modal-title" className="text-lg font-semibold text-lp-text">
          {suggestion.field_label}
        </h3>
        <p className="mt-1 text-sm text-lp-text-tertiary">
          {parseRoutingDate(suggestion.date).toLocaleDateString('en-GB', { weekday: 'short', day: '2-digit', month: 'short', year: 'numeric' })}
          {' · '}
          {suggestion.venue_name || suggestion.city || '—'}
        </p>
        {loading ? (
          <div className="mt-4 flex items-center gap-2 text-sm text-lp-text-tertiary">
            <Loader2 className="h-4 w-4 animate-spin" />
            Loading…
          </div>
        ) : (
          <>
            <textarea
              value={value}
              onChange={(e) => setValue(e.target.value)}
              placeholder={`Enter ${suggestion.field_label.toLowerCase()}…`}
              rows={3}
              className="mt-4 w-full rounded-xl border border-lp-border bg-lp-surface px-3 py-2 text-sm text-lp-text placeholder:text-lp-text-tertiary focus:border-lp-orange focus:outline-none focus:ring-2 focus:ring-lp-orange/20"
              autoFocus
            />
            {error && <p className="mt-2 text-sm text-red-500">{error}</p>}
            <div className="mt-4 flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={handleSave}
                disabled={saving}
                className="rounded-xl bg-lp-orange px-4 py-2 text-sm font-medium text-white hover:bg-lp-orange-hover disabled:opacity-50"
              >
                {saving ? 'Saving…' : 'Save'}
              </button>
              <button
                type="button"
                onClick={onClose}
                className="rounded-xl border border-lp-border px-4 py-2 text-sm font-medium text-lp-text hover:bg-lp-surface-hover"
              >
                Cancel
              </button>
              <Link
                href={`/advance/${suggestion.tour_id}/${suggestion.routing_id}#section-${suggestion.section_id}`}
                className="ml-auto text-sm font-medium text-lp-orange hover:text-lp-orange-hover"
              >
                Open full advance →
              </Link>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
