/* ============================================
   LOWPASS — the budget sheet's top block (Oct 2026; folded rows Nov 2026)

   Pins: section totals and the P&L lines render; typing an overhead % or a
   commission % recalculates on the spot AND saves to the same rows Tour
   settings writes; a refused save rolls back.
   ============================================ */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { BudgetSheetTop, money } from './BudgetSheetTop';
import type { BudgetLineItem, BudgetSection } from '@/types';

vi.mock('@/components/ui/Toast', () => ({ useToast: () => ({ showToast: vi.fn() }) }));
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn() }) }));

const sections = [{ id: 's1', name: 'Salaries', sort_order: 1 }, { id: 's2', name: 'Hotels', sort_order: 2 }] as unknown as BudgetSection[];
const lines = [
  { id: 'a', section_id: 's1', proposed_cost: 1000, actual_cost: 500, currency: null, section: null },
  { id: 'b', section_id: 's2', proposed_cost: 1000, actual_cost: 0, currency: null, section: null },
] as unknown as BudgetLineItem[];
const income = [{ pre_tax_guarantee: 5000, withholding_pct: 0, merch_income: 1000 }];

/** The editors live behind folded rows (Nov 2026 redraw). */
function open(...folds: Array<'commissions' | 'overheads' | 'income'>) {
  for (const f of folds) fireEvent.click(within(screen.getByTestId(`sheet-fold-${f}`)).getAllByRole('button')[0]);
}

