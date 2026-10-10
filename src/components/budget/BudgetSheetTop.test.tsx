/* ============================================
   LOWPASS — the budget sheet's top block (Oct 2026)

   Pins: section totals and the P&L lines render; typing an overhead % or a
   commission % recalculates on the spot AND saves to the same rows Tour
   settings writes; a refused save rolls back.
   ============================================ */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { BudgetSheetTop, money } from './BudgetSheetTop';
import type { BudgetLineItem, BudgetSection } from '@/types';

vi.mock('@/components/ui/Toast', () => ({ useToast: () => ({ showToast: vi.fn() }) }));

const sections = [{ id: 's1', name: 'Salaries', sort_order: 1 }, { id: 's2', name: 'Hotels', sort_order: 2 }] as unknown as BudgetSection[];
const lines = [
  { id: 'a', section_id: 's1', proposed_cost: 1000, actual_cost: 500, currency: null, section: null },
  { id: 'b', section_id: 's2', proposed_cost: 1000, actual_cost: 0, currency: null, section: null },
] as unknown as BudgetLineItem[];
const income = [{ pre_tax_guarantee: 5000, withholding_pct: 0, merch_income: 1000 }];

function mount(extra: Partial<Parameters<typeof BudgetSheetTop>[0]> = {}) {
  return render(
    <BudgetSheetTop
      tourId="t"
      tourCurrency="GBP"
      lines={lines}
      sections={sections}
      income={income}
      commissions={[{ id: 'c1', label: 'Merch', percentage: 0.2, basis: 'gross_merch' }]}
      settings={{ contingency_pct: 0.02, contingency_basis: 'expenses_pre_contingency' }}
      fxRates={{}}
      {...extra}
    />,
  );
}

describe('money()', () => {
  it('puts the sign before the symbol', () => {
    expect(money(-1234.5, 'GBP')).toBe('-£1,234.50');
    expect(money(10, 'GBP')).toBe('£10.00');
  });
});

describe('<BudgetSheetTop>', () => {
  const fetchMock = vi.fn();
  beforeEach(() => {
    fetchMock.mockReset();
    fetchMock.mockResolvedValue(new Response('{}', { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
  });
  afterEach(() => vi.unstubAllGlobals());

  it('one row per section, then the overheads, total and net', () => {
    mount();
    const totals = screen.getByRole('region', { name: 'Budget totals' });
    for (const label of ['Salaries', 'Hotels', 'Commissions', 'Accountancy', 'Insurance', 'Contingency', 'Total expenses', 'Income', 'Net']) {
      expect(within(totals).getByText(label)).toBeTruthy();
    }
  });

  it('the merch commission shows its own row with its amount', () => {
    mount();
    const row = screen.getByTestId('sheet-commission-row');
    expect(within(row).getByText('£200.00')).toBeTruthy(); // 20% of £1,000 merch
  });

  it('typing an overhead % recalculates and saves it as a fraction', async () => {
    mount();
    const before = screen.getByTestId('sheet-total-expenses').textContent;
    const box = screen.getByLabelText('Insurance percentage');
    fireEvent.change(box, { target: { value: '10' } });
    fireEvent.blur(box);
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('/api/budget/settings');
    expect(JSON.parse((init as RequestInit).body as string)).toEqual({ tour_id: 't', insurance_pct: 0.1 });
    expect(screen.getByTestId('sheet-total-expenses').textContent).not.toBe(before);
  });

  it('a refused save puts the old value back', async () => {
    fetchMock.mockResolvedValue(new Response('{}', { status: 500 }));
    mount();
    const box = screen.getByLabelText('Insurance percentage') as HTMLInputElement;
    fireEvent.change(box, { target: { value: '10' } });
    fireEvent.blur(box);
    await waitFor(() => expect((screen.getByLabelText('Insurance percentage') as HTMLInputElement).value).toBe('0'));
  });

  it('changing a commission % saves through the commissions route', async () => {
    mount();
    const box = screen.getByLabelText('Merch percentage');
    fireEvent.change(box, { target: { value: '15' } });
    fireEvent.blur(box);
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('/api/budget/commissions');
    expect((init as RequestInit).method).toBe('PATCH');
    expect(JSON.parse((init as RequestInit).body as string)).toEqual({ id: 'c1', percentage: 0.15 });
    expect(within(screen.getByTestId('sheet-commission-row')).getByText('£150.00')).toBeTruthy();
  });
});
