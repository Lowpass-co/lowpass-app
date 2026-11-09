'use client';

/* ============================================
   LOWPASS — <PersonTours> (Nov 2026, Adam)

   On a person's People panel: every tour they're on, with their role and
   employment ON THAT TOUR. Read-only here — those are per tour and are
   changed on the tour's Crew or Payroll (the same field in both). The
   "Usual role" field above only fills in when they're added to a new tour.

   Data: GET /api/persons/[id]/tours.
   ============================================ */

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { ExternalLink, Loader2 } from 'lucide-react';
import { employmentLabel } from '@/lib/personnel/employment';
import type { PersonTourRow } from '@/lib/personnel/types';

const STATUS_LABEL: Record<string, string> = {
  confirmed: 'Confirmed',
  tentative: 'Tentative',
  awaiting_contract: 'Awaiting contract',
  cancelled: 'Cancelled',
  fired: 'Fired',
};

export function PersonTours({ personId }: { personId: string | null }) {
  const [tours, setTours] = useState<PersonTourRow[] | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (!personId) return;
    let cancelled = false;
    fetch(`/api/persons/${encodeURIComponent(personId)}/tours`, { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((j: { tours?: PersonTourRow[] }) => {
        if (!cancelled) setTours(j.tours ?? []);
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
      Role and employment are set per tour, on that tour&apos;s Crew or Payroll. Their usual role (above) fills in when
      you add them to a new tour.
    </p>
  );

  if (!personId) return note;
  if (failed) return <p className="text-sm text-lp-text-tertiary">Could not load their tours.</p>;
  if (tours === null) {
    return (
      <div className="flex items-center gap-2 text-xs text-lp-text-tertiary">
        <Loader2 className="h-3 w-3 animate-spin" /> Loading tours…
      </div>
    );
  }
  return (
    <div className="space-y-2">
      {tours.length === 0 ? (
        <p className="text-sm text-lp-text-secondary">Not on any tour yet.</p>
      ) : (
        <ul className="divide-y divide-lp-border rounded-lg border border-lp-border">
          {tours.map((t) => (
            <li key={t.memberId} className="flex items-center gap-3 px-3 py-2 text-sm">
              <div className="min-w-0 flex-1">
                <div className="truncate font-medium text-lp-text">{t.tourName}</div>
                <div className="truncate text-xs text-lp-text-secondary">
                  {t.role} · {employmentLabel(t.employment)}
                  {t.status !== 'confirmed' ? ` · ${STATUS_LABEL[t.status] ?? t.status}` : ''}
                </div>
              </div>
              <Link
                href={`/operations/${t.tourId}/personnel`}
                className="inline-flex shrink-0 items-center gap-1 text-xs font-medium text-lp-orange hover:underline"
              >
                Crew <ExternalLink className="h-3 w-3" aria-hidden />
              </Link>
            </li>
          ))}
        </ul>
      )}
      {note}
    </div>
  );
}
