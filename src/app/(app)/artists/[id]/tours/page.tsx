/* ============================================
   LOWPASS — /artists/[id]/tours (Sprint 10 §1.4 — placeholder)

   Per-artist tour list. Sprint 11+. The workspace-level
   ArtistTourSwitcher already shows tours per artist; this
   page will become a richer view (status / dates / personnel
   counts / revenue per tour) once the real surface lands.
   ============================================ */

import { ArtistScopePlaceholder } from '@/components/artists/ArtistScopePlaceholder';

export default function ArtistToursPage() {
  return (
    <ArtistScopePlaceholder
      title="Tours"
      description="Per-artist tour list with status, dates, personnel counts, and revenue per tour — coming Sprint 11. Use the workspace switcher's tours pane for now."
    />
  );
}
