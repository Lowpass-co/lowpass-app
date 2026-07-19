'use client';

/* ============================================
   LOWPASS — <DataHealthBanner> (M1-A)

   "N items to review" on the Budget summary. Amber hairline (planning-neutral —
   NOT red; the wince-fix neutrality rule stays). Expandable; each item deep-links
   to its fix surface. Items are the derivable checks from computeDataHealth
   (server-side, no new tables). Renders nothing when the tour is healthy.
   ============================================ */

import { useState } from 'react';
import Link from 'next/link';
import { ChevronDown, ChevronRight } from 'lucide-react';
import type { HealthItem } from '@/server/budget/dataHealth';

const AMBER = 'var(--color-lp-warning)';

export function DataHealthBanner({ items, total }: { items: HealthItem[]; total: number }) {
  const [open, setOpen] = useState(false);
  if (total === 0 || items.length === 0) return null;

  return (
    <section
      aria-label="Budget data health"
      style={{
        border: `1px solid color-mix(in srgb, ${AMBER} 40%, transparent)`,
        borderRadius: 'var(--lp-radius-md)',
        background: `color-mix(in srgb, ${AMBER} 6%, transparent)`,
        overflow: 'hidden',
      }}
    >
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="btn-transition flex w-full items-center justify-between"
        style={{
          gap: 'var(--lp-space-2)',
          padding: 'var(--lp-space-2) var(--lp-space-3)',
          background: 'transparent',
          border: 0,
          cursor: 'pointer',
          textAlign: 'left',
        }}
        aria-expanded={open}
      >
        <span className="flex items-center" style={{ gap: 'var(--lp-space-2)' }}>
          {open ? <ChevronDown size={15} /> : <ChevronRight size={15} />}
          <span style={{ fontSize: 'var(--lp-text-sm)', fontWeight: 'var(--lp-weight-semibold)', color: 'var(--lp-text)' }}>
            {total} {total === 1 ? 'item' : 'items'} to review
          </span>
        </span>
        <span
          className="lp-label-caps"
          style={{ fontSize: 'var(--lp-text-2xs)', color: 'var(--lp-text-tertiary)' }}
        >
          {items.length} {items.length === 1 ? 'check' : 'checks'}
        </span>
      </button>

      {open ? (
        <ul style={{ listStyle: 'none', margin: 0, padding: '0 0 6px' }}>
          {items.map((it) => (
            <li key={it.kind} style={{ padding: '0 var(--lp-space-3) 6px' }}>
              <Link
                href={it.href}
                className="btn-transition flex items-center justify-between"
                style={{
                  gap: 'var(--lp-space-2)',
                  padding: '6px 10px',
                  borderRadius: 'var(--lp-radius-sm)',
                  background: 'var(--lp-surface)',
                  border: '1px solid var(--lp-border-subtle)',
                  textDecoration: 'none',
                }}
              >
                <span style={{ minWidth: 0 }}>
                  <span style={{ display: 'block', fontSize: 'var(--lp-text-sm)', color: 'var(--lp-text)' }}>
                    {it.label}
                  </span>
                  {it.detail.length > 0 ? (
                    <span
                      style={{
                        display: 'block',
                        marginTop: 1,
                        fontSize: 'var(--lp-text-2xs)',
                        color: 'var(--lp-text-tertiary)',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {it.detail.slice(0, 3).join('  ·  ')}
                      {it.detail.length > 3 ? `  +${it.detail.length - 3} more` : ''}
                    </span>
                  ) : null}
                </span>
                <span style={{ flexShrink: 0, fontSize: 'var(--lp-text-xs)', color: 'var(--color-lp-orange)' }}>
                  Fix →
                </span>
              </Link>
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}
