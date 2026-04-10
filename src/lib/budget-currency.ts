/** Tour budget currency options (ISO 4217) — used in budget toolbar. */
export const BUDGET_CURRENCY_OPTIONS: { code: string; label: string }[] = [
  { code: 'GBP', label: 'GBP — British pound' },
  { code: 'USD', label: 'USD — US dollar' },
  { code: 'EUR', label: 'EUR — Euro' },
  { code: 'CAD', label: 'CAD — Canadian dollar' },
  { code: 'AUD', label: 'AUD — Australian dollar' },
  { code: 'NZD', label: 'NZD — New Zealand dollar' },
  { code: 'JPY', label: 'JPY — Japanese yen' },
  { code: 'CHF', label: 'CHF — Swiss franc' },
  { code: 'SEK', label: 'SEK — Swedish krona' },
  { code: 'NOK', label: 'NOK — Norwegian krone' },
  { code: 'DKK', label: 'DKK — Danish krone' },
  { code: 'MXN', label: 'MXN — Mexican peso' },
];

export function budgetCurrencySymbol(code: string): string {
  const c = code?.trim().toUpperCase() || 'GBP';
  try {
    const parts = new Intl.NumberFormat('en-GB', {
      style: 'currency',
      currency: c,
      currencyDisplay: 'narrowSymbol',
    }).formatToParts(0);
    return parts.find((p) => p.type === 'currency')?.value ?? c;
  } catch {
    return c;
  }
}
