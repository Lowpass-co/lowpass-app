/* PATCH / DELETE /api/rental/jobs/[id] — change or delete a rental job. */
import { NextResponse } from 'next/server';
import { requireWrite } from '@/lib/auth/workspace-check';
import { createServerSupabaseClient } from '@/lib/supabase-server';
import { deleteJob, updateJob } from '@/server/rental/jobs';
import { readBody, rentalError } from '@/server/rental/respond';

export const dynamic = 'force-dynamic';

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createServerSupabaseClient();
  const auth = await requireWrite(supabase);
  if ('error' in auth) return auth.error;
  try {
    return NextResponse.json({ job: await updateJob(supabase, { workspaceId: auth.workspaceId, jobId: id, body: await readBody(request) }) });
  } catch (e) {
    return rentalError(e);
  }
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createServerSupabaseClient();
  const auth = await requireWrite(supabase);
  if ('error' in auth) return auth.error;
  try {
    await deleteJob(supabase, { workspaceId: auth.workspaceId, jobId: id });
    return NextResponse.json({ ok: true });
  } catch (e) {
    return rentalError(e);
  }
}
