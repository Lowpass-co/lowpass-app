'use client';

/* ============================================
   LOWPASS — <OperationsGroupSubNav> (Stage B — group-scoped Bar 2)

   The flat 8-tab Operations sub-nav is retired as a global bar. Under the new
   grouped top row (Routing | $ Budget · ⧉ Advance | Crew · Production · Files)
   only the MULTI-PAGE ops groups need a second level, and they render it as a
   compact SEGMENTED CONTROL that reads as belonging to the section content,
   not global chrome:

     Crew       → [ Personnel · Payroll · Rooming ]
     Production → [ Channel list · Stage plot · Riders ]

   Single-page destinations (Routing landing — which absorbs Summary — and
   Files) show no second bar at all; the top row is their only nav. Tour
   identity persists in the header's artist/tour switcher pills, so no separate
   identity band is needed here. Access-gated: a member the caller can't read is
   dropped from its group. Token-clean.
   ============================================ */

import Link from 'next/link';
import { usePathname } from 'next/navigation';

export interface GroupNavLink {
  id: string;
  label: string;
  /** Path segment under /operations/[tourId]/. e.g. 'payroll'. */
  slug: string;
  /** True when the caller has read access for this resource. */
  visible: boolean;
}

/* The two multi-page groups. Single-page destinations (routing, files) are
   intentionally absent — they render no segmented control. Order here is the
   order shown in the control. */
const GROUP_MEMBERS: Record<'crew' | 'production', readonly string[]> = {
  crew: ['personnel', 'payroll', 'rooming'],
  production: ['channel-list', 'stage-plot', 'riders'],
};

function groupForSlug(slug: string): 'crew' | 'production' | null {
  if (GROUP_MEMBERS.crew.includes(slug)) return 'crew';
  if (GROUP_MEMBERS.production.includes(slug)) return 'production';
  return null;
}

interface OperationsGroupSubNavProps {
  tourId: string;
  links: GroupNavLink[];
}

export function OperationsGroupSubNav({ tourId, links }: OperationsGroupSubNavProps) {
  const pathname = usePathname() ?? '';

  // Active slug = first path segment after /operations/[tourId].
  const prefix = `/operations/${tourId}`;
  let activeSlug = '';
  if (pathname.startsWith(prefix)) {
    const rest = pathname.slice(prefix.length);
    if (rest.startsWith('/')) activeSlug = rest.slice(1).split('/')[0] ?? '';
  }

  const group = groupForSlug(activeSlug);
  if (!group) return null; // Routing landing / Files / Summary — no second bar.

  const bySlug = new Map(links.map((l) => [l.slug, l]));
  const members = GROUP_MEMBERS[group]
    .map((slug) => bySlug.get(slug))
    .filter((l): l is GroupNavLink => !!l && l.visible);

  // A group with a single (or no) readable member doesn't warrant a control.
  if (members.length < 2) return null;

  return (
    <div
      className="flex shrink-0 items-center border-b"
      style={{
        borderColor: 'var(--lp-border-strong)',
        background: 'var(--lp-panel)',
        padding: 'var(--lp-space-2) var(--lp-space-4)',
      }}
    >
      <div
        role="tablist"
        aria-label={group === 'crew' ? 'Crew pages' : 'Production pages'}
        className="inline-flex items-center"
        style={{
          gap: 2,
          padding: 2,
          background: 'var(--lp-bg-deep)',
          border: '1px solid var(--lp-border-subtle)',
          borderRadius: 'var(--lp-radius-md)',
        }}
      >
        {members.map((m) => {
          const active = m.slug === activeSlug;
          return (
            <Link
              key={m.id}
              href={`/operations/${tourId}/${m.slug}`}
              role="tab"
              aria-selected={active}
              aria-current={active ? 'page' : undefined}
              className="btn-transition whitespace-nowrap"
              style={{
                padding: '5px var(--lp-space-3)',
                fontSize: 'var(--lp-text-sm)',
                fontWeight: active
                  ? 'var(--lp-weight-semibold)'
                  : 'var(--lp-weight-medium)',
                color: active ? 'var(--color-lp-orange)' : 'var(--lp-text-secondary)',
                background: active
                  ? 'color-mix(in srgb, var(--color-lp-orange) 10%, var(--lp-panel))'
                  : 'transparent',
                borderRadius: 'calc(var(--lp-radius-md) - 2px)',
                textDecoration: 'none',
              }}
            >
              {m.label}
            </Link>
          );
        })}
      </div>
    </div>
  );
}
