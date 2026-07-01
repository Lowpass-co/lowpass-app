'use client';

/* ============================================
   LOWPASS — <NewTourButton>

   A client button that opens the app-wide tour create modal via useTourEditor().
   Drop-in for server components (the tours list, JobModal) that used to link to the
   retired /tours/create page. Styling is passed through (className/style/children) so
   it can look like whatever the host needs.
   ============================================ */

import { useTourEditor } from '@/contexts/TourEditorContext';

export function NewTourButton({
  className,
  style,
  children,
  artistId = null,
  title,
}: {
  className?: string;
  style?: React.CSSProperties;
  children: React.ReactNode;
  artistId?: string | null;
  title?: string;
}) {
  const { openCreateTour } = useTourEditor();
  return (
    <button type="button" className={className} style={style} title={title} onClick={() => openCreateTour({ artistId })}>
      {children}
    </button>
  );
}