function mount(extra: Partial<Parameters<typeof BudgetSheetTop>[0]> = {}, folds: Array<'commissions' | 'overheads' | 'income'> = ['commissions', 'overheads', 'income']) {
  const r = render(
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
  open(...folds);
  return r;
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
    for (const label of ['Salaries', 'Hotels', 'Commissions', 'Accountancy', 'Insurance', 'Contingency', 'Total expenses', 'Net']) {
      expect(within(totals).getByText(label)).toBeTruthy();
    }
    // Income is the headline figure AND the folded breakdown row.
    expect(within(totals).getAllByText('Income').length).toBe(2);
  });

  it('commissions, overheads and income start folded — one row each', () => {
    mount({}, []);
    for (const f of ['commissions', 'overheads', 'income']) {
      const row = within(screen.getByTestId(`sheet-fold-${f}`)).getAllByRole('button')[0];
      expect(row.getAttribute('aria-expanded')).toBe('false');
    }
    expect(screen.queryByTestId('sheet-commission-row')).toBeNull();
    expect(screen.queryByLabelText('Insurance percentage')).toBeNull();
    // The folded row still says what is inside.
    expect(within(screen.getByTestId('sheet-fold-commissions')).getByText('Merch 20%')).toBeTruthy();
    expect(within(screen.getByTestId('sheet-fold-overheads')).getByText('Contingency 2%')).toBeTruthy();
  });

  it('income, expenses and net each show once', () => {
    mount();
    expect(screen.getAllByTestId('sheet-total-expenses').length).toBe(1);
    expect(screen.getAllByTestId('sheet-net').length).toBe(1);
  });

  it('a section row shows proposed, spent and a spend bar', () => {
    mount({}, []);
    const salaries = screen.getByTestId('sheet-section-s1');
    expect(salaries.textContent).toContain('Salaries£500.00 spent of £1,000.00');
    expect((salaries.querySelector('.bs-bar-fill') as HTMLElement).style.width).toBe('50%');
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

  /* ---- migration 274 options ---- */

  it('a commission ticks the parts it is a % of', async () => {
    mount();
    fireEvent.click(screen.getByRole('button', { name: /Merch is a percentage of/ }));
    const editor = screen.getByTestId('sheet-commission-base');
    fireEvent.click(within(editor).getByLabelText('Show'));
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('/api/budget/commissions');
    expect(JSON.parse((init as RequestInit).body as string)).toEqual({ id: 'c1', basis_components: ['show'] });
    // 20% of show income (£5,000, no withholding) — recalculated in place.
    expect(within(screen.getByTestId('sheet-commission-row')).getByText('£1,000.00')).toBeTruthy();
    // ticked parts disable the single base
    expect((within(editor).getByLabelText('Merch single base') as HTMLSelectElement).disabled).toBe(true);
  });

  it('an overhead switches to a fixed amount and saves it', async () => {
    mount();
    fireEvent.click(screen.getByRole('button', { name: 'Insurance: use a fixed amount' }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    expect(JSON.parse((fetchMock.mock.calls[0][1] as RequestInit).body as string)).toEqual({ tour_id: 't', insurance_mode: 'flat' });
    const box = screen.getByLabelText('Insurance fixed amount');
    fireEvent.change(box, { target: { value: '1500' } });
    fireEvent.blur(box);
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    expect(JSON.parse((fetchMock.mock.calls[1][1] as RequestInit).body as string)).toEqual({ tour_id: 't', insurance_flat_amount: 1500 });
    expect(within(screen.getByTestId('sheet-overhead-insurance')).getByText('fixed')).toBeTruthy();
  });

  it('typing an overhead actual saves the real invoice; clearing it sends null', async () => {
    mount();
    const box = screen.getByLabelText('Insurance actual');
    fireEvent.change(box, { target: { value: '808.81' } });
    fireEvent.blur(box);
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    expect(JSON.parse((fetchMock.mock.calls[0][1] as RequestInit).body as string)).toEqual({ tour_id: 't', insurance_actual_amount: 808.81 });
    fireEvent.change(box, { target: { value: '' } });
    fireEvent.blur(box);
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    expect(JSON.parse((fetchMock.mock.calls[1][1] as RequestInit).body as string)).toEqual({ tour_id: 't', insurance_actual_amount: null });
  });

  it('income is broken down, and a deposit owed back sits outside costs', () => {
    const withDeposit = [
      ...lines,
      { id: 'd', section_id: 's2', proposed_cost: 3500, actual_cost: 3500, currency: null, section: null, refundable_status: 'pending' },
    ] as unknown as BudgetLineItem[];
    mount({ lines: withDeposit });
    expect(within(screen.getByTestId('sheet-income-show')).getByText('£5,000.00')).toBeTruthy();
    expect(within(screen.getByTestId('sheet-income-merch')).getByText('£1,000.00')).toBeTruthy();
    const owed = screen.getByTestId('sheet-deposits-owed');
    expect(within(owed).getByText('£3,500.00')).toBeTruthy();
    expect(within(owed).getByText('£3,500.00 so far')).toBeTruthy();
    // Hotels stays £1,000 proposed — the deposit is not a cost.
    const hotels = screen.getByTestId('sheet-section-s2');
    expect(hotels.textContent).toContain('of £1,000.00');
  });

  /* Nov 2026 (Adam): "it added an 'other income' line to the summary but
     isn't editable" — Other income is now typed right here. */
  it('Add income makes the section (first time) and a line, ready to name', async () => {
    fetchMock
      .mockResolvedValueOnce(new Response('{"id":"s9"}', { status: 200 }))
      .mockResolvedValueOnce(new Response('{"id":"i9","label":"New income","proposed_cost":0,"actual_cost":0,"currency":"GBP","section_id":"s9"}', { status: 200 }));
    mount();
    expect(screen.queryByTestId('sheet-income-other')).toBeNull(); // nothing yet
    fireEvent.click(screen.getByRole('button', { name: /Add income/ }));
    await waitFor(() => expect(screen.getAllByTestId('sheet-other-income-line').length).toBe(1));
    const [u1, i1] = fetchMock.mock.calls[0];
    expect(u1).toBe('/api/budget/sections');
    expect(JSON.parse((i1 as RequestInit).body as string)).toEqual({ tour_id: 't', name: 'Other income', kind: 'income' });
    const [u2, i2] = fetchMock.mock.calls[1];
    expect(u2).toBe('/api/budget/line-items');
    expect(JSON.parse((i2 as RequestInit).body as string)).toMatchObject({ section_id: 's9', section: 'income', label: 'New income' });
    expect(document.activeElement).toBe(screen.getByLabelText('Income name'));
    expect(screen.getByTestId('sheet-income-other')).toBeTruthy();
  });

  it('an existing Other income section is reused, not made again', async () => {
    fetchMock.mockResolvedValueOnce(new Response('{"id":"i9","label":"New income","proposed_cost":0,"actual_cost":0}', { status: 200 }));
    mount({ sections: [...sections, { id: 's9', name: 'Other income', kind: 'income', sort_order: 9 } as unknown as BudgetSection] });
    fireEvent.click(screen.getByRole('button', { name: /Add income/ }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    expect(fetchMock.mock.calls[0][0]).toBe('/api/budget/line-items');
  });

  const buyOn = { id: 'i1', section_id: 's9', section: 'income', label: 'Support buy-on', proposed_cost: 2000, actual_cost: 0, currency: null } as unknown as BudgetLineItem;

  it('typing an amount saves it and moves Income at once', async () => {
    mount({ lines: [...lines, buyOn] });
    expect(screen.getByTestId('sheet-headline-income').textContent).toContain('£8,000.00'); // 5,000 + 1,000 + 2,000
    const box = screen.getByLabelText('Support buy-on proposed');
    fireEvent.change(box, { target: { value: '3000' } });
    fireEvent.blur(box);
    expect(screen.getByTestId('sheet-headline-income').textContent).toContain('£9,000.00');
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('/api/budget/line-items');
    expect((init as RequestInit).method).toBe('PATCH');
    expect(JSON.parse((init as RequestInit).body as string)).toEqual({ id: 'i1', proposed_cost: 3000 });
  });

  it('a typed actual is kept as typed (override), and the name saves', async () => {
    mount({ lines: [...lines, buyOn] });
    const act = screen.getByLabelText('Support buy-on actual');
    fireEvent.change(act, { target: { value: '1500' } });
    fireEvent.blur(act);
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    expect(JSON.parse((fetchMock.mock.calls[0][1] as RequestInit).body as string)).toEqual({ id: 'i1', actual_cost: 1500, actual_cost_override: true });
    const name = screen.getByLabelText('Income name');
    fireEvent.change(name, { target: { value: 'Sponsor' } });
    fireEvent.blur(name);
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    expect(JSON.parse((fetchMock.mock.calls[1][1] as RequestInit).body as string)).toEqual({ id: 'i1', label: 'Sponsor' });
  });

  it('remove asks first, then deletes; a failed save puts the figure back', async () => {
    mount({ lines: [...lines, buyOn] });
    fireEvent.click(screen.getByRole('button', { name: 'Remove Support buy-on' }));
    expect(fetchMock).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Remove' }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    expect(fetchMock.mock.calls[0][0]).toBe('/api/budget/line-items?ids=i1');
    expect(screen.queryAllByTestId('sheet-other-income-line').length).toBe(0);
  });

  it('a refused save restores the old amount', async () => {
    fetchMock.mockResolvedValue(new Response('{"error":"This budget is approved & locked."}', { status: 423 }));
    mount({ lines: [...lines, buyOn] });
    const box = screen.getByLabelText('Support buy-on proposed');
    fireEvent.change(box, { target: { value: '3000' } });
    fireEvent.blur(box);
    await waitFor(() => expect(screen.getByTestId('sheet-headline-income').textContent).toContain('£8,000.00'));
  });
});
