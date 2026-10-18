'use client';

/* ============================================
   LOWPASS — <PersonRatesByTour> (Oct 2026)

   On a workspace person's panel: what they're paid on each tour, read-only.
   This replaced the editable "Default day rates" — rates are typed in ONE
   place, Payroll → Summary, and every row here links to that person's row
   there (?focus=<card id>). A new tour copies from their most recent one.

   Data: GET /api/persons/[id]/rates-history (the same rate lines Payroll reads).
   ============================================ */

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { ExternalLink, Loader2 } from 'lucide-react';
import { budgetCurrencySymbol } from '@/lib/budget-currency';

interface HistoryEntry {
  tour_id: string;
  tour_name: string;
  card_id: string | null;
  currency: string | null;
  lines?: Array<{ name: string; amount: number }>;
}

export function PersonRatesByTour({ personId }: { personId: string | null }) {
  const [history, setHistory] = useState<HistoryEntry[] | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (!personId) return;
    let cancelled = false;
    fetch(`/api/persons/${encodeURIComponent(personId)}/rates-history`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((j: { history?: HistoryEntry[] }) => {
        if (!cancelled) setHistory(j.history ?? []);
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, [personId]);

  const note = (
    <p className="text-xs text-lp-text-tertiary">
      Rates are set per tour in Payroll. A new tour starts from their most recent one.
    </p>
  );

  if (!personId) return note;
  if (failed) return <p className="text-sm text-lp-text-tertiary">Could not load their rates.</p>;
  if (history === null) {
    return (
      <div className="flex items-center gap-2 text-xs text-lp-text-tertiary">
        <Loader2 className="h-3 w-3 animate-spin" /> Loading rates…
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {note}
      {history.length === 0 ? (
        <p className="text-sm text-lp-text-secondary">Not on any tour yet.</p>
      ) : (
        <ul className="space-y-1.5">
          {history.map((h) => {
            const sym = budgetCurrencySymbol(h.currency || 'GBP');
            const lines = h.lines ?? [];
            const href = `/operations/${h.tour_id}/payroll${h.card_id ? `?focus=${encodeURIComponent(h.card_id)}` : ''}`;
            return (
              <li key={h.tour_id}>
                <Link
                  href={href}
                  className="flex items-start justify-between gap-3 rounded-md border border-lp-border px-3 py-2 hover:border-lp-orange"
                >
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-medium text-lp-text">{h.tour_name}</span>
                    <span className="block text-xs tabular-nums text-lp-text-secondary">
                      {lines.length
                        ? lines.map((l) => `${l.name} ${sym}${l.amount.toLocaleString('en-GB', { maximumFractionDigits: 2 })}`).join(' · ')
                        : 'No rates set'}
                    </span>
                  </span>
                  <span className="inline-flex shrink-0 items-center gap-1 text-xs font-medium text-lp-orange">
                    <ExternalLink className="h-3 w-3" aria-hidden /> Payroll
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
