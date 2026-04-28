/** v1 static FX lookup (GBP pivot). Per UX14: hardcoded; admin overrides later. */

const RATES_VS_GBP: Record<string, number> = {
  GBP: 1,
  USD: 0.79,
  EUR: 0.85,
  CAD: 0.58,
  AUD: 0.52,
  JPY: 0.0051,
};

/** Convert `amount` denominated in `fromCurrency` into `toCurrency` using static table. */
export function convertToCurrency(amount: number, fromCurrency: string, toCurrency: string): number {
  const from = fromCurrency.trim().toUpperCase();
  const to = toCurrency.trim().toUpperCase();
  if (from === to) return amount;
  const gbp = amount * (RATES_VS_GBP[from] ?? RATES_VS_GBP.USD);
  if (to === 'GBP') return Math.round(gbp * 100) / 100;
  const out = gbp / (RATES_VS_GBP[to] ?? 1);
  return Math.round(out * 100) / 100;
}
