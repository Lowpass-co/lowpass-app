import { describe, expect, it } from 'vitest';
import { editText, formatAmount, isBlankValue, parseAmount } from './amountText';

describe('amount boxes — what they read', () => {
  it('reads plain, formatted and pasted numbers', () => {
    expect(parseAmount('4500')).toBe(4500);
    expect(parseAmount('US$4,500')).toBe(4500);
    expect(parseAmount('£1 250.50')).toBe(1250.5);
    expect(parseAmount('37%')).toBe(37);
    expect(parseAmount('-200')).toBe(-200);
    expect(parseAmount('−200')).toBe(-200);
  });
  it('blank is null; junk is refused, not saved as 0', () => {
    expect(parseAmount('  ')).toBeNull();
    expect(parseAmount('abc')).toBe('invalid');
    expect(parseAmount('1.2.3')).toBe('invalid');
    expect(parseAmount('.')).toBe('invalid');
  });
});

describe('amount boxes — what they show', () => {
  it('money is currency, % is a percentage, counts are grouped', () => {
    expect(formatAmount(4500, 'money', 'USD')).toBe('US$4,500');
    expect(formatAmount(12.5, 'money', 'GBP')).toBe('£12.50');
    expect(formatAmount(37, 'pct', 'USD')).toBe('37%');
    expect(formatAmount(1250, 'count', 'USD')).toBe('1,250');
  });
  it('a 0 that means "not set" shows the dash (Adam: "percentage defaults to 0")', () => {
    expect(isBlankValue(0, true)).toBe(true);
    expect(isBlankValue(null, false)).toBe(true);
    expect(isBlankValue(0, false)).toBe(false);
    expect(editText(0, true)).toBe('');
    expect(editText(0, false)).toBe('0');
    expect(editText(37.5, true)).toBe('37.5');
  });
});
