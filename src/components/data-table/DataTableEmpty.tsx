'use client';

import type { ReactNode } from 'react';

type DataTableEmptyProps = {
  message?: ReactNode;
  className?: string;
};

export function DataTableEmpty({ message = 'No results', className = '' }: DataTableEmptyProps) {
  return (
    <div
      className={`flex flex-1 flex-col items-center justify-center py-12 text-sm ${className}`}
      style={{ color: 'var(--lp-text-tertiary)' }}
    >
      {message}
    </div>
  );
}
