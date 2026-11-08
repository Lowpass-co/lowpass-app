import { NextResponse } from 'next/server';
import { UploadError } from './grants';

export const NO_STORE = { 'Cache-Control': 'no-store' };

/** UploadError → its status + code; anything else → 500 without internals. */
export function uploadErrorResponse(e: unknown): NextResponse {
  if (e instanceof UploadError) return NextResponse.json({ error: e.message, code: e.code }, { status: e.status, headers: NO_STORE });
  console.error('[upload]', e);
  return NextResponse.json({ error: 'Something went wrong.', code: 'error' }, { status: 500, headers: NO_STORE });
}
