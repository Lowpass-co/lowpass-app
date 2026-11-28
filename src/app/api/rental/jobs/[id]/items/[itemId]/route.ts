/* PATCH / DELETE /api/rental/jobs/[id]/items/[itemId] — a line's quantity or
   day rate; remove a line. */
import { NextResponse } from 'next/server';
import { requireWrite } from '@/lib/auth/workspace-check';
import { createServerSupabaseClient } from '@/lib/supabase-server';
import { deleteLine, updateLine } from '@/server/rental/jobs';
import { readBody, rentalError } from '@/server/rental/respond';

export const dynamic = 'force-dynamic';

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string; itemId: string }> }) {
  const { id, itemId } = await params;
  const supabase = await createServerSupabaseClient();
  const auth = await requireWrite(supabase);
  if ('error' in auth) return auth.error;
  try {
    return NextResponse.json({ item: await updateLine(supabase, { workspaceId: auth.workspaceId, jobId: id, lineId: itemId, body: await readBody(request) }) });
  } catch (e) {
    return rentalError(e);
  }
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string; itemId: string }> }) {
  const { id, itemId } = await params;
  const supabase = await createServerSupabaseClient();
  const auth = await requireWrite(supabase);
  if ('error' in auth) return auth.error;
  try {
    await deleteLine(supabase, { workspaceId: auth.workspaceId, jobId: id, lineId: itemId });
    return NextResponse.json({ ok: true });
  } catch (e) {
    return rentalError(e);
  }
}
