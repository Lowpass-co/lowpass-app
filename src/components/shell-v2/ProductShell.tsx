/* ============================================
   LOWPASS — <ProductShell> (Sprint 10 §1.6 — pass-through)

   Was: ProductRail + ProductHeader + main scroll container.
   Sprint 10 §1 collapses chrome into the (app)/layout's
   <UnifiedTopBar> + <ScopeNavStrip>. The four per-product
   layouts (operations, budget, advance, artists) still wrap
   their page body in <ProductShell>; keeping the export as a
   pass-through lets the IA reframe ship without touching every
   layout in the same commit.

   ProductRail is gone — replaced by the top-level
   <ScopeNavStrip>. ProductHeader is gone — replaced by
   <UnifiedTopBar>.

   The scroll-containment behaviour those layouts depended on
   (h-screen + main overflow-y-auto) now needs to be supplied
   by the page or per-product layout itself. To avoid breaking
   sticky positioning inside page bodies, this pass-through
   still produces the same flex frame structure (just without
   the chrome).

   `active` / `artistId` / `tourId` / `productName` /
   `homeHref` props stay accepted but unused so existing call
   sites compile without edit.
   ============================================ */

import type { ProductRailActive } from './ProductRail';
import type { ProductName } from './ProductHeader';

interface ProductShellProps {
  active: ProductRailActive;
  artistId: string | null;
  tourId?: string | null;
  productName: ProductName;
  homeHref?: string;
  children: React.ReactNode;
}

export function ProductShell({
  active,
  artistId,
  tourId,
  productName,
  homeHref,
  children,
}: ProductShellProps) {
  // Sprint 10 §1.6 — props retained for backward compat.
  void active;
  void artistId;
  void tourId;
  void productName;
  void homeHref;
  return (
    <div
      className="lp-product-shell flex min-h-0 flex-1 flex-col"
      style={{
        background: 'var(--lp-bg)',
        color: 'var(--lp-text)',
      }}
    >
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
