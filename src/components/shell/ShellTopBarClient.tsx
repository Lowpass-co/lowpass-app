'use client';

import { useCallback, useMemo } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { useAuth } from '@/hooks/useAuth';
import { useArtistTourContext } from '@/contexts/ArtistTourContext';
import { TopBar } from '@/components/shell/TopBar';
import { useCommandPalette } from '@/components/command-palette/CommandPaletteContext';
import { useTourEditor } from '@/contexts/TourEditorContext';
import type { ShellData } from '@/lib/shell/types';

export type ShellTopBarClientProps = {
  shellData: ShellData;
};

export function ShellTopBarClient({ shellData }: ShellTopBarClientProps) {
  const router = useRouter();
  const pathname = usePathname() ?? '';
  const { signOut } = useAuth();
  const { setSelectedTourId, setSelectedArtistId } = useArtistTourContext();
  const palette = useCommandPalette();
  const { openCreateTour } = useTourEditor();

  const activeTourId = useMemo(() => {
    const m = pathname.match(/^\/tours\/([^/]+)/);
    if (m?.[1] && m[1] !== 'create') return m[1];
    return undefined;
  }, [pathname]);

  const onTourSelect = useCallback(
    (id: string) => {
      // Picking a tour also re-scopes the workspace to that tour's artist —
      // restoring the legacy Sidebar's artist-picker behaviour. Downstream
      // pages (DashboardArtistGate, /advance, etc.) already consume
      // selectedArtistId, so they re-filter without further wiring.
      const tour = shellData.tours.find((t) => t.id === id);
      if (tour?.artistId) setSelectedArtistId(tour.artistId);
      setSelectedTourId(id);
      router.push(`/tours/${id}`);
    },
    [router, setSelectedTourId, setSelectedArtistId, shellData.tours],
  );

  const onCreateTour = useCallback(() => {
    openCreateTour();
  }, [openCreateTour]);

  // UX08b — TopBar's ⌘K trigger flips the same provider state the global
  // shortcut listener owns. Two-way binding via CommandPaletteContext.
  const onCommandPaletteOpen = palette.show;

  const user = shellData.user ?? { name: 'Guest', email: '' };

  return (
    <TopBar
      tours={shellData.tours}
      isSiteAdmin={shellData.isSiteAdmin}
      activeTourId={activeTourId}
      onTourSelect={onTourSelect}
      onCreateTour={onCreateTour}
      onCommandPaletteOpen={onCommandPaletteOpen}
      user={user}
      onSignOut={() => {
        void signOut();
      }}
    />
  );
}
