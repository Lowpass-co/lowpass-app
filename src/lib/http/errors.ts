/* ============================================================
   LOWPASS — Sanitized API error responses (Security audit §L1)

   Many routes return the raw Postgres/Supabase error.message to the
   client (`NextResponse.json({ error: error.message }, { status: 500 })`),
   which leaks schema names, constraint names, and internal detail useful
   for recon. Use jsonError() instead: it logs the real error server-side
   and returns a generic, safe message to the caller.

   For deliberate, non-sensitive 4xx validation messages (e.g. "tour_id
   required"), keep returning those directly — they're meant for the user.
   jsonError is for the 5xx / DB-failure path where the underlying message
   should never reach the client.
   ============================================================ */

import { NextResponse } from 'next/server';

/**
 * Log the real error and return a generic JSON error to the client.
 *
 *   const { error } = await supabase.from('x').insert(...);
 *   if (error) return jsonError('flights.create', error);
 */
export function jsonError(
  context: string,
  err: unknown,
  status = 500,
  clientMessage = 'Something went wrong. Please try again.',
): NextResponse {
  const detail = err instanceof Error ? err.message : String(err);
  console.error(`[api-error] ${context}:`, detail);
  return NextResponse.json({ error: clientMessage }, { status });
}
