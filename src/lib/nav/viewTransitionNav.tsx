'use client';

/* ============================================
   LOWPASS — the spine-morph trigger (R5-3 completion, 2026-08-06)

   R5-3 built every piece of the routing→rail fold — view-transition-name
   'lp-routing-spine' on the RoutingLedger container, the Advance sidebar and
   the Day rail, the 220ms group animation in globals.css, and
   `experimental.viewTransition` in next.config — but stable React 19 exports
   NO ViewTransition component, so nothing ever STARTED a transition and the
   names sat inert. (Adam, 2026-08-06: "the routing view should fold …
   animate the slide over. everything flows from the routing.")

   This module is the missing trigger: wrap the navigation in the browser's
   own document.startViewTransition, and resolve its update-callback promise
   when the app router commits the new route (pathname change), so the
   browser snapshots old → new and morphs the named spine between them.

   Contained on purpose: only call sites that opt in (the RoutingRail entry
   links, and the shell NavRail when BOTH ends of the hop are spine surfaces)
   use it. Everything else navigates exactly as before. No transition support
   in the browser → plain push, zero cost.

   The 500ms guard: if the destination's RSC payload is slow, we resolve
   anyway — the transition animates to whatever has rendered and the page
   finishes loading normally. A morph must never hold the screen hostage.
   ============================================ */

import { useCallback, useEffect } from 'react';
import { usePathname, useRouter } from 'next/navigation';

type StartViewTransitionFn = (update: () => Promise<void> | void) => unknown;

let pendingResolve: (() => void) | null = null;
let pendingTimer: ReturnType<typeof setTimeout> | null = null;

function settle(): void {
  if (pendingTimer) {
    clearTimeout(pendingTimer);
    pendingTimer = null;
  }
  const r = pendingResolve;
  pendingResolve = null;
  r?.();
}

/** Push wrapped in a view transition (when the browser has one). */
export function navigateWithSpineMorph(push: (href: string) => void, href: string): void {
  const doc =
    typeof document !== 'undefined'
      ? (document as Document & { startViewTransition?: StartViewTransitionFn })
      : null;
  if (!doc?.startViewTransition) {
    push(href);
    return;
  }
  settle(); // collapse any stale pending transition first
  doc.startViewTransition(
    () =>
      new Promise<void>((resolve) => {
        pendingResolve = resolve;
        pendingTimer = setTimeout(settle, 500);
        push(href);
      }),
  );
}

/** The hook call sites use. Stable identity per router instance. */
export function useSpineNavigate(): (href: string) => void {
  const router = useRouter();
  return useCallback((href: string) => navigateWithSpineMorph((h) => router.push(h), href), [router]);
}

/** True when a shell-rail hop should morph: both ends are spine surfaces
 *  (routing ledger / day sheets / advance) — the "everything flows from the
 *  routing" set. Exported for the NavRail predicate + tests. */
const SPINE_RE = /\/(routing|day|advance)(\/|$)/;
export function isSpineHop(fromPathname: string, toHref: string): boolean {
  return SPINE_RE.test(fromPathname) && SPINE_RE.test(toHref);
}

/** Mounted ONCE in AppShell. Resolves the pending transition the moment the
 *  router commits the new route, so the browser captures the real
 *  destination frame rather than timing out against the old one. */
export function ViewTransitionResolver() {
  const pathname = usePathname();
  useEffect(() => {
    settle();
  }, [pathname]);
  return null;
}
