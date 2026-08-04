import { NextResponse } from 'next/server';
import { requireWrite } from '@/lib/auth/workspace-check';
import { createServerSupabaseClient } from '@/lib/supabase-server';

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { id } = await params;

  const { data, error } = await supabase
    .from('rooms')
    .select(`
      *,
      hotels(id, name, address, city, phone, confirmation_number)
    `)
    .eq('id', id)
    .single();

  if (error) {
    if (error.code === 'PGRST116') return NextResponse.json({ error: 'Not found' }, { status: 404 });
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json(data);
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const supabase = await createServerSupabaseClient();
  const auth = await requireWrite(supabase);
  if ('error' in auth) return auth.error;
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { id } = await params;

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const roomPayload: Record<string, unknown> = {};
  if (body.room_number !== undefined) roomPayload.room_number = body.room_number;
  if (body.room_type !== undefined) roomPayload.room_type = body.room_type;
  if (body.cost_amount !== undefined) roomPayload.cost_amount = body.cost_amount;
  if (body.cost_currency !== undefined) roomPayload.cost_currency = body.cost_currency;
  if (body.bed_count !== undefined) roomPayload.bed_count = body.bed_count;
  if (body.notes !== undefined) roomPayload.notes = body.notes;

  if (Object.keys(roomPayload).length > 0) {
    const { error } = await supabase.from('rooms').update(roomPayload).eq('id', id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const hotelPayload: Record<string, unknown> = {};
  if (body.hotel_name !== undefined) hotelPayload.name = body.hotel_name;
  if (body.hotel_address !== undefined) hotelPayload.address = body.hotel_address;
  if (body.hotel_phone !== undefined) hotelPayload.phone = body.hotel_phone;
  if (body.confirmation_number !== undefined) hotelPayload.confirmation_number = body.confirmation_number;
  if (body.hotel_notes !== undefined) hotelPayload.notes = body.hotel_notes;

  if (Object.keys(hotelPayload).length > 0) {
    const { data: room } = await supabase.from('rooms').select('hotel_id').eq('id', id).single();
    if (room?.hotel_id) {
      const { error } = await supabase.from('hotels').update(hotelPayload).eq('id', room.hotel_id);
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    }
  }

  const { data, error } = await supabase
    .from('rooms')
    .select(`
      *,
      hotels(id, name, address, city, phone, confirmation_number)
    `)
    .eq('id', id)
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}
