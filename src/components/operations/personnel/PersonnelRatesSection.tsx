'use client';

/* ============================================
   LOWPASS — <PersonnelRatesSection> (read-only since Oct 2026)

   The person's rates on THIS tour, shown on the Crew panel so a TM can see
   them without leaving the page. Rates are typed in ONE place — Payroll →
   Summary — so this shows every non-zero rate line read-only and links
   straight to that person's row in Payroll (?focus=<card id>).

   Data: GET /api/tours/[id]/personnel/[memberId]/rates (the same rate lines
   Payroll reads). The admin-only internal rate (the Lowpass rate) is listed
   only when the API says the viewer is an admin; the server omits it
   otherwise.
   ============================================ */

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Loader2, ExternalLink } from 'lucide-react';
import { budgetCurrencySymbol } from '@/lib/budget-currency';

interface Props {
  tourId: string;
  memberId: string;
  /** Tour currency (rates are in the tour's currency). */
  currency: string;
}

interface RatesResponse {
  card_id?: string | null;
  lines?: Array<{ name: string; amount: number }>;
  rates?: { internal_rate?: number | null };
  is_admin?: boolean;
}

export function PersonnelRatesSection({ tourId, memberId, currency }: Props) {
  const [data, setData] = useState<RatesResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const symbol = budgetCurrencySymbol(currency);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/tours/${tourId}/personnel/${memberId}/rates`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((json: RatesResponse) => {
        if (!cancelled) setData(json);
      })
      .catch(() => {
        if (!cancelled) setError('Could not load rates.');
      });
    return () => {
      cancelled = true;
    };
  }, [tourId, memberId]);

  const href = data?.card_id
    ? `/operations/${tourId}/payroll?focus=${encodeURIComponent(data.card_id)}`
    : `/operations/${tourId}/payroll`;
  const money = (n: number) => `${symbol}${n.toLocaleString('en-GB', { maximumFractionDigits: 2 })}`;
  const internal = data?.is_admin ? data.rates?.internal_rate ?? null : null;

  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-xs font-bold uppercase tracking-wider text-lp-text-secondary">Rates</h3>
        <Link href={href} className="inline-flex items-center gap-1 text-xs font-medium text-lp-orange hover:underline">
          <ExternalLink className="h-3 w-3" aria-hidden /> Edit in Payroll
        </Link>
      </div>

      {error ? (
        <p className="text-xs text-lp-error">{error}</p>
      ) : data === null ? (
        <div className="flex items-center gap-2 text-xs text-lp-text-tertiary">
          <Loader2 className="h-3 w-3 animate-spin" /> Loading rates…
        </div>
      ) : (data.lines ?? []).length === 0 ? (
        <p className="text-sm text-lp-text-tertiary">
          No rates yet — set them in{' '}
          <Link href={href} className="text-lp-orange hover:underline">
            Payroll
          </Link>
          .
        </p>
      ) : (
        <div className="space-y-2">
          {(data.lines ?? []).map((l) => (
            <div key={l.name} className="flex items-center justify-between gap-3">
              <span className="text-sm text-lp-text-secondary">{l.name}</span>
              <Link href={href} className="text-sm tabular-nums text-lp-text hover:text-lp-orange" title="Edit in Payroll">
                {money(l.amount)}
              </Link>
            </div>
          ))}
        </div>
      )}

      {internal != null ? (
        <div className="flex items-center justify-between gap-3 border-t border-lp-border pt-2">
          <span className="text-sm text-lp-text-secondary">
            Internal rate <span className="text-[11px] text-lp-text-tertiary">(admin only)</span>
          </span>
          <span className="text-sm tabular-nums text-lp-text">{money(internal)}</span>
        </div>
      ) : null}
    </section>
  );
}
