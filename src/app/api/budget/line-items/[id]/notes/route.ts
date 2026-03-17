/* ============================================
   LOWPASS — Line Item Notes API

   POST: Add note to a line item.
   ============================================ */

import { NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase-server';

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { data: profile } = await supabase
    .from('profiles')
    .select('workspace_id')
    .eq('id', user.id)
    .single();
  if (!profile?.workspace_id) return NextResponse.json({ error: 'No workspace' }, { status: 403 });

  const { id: lineItemId } = await params;
  if (!lineItemId) return NextResponse.json({ error: 'id required' }, { status: 400 });

  const { data: lineItem } = await supabase
    .from('budget_line_items')
    .select('id')
    .eq('id', lineItemId)
    .eq('workspace_id', profile.workspace_id)
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
      workspace_id: profile.workspace_id,
      content,
      created_by: user.id,
      note_type: noteType,
    })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(created);
}
