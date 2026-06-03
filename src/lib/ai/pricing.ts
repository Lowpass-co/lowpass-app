/* ============================================================
   LOWPASS — Anthropic model pricing (CC_AI_USAGE_TRACKING §AI-2)

   Source of truth for converting Anthropic token usage into
   micro-USD cost. All rates verified against the official pricing
   page on 2026-06-03:

     https://platform.claude.com/docs/en/about-claude/pricing

   Rates are USD per MILLION tokens. Cost in micro-USD works out to a
   clean identity: 1 USD = 1_000_000 micro-USD, and cost_usd =
   tokens * rate_per_mtok / 1_000_000, so

       cost_micros = cost_usd * 1_000_000 = tokens * rate_per_mtok

   i.e. micro-USD == tokens * (USD-per-MTok). See computeCostMicros.

   NOTE (correction vs the §AI-2 spec draft): the spec's PRICING block
   listed Haiku at $0.80 / $4.00 — those are the RETIRED Haiku 3.5
   rates. Haiku 4.5 is $1.00 / $5.00. Locked from the live page above.

   Keyed by model-FAMILY prefix (no dated suffix) so a new dated
   release (e.g. claude-haiku-4-5-YYYYMMDD) resolves without a code
   change. resolvePricing() does longest-prefix matching.
   ============================================================ */

export interface ModelPriceCard {
  /** USD per million input tokens. */
  input: number;
  /** USD per million output tokens. */
  output: number;
  /** USD per million 5-minute cache-write tokens (1.25x input). */
  cacheWrite: number;
  /** USD per million cache-read / hit tokens (0.1x input). */
  cacheRead: number;
}

/**
 * USD-per-million-token rates, keyed by model-family prefix.
 * Longest matching prefix wins (see resolvePricing).
 */
export const PRICING: Record<string, ModelPriceCard> = {
  // Haiku 4.5 — the model all 6 currently-wrapped endpoints use.
  'claude-haiku-4-5': { input: 1.0, output: 5.0, cacheWrite: 1.25, cacheRead: 0.1 },
  // Sonnet 4.5 / 4.6 — the 7th endpoint (stage-plot icons) is expected
  // to use Sonnet; both 4.5 and 4.6 share rates.
  'claude-sonnet-4-6': { input: 3.0, output: 15.0, cacheWrite: 3.75, cacheRead: 0.3 },
  'claude-sonnet-4-5': { input: 3.0, output: 15.0, cacheWrite: 3.75, cacheRead: 0.3 },
  // Opus 4.5+ — priced in for completeness; not used by any endpoint yet.
  'claude-opus-4-8': { input: 5.0, output: 25.0, cacheWrite: 6.25, cacheRead: 0.5 },
  'claude-opus-4-7': { input: 5.0, output: 25.0, cacheWrite: 6.25, cacheRead: 0.5 },
  'claude-opus-4-6': { input: 5.0, output: 25.0, cacheWrite: 6.25, cacheRead: 0.5 },
  'claude-opus-4-5': { input: 5.0, output: 25.0, cacheWrite: 6.25, cacheRead: 0.5 },
};

/** Anthropic Messages `usage` shape — structural, to avoid coupling to
 *  the SDK's exported type name across versions. */
export interface AnthropicUsageLike {
  input_tokens?: number | null;
  output_tokens?: number | null;
  cache_read_input_tokens?: number | null;
  cache_creation_input_tokens?: number | null;
}

/**
 * Resolve a price card for a (possibly dated) model id by longest
 * prefix match against PRICING. Returns null if no family matches —
 * the caller records the event with cost 0 rather than throwing, so an
 * unpriced model never blocks an AI call or loses attribution.
 */
export function resolvePricing(model: string): ModelPriceCard | null {
  let best: { len: number; card: ModelPriceCard } | null = null;
  for (const prefix of Object.keys(PRICING)) {
    if (model.startsWith(prefix) && (!best || prefix.length > best.len)) {
      best = { len: prefix.length, card: PRICING[prefix] };
    }
  }
  return best?.card ?? null;
}

/**
 * Compute the micro-USD cost of one call from its token usage.
 * Returns { micros, priced } — priced=false means the model wasn't in
 * PRICING (micros will be 0); the caller should log it.
 */
export function computeCostMicros(
  model: string,
  usage: AnthropicUsageLike,
): { micros: number; priced: boolean } {
  const card = resolvePricing(model);
  if (!card) return { micros: 0, priced: false };

  const input = num(usage.input_tokens) * card.input;
  const output = num(usage.output_tokens) * card.output;
  const cacheRead = num(usage.cache_read_input_tokens) * card.cacheRead;
  const cacheWrite = num(usage.cache_creation_input_tokens) * card.cacheWrite;

  // tokens * (USD per MTok) == micro-USD (see header identity).
  return { micros: Math.round(input + output + cacheRead + cacheWrite), priced: true };
}

function num(v: number | null | undefined): number {
  return typeof v === 'number' && Number.isFinite(v) ? v : 0;
}
