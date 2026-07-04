/* ============================================
   LOWPASS — FX missing-rate banner (FX unify · Stage 2)

   When a budget line / income row is in a foreign currency that has NO entry in
   the tour's budget_fx_rates, the P&L converts it 1:1 (a FLAGGED fallback, never
   silent stale-table math). This banner surfaces that: it lists the currencies
   used in the data that lack a rate and links to Settings → FX rates.

   Presentational — the page computes the missing set (it has the lines + income)
   and passes it in.
   ============================================ */

import Link from 'next/link';
import { AlertTriangle } from 'lucide-react';

export function FxMissingRateBanner({
  missing,
  tourCurrency,
  settingsHref,
}: {
  /** Foreign currencies used in the budget that have no budget_fx_rates entry. */
  missing: string[];
  tourCurrency: string;
  /** Link to the budget Settings tab (FX rates card). */
  settingsHref: string;
}) {
  if (missing.length === 0) return null;
  return (
    <div
      role="status"
      className="mx-4 mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 rounded-lg border px-3 py-2"
      style={{
        borderColor: 'var(--color-lp-warning)',
        background: 'color-mix(in srgb, var(--color-lp-warning) 10%, transparent)',
        fontSize: 'var(--lp-text-sm)',
      }}
    >
      <AlertTriangle className="h-4 w-4 shrink-0" style={{ color: 'var(--color-lp-warning)' }} aria-hidden />
      <span style={{ color: 'var(--lp-text)' }}>
        No FX rate for{' '}
        {missing.map((c, i) => (
          <span key={c} style={{ fontWeight: 'var(--lp-weight-medium)' }}>
            {c}
            {i < missing.length - 1 ? ', ' : ''}
          </span>
        ))}{' '}
        — {missing.length === 1 ? 'it converts' : 'they convert'} 1:1 into {tourCurrency.toUpperCase()} in the P&amp;L.
      </span>
      <Link
        href={settingsHref}
        className="btn-transition rounded px-2 py-0.5"
        style={{ color: 'var(--color-lp-orange)', fontWeight: 'var(--lp-weight-medium)' }}
      >
        Set rates →
      </Link>
    </div>
  );
}
