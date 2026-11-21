/* ============================================
   /api/tours/[id]/personnel/[memberId]/login — a crew member's app access
   on THIS tour (Nov 2026, Adam). [memberId] = tour_personnel.id.

     PUT    { preset, email? } → giveTourLogin (grant, or invite + link)
     DELETE                    → removeTourLogin (this tour only)

   Workspace ADMINS only — invites and tour access are admin-writable in the
   database (078 / 292); this check makes a manager's refusal readable.
   ============================================ */

import { NextResponse } from 'next/server';
import { requireWrite } from '@/lib/auth/workspace-check';
import { createServerSupabaseClient } from '@/lib/supabase-server';
import { PRESETS, type Preset } from '@/lib/permissions/areas';
import { giveTourLogin, removeTourLogin } from '@/server/people/tourLogin';

export const dynamic = 'force-dynamic';
type Params = { params: Promise<{ id: string; memberId: string }> };

async function context(request: Request, { params }: Params) {
  const supabase = await createServerSupabaseClient();
  const auth = await requireWrite(supabase, { adminOnly: true });
  if ('error' in auth) return { ok: false, res: auth.error } as const;
  const { id: tourId, memberId } = await params;
  const { data: row } = await supabase
    .from('tour_personnel')
    .select('person_id, workspace_id')
    .eq('id', memberId)
    .eq('tour_id', tourId)
    .maybeSingle();
  if (!row) return { ok: false, res: NextResponse.json({ error: 'Not on this tour' }, { status: 404 }) } as const;
  const r = row as { person_id: string; workspace_id: string };
  if (r.workspace_id !== auth.workspaceId) {
    return { ok: false, res: NextResponse.json({ error: "Switch to this tour's workspace to change app access" }, { status: 409 }) } as const;
  }
  return {
    ok: true,
    supabase,
    personId: r.person_id,
    ctx: { workspaceId: r.workspace_id, tourId, actorUserId: auth.user.id, origin: new URL(request.url).origin },
  } as const;
}

export async function PUT(request: Request, p: Params): Promise<Response> {
  const c = await context(request, p);
  if (!c.ok) return c.res;
  const body = (await request.json().catch(() => null)) as { preset?: unknown; email?: unknown } | null;
  const preset = body?.preset;
  if (typeof preset !== 'string' || !(PRESETS as readonly string[]).includes(preset)) {
    return NextResponse.json({ error: 'Unknown access preset' }, { status: 400 });
  }
  const result = await giveTourLogin(
    c.supabase,
    c.ctx,
    c.personId,
    preset as Preset,
    typeof body?.email === 'string' ? body.email : null,
  );
  if (result.kind === 'error') return NextResponse.json({ error: result.error }, { status: 400 });
  return NextResponse.json({ login: result });
}

export async function DELETE(request: Request, p: Params): Promise<Response> {
  const c = await context(request, p);
  if (!c.ok) return c.res;
  const r = await removeTourLogin(c.supabase, c.ctx, c.personId);
  if (!r.ok) return NextResponse.json({ error: r.error }, { status: 400 });
  return NextResponse.json({ ok: true });
}
