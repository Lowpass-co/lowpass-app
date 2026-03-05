'use client';

import Link from 'next/link';
import { ChevronLeft, ChevronRight } from 'lucide-react';

export function ToursPagination({
  total,
  page,
  limit,
}: {
  total: number;
  page: number;
  limit: number;
}) {
  const totalPages = Math.max(1, Math.ceil(total / limit));
  const from = total === 0 ? 0 : (page - 1) * limit + 1;
  const to = Math.min(page * limit, total);

  return (
    <div className="flex flex-wrap items-center justify-between gap-4 border-t border-lp-border pt-4">
      <p className="text-sm text-lp-text-secondary">
        Showing {from}–{to} of {total} tours
      </p>
      <div className="flex items-center gap-2">
        {page <= 1 ? (
          <span className="flex items-center gap-1 rounded-lg border border-lp-border bg-lp-bg-tertiary px-3 py-2 text-sm font-medium text-lp-text-tertiary">
            <ChevronLeft size={16} />
            Previous
          </span>
        ) : (
          <Link
            href={`/tours?page=${page - 1}`}
            className="flex items-center gap-1 rounded-lg border border-lp-border bg-lp-surface px-3 py-2 text-sm font-medium text-lp-text hover:bg-lp-surface-hover transition-colors"
          >
            <ChevronLeft size={16} />
            Previous
          </Link>
        )}
        {page >= totalPages ? (
          <span className="flex items-center gap-1 rounded-lg border border-lp-border bg-lp-bg-tertiary px-3 py-2 text-sm font-medium text-lp-text-tertiary">
            Next
            <ChevronRight size={16} />
          </span>
        ) : (
          <Link
            href={`/tours?page=${page + 1}`}
            className="flex items-center gap-1 rounded-lg border border-lp-border bg-lp-surface px-3 py-2 text-sm font-medium text-lp-text hover:bg-lp-surface-hover transition-colors"
          >
            Next
            <ChevronRight size={16} />
          </Link>
        )}
      </div>
    </div>
  );
}
