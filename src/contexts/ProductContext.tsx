/* ============================================
   LOWPASS — Product Split Phase 1 — ProductContext

   Tracks which of the four products the user is currently inside
   (home / operations / budget / advance), derived from the URL
   pathname. Mounted in the (app) layout so any client component
   under /operations/*, /budget/*, /advance/* can call
   `useProductContext()` to know its product silo.

   Phase 1 only exposes `current`. Future phases extend with
   per-product state hooks (e.g. tour-scoped sub-product state) —
   add narrow context slices rather than fattening this one.
   ============================================ */

'use client';

import { createContext, useContext, useMemo, type ReactNode } from 'react';
import { usePathname } from 'next/navigation';

export type Product = 'home' | 'operations' | 'budget' | 'advance';

export interface ProductContextValue {
  /** Which product silo the current pathname belongs to. */
  current: Product;
}

const ProductContext = createContext<ProductContextValue | null>(null);

/** Resolve a pathname to a product silo. Default = home. */
function pathToProduct(pathname: string | null): Product {
  if (!pathname) return 'home';
  if (pathname.startsWith('/operations')) return 'operations';
  if (pathname.startsWith('/budget')) return 'budget';
  if (pathname.startsWith('/advance')) return 'advance';
  // Legacy /tours/[id]/* URLs are pre-redirect; treat them as
  // operations for the brief moment before middleware/redirects swap
  // the URL. Once the 301s land in §C, this branch is unreachable.
  if (pathname.startsWith('/tours')) return 'operations';
  return 'home';
}

export function ProductProvider({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const value = useMemo<ProductContextValue>(
    () => ({ current: pathToProduct(pathname) }),
    [pathname],
  );
  return (
    <ProductContext.Provider value={value}>{children}</ProductContext.Provider>
  );
}

/** Throws if called outside <ProductProvider>. */
export function useProductContext(): ProductContextValue {
  const ctx = useContext(ProductContext);
  if (!ctx) {
    throw new Error(
      'useProductContext must be used within <ProductProvider> (mounted in (app)/layout.tsx)',
    );
  }
  return ctx;
}

/** Same value but returns `null` instead of throwing — useful in
    components that may render outside the (app) tree (e.g. shared
    pieces used in auth pages too). */
export function useProductContextOptional(): ProductContextValue | null {
  return useContext(ProductContext);
}
