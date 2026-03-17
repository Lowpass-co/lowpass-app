/* ============================================
   LOWPASS — Line Item Details API

   GET: Attachments, notes, linked items for a line item.
   ============================================ */

import { NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase-server';

export async function GET(
  _request: Request,
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

  const { data: lineItem, error: itemErr } = await supabase
    .from('budget_line_items')
    .select('*')
    .eq('id', lineItemId)
    .eq('workspace_id', profile.workspace_id)
    .single();

  if (itemErr || !lineItem) return NextResponse.json({ error: 'Line item not found' }, { status: 404 });

  const [attachmentsRes, notesRes] = await Promise.all([
    supabase
      .from('budget_line_item_attachments')
      .select('*')
      .eq('line_item_id', lineItemId)
      .order('uploaded_at', { ascending: false }),
    supabase
      .from('budget_line_item_notes')
      .select('*')
      .eq('line_item_id', lineItemId)
      .order('created_at', { ascending: false }),
  ]);

  const attachments = attachmentsRes.data ?? [];
  const notes = notesRes.data ?? [];

  const linkedIds = (lineItem as { linked_item_ids?: string[] }).linked_item_ids ?? [];
  let linkedItems: unknown[] = [];
  if (linkedIds.length > 0) {
    const { data: linked } = await supabase
      .from('budget_line_items')
      .select('id, category, label, proposed_cost, actual_cost')
      .in('id', linkedIds)
      .eq('workspace_id', profile.workspace_id);
    linkedItems = linked ?? [];
  }

  return NextResponse.json({
    line_item: lineItem,
    attachments,
    notes,
    linked_items: linkedItems,
  });
}
