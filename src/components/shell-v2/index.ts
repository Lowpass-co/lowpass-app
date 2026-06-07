/* Barrel export for the Phase 1 product shells.
   Import sites should use `@/components/shell-v2`. */

/* Two-bar shell — ProductRail retired (replaced by the top product bar
   in ProductHeader). The active-product type now lives in productNav. */
export type { ProductRailActive } from './productNav';
export { ProductHeader } from './ProductHeader';
export type { ProductName } from './ProductHeader';
export { ProductShell } from './ProductShell';
export { TopProductNav } from './TopProductNav';
export { ProductSubBar } from './ProductSubBar';
