/* ============================================
   LOWPASS — Advance Section Templates API

   GET: List advance section templates (platform + workspace)
   POST: Create workspace template (custom section)
   ============================================ */

import { NextResponse } from 'next/server';
import { requireWrite } from '@/lib/auth/workspace-check';
import { createServerSupabaseClient } from '@/lib/supabase-server';

async function getWorkspaceId(supabase: Awaited<ReturnType<typeof createServerSupabaseClient>>) {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const { data: profile } = await supabase.from('profiles').select('workspace_id').eq('id', user.id).single();
  return profile?.workspace_id ?? null;
}

export async function GET() {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const workspaceId = await getWorkspaceId(supabase);
  if (!workspaceId) {
    return NextResponse.json({ templates: [] });
  }

  const { data: templates, error } = await supabase
    .from('advance_templates')
    .select(
      'id, name, description, icon, fields, suggested_for_day_types, workspace_id, sort_order, tm_only, forked_from_id',
    )
    .or(`workspace_id.is.null,workspace_id.eq.${workspaceId}`)
    .order('workspace_id', { ascending: true, nullsFirst: true })
    .order('sort_order', { ascending: true, nullsFirst: false })
    .order('name');

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Sprint 8.6 §6 — when the workspace has a fork of a platform
  // template (workspace_id = $w AND forked_from_id = $platformId),
  // filter the platform original out of the listing. The fork
  // replaces the parent so each section appears once in the
  // library.
  type Row = {
    id: string;
    forked_from_id: string | null;
    workspace_id: string | null;
  };
  const allRows = (templates ?? []) as Row[];
  const forkedPlatformIds = new Set<string>(
    allRows
      .filter((t) => t.workspace_id != null && t.forked_from_id != null)
      .map((t) => t.forked_from_id as string),
  );
  const filtered = allRows.filter(
    (t) => !(t.workspace_id == null && forkedPlatformIds.has(t.id)),
  );

  return NextResponse.json({ templates: filtered });
}

export async function POST(request: Request) {
  const supabase = await createServerSupabaseClient();
  const auth = await requireWrite(supabase);
  if ('error' in auth) return auth.error;
  const workspaceId = await getWorkspaceId(supabase);
  if (!workspaceId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let body: { name: string; description?: string; icon?: string; fields?: unknown[] };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const name = typeof body.name === 'string' ? body.name.trim() : '';
  if (!name) {
    return NextResponse.json({ error: 'name is required' }, { status: 400 });
  }

  const fields = Array.isArray(body.fields) ? body.fields : [];
  const { data: template, error } = await supabase
    .from('advance_templates')
    .insert({
      workspace_id: workspaceId,
      template_type: 'section',
      name,
      description: typeof body.description === 'string' ? body.description.trim() : '',
      icon: body.icon ?? 'clipboard',
      fields,
      suggested_for_day_types: ['show', 'festival'],
    })
    .select('id, name, description, icon, fields, suggested_for_day_types')
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(template);
}
