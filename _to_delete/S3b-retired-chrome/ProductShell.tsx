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
   This is the same sticky-inside-a-scroll-container fix the retired
   tour breadcrumb ran into.
   ============================================ */

import { ProductHeader, type ProductName } from './ProductHeader';
import type { ProductRailActive } from './productNav';
import { RememberTourProduct } from './RememberTourProduct';
import { TOUR_PRODUCTS, type TourProduct } from '@/lib/nav/lastProduct';

interface ProductShellProps {
  active: ProductRailActive;
  artistId: string | null;
  tourId?: string | null;
  productName: ProductName;
  /** When the active product is "home" and an artist is selected, the
      Home root lives at `/artists/[artistId]` rather than `/`. Pass
      that through for the top bar's Home item + its dropdown. */
  homeHref?: string;
  /** Two-bar shell — Bar 2: the product's sub-tab strip, rendered
      directly under the top product bar (Bar 1) and above <main>. */
  subNav?: React.ReactNode;
  children: React.ReactNode;
}

export function ProductShell({
  active,
  artistId,
  tourId,
  productName,
  homeHref,
  subNav,
  children,
}: ProductShellProps) {
  // Sprint 8.5 §1 — artistId and tourId are no longer consumed
  // by ProductShell now that the switcher lives at workspace
  // level. The props stay on the interface for backward
  // compatibility with the four per-product layouts that pass
  // them; future cleanup can drop them entirely once all call
  // sites are updated.
  void artistId;
  // Nav & entry fixpack item 1 — record last-product-used for this tour when
  // the surface is one of the three products. Read back by openTour()/Resume.
  const rememberProduct: TourProduct | null =
    tourId && (TOUR_PRODUCTS as readonly string[]).includes(active as string)
      ? (active as TourProduct)
      : null;
  // Two-bar shell — the left ProductRail is replaced by the horizontal
  // top product bar inside <ProductHeader> (Bar 1), reclaiming the 56px
  // sidebar for content. The shell is now a vertical column: Bar 1 →
  // Bar 2 (subNav) → scrolling <main>. <main> stays the only scroll
  // surface, so sticky chrome inside the page still anchors to it.
  return (
    <div
      className="lp-product-shell flex h-screen flex-col overflow-hidden"
      style={{
        background: 'var(--lp-bg)',
        color: 'var(--lp-text)',
      }}
    >
      {rememberProduct && tourId ? (
        <RememberTourProduct tourId={tourId} product={rememberProduct} />
      ) : null}
      <ProductHeader productName={productName} active={active} homeHref={homeHref} />
      {subNav ?? null}
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
  );
}
