import { NextResponse } from 'next/server';
import { ShareError } from './shareLinks';

/** ShareError → JSON with its status and a machine code; anything else → 500
 *  without leaking internals to a public caller. */
export function shareErrorResponse(e: unknown): NextResponse {
  if (e instanceof ShareError) return NextResponse.json({ error: e.message, code: e.code }, { status: e.status, headers: NO_STORE });
  console.error('[file-share]', e);
  return NextResponse.json({ error: 'Something went wrong.', code: 'error' }, { status: 500, headers: NO_STORE });
}

export const NO_STORE = { 'Cache-Control': 'no-store' };

export async function readJson(request: Request): Promise<Record<string, unknown>> {
  try {
    const b = (await request.json()) as unknown;
    return b && typeof b === 'object' && !Array.isArray(b) ? (b as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

export const str = (v: unknown): string | null => (typeof v === 'string' && v ? v : null);
