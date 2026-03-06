/* ============================================
   LOWPASS — Advance Section Templates API

   GET: List advance section templates (platform + workspace)
   POST: Create workspace template (custom section)
   ============================================ */

import { NextResponse } from 'next/server';
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

  const { data: templates, error } = await supabase
    .from('advance_templates')
    .select('id, name, description, icon, fields, suggested_for_day_types, workspace_id')
    .order('name');

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({
    templates: templates ?? [],
  });
}

export async function POST(request: Request) {
  const supabase = await createServerSupabaseClient();
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
