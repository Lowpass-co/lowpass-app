/* ============================================
   LOWPASS — Product Split Phase 1 — <ProductShell>

   Wraps a product surface with the rail + header + scroll-contained
   main area. Composition primitive — pages don't roll their own
   chrome.

   API:
     <ProductShell
       active="operations"
       artistId={artistId}
       tourId={tourId}                // optional
       productName="Operations"
       homeHref={`/artists/${artistId}`}   // optional
     >
       {page body}
     </ProductShell>

   Scroll containment: the rail and header sit on the flex frame,
   which is `h-screen overflow-hidden`. The <main> is the only
   scroll surface, so `position: sticky` inside the page body
   anchors against <main>'s viewport — not against the document.
   This is the same fix CLAUDE.md notes the legacy TourBreadcrumb
   ran into.
   ============================================ */

import { ProductHeader, type ProductName } from './ProductHeader';
import { ProductRail, type ProductRailActive } from './ProductRail';

interface ProductShellProps {
  active: ProductRailActive;
  artistId: string | null;
  tourId?: string | null;
  productName: ProductName;
  /** When the active product is "home" and an artist is selected, the
      Home root lives at `/artists/[artistId]` rather than `/`. Pass
      that through for the rail's Home icon. */
  homeHref?: string;
  /** Sprint 8.1 §1 — pre-formatted key-stat string the switcher
   *  trigger displays as a third dot-segment on tour-scoped
   *  pages. Examples: "67% SPENT", "82% COMPLETE", "12 CREW".
   *  Computed page-side from the same data the TourHeader
   *  consumes; null on non-tour pages. */
  currentTourKeyStat?: string | null;
  children: React.ReactNode;
}

export function ProductShell({
  active,
  artistId,
  tourId,
  productName,
  homeHref,
  currentTourKeyStat,
  children,
}: ProductShellProps) {
  return (
    <div
      className="lp-product-shell flex h-screen overflow-hidden"
      style={{
        background: 'var(--lp-bg)',
        color: 'var(--lp-text)',
      }}
    >
      <ProductRail active={active} homeHref={homeHref} />
      <div className="flex min-w-0 flex-1 flex-col">
        <ProductHeader
          artistId={artistId}
          tourId={tourId}
          productName={productName}
          currentTourKeyStat={currentTourKeyStat}
        />
        <main
          className="flex-1 overflow-y-auto"
          style={{
            minHeight: 0,
            background: 'var(--lp-bg)',
          }}
        >
          {children}
        </main>
      </div>
    </div>
  );
}
