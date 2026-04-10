'use client';

import { cn } from '@/lib/utils';

/** Read-only currency display: localized amount + ISO code (matches InlineEditCell). */
export function SpreadsheetCurrencyAmount({
  amount,
  currency,
  className,
  justify = 'end',
}: {
  amount: number;
  currency: string;
  className?: string;
  justify?: 'start' | 'end';
}) {
  const formatted = new Intl.NumberFormat('en-GB', {
    style: 'currency',
    currency,
    minimumFractionDigits: 2,
  }).format(amount);
  return (
    <span
      className={cn(
        'inline-flex items-baseline gap-1',
        justify === 'end' && 'w-full justify-end',
        className
      )}
    >
      <span className="font-sans font-[tabular-nums] text-sm leading-normal">{formatted}</span>
      <span className="shrink-0 text-[10px] font-semibold uppercase tracking-wide text-lp-text-tertiary">
        {currency}
      </span>
    </span>
  );
}
