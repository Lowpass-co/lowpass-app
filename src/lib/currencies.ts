/* ============================================
   LOWPASS — Tour currency list (Sprint 5 §6)

   Single source of truth for the currency dropdown. Used by the
   full-page TourWizard and the in-context TourCreateSlideOver
   (and any future tour-currency surface).

   The DB column `tours.currency` is a free TEXT field (NOT NULL,
   DEFAULT 'GBP'). We constrain the UI to a sensible set; if a
   future workflow needs more, add to this list rather than
   forking it.
   ============================================ */

export interface CurrencyOption {
  /** ISO 4217 code, uppercase. Stored verbatim in tours.currency. */
  value: string;
  /** Display label — currency symbol + code. */
  label: string;
}

export const TOUR_CURRENCIES: ReadonlyArray<CurrencyOption> = [
  { value: 'GBP', label: '£ GBP' },
  { value: 'USD', label: '$ USD' },
  { value: 'EUR', label: '€ EUR' },
  { value: 'AUD', label: 'A$ AUD' },
] as const;

export const DEFAULT_TOUR_CURRENCY = 'GBP';
