/* ============================================
   LOWPASS — <IncomeSettlementSwitch> (UX simplification, Oct 2026)

   Income and Settlements are one job — what the shows pay — so the sidebar
   has ONE item for them ("Income & settlements"). This two-way switch, on
   both pages, is how you move between the plan (Income: expected per show)
   and the night (Settlements: what was actually paid out).

   Plain links, so it works without JS and the URL stays the source of truth
   (the rail highlights from the URL, not from this control).
   ============================================ */

import Link from 'next/link';

export function IncomeSettlementSwitch({ tourId, active }: { tourId: string; active: 'income' | 'settlements' }) {
  const items = [
    { id: 'income', label: 'Income', href: `/budget/${tourId}?tab=income` },
    { id: 'settlements', label: 'Settlements', href: `/budget/${tourId}/settlement` },
  ] as const;
  return (
    <nav
      aria-label="Income or settlements"
      data-testid="income-settlement-switch"
      className="inline-flex rounded-lg border border-lp-border bg-lp-surface p-0.5"
    >
      {items.map((it) => {
        const on = it.id === active;
        return (
          <Link
            key={it.id}
            href={it.href}
            aria-current={on ? 'page' : undefined}
            data-active={on ? 'true' : undefined}
            className="rounded-md px-3 py-1.5 text-sm font-medium no-underline"
            style={{
              color: on ? 'var(--lp-text)' : 'var(--lp-text-secondary)',
              background: on ? 'var(--lp-surface-hover)' : 'transparent',
            }}
          >
            {it.label}
          </Link>
        );
      })}
    </nav>
  );
}
