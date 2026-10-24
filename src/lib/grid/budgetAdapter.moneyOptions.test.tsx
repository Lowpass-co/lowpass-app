/* Migration 274 — the slide-over's money options map to the right columns
   with the right types, and the adapter carries what the slide-over needs. */
import { describe, expect, it } from 'vitest';
import { gridEditToPatch, lineToRow } from './budgetAdapter';
import type { BudgetLineItem } from '@/types';

describe('money options → PATCH', () => {
  it('refundable: owed back / returned / forfeited, anything else = an ordinary cost', () => {
    expect(gridEditToPatch('refundable', 'pending')).toEqual({ refundable_status: 'pending' });
    expect(gridEditToPatch('refundable', 'Forfeited')).toEqual({ refundable_status: 'forfeited' });
    expect(gridEditToPatch('refundable', '')).toEqual({ refundable_status: null });
  });
  it('paid rate: a positive number, blank / 0 = back to the tour rate', () => {
    expect(gridEditToPatch('paidRate', '1.3508')).toEqual({ locked_fx_rate: 1.3508 });
    expect(gridEditToPatch('paidRate', '')).toEqual({ locked_fx_rate: null });
    expect(gridEditToPatch('paidRate', 0)).toEqual({ locked_fx_rate: null });
  });
  it('commissionable is a boolean and never sets an override', () => {
    expect(gridEditToPatch('commissionable', false)).toEqual({ income_commissionable: false });
  });
});

describe('lineToRow carries the options', () => {
  it('income, deposit and locked rate', () => {
    const r = lineToRow(
      { id: 'x', section: 'income', currency: 'GBP', locked_fx_rate: 1.34, refundable_status: null, income_commissionable: false } as unknown as BudgetLineItem,
      'usd',
    );
    expect(r).toMatchObject({ _tourCcy: 'USD', _income: true, _commissionable: false, _fxRate: 1.34, _refundable: null });
  });
});
