/* ============================================================
   LOWPASS — <NeedsYouQueue> (Design pass §9 · VIS-WS-04)

   The rule-generated "Needs you" queue on the workspace landing — replaces the
   activity feed. Each row is a derived call to action (verb + time anchor, no
   mood words), most-urgent first, linking to where the work happens. Server
   computes the items (computeNeedsYou); this lays them out.
   ============================================================ */

import Link from 'next/link';
import { ClipboardList, Receipt, Users, ChevronRight } from 'lucide-react';
import type { NeedsYouItem } from '@/server/workspace/computeNeedsYou';

const KIND_ICON = {
  advances: ClipboardList,
  settle: Receipt,
  crew: Users,
} as const;

export function NeedsYouQueue({ items }: { items: NeedsYouItem[] }) {
  if (items.length === 0) {
    return (
      <div
        className="rounded-lg border px-4 py-6 text-center"
        style={{ borderColor: 'var(--lp-border)', background: 'var(--lp-panel)', fontSize: 'var(--lp-text-sm)', color: 'var(--lp-text-tertiary)' }}
      >
        Nothing needs you right now.
      </div>
    );
  }

  return (
    <ul className="flex flex-col gap-2" style={{ listStyle: 'none', margin: 0, padding: 0 }}>
      {items.map((item, i) => {
        const Icon = KIND_ICON[item.kind];
        return (
          <li
            key={item.id}
            className="lp-stagger-item"
            style={{ animationDelay: `${Math.min(i * 50, 400)}ms` }}
          >
            <Link
              href={item.href}
              className="btn-transition group flex items-center gap-3 rounded-lg border px-4 py-3"
              style={{
                borderColor: 'var(--lp-border)',
                background: 'var(--lp-panel)',
                textDecoration: 'none',
              }}
            >
              <span
                aria-hidden
                className="flex shrink-0 items-center justify-center"
                style={{
                  width: 30,
                  height: 30,
                  borderRadius: 'var(--lp-radius-md)',
                  color: 'var(--color-lp-orange)',
                  background: 'color-mix(in srgb, var(--color-lp-orange) 12%, transparent)',
                }}
              >
                <Icon size={15} />
              </span>
              <span className="min-w-0 flex-1">
                <span
                  className="block truncate lp-label-caps"
                  style={{
                    fontSize: 'var(--lp-text-xs)',
                    fontWeight: 'var(--lp-weight-medium)',
                    letterSpacing: 'var(--lp-tracking-caps)',
                    textTransform: 'uppercase',
                    color: 'var(--lp-text)',
                  }}
                >
                  {item.artistName} · {item.tourName}
                </span>
                <span
                  className="block truncate"
                  style={{ fontSize: 'var(--lp-text-2xs)', color: 'var(--lp-text-secondary)' }}
                >
                  {item.status}
                </span>
              </span>
              <ChevronRight
                size={16}
                aria-hidden
                className="shrink-0"
                style={{ color: 'var(--lp-text-tertiary)' }}
              />
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
