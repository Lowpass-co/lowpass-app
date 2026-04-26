'use client';

import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

type GridPinnedRowProps = {
  children: ReactNode;
  variant: 'top' | 'bottom';
  density: 'comfortable' | 'compact' | 'tight';
};

export function GridPinnedRow({ children, variant, density }: GridPinnedRowProps) {
  return (
    <tr
      className={cn('border-b', variant === 'bottom' && 'font-semibold')}
      style={{
        height: `var(--lp-row-${density})`,
        backgroundColor: variant === 'bottom' ? 'var(--lp-surface)' : 'var(--lp-surface)',
        borderColor: 'var(--lp-border-light)',
        borderTop: variant === 'bottom' ? '2px solid var(--lp-border)' : undefined,
      }}
    >
      {children}
    </tr>
  );
}
