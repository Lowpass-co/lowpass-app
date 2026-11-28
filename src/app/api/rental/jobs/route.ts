/* POST /api/rental/jobs — make a rental job (server/rental/jobs.ts). */
import { NextResponse } from 'next/server';
import { requireWrite } from '@/lib/auth/workspace-check';
import { createServerSupabaseClient } from '@/lib/supabase-server';
import { createJob } from '@/server/rental/jobs';
import { readBody, rentalError } from '@/server/rental/respond';

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  const supabase = await createServerSupabaseClient();
  const auth = await requireWrite(supabase);
  if ('error' in auth) return auth.error;
  try {
    const job = await createJob(supabase, { workspaceId: auth.workspaceId, userId: auth.user.id, body: await readBody(request) });
    return NextResponse.json({ job }, { status: 201 });
  } catch (e) {
    return rentalError(e);
  }
}
