'use client';

/* ============================================
   LOWPASS — <UnifiedTopBar> (Sprint 10 §1.2)

   Single context-aware TopBar that replaces both shell-v1's
   <TopBar> and shell-v2's <ProductHeader>. Mounted once at
   (app)/layout.tsx; every authenticated route inherits it.

   Layout:

     [Logo] [WorkspaceSwitcher] [BreadcrumbPill]   [Search ⌘K] [Live] [Admin] [User ▾]
                                       ↑ scope-aware (null at workspace scope)
                                                                ↑ tour-scope only

   Below this header, (app)/layout.tsx mounts the
   <ScopeNavStripClient> + <SubNavStripClient> wrappers. The
   sub-nav links + breadcrumb data are server-fetched in the
   layouts that own scope-specific data (operations / budget /
   advance / artists tour layouts) and threaded via React
   context. UnifiedTopBar just derives scope from pathname
   client-side; the surface-specific data flows from the
   nearest scoped layout.

   Client component because:
     - usePathname() is required for scope detection
     - useArtistTourContext() supplies the artist + tour
       breadcrumb labels without a per-render server fetch
     - SearchTriggerButton + WorkspaceSwitcher + the ATSCW
       avatar trigger + ProductHeaderAvatarMenu are all
       interactive

   The layout pre-fetches user/profile/isSiteAdmin/initialArtists
   server-side and passes them as plain serialisable props.
   ============================================ */

import Link from 'next/link';
import Image from 'next/image';
import { usePathname } from 'next/navigation';
import { WorkspaceSwitcher } from '@/components/shell-v2/WorkspaceSwitcher';
import { BreadcrumbPill } from '@/components/shell/BreadcrumbPill';
import { SearchTriggerButton } from '@/components/shell/SearchTriggerButton';
import { ProductHeaderAvatarMenu } from '@/components/shell-v2/ProductHeaderAvatarMenu';
import { ConnectionIndicator } from '@/components/realtime/ConnectionIndicator';
import { useArtistTourContext } from '@/contexts/ArtistTourContext';
import { deriveScope } from '@/lib/shell/scope';

type SwitcherArtistMin = {
  id: string;
  name: string;
  branding: unknown;
  spotify_image_url: string | null;
};

interface UnifiedTopBarProps {
  /** Server-fetched user pill data. Pre-rendering avoids a
   *  client-side Supabase auth roundtrip on every nav. */
  user: { name: string; email: string; avatarUrl: string | null } | null;
  isSiteAdmin: boolean;
  /** Workspace artist list — feeds the BreadcrumbPill avatar
   *  dropdown's first paint. */
  initialArtists: SwitcherArtistMin[];
}

export function UnifiedTopBar({ user, isSiteAdmin, initialArtists }: UnifiedTopBarProps) {
  const pathname = usePathname();
  const scope = deriveScope(pathname);

  /* Sprint 10 §1.3 — pull breadcrumb labels from the existing
     ArtistTourContext rather than re-fetching server-side. The
     context already knows selectedArtistId / selectedTourId
     (the route's URL syncs into it via ArtistTourScopeGuard).
     When labels are missing (race during first navigation),
     the BreadcrumbPill renders the avatar trigger only —
     better than flashing stale data.

     React Compiler auto-memoizes derivations downstream of
     hooks; manual useMemo here was tripping the compiler's
     dep-equivalence check. */
  const { selectedArtist, selectedTour } = useArtistTourContext();

  const breadcrumbArtist =
    scope.level !== 'workspace' && selectedArtist?.id
      ? { id: selectedArtist.id, name: selectedArtist.name }
      : null;

  const breadcrumbTour =
    scope.level === 'tour' &&
    selectedTour?.id &&
    selectedTour.id === scope.tourId
      ? { id: selectedTour.id, name: selectedTour.name }
      : null;

  return (
    <header
      className="lp-unified-topbar"
      style={{
        position: 'sticky',
        top: 0,
        zIndex: 'var(--lp-z-sticky)',
        display: 'flex',
        alignItems: 'center',
        gap: 'var(--lp-space-3)',
        height: 'var(--lp-topbar-height, 48px)',
        padding: '0 var(--lp-content-padding-x)',
        background: 'var(--lp-bg)',
        borderBottom: '1px solid var(--lp-border)',
        boxShadow: 'var(--lp-shadow-xs)',
      }}
    >
      <div
        className="flex min-w-0 flex-1 items-center"
        style={{ gap: 'var(--lp-space-3)' }}
      >
        <Link href="/artists" className="shrink-0" aria-label="Workspace home">
          <Image
            src="/lowpass-logo.png"
            alt="Lowpass"
            width={64}
            height={50}
            className="h-9 w-auto"
            priority
          />
        </Link>
        <WorkspaceSwitcher />
        <BreadcrumbPill
          scope={scope}
          artist={breadcrumbArtist}
          tour={breadcrumbTour}
          initialArtists={initialArtists}
        />
      </div>

      <div
        className="flex shrink-0 items-center"
        style={{ gap: 'var(--lp-space-2)' }}
      >
        <SearchTriggerButton />
        {scope.level === 'tour' ? <ConnectionIndicator /> : null}
        {user ? (
          <ProductHeaderAvatarMenu
            user={user}
            isSiteAdmin={isSiteAdmin}
          />
        ) : null}
      </div>
    </header>
  );
}
