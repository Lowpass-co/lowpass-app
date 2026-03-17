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
  const notesRaw = notesRes.data ?? [];

  const createdByIds = [...new Set((notesRaw ?? []).map((n) => (n as { created_by?: string | null }).created_by).filter(Boolean))] as string[];
  const { data: profilesRaw } = createdByIds.length
    ? await supabase
        .from('profiles')
        .select('id, name, avatar_url')
        .in('id', createdByIds)
    : { data: [] as unknown[] };
  const profiles = (profilesRaw ?? []) as { id: string; name: string | null; avatar_url: string | null }[];
  const profileById = new Map(profiles.map((p) => [p.id, p]));

  const notes = (notesRaw ?? []).map((n) => {
    const authorId = (n as { created_by?: string | null }).created_by ?? null;
    const author = authorId ? profileById.get(authorId) ?? null : null;
    return {
      ...n,
      author: author ? { id: (author as { id: string }).id, name: (author as { name?: string | null }).name ?? null, avatar_url: (author as { avatar_url?: string | null }).avatar_url ?? null } : null,
    };
  });

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
