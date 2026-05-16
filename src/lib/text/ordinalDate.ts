/* ============================================
   LOWPASS — ordinalDate (Sprint 12 §9b)

   Formats a date as "23rd Mar '26" per Adam's §9 spec for the
   "Rider Updated" timestamp on the cover page. Day-of-month
   ordinal + short month + 2-digit year apostrophe-prefixed.

   en-GB locale for British conventions (day-month-year). All
   formatting via Intl.DateTimeFormat which ships in every
   supported Node + browser version — no polyfill needed.
   ============================================ */

const ORDINAL_RULES = new Intl.PluralRules('en-GB', { type: 'ordinal' });

const ORDINAL_SUFFIX: Record<Intl.LDMLPluralRule, string> = {
  one: 'st',
  two: 'nd',
  few: 'rd',
  other: 'th',
  zero: 'th',
  many: 'th',
};

const MONTH_FMT = new Intl.DateTimeFormat('en-GB', { month: 'short' });

/** "23rd Mar '26" */
export function formatOrdinalDate(input: Date | string | null | undefined): string {
  if (!input) return '';
  const d = typeof input === 'string' ? new Date(input) : input;
  if (Number.isNaN(d.getTime())) return '';
  const day = d.getDate();
  const suffix = ORDINAL_SUFFIX[ORDINAL_RULES.select(day) as Intl.LDMLPluralRule];
  const month = MONTH_FMT.format(d);
  const year = d.getFullYear().toString().slice(-2);
  return `${day}${suffix} ${month} '${year}`;
}
