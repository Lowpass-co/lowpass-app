/* ============================================
   LOWPASS — Line Item Notes API

   GET: List notes (with author info) for a line item.
   POST: Add note to a line item.
   PATCH: Update a note (body: { noteId, content }).
   DELETE: Delete a note (body: { noteId }).
   ============================================ */

import { NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase-server';

async function getWorkspaceId(supabase: Awaited<ReturnType<typeof createServerSupabaseClient>>, userId: string) {
  const { data: profile } = await supabase
    .from('profiles')
    .select('workspace_id')
    .eq('id', userId)
    .single();
  return profile?.workspace_id ?? null;
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const workspaceId = await getWorkspaceId(supabase, user.id);
  if (!workspaceId) return NextResponse.json({ error: 'No workspace' }, { status: 403 });

  const { id: lineItemId } = await params;
  if (!lineItemId) return NextResponse.json({ error: 'id required' }, { status: 400 });

  const { data: lineItem } = await supabase
    .from('budget_line_items')
    .select('id')
    .eq('id', lineItemId)
    .eq('workspace_id', workspaceId)
    .single();
  if (!lineItem) return NextResponse.json({ error: 'Line item not found' }, { status: 404 });

  const { data: notes, error } = await supabase
    .from('budget_line_item_notes')
    .select('*')
    .eq('line_item_id', lineItemId)
    .eq('workspace_id', workspaceId)
    .order('created_at', { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const createdByIds = [...new Set((notes ?? []).map((n) => (n as { created_by?: string | null }).created_by).filter(Boolean))] as string[];
  const { data: profilesRaw } = createdByIds.length
    ? await supabase
        .from('profiles')
        .select('id, name, avatar_url')
        .in('id', createdByIds)
    : { data: [] as unknown[] };

  const profiles = (profilesRaw ?? []) as { id: string; name: string | null; avatar_url: string | null }[];
  const profileById = new Map(profiles.map((p) => [p.id, p]));

  const enriched = (notes ?? []).map((n) => {
    const authorId = (n as { created_by?: string | null }).created_by ?? null;
    const author = authorId ? profileById.get(authorId) ?? null : null;
    return {
      ...n,
      author: author ? { id: (author as { id: string }).id, name: (author as { name?: string | null }).name ?? null, avatar_url: (author as { avatar_url?: string | null }).avatar_url ?? null } : null,
    };
  });

  return NextResponse.json({ notes: enriched });
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const workspaceId = await getWorkspaceId(supabase, user.id);
  if (!workspaceId) return NextResponse.json({ error: 'No workspace' }, { status: 403 });

  const { id: lineItemId } = await params;
  if (!lineItemId) return NextResponse.json({ error: 'id required' }, { status: 400 });

  const { data: lineItem } = await supabase
    .from('budget_line_items')
    .select('id')
    .eq('id', lineItemId)
    .eq('workspace_id', workspaceId)
    .single();
  if (!lineItem) return NextResponse.json({ error: 'Line item not found' }, { status: 404 });

  let body: { content: string; note_type?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }
  const content = (body.content ?? '').toString().trim();
  if (!content) return NextResponse.json({ error: 'content required' }, { status: 400 });

  const noteType = ['note', 'status_change', 'approval', 'system'].includes(body.note_type ?? '')
    ? body.note_type
    : 'note';

  const { data: created, error } = await supabase
    .from('budget_line_item_notes')
    .insert({
      line_item_id: lineItemId,
      workspace_id: workspaceId,
      content,
      created_by: user.id,
      note_type: noteType,
    })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  const { data: author } = await supabase.from('profiles').select('id, name, avatar_url').eq('id', user.id).maybeSingle();
  return NextResponse.json({ ...created, author: author ?? null });
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const workspaceId = await getWorkspaceId(supabase, user.id);
  if (!workspaceId) return NextResponse.json({ error: 'No workspace' }, { status: 403 });

  const { id: lineItemId } = await params;
  if (!lineItemId) return NextResponse.json({ error: 'id required' }, { status: 400 });

  let body: { noteId: string; content: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const noteId = (body.noteId ?? '').trim();
  const content = (body.content ?? '').toString().trim();
  if (!noteId || !content) return NextResponse.json({ error: 'noteId and content required' }, { status: 400 });

  const { data: updated, error } = await supabase
    .from('budget_line_item_notes')
    .update({ content })
    .eq('id', noteId)
    .eq('line_item_id', lineItemId)
    .eq('workspace_id', workspaceId)
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const createdBy = (updated as { created_by?: string | null }).created_by ?? null;
  const { data: author } = createdBy
    ? await supabase.from('profiles').select('id, name, avatar_url').eq('id', createdBy).maybeSingle()
    : { data: null };

  return NextResponse.json({ ...updated, author: author ?? null });
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const workspaceId = await getWorkspaceId(supabase, user.id);
  if (!workspaceId) return NextResponse.json({ error: 'No workspace' }, { status: 403 });

  const { id: lineItemId } = await params;
  if (!lineItemId) return NextResponse.json({ error: 'id required' }, { status: 400 });

  let body: { noteId: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const noteId = (body.noteId ?? '').trim();
  if (!noteId) return NextResponse.json({ error: 'noteId required' }, { status: 400 });

  const { error } = await supabase
    .from('budget_line_item_notes')
    .delete()
    .eq('id', noteId)
    .eq('line_item_id', lineItemId)
    .eq('workspace_id', workspaceId);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return new Response(null, { status: 204 });
}
