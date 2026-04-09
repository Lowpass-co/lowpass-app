/* ============================================
   LOWPASS — Header Artist / Tour (scoped context)

   Horizontal Lowpass-style selects next to NEW TOUR.
   ============================================ */

'use client';

import { useMemo } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useArtistTourContext } from '@/contexts/ArtistTourContext';
import { StyledSelect, type StyledSelectOption } from '@/components/ui/StyledSelect';

export function HeaderArtistTourPicker() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const {
    selectedArtistId,
    selectedTourId,
    selectedArtist,
    setSelectedArtistId,
    setSelectedTourId,
    artists,
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
      router.push(`/budget?tour_id=${newTourId}&tab=summary`);
      return;
    }
    if (pathname?.startsWith('/budget')) {
      const tab = searchParams?.get('tab') ?? 'summary';
      router.push(`/budget?tour_id=${newTourId}&tab=${tab}`);
    } else if (pathname?.includes('/overview')) {
      router.push(`/tours/${newTourId}/overview`);
    } else if (pathname?.includes('/advance')) {
      router.push(`/tours/${newTourId}/advance`);
    } else if (pathname?.includes('/rooming')) {
      router.push(`/tours/${newTourId}/rooming`);
    } else if (pathname?.includes('/payroll')) {
      router.push(`/tours/${newTourId}/payroll`);
    } else {
      router.push(`/budget?tour_id=${newTourId}&tab=summary`);
    }
  }

  const artistOptions: StyledSelectOption<string>[] = useMemo(
    () => [
      { value: '', label: 'Select artist' },
      ...artists.map((a) => ({ value: a.id, label: a.name })),
    ],
    [artists]
  );

  const tourOptions: StyledSelectOption<string>[] = useMemo(
    () => [
      {
        value: '',
        label: !selectedArtistId
          ? 'Select artist first'
          : isLoading
            ? 'Loading tours…'
            : 'Select tour',
      },
      ...tours.map((t) => ({ value: t.id, label: t.name })),
    ],
    [tours, selectedArtistId, isLoading]
  );

  if (!hydrated) {
    return (
      <div
        className="flex min-h-9 min-w-0 flex-1 items-center gap-2 sm:max-w-xl"
        aria-hidden
      >
        <div className="h-9 flex-1 rounded-xl border border-lp-border bg-lp-surface/50" />
        <div className="h-9 flex-1 rounded-xl border border-lp-border bg-lp-surface/50" />
      </div>
    );
  }

  return (
    <div className="flex min-w-0 flex-1 items-center gap-2 sm:max-w-xl">
      <div className="h-9 w-9 shrink-0 overflow-hidden rounded-full border border-lp-border bg-lp-bg-secondary">
        {selectedArtist?.spotify_image_url ? (
          <img src={selectedArtist.spotify_image_url} alt="" className="h-full w-full object-cover" />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-[11px] font-bold text-lp-text-tertiary">
            {(selectedArtist?.name ?? '?').charAt(0).toUpperCase()}
          </div>
        )}
      </div>

      <div className="flex min-w-0 flex-1 flex-row items-stretch gap-2">
        <div className="min-w-0 flex-1">
          <StyledSelect
            size="sm"
            value={selectedArtistId ?? ''}
            onChange={(v) => setSelectedArtistId(v || null)}
            options={artistOptions}
            placeholder="Select artist"
          />
        </div>
        <div className="min-w-0 flex-1">
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
          />
        </div>
      </div>
    </div>
  );
}
