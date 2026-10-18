/* The currencies the budget's "Show in" switcher offers. Shared by the switcher
   and the budget page, which keeps a live rate for each (Oct 2026) so switching
   never falls back to 1:1. */
export const DISPLAY_CURRENCIES: ReadonlyArray<{ code: string; label: string }> = [
  { code: 'GBP', label: '£ GBP' },
  { code: 'USD', label: '$ USD' },
  { code: 'EUR', label: '€ EUR' },
  { code: 'CAD', label: 'C$ CAD' },
  { code: 'AUD', label: 'A$ AUD' },
];
