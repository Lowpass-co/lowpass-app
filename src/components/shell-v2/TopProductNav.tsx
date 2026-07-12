'use client';

/* ============================================
   LOWPASS — <TopProductNav> (Stage B — the designed single grouped row)

   One horizontal nav on the tour tier:

     Routing | $ Budget · ⧉ Advance | Crew · Production · Files

   Three clusters (Routing / the two products / the ops groups) separated by
   hairline dividers; icons only on the two products; active group = orange
   UNDERLINE (never a filled pill). The active group is DERIVED from the
   pathname (`activeNavGroup`) so pages don't each thread an `active` prop.

   Tour-scoped by design: off the tour tier (no tour selected) it renders
   nothing — the artist/workspace tiers use their own tabs (Stage B removes the
   product nav from those tiers entirely). Token-clean.
   ============================================ */

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Settings } from 'lucide-react';
import { useEntitlements } from '@/lib/entitlements';
import { useArtistTourContext } from '@/contexts/ArtistTourContext';
import { TOUR_NAV_GROUPS, activeNavGroup } from './productNav';

export function TopProductNav() {
  const pathname = usePathname() ?? '';
  const { selectedTourId } = useArtistTourContext();
  const entitlements = useEntitlements();

  // The designed nav is tour-scoped. Off the tour tier it renders nothing —
  // the artist/workspace tiers own their nav (Stage B).
  if (!selectedTourId) return null;
  const tourId = selectedTourId;
  const activeGroup = activeNavGroup(pathname, tourId);

  const groups = TOUR_NAV_GROUPS.filter((g) => entitlements[g.flag]);

  return (
    <nav className="flex items-stretch" aria-label="Tour navigation">
      {groups.map((g, i) => {
        const prev = groups[i - 1];
        const showDivider = !!prev && prev.cluster !== g.cluster;
        const isActive = activeGroup === g.key;
        const Icon = g.Icon;
        return (
          <span key={g.key} className="flex items-stretch">
            {showDivider ? (
              <span
                aria-hidden
                style={{
                  alignSelf: 'center',
                  width: 1,
                  height: 16,
                  marginInline: 'var(--lp-space-2)',
                  background: 'var(--lp-border-strong)',
                }}
              />
            ) : null}
            <Link
              href={g.href(tourId)}
              aria-current={isActive ? 'page' : undefined}
              className="btn-transition inline-flex items-center gap-1.5 px-3 py-2"
              style={{
                fontSize: '14px',
                fontWeight: isActive
                  ? 'var(--lp-weight-semibold)'
                  : 'var(--lp-weight-medium)',
                color: isActive ? 'var(--lp-text)' : 'var(--lp-text-tertiary)',
                // Active = orange underline, not a filled pill. -1px so the
                // underline sits on the header's bottom border.
                borderBottom: `2px solid ${isActive ? 'var(--color-lp-orange)' : 'transparent'}`,
                marginBottom: -1,
                textDecoration: 'none',
              }}
            >
              {Icon ? (
                <Icon
                  className="h-4 w-4"
                  strokeWidth={2}
                  aria-hidden
                  style={{
                    color: isActive
                      ? 'var(--color-lp-orange)'
                      : 'var(--lp-text-tertiary)',
                  }}
                />
              ) : null}
              {g.label}
            </Link>
          </span>
        );
      })}

      {/* Settings — neutral corner destination (was at the rail bottom). */}
      <Link
        href="/settings"
        className="btn-transition ml-auto inline-flex items-center justify-center rounded-md px-2 py-1.5"
        style={{ color: 'var(--lp-text-tertiary)' }}
        title="Settings"
        aria-label="Settings"
      >
        <Settings className="h-4 w-4" strokeWidth={2} aria-hidden />
      </Link>
    </nav>
  );
}
