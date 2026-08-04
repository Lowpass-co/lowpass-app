/* ============================================
   LOWPASS — R2-6: the symbol and the number must agree

   SHIPPED BUG. Switching CS USA HEADLINE from USD to GBP on production
   re-rendered every figure with a new symbol and the SAME number:

     Items subtotal   $17,189.10  →  £17,189.10
     Total            $10,313.46  →  £10,313.46
     Waves LV1 rate      $270.00  →     £270.00

   A UK client would have been quoted £270/day for a $270/day item.

   The conversion arithmetic was never wrong — it just never ran. conv() is the
   identity function when the rate is null, while the currency label changed
   regardless, so the two halves of a price were sourced independently. These
   tests pin the join: the label is DERIVED from whether a rate exists, which
   makes the mixed pair unrepresentable rather than merely unlikely.

   The money assertions below multiply through deliberately. Asserting only
   `dispCur` would pass against a build that labels correctly and still prints
   the wrong figure.
   ============================================ */

import { describe, it, expect } from 'vitest';
import { resolveQuoteDisplay, fmtMoney } from './types';

/** What the screen and the PDF both do: convert, then label. */
const render = (usd: number, cur: string, fxRate: number | null) => {
  const { dispCur } = resolveQuoteDisplay(cur, fxRate);
  return fmtMoney(fxRate == null ? usd : usd * fxRate, dispCur);
};

describe('R2-6 — a foreign symbol never appears over an unconverted number', () => {
  it('THE REGRESSION: GBP with no rate shows dollars, not £ over dollar figures', () => {
    /* This is the exact production capture. Before the fix these returned
       "£17,189.10" / "£270.00" — right symbol, untouched number. */
    expect(render(17189.1, 'GBP', null)).toBe(fmtMoney(17189.1, 'USD'));
    expect(render(270, 'GBP', null)).toBe(fmtMoney(270, 'USD'));
    expect(render(17189.1, 'GBP', null)).not.toContain('£');
  });

  it('with a rate, BOTH the symbol and the number move', () => {
    const out = render(270, 'GBP', 0.74407);
    expect(out).toContain('£');
    /* 270 × 0.74407 = 200.90. The old build printed £270.00 here. */
    expect(out).toBe(fmtMoney(200.8989, 'GBP'));
    expect(out).not.toBe(fmtMoney(270, 'GBP'));
  });

  it('USD needs no rate and is always converted', () => {
    expect(resolveQuoteDisplay('USD', null)).toEqual({ dispCur: 'USD', converted: true });
    expect(render(270, 'USD', null)).toBe(fmtMoney(270, 'USD'));
  });

  it('`converted` is the flag the warning renders from', () => {
    /* The old UI keyed its warning off rateMissing, which only the FETCH set —
       so a non-draft job that never froze a rate skipped the fetch, left
       rateMissing false, fell through to a `: null` branch and warned about
       NOTHING. That silent state is what made this ship. */
    expect(resolveQuoteDisplay('GBP', null).converted).toBe(false);
    expect(resolveQuoteDisplay('GBP', 0.74).converted).toBe(true);
  });

  it('a zero rate is a rate, not a missing one', () => {
    /* Guards against "fxRate ? x : y" creeping back in — 0 is falsy and would
       silently reclassify a real (if absurd) rate as absent. */
    expect(resolveQuoteDisplay('GBP', 0).dispCur).toBe('GBP');
  });

  it('every quote currency behaves the same — no per-currency special cases', () => {
    for (const c of ['GBP', 'EUR', 'CAD', 'AUD', 'JPY', 'SEK', 'CHF']) {
      expect(resolveQuoteDisplay(c, null)).toEqual({ dispCur: 'USD', converted: false });
      expect(resolveQuoteDisplay(c, 1.23)).toEqual({ dispCur: c, converted: true });
    }
  });
});
