// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import type { IncomeRow } from '@/lib/budget/income';
import { blankWalk, buildShowList } from '@/lib/income/showMoney';
import { ShowNightCard } from './ShowNightCard';
import { ShowDealCard } from './ShowDealCard';
import { applySettlementPatch } from '@/lib/income/showMoney';

/* Adam's screenshot (Nov 2026): $2,500 guarantee, 30% withholding, the
   actual guarantee typed and nothing else → Actual read $2,500, "$750 over
   expected". */
function show() {
  const income = [{ routing_id: 'r1', pre_tax_guarantee: 2500, withholding_pct: 30, pre_tax_overage: 0, merch_income: 0, vip_income: 0, currency: 'USD', deal_type: 'FLAT', face_value: null } as unknown as IncomeRow];
  const walk = applySettlementPatch(blankWalk({ routingId: 'r1', currency: 'USD', date: '2026-11-20', city: 'Austin', venue: 'Mohawk', dayType: 'show' }), { reconciled_guarantee: 2500 });
  return buildShowList(income, [walk], 'USD', '2026-11-27')[0];
}

describe('<ShowNightCard> — the night', () => {
  it('offers the withholding the deal takes off, and adds it in one click', () => {
    const onAddLine = vi.fn();
    render(<ShowNightCard show={show()} h={{ onSave: vi.fn(), onAddLine, onRemoveLine: vi.fn(), onSaveVip: vi.fn() }} />);
    fireEvent.click(screen.getByRole('button', { name: '+ Withholding US$750' }));
    expect(onAddLine).toHaveBeenCalledWith('deduction', { kind: 'withholding', label: '30%', amount: 750 });
  });

  it('boxes are text (no spinners) and read as money; blank is a dash', () => {
    render(<ShowNightCard show={show()} h={{ onSave: vi.fn(), onAddLine: vi.fn(), onRemoveLine: vi.fn(), onSaveVip: vi.fn() }} />);
    const g = screen.getByLabelText('Actual guarantee') as HTMLInputElement;
    expect(g.type).toBe('text');
    expect(g.value).toBe('US$2,500');
    const o = screen.getByLabelText('Actual overage') as HTMLInputElement;
    expect(o.value).toBe('');
    expect(o.placeholder).toBe('—');
    expect(document.querySelectorAll('input[type="number"]')).toHaveLength(0);
  });

  it('typing "$3,100" saves 3100; junk saves nothing', () => {
    const onSave = vi.fn();
    render(<ShowNightCard show={show()} h={{ onSave, onAddLine: vi.fn(), onRemoveLine: vi.fn(), onSaveVip: vi.fn() }} />);
    const g = screen.getByLabelText('Actual guarantee') as HTMLInputElement;
    fireEvent.focus(g);
    expect(g.value).toBe('2500');
    fireEvent.change(g, { target: { value: '$3,100' } });
    fireEvent.blur(g);
    expect(onSave).toHaveBeenCalledWith({ reconciled_guarantee: 3100 });
    fireEvent.focus(g);
    fireEvent.change(g, { target: { value: 'lots' } });
    fireEvent.blur(g);
    expect(onSave).toHaveBeenCalledTimes(1);
    expect(g.getAttribute('aria-invalid')).toBe('true');
  });
});

describe('<ShowDealCard> — the deal', () => {
  it('% reads as a %, money as money, an unset % is a dash', () => {
    const s = show();
    render(
      <ShowDealCard row={{ ...s.income!, deal_type: 'PLUS', deal_pct: 0 } as IncomeRow} expected={s.expected} currency="USD" tourCurrency="USD" currencyOptions={['USD']} versionLocked={false} onLockedEdit={vi.fn()} onSave={vi.fn()} />,
    );
    expect((screen.getByLabelText('Withholding') as HTMLInputElement).value).toBe('30%');
    expect((screen.getByLabelText('Guarantee') as HTMLInputElement).value).toBe('US$2,500');
    expect((screen.getByLabelText('Deal %') as HTMLInputElement).value).toBe('');
    expect((screen.getByLabelText('Ticket price') as HTMLInputElement).placeholder).toBe('—');
  });

  it('a dropdown change goes straight to the page (no wait for the server)', () => {
    const onSave = vi.fn();
    const s = show();
    render(<ShowDealCard row={s.income} expected={s.expected} currency="USD" tourCurrency="USD" currencyOptions={['USD']} versionLocked={false} onLockedEdit={vi.fn()} onSave={onSave} />);
    fireEvent.change(screen.getByLabelText('Deal'), { target: { value: 'VS' } });
    expect(onSave).toHaveBeenCalledWith({ deal_type: 'VS' });
  });
});
