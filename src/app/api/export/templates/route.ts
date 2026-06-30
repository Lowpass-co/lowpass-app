/* ============================================
   LOWPASS — /api/export/templates  (#8 Document Export, Template Builder Phase 3)

   Workspace-scoped CRUD for saved export templates (migration 224). All routes are
   RLS-enforced + workspace-scoped; the GLOBAL tier (workspace_id NULL) is read-only
   to clients (a client write to a NULL workspace_id is blocked by RLS, and POST
   always stamps the caller's workspace_id). Copy-on-apply for global is a client
   concern (the editor loads a global config + Save creates a workspace row).

     GET    ?surface=budget          → list { templates } (own workspace + global)
     POST   { surface, name, config } → create a workspace-owned template
     PATCH  { id, name?, isDefault? } → rename / set-default (own workspace only)
     DELETE ?id=                      → delete (own workspace only)

   The config is run through normalizeConfig on save — presentation-only, coerced.
   ============================================ */

import { NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase-server';
import { normalizeConfig, type ExportSurface } from '@/lib/export/template-config';

export const dynamic = 'force-dynamic';

const SURFACES: ExportSurface[] = ['budget', 'rooming', 'payroll', 'routing'];
const isSurface = (s: unknown): s is ExportSurface => typeof s === 'string' && SURFACES.includes(s as ExportSurface);

type Ctx =
  | { ok: false; response: NextResponse }
  | { ok: true; supabase: Awaited<ReturnType<typeof createServerSupabaseClient>>; user: { id: string }; workspaceId: string };

async function ctx(): Promise<Ctx> {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, response: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) };
  const { data: profile } = await supabase.from('profiles').select('workspace_id').eq('id', user.id).single();
  if (!profile?.workspace_id) return { ok: false, response: NextResponse.json({ error: 'No workspace' }, { status: 403 }) };
  return { ok: true, supabase, user, workspaceId: profile.workspace_id as string };
}

export async function GET(request: Request): Promise<NextResponse> {
  const c = await ctx();
  if (!c.ok) return c.response;
  const surface = new URL(request.url).searchParams.get('surface');
  if (!isSurface(surface)) return NextResponse.json({ error: 'Invalid surface' }, { status: 400 });

  // RLS returns own-workspace + global rows; order own-first then global, by name.
  const { data, error } = await c.supabase
    .from('export_templates')
    .select('id, workspace_id, surface, name, config, is_default, created_at')
    .eq('surface', surface)
    .order('workspace_id', { ascending: true, nullsFirst: false })
    .order('name', { ascending: true });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const templates = (data ?? []).map((t) => ({
    id: t.id,
    name: t.name,
    surface: t.surface,
    config: t.config,
    isDefault: t.is_default,
    isGlobal: t.workspace_id === null,
  }));
  return NextResponse.json({ templates });
}

export async function POST(request: Request): Promise<NextResponse> {
  const c = await ctx();
  if (!c.ok) return c.response;
  const body = (await request.json().catch(() => ({}))) as { surface?: unknown; name?: unknown; config?: unknown };
  if (!isSurface(body.surface)) return NextResponse.json({ error: 'Invalid surface' }, { status: 400 });
  const name = typeof body.name === 'string' ? body.name.trim().slice(0, 80) : '';
  if (!name) return NextResponse.json({ error: 'Name is required' }, { status: 400 });

  const config = normalizeConfig(body.surface, body.config);
  const { data, error } = await c.supabase
    .from('export_templates')
    .insert({ workspace_id: c.workspaceId, surface: body.surface, name, config, created_by: c.user.id })
    .select('id, name, surface, config, is_default, workspace_id')
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({
    template: { id: data.id, name: data.name, surface: data.surface, config: data.config, isDefault: data.is_default, isGlobal: data.workspace_id === null },
  });
}

export async function PATCH(request: Request): Promise<NextResponse> {
  const c = await ctx();
  if (!c.ok) return c.response;
  const body = (await request.json().catch(() => ({}))) as { id?: unknown; name?: unknown; isDefault?: unknown };
  if (typeof body.id !== 'string') return NextResponse.json({ error: 'id is required' }, { status: 400 });

  // Fetch the row (RLS-scoped). A global row (no workspace) is read-only.
  const { data: row } = await c.supabase.from('export_templates').select('id, workspace_id, surface').eq('id', body.id).maybeSingle();
  if (!row) return NextResponse.json({ error: 'Template not found' }, { status: 404 });
  if (row.workspace_id === null || row.workspace_id !== c.workspaceId) {
    return NextResponse.json({ error: 'Read-only template' }, { status: 403 });
  }

  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (typeof body.name === 'string' && body.name.trim()) patch.name = body.name.trim().slice(0, 80);

  if (body.isDefault === true) {
    // One default per (workspace, surface) — clear the existing default first
    // (the partial unique index would otherwise reject a second default).
    await c.supabase
      .from('export_templates')
      .update({ is_default: false })
      .eq('workspace_id', c.workspaceId)
      .eq('surface', row.surface)
      .eq('is_default', true);
    patch.is_default = true;
  } else if (body.isDefault === false) {
    patch.is_default = false;
  }

  const { error } = await c.supabase.from('export_templates').update(patch).eq('id', body.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}

export async function DELETE(request: Request): Promise<NextResponse> {
  const c = await ctx();
  if (!c.ok) return c.response;
  const id = new URL(request.url).searchParams.get('id');
  if (!id) return NextResponse.json({ error: 'id is required' }, { status: 400 });
  const { error } = await c.supabase.from('export_templates').delete().eq('id', id).eq('workspace_id', c.workspaceId);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return new NextResponse(null, { status: 204 });
}
