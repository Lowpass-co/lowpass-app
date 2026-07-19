'use client';

/* ============================================
   LOWPASS — <TourIdentityBand> (G2-1, graded identity standard)

   avatar · artist · condensed tour · status — the identity-only band that sits
   directly above a grouped surface's section tabs + page title. Landed here on
   the Crew group (Tour Personnel · Payroll · Rooming) for Adam to grade; G2-4
   rolls the same component to the other grouped surfaces. Self-hides on
   non-Crew ops pages so the rest of Operations is untouched until then.
   ============================================ */

import { usePathname } from 'next/navigation';

// G2-4 — the identity band is the app-wide standard on grouped surfaces. In
// Operations it shows across BOTH grouped sub-nav clusters: Crew (personnel ·
// payroll · rooming) and Production (channel-list · stage-plot · riders). Routing
// (the tour landing) and Files keep their own chrome for now.
const GROUP_SLUGS = ['personnel', 'payroll', 'rooming', 'channel-list', 'stage-plot', 'riders'];

const STATUS_TONE: Record<string, { fg: string; bg: string }> = {
  on_tour: { fg: 'var(--color-lp-day-show)', bg: 'color-mix(in srgb, var(--color-lp-day-show) 14%, transparent)' },
  upcoming: { fg: 'var(--color-lp-orange)', bg: '#FF45001a' },
  planning: { fg: 'var(--lp-text-secondary)', bg: 'var(--lp-surface-muted, rgba(120,120,120,0.14))' },
  ended: { fg: 'var(--lp-text-tertiary)', bg: 'var(--lp-surface-muted, rgba(120,120,120,0.12))' },
};

export function TourIdentityBand({
  tourId,
  artistName,
  avatarUrl,
  tourName,
  statusLabel,
  statusKey,
}: {
  tourId: string;
  artistName: string;
  avatarUrl: string | null;
  tourName: string;
  statusLabel: string;
  statusKey: string;
}) {
  const pathname = usePathname() ?? '';
  const prefix = `/operations/${tourId}`;
  let slug = '';
  if (pathname.startsWith(prefix)) {
    const rest = pathname.slice(prefix.length);
    if (rest.startsWith('/')) slug = rest.slice(1).split('/')[0] ?? '';
  }
  if (!GROUP_SLUGS.includes(slug)) return null; // Crew + Production grouped surfaces.

  const tone = STATUS_TONE[statusKey] ?? STATUS_TONE.planning;
  const initials = (artistName || '?').trim().slice(0, 1).toUpperCase();

  return (
    <div
      className="flex shrink-0 items-center gap-3"
      style={{ background: 'var(--lp-panel)', padding: 'var(--lp-space-2) var(--lp-space-4)', borderBottom: '1px solid var(--lp-border-subtle)' }}
    >
      <span
        aria-hidden
        style={{
          width: 26, height: 26, borderRadius: '50%', flexShrink: 0, overflow: 'hidden',
          display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
          background: avatarUrl ? undefined : 'var(--lp-surface-muted, #374151)',
          color: 'var(--lp-text-secondary)', fontSize: 11, fontWeight: 700,
          border: '1px solid var(--lp-border-subtle)',
        }}
      >
        {avatarUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={avatarUrl} alt="" width={26} height={26} style={{ width: 26, height: 26, objectFit: 'cover' }} />
        ) : (
          initials
        )}
      </span>
      <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--lp-text)', whiteSpace: 'nowrap' }}>{artistName || 'Artist'}</span>
      <span aria-hidden style={{ color: 'var(--lp-text-tertiary)' }}>·</span>
      <span style={{ fontSize: 13, color: 'var(--lp-text-secondary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: 320 }}>{tourName || 'Tour'}</span>
      {statusLabel ? (
        <span
          style={{
            marginLeft: 4, display: 'inline-flex', alignItems: 'center', gap: 5,
            fontSize: 11, fontWeight: 600, padding: '2px 9px', borderRadius: 'var(--lp-radius-full)',
            color: tone.fg, background: tone.bg, whiteSpace: 'nowrap',
          }}
        >
          <span aria-hidden style={{ width: 6, height: 6, borderRadius: '50%', background: tone.fg }} />
          {statusLabel}
        </span>
      ) : null}
    </div>
  );
}
