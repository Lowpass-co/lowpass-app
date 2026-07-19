'use client';

/* ============================================
   LOWPASS — <TourIdentityBand> (G2-4)

   Operations-scoped gate around the shared <IdentityLockup>. The lockup itself
   is the ONE app-wide artist/tour band (src/components/shell-v2/IdentityLockup);
   this wrapper only decides WHERE in Operations it shows: the two grouped sub-nav
   clusters — Crew (personnel · payroll · rooming) and Production (channel-list ·
   stage-plot · riders). Routing (the tour landing) and Files keep their own chrome.
   ============================================ */

import { usePathname } from 'next/navigation';
import { IdentityLockup } from '@/components/shell-v2/IdentityLockup';

const GROUP_SLUGS = ['personnel', 'payroll', 'rooming', 'channel-list', 'stage-plot', 'riders'];

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
  if (!GROUP_SLUGS.includes(slug)) return null;

  return (
    <IdentityLockup
      artistName={artistName}
      avatarUrl={avatarUrl}
      tourName={tourName}
      statusLabel={statusLabel}
      statusKey={statusKey}
    />
  );
}
