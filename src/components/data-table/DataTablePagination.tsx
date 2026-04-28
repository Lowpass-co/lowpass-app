'use client';

import { ChevronLeft, ChevronRight } from 'lucide-react';

type DataTablePaginationProps = {
  total: number;
  page: number;
  pageSize: number;
  onPageChange: (p: number) => void;
};

export function DataTablePagination({ total, page, pageSize, onPageChange }: DataTablePaginationProps) {
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const safePage = Math.min(page, totalPages - 1);
  const start = total === 0 ? 0 : safePage * pageSize + 1;
  const end = Math.min(total, (safePage + 1) * pageSize);

  const window = 5;
  let from = Math.max(0, safePage - Math.floor(window / 2));
  const to = Math.min(totalPages, from + window);
  if (to - from < window) {
    from = Math.max(0, to - window);
  }
  const pages: number[] = [];
  for (let i = from; i < to; i++) pages.push(i);

  return (
    <div
      className="flex shrink-0 items-center justify-between gap-3 border-t px-3"
      style={{
        height: 40,
        borderColor: 'var(--lp-border)',
        color: 'var(--lp-text-secondary)',
      }}
    >
      <span className="text-xs">
        Showing {start}–{end} of {total}
      </span>
      <div className="flex items-center gap-1">
        <button
          type="button"
          className="inline-flex h-8 w-8 items-center justify-center rounded-lg border text-xs disabled:opacity-40"
          style={{ borderColor: 'var(--lp-border)' }}
          disabled={safePage <= 0}
          onClick={() => onPageChange(safePage - 1)}
          aria-label="Previous page"
        >
          <ChevronLeft size={16} />
        </button>
        {pages.map(p => (
          <button
            key={p}
            type="button"
            className="inline-flex h-8 min-w-8 items-center justify-center rounded-lg px-2 text-xs font-medium"
            style={
              p === safePage
                ? { backgroundColor: 'var(--lp-bg-secondary)', color: 'var(--lp-text)' }
                : { color: 'var(--lp-text-secondary)' }
            }
            onClick={() => onPageChange(p)}
          >
            {p + 1}
          </button>
        ))}
        <button
          type="button"
          className="inline-flex h-8 w-8 items-center justify-center rounded-lg border text-xs disabled:opacity-40"
          style={{ borderColor: 'var(--lp-border)' }}
          disabled={safePage >= totalPages - 1}
          onClick={() => onPageChange(safePage + 1)}
          aria-label="Next page"
        >
          <ChevronRight size={16} />
        </button>
      </div>
    </div>
  );
}
