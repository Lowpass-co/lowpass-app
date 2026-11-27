/* ============================================
   /api/tours/[id]/riders/blocks — rider blocks, one at a time (Nov 2026)

   POST   { riderId, blocks: [{ id?, kind, content, position, from?, until? }] }
   PATCH  { id, ifVersion, kind?, content?, position?, from?, until? }
          → the block as saved (version + 1), or 409 { code: 'STALE', current }
            when someone saved it in between — the editor asks whose wins.
   DELETE { ids: uuid[] }
   Production EDIT on this tour. Content always passes parseContent.
   ============================================ */

import { NextResponse } from 'next/server';
import type { SupabaseClient } from '@supabase/supabase-js';
import { createServerSupabaseClient } from '@/lib/supabase-server';
import { requireWrite } from '@/lib/auth/workspace-check';
import { readJson, tourGate } from '@/server/advance/routeGuard';
import { deleteBlocks, insertBlocks, updateBlock } from '@/server/riders/actions';
import { riderErrorResponse } from '@/server/riders/http';

export const dynamic = 'force-dynamic';

type Params = { params: Promise<{ id: string }> };

async function guard(tourId: string) {
  const supabase = await createServerSupabaseClient();
  const auth = await requireWrite(supabase, { area: 'production', tourId });
  if ('error' in auth) return { error: auth.error };
  const gate = await tourGate(supabase, tourId, auth.workspaceId);
  if (gate) return { error: gate };
  return { client: supabase as unknown as SupabaseClient, userId: auth.user.id };
}

export async function POST(request: Request, { params }: Params) {
  const { id: tourId } = await params;
  const g = await guard(tourId);
  if ('error' in g) return g.error;
  const body = await readJson<{ riderId?: unknown; blocks?: unknown }>(request);
  try {
    return NextResponse.json({ blocks: await insertBlocks(g.client, tourId, body?.riderId, (body?.blocks ?? []) as never[], g.userId) });
  } catch (e) {
    return riderErrorResponse(e, 'insert');
  }
}

export async function PATCH(request: Request, { params }: Params) {
  const { id: tourId } = await params;
  const g = await guard(tourId);
  if ('error' in g) return g.error;
  const body = (await readJson<Record<string, unknown>>(request)) ?? {};
  try {
    return NextResponse.json({ block: await updateBlock(g.client, tourId, body, g.userId) });
  } catch (e) {
    return riderErrorResponse(e, 'update');
  }
}

export async function DELETE(request: Request, { params }: Params) {
  const { id: tourId } = await params;
  const g = await guard(tourId);
  if ('error' in g) return g.error;
  const body = await readJson<{ ids?: unknown }>(request);
  try {
    return NextResponse.json({ deleted: await deleteBlocks(g.client, tourId, (body?.ids ?? []) as unknown[]) });
  } catch (e) {
    return riderErrorResponse(e, 'delete');
  }
}
