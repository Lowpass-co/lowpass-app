/** ISO 3166-1 alpha-2 → ISO 4217 (common touring countries). Incomplete by design — extend as needed. */
const MAP: Record<string, string> = {
  GB: 'GBP',
  UK: 'GBP',
  US: 'USD',
  CA: 'CAD',
  AU: 'AUD',
  NZ: 'NZD',
  FR: 'EUR',
  DE: 'EUR',
  ES: 'EUR',
  IT: 'EUR',
  NL: 'EUR',
  BE: 'EUR',
  AT: 'EUR',
  PT: 'EUR',
  IE: 'EUR',
  SE: 'SEK',
  NO: 'NOK',
  DK: 'DKK',
  CH: 'CHF',
  JP: 'JPY',
  MX: 'MXN',
};

export function countryToCurrency(alpha2: string | null | undefined): string | null {
  if (!alpha2) return null;
  const k = alpha2.trim().toUpperCase();
  return MAP[k] ?? null;
}
