/* ============================================
   LOWPASS — Product nav model (Stage B — single grouped row)

   Single source for the tour nav. Pure data (NO 'use client') so server and
   client both import it.

   - TOUR_NAV_GROUPS: the designed grouped row —
       Routing | $ Budget · ⧉ Advance | Crew · Production · Files
     with cluster boundaries, entitlement flags, tour-scoped href builders, and
     the pathname segments that light each group.
   - activeNavGroup(): derives the active group from the pathname so pages
     don't each thread an `active` prop.

   The pre-Stage-B four-product model (PRODUCTS / resolveProductHref /
   getProductSubItems, plus the left-rail hover dropdowns) was retired with the
   flat two-bar nav; only the `ProductRailActive` prop-type name survives.
   ============================================ */

import {
  ClipboardList,
  DollarSign,
  type LucideIcon,
} from 'lucide-react';
import type { Entitlements } from '@/lib/entitlements';

/* ============================================================
   DESIGNED tour nav (Stage B) — a single grouped row:
     Routing | $ Budget · ⧉ Advance | Crew · Production · Files
   Three clusters separated by hairline dividers; icons only on the two
   products; active = orange underline (rendered by TopProductNav). The active
   GROUP is derived from the pathname so pages don't each pass an `active` prop.
   Routes are UNCHANGED — this only regroups how they're presented:
     Routing   = /operations/[t]/routing (+ the /operations/[t] landing; Summary
                 folds into the Routing header)
     Crew      = /operations/[t]/(personnel|payroll|rooming)
     Production = /operations/[t]/(channel-list|stage-plot|riders)
     Files     = /operations/[t]/files
     Budget    = /budget/[t]      Advance = /advance/[t]
   ============================================================ */

export type NavGroupKey = 'routing' | 'budget' | 'advance' | 'crew' | 'production' | 'files';

export interface NavGroupDef {
  key: NavGroupKey;
  label: string;
  /** Icon shown only on the two products (Budget $, Advance ⧉). */
  Icon?: LucideIcon;
  /** 1 = Routing · 2 = products · 3 = ops groups. Hairline divider between clusters. */
  cluster: 1 | 2 | 3;
  flag: keyof Entitlements;
  href: (tourId: string) => string;
  /** The pathnames (for this tour) that light this group. */
  segments: string[];
}

export const TOUR_NAV_GROUPS: ReadonlyArray<NavGroupDef> = [
  { key: 'routing', label: 'Routing', cluster: 1, flag: 'operations',
    href: (t) => `/operations/${t}/routing`, segments: ['routing', 'summary', ''] },
  { key: 'budget', label: 'Budget', Icon: DollarSign, cluster: 2, flag: 'budget',
    href: (t) => `/budget/${t}`, segments: [] },
  { key: 'advance', label: 'Advance', Icon: ClipboardList, cluster: 2, flag: 'advance',
    href: (t) => `/advance/${t}`, segments: [] },
  { key: 'crew', label: 'Crew', cluster: 3, flag: 'operations',
    href: (t) => `/operations/${t}/personnel`, segments: ['personnel', 'payroll', 'rooming'] },
  { key: 'production', label: 'Production', cluster: 3, flag: 'operations',
    href: (t) => `/operations/${t}/channel-list`, segments: ['channel-list', 'stage-plot', 'riders'] },
  { key: 'files', label: 'Files', cluster: 3, flag: 'operations',
    href: (t) => `/operations/${t}/files`, segments: ['files'] },
];

/** Which nav group the current path belongs to (tour tier). Budget/Advance match
 *  their product prefix; the operations groups match the sub-segment after the
 *  tourId. Returns null off the tour tier. */
export function activeNavGroup(pathname: string, tourId: string | null): NavGroupKey | null {
  if (!tourId) return null;
  if (pathname.startsWith(`/budget/${tourId}`)) return 'budget';
  if (pathname.startsWith(`/advance/${tourId}`)) return 'advance';
  const opsPrefix = `/operations/${tourId}`;
  if (pathname.startsWith(opsPrefix)) {
    const rest = pathname.slice(opsPrefix.length).replace(/^\//, '').split('/')[0] ?? '';
    for (const g of TOUR_NAV_GROUPS) {
      if (g.segments.includes(rest)) return g.key;
    }
    return 'routing'; // the /operations/[t] landing + Summary fold into Routing
  }
  return null;
}

/* `null` is the "neutral chrome" state (Settings / Venues / Bugs). Retained as
   the `active` prop type on ProductHeader / ProductShell after Stage B derived
   the highlighted group from the pathname (`activeNavGroup`) instead — the four
   per-product layouts still pass `active` and neutral surfaces pass `null`. */
export type ProductRailActive = 'home' | 'operations' | 'budget' | 'advance' | null;
