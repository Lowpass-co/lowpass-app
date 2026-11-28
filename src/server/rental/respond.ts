import { NextResponse } from 'next/server';
import { RentalError } from './jobs';

/** A rental route's error → JSON with the right status. */
export function rentalError(e: unknown) {
  if (e instanceof RentalError) return NextResponse.json({ error: e.message }, { status: e.status });
  return NextResponse.json({ error: e instanceof Error ? e.message : 'Something went wrong' }, { status: 500 });
}

export async function readBody(request: Request): Promise<Record<string, unknown>> {
  const j = await request.json().catch(() => null);
  return j && typeof j === 'object' && !Array.isArray(j) ? (j as Record<string, unknown>) : {};
}
