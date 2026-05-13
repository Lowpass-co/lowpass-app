/* ============================================
   LOWPASS — In-memory rate limiter (Sprint 12 §SAFE)

   Pattern is the same one Sprint 12 §9d.b's advance-summary/
   generate route inlines: a Map<key, last-call-timestamp>
   on the function module that gates calls inside a sliding
   window. Cold starts reset it; that's acceptable for a
   "don't burn the AI key" guard, not a security boundary.

   This module just lifts the helper out so every AI endpoint
   uses the same shape. Use one Map per endpoint with a route-
   appropriate key — e.g. user_id for OCR (per-user), tour_id
   for budget template (per-tour), or a composite for the
   per-user + per-line-item suggest dedupe.

   Two-call shape:
     1. checkRateLimit(map, key, windowMs) — returns a 429
        NextResponse on hit, or null to proceed.
     2. markRateLimit(map, key) — stamps the timestamp on
        successful completion. Stamp on success only so a 5xx
        from the AI doesn't lock the operator out.
   ============================================ */

import { NextResponse } from 'next/server';

export function checkRateLimit(
  map: Map<string, number>,
  key: string,
  windowMs: number,
): NextResponse | null {
  const last = map.get(key);
  if (last == null) return null;
  const elapsed = Date.now() - last;
  if (elapsed >= windowMs) return null;
  const waitSeconds = Math.ceil((windowMs - elapsed) / 1000);
  return NextResponse.json(
    { error: `Slow down — try again in ${waitSeconds}s.`, retry_after_seconds: waitSeconds },
    { status: 429 },
  );
}

export function markRateLimit(map: Map<string, number>, key: string): void {
  map.set(key, Date.now());
}

/** Cached-response wrapper for routes that should return the
 *  most recent result (instead of 429) when called inside the
 *  window. Used by /budget/ai/suggest (auto-fires) +
 *  /budget/ai/alerts (button-driven but server-belt-and-
 *  braces). */
export function getCached<T>(
  map: Map<string, { at: number; value: T }>,
  key: string,
  windowMs: number,
): T | null {
  const entry = map.get(key);
  if (!entry) return null;
  if (Date.now() - entry.at >= windowMs) return null;
  return entry.value;
}

export function setCached<T>(
  map: Map<string, { at: number; value: T }>,
  key: string,
  value: T,
): void {
  map.set(key, { at: Date.now(), value });
}
