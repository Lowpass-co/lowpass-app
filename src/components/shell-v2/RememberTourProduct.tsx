'use client';

/* ============================================
   LOWPASS — <RememberTourProduct> (Nav & entry fixpack, item 1)

   Zero-render client island mounted by ProductShell on every tour-scoped
   product surface. Records "this tour was last opened in <product>" so the
   next openTour()/Resume resolves the tour to the right surface instead of
   hardwiring Budget. See src/lib/nav/lastProduct.ts.
   ============================================ */

import { useEffect } from 'react';
import { rememberTourProduct, type TourProduct } from '@/lib/nav/lastProduct';

export function RememberTourProduct({
  tourId,
  product,
}: {
  tourId: string;
  product: TourProduct;
}) {
  useEffect(() => {
    rememberTourProduct(tourId, product);
  }, [tourId, product]);
  return null;
}
