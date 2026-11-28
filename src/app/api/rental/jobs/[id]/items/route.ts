/* GET / POST /api/rental/jobs/[id]/items — a job's lines; add items
   ({ items: [{ gear_id, quantity, day_rate_override }] }). Answers with all
   of the job's lines. */
import { NextResponse } from 'next/server';
import { requireWrite } from '@/lib/auth/workspace-check';
import { createServerSupabaseClient } from '@/lib/supabase-server';
import { addLines, listLines } from '@/server/rental/jobs';
import { readBody, rentalError } from '@/server/rental/respond';

export const dynamic = 'force-dynamic';

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createServerSupabaseClient();
  const auth = await requireWrite(supabase);
  if ('error' in auth) return auth.error;
  try {
    return NextResponse.json({ items: await listLines(supabase, { workspaceId: auth.workspaceId, jobId: id }) });
  } catch (e) {
    return rentalError(e);
  }
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createServerSupabaseClient();
  const auth = await requireWrite(supabase);
  if ('error' in auth) return auth.error;
  try {
    const body = await readBody(request);
    const items = Array.isArray(body.items) ? (body.items as Array<Record<string, unknown>>) : [];
    return NextResponse.json({ items: await addLines(supabase, { workspaceId: auth.workspaceId, jobId: id, items }) });
  } catch (e) {
    return rentalError(e);
  }
}
