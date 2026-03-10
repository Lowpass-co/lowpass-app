'use client';

import { useState, useEffect, useMemo } from 'react';
import Link from 'next/link';
import { parseRoutingDate } from '@/lib/utils';
import { AlertTriangle, Loader2 } from 'lucide-react';
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

/** Group by show (routing), then by section; High risk items first in a separate block */
function groupSuggestions(suggestions: SuggestionItem[]) {
  const high = suggestions.filter((s) => s.importance_badge === 'High');
  const rest = suggestions.filter((s) => s.importance_badge !== 'High');
  const byShow = new Map<string, SuggestionItem[]>();
  for (const s of rest) {
    const key = s.routing_id;
    if (!byShow.has(key)) byShow.set(key, []);
    byShow.get(key)!.push(s);
  }
  const highByShow = new Map<string, SuggestionItem[]>();
  for (const s of high) {
    const key = s.routing_id;
    if (!highByShow.has(key)) highByShow.set(key, []);
    highByShow.get(key)!.push(s);
  }
  return { highByShow, byShow, highItems: high };
}

/** Within one show, group by section and format "Section | field1, field2, …" */
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

export function DashboardAdvanceNeeds() {
  const [suggestions, setSuggestions] = useState<SuggestionItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/advance/suggestions')
      .then((r) => (r.ok ? r.json() : { suggestions: [] }))
      .then((j) => setSuggestions((j.suggestions ?? []).slice(0, 40)))
      .catch(() => setSuggestions([]))
      .finally(() => setLoading(false));
  }, []);

  const { highByShow, byShow, highItems } = useMemo(() => groupSuggestions(suggestions), [suggestions]);

  if (loading) {
    return (
      <div className="rounded-xl border border-lp-border bg-lp-surface p-4">
        <h2 className="mb-3 flex items-center gap-2 text-base font-semibold text-lp-text">
          <AlertTriangle className="h-4 w-4 text-amber-500" />
          Needs Attention
        </h2>
        <div className="flex items-center gap-2 py-4 text-sm text-lp-text-tertiary">
          <Loader2 className="h-4 w-4 animate-spin" />
          Loading…
        </div>
      </div>
    );
  }

  if (suggestions.length === 0) {
    return (
      <div className="rounded-xl border border-lp-border bg-lp-surface p-4">
        <h2 className="mb-3 flex items-center gap-2 text-base font-semibold text-lp-text">
          <AlertTriangle className="h-4 w-4 text-amber-500" />
          Needs Attention
        </h2>
        <p className="py-2 text-sm text-lp-text-tertiary">No urgent advance items.</p>
        <Link href="/advance" className="mt-2 inline-block text-sm font-medium text-lp-orange hover:text-lp-orange-hover">
          Open advance →
        </Link>
      </div>
    );
  }

  const formatShowDate = (date: string) =>
    parseRoutingDate(date).toLocaleDateString('en-GB', { weekday: 'short', day: '2-digit', month: 'short' });

  const renderShowBlock = (
    routingId: string,
    tourId: string,
    date: string,
    venueName: string | null,
    city: string,
    groups: { section_label: string; field_labels: string[]; first: SuggestionItem }[],
    isHighRisk: boolean
  ) => {
    const showTitle = `${formatShowDate(date)} · ${venueName || city || '—'}`;
    return (
      <div key={routingId} className="space-y-1.5">
        <div className="font-medium text-lp-text text-[13px]">{showTitle}</div>
        {groups.map((g) => (
          <Link
            key={g.first.section_id}
            href={`/tours/${tourId}/advance/${routingId}#section-${g.first.section_id}`}
            className={cn(
              'block rounded-lg border p-2 text-sm transition-colors duration-200 hover:bg-lp-surface-hover',
              isHighRisk ? 'border-amber-500/40 bg-amber-500/5' : 'border-lp-border'
            )}
          >
            <span className="text-lp-text-secondary">
              {g.section_label} · {g.field_labels.join(', ')}
            </span>
          </Link>
        ))}
      </div>
    );
  };

  return (
    <div className="rounded-xl border border-lp-border bg-lp-surface p-4">
      <h2 className="mb-3 flex items-center gap-2 text-base font-semibold text-lp-text">
        <AlertTriangle className="h-4 w-4 text-amber-500" />
        Needs Attention
      </h2>
      <p className="mb-3 text-xs text-lp-text-tertiary">
        Urgent unfilled advance items (next 30 days)
      </p>
      <div className="space-y-4 max-h-[420px] overflow-y-auto">
        {highItems.length > 0 && (
          <div>
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-amber-600 dark:text-amber-400">
              High risk
            </p>
            <div className="space-y-3">
              {Array.from(highByShow.entries()).map(([routingId, items]) => {
                const s = items[0];
                const groups = groupBySection(items);
                return renderShowBlock(
                  routingId,
                  s.tour_id,
                  s.date,
                  s.venue_name,
                  s.city,
                  groups,
                  true
                );
              })}
            </div>
          </div>
        )}
        <div className="space-y-3">
          {Array.from(byShow.entries()).map(([routingId, items]) => {
            const s = items[0];
            const groups = groupBySection(items);
            return renderShowBlock(
              routingId,
              s.tour_id,
              s.date,
              s.venue_name,
              s.city,
              groups,
              false
            );
          })}
        </div>
      </div>
      <Link href="/advance" className="mt-3 inline-block text-sm font-medium text-lp-orange hover:text-lp-orange-hover">
        View all on advance →
      </Link>
    </div>
  );
}
