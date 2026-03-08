'use client';

import { useState, useEffect } from 'react';
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

export function DashboardAdvanceNeeds() {
  const [suggestions, setSuggestions] = useState<SuggestionItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/advance/suggestions')
      .then((r) => (r.ok ? r.json() : { suggestions: [] }))
      .then((j) => setSuggestions((j.suggestions ?? []).slice(0, 5)))
      .catch(() => setSuggestions([]))
      .finally(() => setLoading(false));
  }, []);

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

  return (
    <div className="rounded-xl border border-lp-border bg-lp-surface p-4">
      <h2 className="mb-3 flex items-center gap-2 text-base font-semibold text-lp-text">
        <AlertTriangle className="h-4 w-4 text-amber-500" />
        Needs Attention
      </h2>
      <p className="mb-3 text-xs text-lp-text-tertiary">
        Urgent unfilled advance items (next 30 days)
      </p>
      <ul className="space-y-2">
        {suggestions.map((s, i) => (
          <li key={`${s.routing_id}-${s.section_id}-${s.field_id}-${i}`}>
            <Link
              href={`/tours/${s.tour_id}/advance/${s.routing_id}#section-${s.section_id}`}
              className="block rounded-lg border border-lp-border p-2 text-sm hover:bg-lp-surface-hover transition-colors duration-200"
              style={{ transitionTimingFunction: 'cubic-bezier(0.4, 0, 0.2, 1)' }}
            >
              <div className="font-medium text-lp-text">
                {parseRoutingDate(s.date).toLocaleDateString('en-GB', { weekday: 'short', day: '2-digit', month: 'short' })}
                {' · '}
                {s.venue_name || s.city || '—'}
              </div>
              <div className="mt-0.5 text-xs text-lp-text-secondary">{s.field_label}</div>
              <span
                className={cn(
                  'mt-1 inline-block rounded px-1.5 py-0.5 text-xs font-medium',
                  s.importance_badge === 'High' ? 'bg-amber-500/20 text-amber-700 dark:text-amber-400' : 'bg-blue-500/20 text-blue-700 dark:text-blue-400'
                )}
              >
                {s.importance_badge}
              </span>
            </Link>
          </li>
        ))}
      </ul>
      <Link href="/advance" className="mt-3 inline-block text-sm font-medium text-lp-orange hover:text-lp-orange-hover">
        View all on advance →
      </Link>
    </div>
  );
}
