/* ============================================
   LOWPASS — FX vendor response parsing

   THIS is where the bug lived, and it was invisible because both vendor legs
   fail by returning null rather than throwing. An integration whose failure
   mode is a silent null degrades without a single error anywhere — no 500, no
   log line, no exception. The only defence is a POSITIVE assertion: something
   must claim a NUMBER comes out for a known pair. A status-only check would
   have passed this route throughout, because the 200 was never the problem.

   Two shapes are accepted on purpose:
     · `rates`            — api.exchangerate.host (legacy, now key-gated) AND
                            the FREE open.er-api.com endpoint. This is the one
                            leg two failed to read.
     · `conversion_rates` — the PAID exchangerate-api v6 shape. Kept so a future
                            key upgrade does not silently break this again.

   Pure and exported so exchange-rate.test.tsx can drive it from captured
   fixtures of both real responses. A live-vendor test would be the more honest
   check but is not CI-safe; the parse is the deterministic half and is exactly
   what drifted. */

export function pickRate(data: unknown, to: string): number | null {
  if (!data || typeof data !== 'object') return null;
  const d = data as {
    rates?: Record<string, unknown>;
    conversion_rates?: Record<string, unknown>;
  };
  const candidate = d.rates?.[to] ?? d.conversion_rates?.[to];
  /* Number, and FINITE — a vendor returning null/"" would coerce to 0 through
     a laxer check and print a free quote. */
  return typeof candidate === 'number' && Number.isFinite(candidate) ? candidate : null;
}
