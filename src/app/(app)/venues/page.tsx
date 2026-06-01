/* ============================================
   LOWPASS — /venues (IA Cleanup §I4.2)

   Low-traffic placeholder for the eventual venue + contact
   database. Migrated from shell-v1 PageShell to ProductShell
   with active=null so the chrome matches the rest of the
   app — ProductRail renders without a highlighted product
   (none of Home / Operations / Budget / Advance is the
   destination), users still get one-click jump-back nav.

   Reachable via the avatar dropdown until the real surface
   ships.
   ============================================ */

import { ProductShell } from '@/components/shell-v2';
import { PageHeader } from '@/components/ui/PageHeader';

export default async function VenuesPage() {
  return (
    <ProductShell active={null} artistId={null} productName="Venues">
      <div className="mx-auto max-w-6xl p-6">
        {/* UX Audit 2026 — uniform page chrome via <PageHeader>. */}
        <PageHeader
          title="Venues"
          subtitle="Venue and contact database. Coming in a later phase."
        />
      </div>
    </ProductShell>
  );
}
