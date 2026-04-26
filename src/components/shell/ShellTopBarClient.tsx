'use client';

import { useCallback, useMemo } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { useAuth } from '@/hooks/useAuth';
import { useArtistTourContext } from '@/contexts/ArtistTourContext';
import { TopBar } from '@/components/shell/TopBar';
import type { ShellData } from '@/lib/shell/types';

export type ShellTopBarClientProps = {
  shellData: ShellData;
};

export function ShellTopBarClient({ shellData }: ShellTopBarClientProps) {
  const router = useRouter();
  const pathname = usePathname() ?? '';
  const { signOut } = useAuth();
  const { setSelectedTourId } = useArtistTourContext();

  const activeTourId = useMemo(() => {
    const m = pathname.match(/^\/tours\/([^/]+)/);
    if (m?.[1] && m[1] !== 'create') return m[1];
    return undefined;
  }, [pathname]);

  const onTourSelect = useCallback(
    (id: string) => {
      setSelectedTourId(id);
      router.push(`/tours/${id}`);
    },
    [router, setSelectedTourId],
  );

  const onCreateTour = useCallback(() => {
    router.push('/tours/create');
  }, [router]);

  const onCommandPaletteOpen = useCallback(() => {
    console.log('[shell] Command palette (UX08b stub)');
  }, []);

  const user = shellData.user ?? { name: 'Guest', email: '' };

  return (
    <TopBar
      tours={shellData.tours}
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
