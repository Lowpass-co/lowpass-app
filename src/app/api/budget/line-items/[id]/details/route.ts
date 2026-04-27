/* ============================================
   LOWPASS — Line Item Details API

   GET: Attachments, notes, linked items for a line item.
   ============================================ */

import { NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase-server';

const BUCKET = 'budget-files';

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
      .eq('workspace_id', profile.workspace_id)
      .order('uploaded_at', { ascending: false }),
    supabase
      .from('budget_line_item_notes')
      .select('*')
      .eq('line_item_id', lineItemId)
      .eq('workspace_id', profile.workspace_id)
      .order('created_at', { ascending: false }),
  ]);

  const attachmentRows = attachmentsRes.data ?? [];
  const notesRaw = notesRes.data ?? [];

  const attachments = await Promise.all(
    attachmentRows.map(async (row) => {
      const fileUrl = String((row as { file_url?: string | null }).file_url ?? '');
      const marker = `/${BUCKET}/`;
      const storagePath = fileUrl.includes(marker) ? fileUrl.split(marker)[1] : null;
      if (!storagePath) return row;
      const { data: signed } = await supabase.storage.from(BUCKET).createSignedUrl(storagePath, 60 * 60 * 12);
      if (!signed?.signedUrl) return row;
      return { ...row, file_url: signed.signedUrl };
    })
  );

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

  let hotel_booking: {
    id: string;
    hotel_name: string;
    city: string | null;
    check_in_date: string | null;
    check_out_date: string | null;
    total_assignment_nights: number;
  } | null = null;
  const srcType = (lineItem as { source_entity_type?: string | null }).source_entity_type;
  const srcId = (lineItem as { source_entity_id?: string | null; hotel_id?: string | null }).hotel_id
    ?? (lineItem as { source_entity_id?: string | null }).source_entity_id;
  if ((srcType === 'hotel_booking' || srcId) && srcId) {
    const [{ data: hb }, { data: asgRows }] = await Promise.all([
      supabase
        .from('hotels')
        .select('id, name, city, check_in_at, check_out_at')
        .eq('id', srcId)
        .eq('workspace_id', profile.workspace_id)
        .maybeSingle(),
      supabase
        .from('rooms')
        .select('room_assignments(starts_on, ends_on)')
        .eq('hotel_id', srcId)
        .eq('workspace_id', profile.workspace_id),
    ]);
    const totalAssignmentNights = (asgRows ?? []).reduce((sum, r) => {
      const ranges = (r as { room_assignments?: Array<{ starts_on?: string; ends_on?: string }> }).room_assignments ?? [];
      const roomNights = ranges.reduce((rs, range) => {
        if (!range.starts_on || !range.ends_on) return rs;
        const ms =
          new Date(`${range.ends_on}T12:00:00`).getTime() -
          new Date(`${range.starts_on}T12:00:00`).getTime();
        return rs + Math.max(0, Math.round(ms / (24 * 60 * 60 * 1000)));
      }, 0);
      return sum + roomNights;
    }, 0);
    if (hb) {
      const b = hb as {
        id: string;
        name?: string | null;
        city?: string | null;
        check_in_at?: string | null;
        check_out_at?: string | null;
      };
      hotel_booking = {
        id: b.id,
        hotel_name: String(b.name ?? '').trim(),
        city: b.city ?? null,
        check_in_date: b.check_in_at?.slice(0, 10) ?? null,
        check_out_date: b.check_out_at?.slice(0, 10) ?? null,
        total_assignment_nights: totalAssignmentNights,
      };
    }
  }

  return NextResponse.json({
    line_item: lineItem,
    attachments,
    notes,
    linked_items: linkedItems,
    /** Hotel stay fields aligned with the budget grid (same source row). */
    hotel_booking,
    /** @deprecated Use hotel_booking for dates and nights; kept for older clients. */
    hotel_booking_summary: hotel_booking
      ? {
          check_in_date: hotel_booking.check_in_date,
          check_out_date: hotel_booking.check_out_date,
          total_assignment_nights: hotel_booking.total_assignment_nights,
        }
      : null,
  });
}
