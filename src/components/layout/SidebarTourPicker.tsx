/* ============================================
   LOWPASS — Sidebar “Choose Tour” (StyledSelect)
   ============================================ */

'use client';

import { useMemo } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useArtistTourContext } from '@/contexts/ArtistTourContext';
import { StyledSelect, type StyledSelectOption } from '@/components/ui/StyledSelect';

export function SidebarTourPicker() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const {
    selectedArtistId,
    selectedTourId,
    setSelectedTourId,
    tours,
    isLoading,
    hydrated,
  } = useArtistTourContext();

  const onManagePage =
    pathname?.startsWith('/budget') ||
    pathname?.startsWith('/tours/') ||
    pathname?.includes('/payroll') ||
    pathname?.includes('/rooming');

  function redirectAfterTourSwitch(newTourId: string) {
    if (!onManagePage) {
      router.push(`/budget?tour_id=${newTourId}`);
      return;
    }
    if (pathname?.startsWith('/budget')) {
      // Preserve view=detail if already in detail mode; otherwise go to overview
      const view = searchParams?.get('view');
      const tab = searchParams?.get('tab') ?? 'summary';
      if (view === 'detail') {
        router.push(`/budget?tour_id=${newTourId}&view=detail&tab=${tab}`);
      } else {
        router.push(`/budget?tour_id=${newTourId}`);
      }
    } else if (pathname?.includes('/overview')) {
      router.push(`/tours/${newTourId}/overview`);
    } else if (pathname?.includes('/advance')) {
      router.push(`/tours/${newTourId}/advance`);
    } else if (pathname?.includes('/rooming')) {
      router.push(`/tours/${newTourId}/rooming`);
    } else if (pathname?.includes('/payroll')) {
      router.push(`/tours/${newTourId}/payroll`);
    } else {
      router.push(`/budget?tour_id=${newTourId}`);
    }
  }

  const tourOptions: StyledSelectOption<string>[] = useMemo(
    () => [
      {
        value: '',
        label: !selectedArtistId
          ? 'Select artist in header'
          : isLoading
            ? 'Loading tours…'
            : 'Select tour',
      },
      ...tours.map((t) => ({ value: t.id, label: t.name })),
    ],
    [tours, selectedArtistId, isLoading]
  );

  if (!hydrated) {
    return <div className="h-9 w-full rounded-xl border border-lp-border bg-lp-surface/40" aria-hidden />;
  }

  return (
    <StyledSelect
      size="sm"
      value={selectedTourId ?? ''}
      onChange={(v) => {
        if (!v) {
          setSelectedTourId(null);
          if (onManagePage) router.push('/budget');
          return;
        }
        setSelectedTourId(v);
        redirectAfterTourSwitch(v);
      }}
      options={tourOptions}
      placeholder="Select tour"
      disabled={!selectedArtistId || isLoading}
      className="w-full"
    />
  );
}
