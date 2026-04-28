import { getDealMemoById, searchDealMemos } from '@/lib/api/deal-memos';
import type { DealMemoListRow } from '@/lib/types/deal-memo';
import { registerEntity } from './registry';

registerEntity<DealMemoListRow>({
  kind: 'deal-memo',
  fetchById: (id: string) => getDealMemoById(id),
  search: searchDealMemos,
  getLabel: (m) => m.title,
  getSecondary: (m) => {
    const scope = m.showId ? 'Show' : 'Tour-wide';
    const fee = m.feeAmount != null ? ` · ${m.feeCurrency} ${m.feeAmount}` : '';
    return `${scope}${fee} · ${m.status}`;
  },
  getColor: (m): string => {
    if (m.status === 'signed') return 'var(--lp-success)';
    if (m.status === 'pending') return '#fbbf24';
    if (m.status === 'draft') return 'var(--lp-text-tertiary)';
    return 'var(--lp-text-secondary)';
  },
  SlideOverContent: () => import('@/components/entity/deal-memo/DealMemoSlideOver'),
});
