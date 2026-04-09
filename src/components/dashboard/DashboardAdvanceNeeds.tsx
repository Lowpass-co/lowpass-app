'use client';

import { useState, useEffect, useMemo } from 'react';
import Link from 'next/link';
import { useArtistTourContext } from '@/contexts/ArtistTourContext';
import { parseRoutingDate } from '@/lib/utils';
import { AlertTriangle, Loader2, ChevronLeft, ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';

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

/** Group items by show (routing_id), then by section. */
function groupBySection(items: SuggestionItem[]) {
  const bySection = new Map<string, string[]>();
  for (const s of items) {
    if (!bySection.has(s.section_label)) bySection.set(s.section_label, []);
    bySection.get(s.section_label)!.push(s.field_label);
  }
  return Array.from(bySection.entries()).map(([label, fields]) => ({
    section_label: label,
    field_labels: fields,
    first: items.find((i) => i.section_label === label)!,
  }));
}

/**
 * Build a single ordered list for the carousel.
 * API returns sorted by days-until-show ASC, importance DESC (most urgent first).
 * We reverse so "most urgent" is at the END of the carousel (right arrow = more urgent).
 */
function buildCarouselItems(suggestions: SuggestionItem[]): { routingId: string; tourId: string; date: string; venueName: string | null; city: string; groups: ReturnType<typeof groupBySection>; isHigh: boolean }[] {
  const byShow = new Map<string, SuggestionItem[]>();
  for (const s of suggestions) {
    const key = s.routing_id;
    if (!byShow.has(key)) byShow.set(key, []);
    byShow.get(key)!.push(s);
  }
  const items: { routingId: string; tourId: string; date: string; venueName: string | null; city: string; groups: ReturnType<typeof groupBySection>; isHigh: boolean }[] = [];
  for (const [routingId, list] of byShow.entries()) {
    const s = list[0];
    const isHigh = list.some((i) => i.importance_badge === 'High');
    items.push({
      routingId,
      tourId: s.tour_id,
      date: s.date,
      venueName: s.venue_name,
      city: s.city,
      groups: groupBySection(list),
      isHigh,
    });
  }
  items.sort((a, b) => {
    const dateCmp = a.date.localeCompare(b.date);
    if (dateCmp !== 0) return dateCmp;
    return a.isHigh === b.isHigh ? 0 : a.isHigh ? -1 : 1;
  });
  return items.reverse();
}

export function DashboardAdvanceNeeds() {
  const { selectedArtistId } = useArtistTourContext();
  const suggestionsQuery = selectedArtistId
    ? `?artist_id=${encodeURIComponent(selectedArtistId)}`
    : '';

  const [suggestions, setSuggestions] = useState<SuggestionItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [index, setIndex] = useState(0);

  useEffect(() => {
    setLoading(true);
    fetch(`/api/advance/suggestions${suggestionsQuery}`)
      .then((r) => (r.ok ? r.json() : { suggestions: [] }))
      .then((j) => setSuggestions((j.suggestions ?? []).slice(0, 40)))
      .catch(() => setSuggestions([]))
      .finally(() => setLoading(false));
  }, [suggestionsQuery]);

  const carouselItems = useMemo(() => buildCarouselItems(suggestions), [suggestions]);
  const total = carouselItems.length;
  const highRiskCount = carouselItems.filter((i) => i.isHigh).length;
  const safeIndex = total === 0 ? 0 : Math.min(Math.max(0, index), total - 1);
  const current = carouselItems[safeIndex] ?? null;

  useEffect(() => {
    if (total === 0) setIndex(0);
    else setIndex((i) => Math.min(Math.max(0, i), total - 1));
  }, [total]);

  if (loading) {
    return (
      <div className="lp-dashboard-glass-card rounded-2xl p-5">
        <h2 className="flex items-center gap-2 text-base font-semibold text-lp-text">
          <AlertTriangle className="h-4 w-4 text-amber-500" />
          Needs Attention
        </h2>
        <div className="mt-3 flex items-center gap-2 py-4 text-sm text-lp-text-tertiary">
          <Loader2 className="h-4 w-4 animate-spin" />
          Loading…
        </div>
      </div>
    );
  }

  if (suggestions.length === 0) {
    return (
      <div className="lp-dashboard-glass-card rounded-2xl p-5">
        <h2 className="flex items-center gap-2 text-base font-semibold text-lp-text">
          <AlertTriangle className="h-4 w-4 text-amber-500" />
          Needs Attention
        </h2>
        <p className="mt-3 text-sm text-lp-text-tertiary">No urgent advance items.</p>
        <Link
          href={selectedArtistId ? `/advance?artist_id=${encodeURIComponent(selectedArtistId)}` : '/advance'}
          className="mt-2 inline-block text-sm font-medium text-lp-orange hover:text-lp-orange-hover"
        >
          Open advance →
        </Link>
      </div>
    );
  }

  const formatShowDate = (date: string) =>
    parseRoutingDate(date).toLocaleDateString('en-GB', { weekday: 'short', day: '2-digit', month: 'short' });

  return (
    <div className="lp-dashboard-glass-card rounded-2xl p-5">
      <div className="flex items-center justify-between gap-2">
        <h2 className="flex items-center gap-2 text-base font-semibold text-lp-text">
          <AlertTriangle className="h-4 w-4 text-amber-500" />
          Needs Attention
        </h2>
        <span className="rounded-full bg-lp-orange/20 px-2.5 py-0.5 text-xs font-bold text-lp-orange">
          #{highRiskCount}
        </span>
      </div>
      <div className="mt-3 flex items-center gap-1">
        <button
          type="button"
          onClick={() => setIndex((i) => (total <= 1 ? 0 : i <= 0 ? total - 1 : i - 1))}
          className="rounded-lg p-1.5 text-lp-text-tertiary transition-colors hover:bg-lp-surface-hover hover:text-lp-orange"
          aria-label="Previous"
          disabled={total === 0}
        >
          <ChevronLeft size={20} />
        </button>
        <button
          type="button"
          onClick={() => setIndex((i) => (total <= 1 ? 0 : i >= total - 1 ? 0 : i + 1))}
          className="rounded-lg p-1.5 text-lp-text-tertiary transition-colors hover:bg-lp-surface-hover hover:text-lp-orange"
          aria-label="Next"
          disabled={total === 0}
        >
          <ChevronRight size={20} />
        </button>
      </div>

      {current && (
        <div className="mt-3 max-h-[200px] overflow-y-auto space-y-2">
          <p className="font-medium text-lp-text text-[13px]">
            {formatShowDate(current.date)} · {current.venueName || current.city || '—'}
          </p>
          {current.groups.map((g) => (
            <Link
              key={g.first.section_id}
              href={`/tours/${current.tourId}/advance/${current.routingId}#section-${g.first.section_id}`}
              className={cn(
                'block rounded-lg border p-2 text-sm transition-colors hover:bg-lp-surface-hover',
                current.isHigh ? 'border-amber-500/40 bg-amber-500/5' : 'border-lp-border'
              )}
            >
              <span className="text-lp-text-secondary">
                {g.section_label} · {g.field_labels.join(', ')}
              </span>
            </Link>
          ))}
        </div>
      )}

      <Link
        href={selectedArtistId ? `/advance?artist_id=${encodeURIComponent(selectedArtistId)}` : '/advance'}
        className="mt-3 inline-block text-sm font-medium text-lp-orange hover:text-lp-orange-hover"
      >
        View all on advance →
      </Link>
    </div>
  );
}
