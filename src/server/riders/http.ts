/* LOWPASS — Riders: one error shape for every rider route. */
import { NextResponse } from 'next/server';
import { RiderError } from './actions';

export function riderErrorResponse(e: unknown, where: string): NextResponse {
  if (e instanceof RiderError) {
    return NextResponse.json({ error: e.message, code: e.code ?? null, ...(e.data !== undefined ? { current: e.data } : {}) }, { status: e.status });
  }
  console.error(`[riders:${where}]`, e);
  return NextResponse.json({ error: 'Something went wrong — try again.' }, { status: 500 });
}
