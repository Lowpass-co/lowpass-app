'use client';

/* ============================================
   LOWPASS — navigation that admits it is working (S-1 fixpack)

   The smoke walk: "there's no interaction when you click a menu item, it just
   loads silently then the new screen appears." A route change in the App Router
   can take a second or more on a cold lambda, and for that second the app looks
   identical to an app that ignored the click. So people click again.

   `useLinkStatus()` (Next 15.3+) reports the pending state of the NEAREST
   PARENT <Link>, which is why these are tiny components rendered INSIDE a Link
   rather than a prop computed outside one — the hook reads context the Link
   provides, so it only works from a descendant.

   Nothing here fires on a prefetched, instant navigation: `pending` never flips
   if the payload is already cached. Feedback shows up exactly when there is a
   wait worth acknowledging, which is the only time it should.
   ============================================ */

import { useLinkStatus } from 'next/link';
import { Loader2 } from 'lucide-react';

/** Swaps a link's own icon for a spinner while that link is loading.
 *
 *  Swapping rather than appending is deliberate: the row keeps its exact
 *  geometry, so nothing shifts under the cursor mid-click, and it works
 *  identically in a 52px collapsed rail where there is no room to append. */
export function PendingSwap({
  className = 'h-3.5 w-3.5',
  children,
}: {
  className?: string;
  children: React.ReactNode;
}) {
  const { pending } = useLinkStatus();
  if (!pending) return <>{children}</>;
  return <Loader2 data-testid="nav-pending-spinner" className={`${className} animate-spin`} aria-hidden />;
}

/** The clicked thing takes its destination's look IMMEDIATELY — an optimistic
 *  active state, drawn as an overlay because the style it has to match lives on
 *  a parent this component can't reach.
 *
 *  Rendered absolutely, so the parent must be `position: relative`. Call sites
 *  pass the geometry: a rail row and a mode pill are highlighted differently
 *  and each already knows how. */
export function PendingTint({ style }: { style: React.CSSProperties }) {
  const { pending } = useLinkStatus();
  if (!pending) return null;
  return (
    <span
      aria-hidden
      data-testid="nav-pending-tint"
      style={{ position: 'absolute', pointerEvents: 'none', ...style }}
    />
  );
}

/** Announces the wait to a screen reader, which sees none of the above. */
export function PendingLive({ label }: { label: string }) {
  const { pending } = useLinkStatus();
  return (
    <span aria-live="polite" className="sr-only">
      {pending ? `Loading ${label}` : ''}
    </span>
  );
}
