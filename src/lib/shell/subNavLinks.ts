/* ============================================
   LOWPASS — Sub-nav link builders (Sprint 10 §1.4)

   Server-side helpers that produce the per-product link list
   for the tour-scope <SubNavStrip>. Each builder takes a
   tourId + a permission-check function and returns links with
   `visible` flags computed once.

   Per Q5 — option (a): the layout that mounts <UnifiedTopBar>
   calls these, passes the result to <SubNavStrip>. Per-product
   layouts stay thin. No context plumbing.
   ============================================ */

import type { SubNavLink } from '@/components/shell/SubNavStrip';
import type { TourProduct } from '@/lib/shell/scope';

type CanRead = (resourceId: string) => boolean;

export function operationsSubNavLinks(tourId: string, canRead: CanRead): SubNavLink[] {
  const base = `/operations/${tourId}`;
  return [
    {
      id: 'summary',
      label: 'Summary',
      href: base,
      visible: true,
      isActive: (p) => p === base,
    },
    {
      id: 'personnel',
      label: 'Personnel',
      href: `${base}/personnel`,
      visible: canRead('operations.personnel'),
      isActive: (p) => p.startsWith(`${base}/personnel`),
    },
    {
      id: 'routing',
      label: 'Routing',
      href: `${base}/routing`,
      visible: canRead('operations.routing'),
      isActive: (p) => p.startsWith(`${base}/routing`),
    },
    {
      id: 'channel-list',
      label: 'Channel list',
      href: `${base}/channel-list`,
      visible: canRead('operations.channel_list'),
      isActive: (p) => p.startsWith(`${base}/channel-list`),
    },
    {
      id: 'payroll',
      label: 'Payroll',
      href: `${base}/payroll`,
      visible: canRead('operations.payroll'),
      isActive: (p) => p.startsWith(`${base}/payroll`),
    },
    {
      id: 'rooming',
      label: 'Rooming',
      href: `${base}/rooming`,
      visible: canRead('operations.rooming'),
      isActive: (p) => p.startsWith(`${base}/rooming`),
    },
    {
      id: 'files',
      label: 'Files',
      href: `${base}/files`,
      visible: canRead('operations.files'),
      isActive: (p) => p.startsWith(`${base}/files`),
    },
    {
      id: 'riders',
      label: 'Riders',
      href: `${base}/riders`,
      visible: canRead('operations.riders'),
      isActive: (p) => p.startsWith(`${base}/riders`),
    },
  ];
}

export function budgetSubNavLinks(tourId: string, canRead: CanRead): SubNavLink[] {
  const base = `/budget/${tourId}`;
  return [
    {
      id: 'line-items',
      label: 'Line items',
      href: `${base}/line-items`,
      visible: canRead('budget.line_items'),
      isActive: (p) => p.startsWith(`${base}/line-items`),
    },
    {
      id: 'receipts',
      label: 'Receipts',
      href: `${base}/receipts`,
      visible: canRead('budget.receipts'),
      isActive: (p) => p.startsWith(`${base}/receipts`),
    },
    {
      id: 'payroll',
      label: 'Payroll',
      href: `${base}/payroll`,
      visible: canRead('budget.payroll'),
      isActive: (p) => p.startsWith(`${base}/payroll`),
    },
    {
      id: 'deal-memos',
      label: 'Deal memos',
      href: `${base}/deal-memos`,
      visible: canRead('budget.deal_memos'),
      isActive: (p) => p.startsWith(`${base}/deal-memos`),
    },
    {
      id: 'commissions',
      label: 'Commissions',
      href: `${base}/commissions`,
      visible: canRead('budget.commissions'),
      isActive: (p) => p.startsWith(`${base}/commissions`),
    },
    {
      id: 'summary',
      label: 'Summary',
      href: base,
      visible: true,
      isActive: (p) => p === base,
    },
  ];
}

export function advanceSubNavLinks(tourId: string, _canRead: CanRead): SubNavLink[] {
  // Advance is two-step (Setup + Fill). Sub-nav is intentionally
  // sparse; per-show navigation lives inside the Fill view.
  const base = `/advance/${tourId}`;
  return [
    {
      id: 'setup',
      label: 'Setup',
      href: `${base}/setup`,
      visible: true,
      isActive: (p) => p.startsWith(`${base}/setup`),
    },
    {
      id: 'fill',
      label: 'Fill',
      href: `${base}/fill`,
      visible: true,
      isActive: (p) => p.startsWith(`${base}/fill`),
    },
  ];
}

export function buildSubNavLinks(
  product: TourProduct,
  tourId: string,
  canRead: CanRead,
): SubNavLink[] {
  switch (product) {
    case 'operations':
      return operationsSubNavLinks(tourId, canRead);
    case 'budget':
      return budgetSubNavLinks(tourId, canRead);
    case 'advance':
      return advanceSubNavLinks(tourId, canRead);
  }
}
