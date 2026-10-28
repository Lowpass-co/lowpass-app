/* Shared helpers for the per-show advance write routes. Each route calls
   requireWrite itself (the route-guard ratchet checks for it), then
   tourGate() for tenancy. */

import { NextResponse } from 'next/server';
import { requireTourInWorkspace } from '@/lib/auth/workspace-check';
import { AdvanceNotFound } from './ensure';

export async function tourGate(
  supabase: Parameters<typeof requireTourInWorkspace>[0],
  tourId: string,
  workspaceId: string,
): Promise<NextResponse | null> {
  return (await requireTourInWorkspace(supabase, tourId, workspaceId)) as NextResponse | null;
}

export function advanceError(e: unknown): NextResponse {
  if (e instanceof AdvanceNotFound) return NextResponse.json({ error: e.message }, { status: 404 });
  const msg = e instanceof Error ? e.message : 'Something went wrong';
  return NextResponse.json({ error: msg }, { status: 500 });
}

export async function readJson<T>(request: Request): Promise<T | null> {
  try {
    return (await request.json()) as T;
  } catch {
    return null;
  }
}
