/* ============================================
   LOWPASS — <ProductHeader> (Sprint 10 §1.6 — null no-op)

   Was: 48px header per product (Operations / Budget / Advance
   / Home) showing workspace switcher + artist/tour switcher +
   product name + search + avatar.

   Sprint 10 §1.2 — replaced by <UnifiedTopBar> mounted at
   (app)/layout.tsx. ProductShell no longer mounts this; the
   only direct consumers are doc comments. Returning null
   keeps the export so existing imports compile cleanly while
   ensuring no chrome doubles up if a stale call site survives.

   `ProductName` re-exported for backward-compat with callers
   that still receive a productName prop (now ignored). The
   AvatarMenu (`ProductHeaderAvatarMenu`) remains in active
   use — UnifiedTopBar re-uses it for the user pill.
   ============================================ */

export type ProductName = 'Home' | 'Operations' | 'Budget' | 'Advance';

interface ProductHeaderProps {
  productName: ProductName;
}

export function ProductHeader({ productName }: ProductHeaderProps) {
  void productName;
  return null;
}
