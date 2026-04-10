/* ============================================
   LOWPASS — Delete Advance Layout Template
   ============================================ */

import { NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase-server';

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('workspace_id')
    .eq('id', user.id)
    .single();
  if (!profile?.workspace_id) {
    return NextResponse.json({ error: 'No workspace' }, { status: 403 });
  }

  const { id } = await params;

  const { data: removedWorkspaceTemplate, error: wsErr } = await supabase
    .from('advance_layout_templates')
    .delete()
    .eq('id', id)
    .eq('workspace_id', profile.workspace_id)
    .select('id');

  if (wsErr) {
    return NextResponse.json({ error: wsErr.message }, { status: 500 });
  }
  if (removedWorkspaceTemplate?.length) {
    return new Response(null, { status: 204 });
  }

  const { data: tours } = await supabase
    .from('tours')
    .select('id')
    .eq('workspace_id', profile.workspace_id);
  const tourIds = (tours ?? []).map((t) => t.id);

  if (tourIds.length === 0) {
    return NextResponse.json({ error: 'Template not found' }, { status: 404 });
  }

  const { data: removedTourTemplate, error: afcErr } = await supabase
    .from('advance_form_configs')
    .delete()
    .eq('id', id)
    .eq('is_template', true)
    .in('tour_id', tourIds)
    .select('id');

  if (afcErr) {
    return NextResponse.json({ error: afcErr.message }, { status: 500 });
  }
  if (!removedTourTemplate?.length) {
    return NextResponse.json({ error: 'Template not found' }, { status: 404 });
  }

  return new Response(null, { status: 204 });
}
