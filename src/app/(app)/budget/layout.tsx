import type { ReactNode } from 'react';
import { BudgetDetailPanelLayout } from '@/components/budget/BudgetDetailPanelLayout';

export default function BudgetLayout({ children }: { children: ReactNode }) {
  return <BudgetDetailPanelLayout>{children}</BudgetDetailPanelLayout>;
}
