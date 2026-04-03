'use client';

import type { LucideIcon } from 'lucide-react';
import {
  Bus,
  DollarSign,
  Hotel,
  LayoutPanelLeft,
  Package,
  PercentDiamond,
  Plane,
  Receipt,
  Route,
  Scale,
} from 'lucide-react';
import type { TabId } from './budget-tabs';

/** Lucide icon per budget tab (shared by folder tabs + vertical nav). */
export const BUDGET_TAB_ICONS: Record<TabId, LucideIcon> = {
  summary: LayoutPanelLeft,
  income: Route,
  salaries: DollarSign,
  hotels: Hotel,
  flights: Plane,
  transport: Bus,
  production: Package,
  receipts: Receipt,
  commissions: PercentDiamond,
  settlement: Scale,
};

export function BudgetTabIcon({
  tabId,
  className,
}: {
  tabId: TabId;
  className?: string;
}) {
  const Icon = BUDGET_TAB_ICONS[tabId];
  return <Icon className={className} aria-hidden />;
}
