/* ============================================
   LOWPASS — Page-shell wrappers (Sprint 10 §1.6 — pass-through)

   These wrappers used to add per-archetype chrome (TopBar +
   LeftRail) around page content. Sprint 10 §1 collapses chrome
   into the (app)/layout.tsx <UnifiedTopBar> + <ScopeNavStrip>
   mount, so these wrappers become pass-throughs.

   Why keep the exports at all?
   ~44 pages currently import + await one of these. Removing
   them would touch every page in the same commit; keeping them
   as no-ops lets the IA reframe ship as a single contained
   commit. A follow-up cleanup pass (Sprint 10 §x or Sprint 11)
   can delete the import lines page-by-page.

   The LeftRail filters/sections those wrappers used to inject
   are deliberately dropped — the IA reframe replaces them with
   in-page filter chips (Phase 2 §2.1) and richer page content.

   `LeftRailVariant` is re-exported as a vestigial type so a
   handful of pages that destructure it from this module keep
   compiling.
   ============================================ */

import type { ReactNode } from 'react';
import type { LeftRailVariant } from '@/components/shell/LeftRail';

export type { LeftRailVariant } from '@/components/shell/LeftRail';

/** Sprint 10 — pass-through. Was: list archetype + filters
 *  rail + TopBar. Chrome now lives in the (app)/layout. */
export async function listAppPageShell(children: ReactNode): Promise<ReactNode> {
  return children;
}

export async function dashboardAppPageShell(
  children: ReactNode,
  _rail: LeftRailVariant,
): Promise<ReactNode> {
  return children;
}

export async function docDaysAppPageShell(
  children: ReactNode,
  _base: Extract<LeftRailVariant, { kind: 'docDays' }>,
): Promise<ReactNode> {
  return children;
}

export async function documentSectionsAppPageShell(
  children: ReactNode,
  _rail: Extract<LeftRailVariant, { kind: 'docSections' }>,
): Promise<ReactNode> {
  return children;
}

export async function spreadsheetAppPageShell(
  children: ReactNode,
  _rail: Extract<LeftRailVariant, { kind: 'spreadsheet' }>,
): Promise<ReactNode> {
  return children;
}

export async function builderAppPageShell(
  children: ReactNode,
  _rail: Extract<LeftRailVariant, { kind: 'docSections' }>,
): Promise<ReactNode> {
  return children;
}

export async function topBarOnlyAppPageShell(children: ReactNode): Promise<ReactNode> {
  return children;
}
