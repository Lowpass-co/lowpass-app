'use client';

import { useId } from 'react';
import { useArtistTourContext } from '@/contexts/ArtistTourContext';

/**
 * Until the user picks an artist (localStorage + context), the dashboard stays empty
 * and prompts them toward the header picker.
 */
export function DashboardArtistGate({ children }: { children: React.ReactNode }) {
  const { selectedArtistId, hydrated } = useArtistTourContext();

  if (!hydrated) {
    return <div className="mx-auto min-h-[60vh] max-w-7xl" aria-busy="true" />;
  }

  if (!selectedArtistId) {
    return <DashboardChooseArtistPrompt />;
  }

  return <>{children}</>;
}

function DashboardChooseArtistPrompt() {
  const markerId = useId().replace(/:/g, '');

  return (
    <div className="relative mx-auto min-h-[min(72vh,640px)] max-w-7xl px-2 sm:px-0">
      {/* Curved arrow toward header artist picker (top-left of main column) */}
      <svg
        className="pointer-events-none absolute left-0 top-2 z-0 h-40 w-[min(55vw,280px)] text-lp-orange sm:left-4 sm:top-4 sm:h-48 sm:w-[320px]"
        viewBox="0 0 320 200"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        aria-hidden
      >
        <defs>
          <marker
            id={markerId}
            markerWidth="9"
            markerHeight="9"
            refX="7"
            refY="4.5"
            orient="auto"
            markerUnits="strokeWidth"
          >
            <path d="M 0 0 L 9 4.5 L 0 9 Z" fill="currentColor" className="opacity-[0.6]" />
          </marker>
        </defs>
        <path
          d="M 298 172 C 215 118, 125 48, 26 18"
          stroke="currentColor"
          strokeWidth="2.25"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="opacity-[0.5]"
          markerEnd={`url(#${markerId})`}
        />
      </svg>

      <div className="relative z-[1] flex min-h-[min(68vh,600px)] flex-col items-center justify-center pt-16 sm:pt-20">
        <div
          className="lp-dashboard-glass-card max-w-md rounded-2xl border border-lp-orange/20 px-8 py-10 text-center shadow-lg"
          style={{
            boxShadow: '0 0 0 1px rgba(255, 69, 0, 0.08), 0 20px 50px -24px rgba(255, 69, 0, 0.25)',
          }}
          role="status"
        >
          <h2 className="text-2xl font-bold leading-snug tracking-tight text-lp-text sm:text-[1.75rem]">
            Choose an artist.
          </h2>
          <p className="mt-4 text-base font-medium leading-relaxed text-lp-text-secondary sm:text-lg">
            Let&apos;s manage some tours together.
          </p>
        </div>
      </div>
    </div>
  );
}
