/**
 * UX21 — List rental_inventory rows in the caller's workspace that are NOT
 * yet linked to a canonical Gear, for display under "From your rental
 * inventory" in the gear picker and in GearSlideOver's link picker.
 *
 * Workspace scoping: rental_inventory rows are owned by `user_id`. We list
 * rows owned by anyone in the same workspace as the caller. RLS on
 * rental_inventory + the gear NOT EXISTS check enforces the boundary.
 */

import { NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase-server';

export async function GET(request: Request) {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { data: profile } = await supabase
    .from('profiles')
    .select('workspace_id')
    .eq('id', user.id)
    .single();
  if (!profile?.workspace_id) return NextResponse.json({ error: 'No workspace' }, { status: 403 });

  const { searchParams } = new URL(request.url);
  const q = (searchParams.get('q') ?? '').trim();
  const limit = Math.min(Math.max(Number(searchParams.get('limit') ?? 50) || 50, 1), 200);

  // Workspace siblings (anyone in the same workspace).
  const { data: members } = await supabase
    .from('workspace_members')
    .select('user_id')
    .eq('workspace_id', profile.workspace_id);
  const memberIds = (members ?? []).map((m: { user_id: string }) => m.user_id);
  if (memberIds.length === 0) {
    return NextResponse.json({ items: [] });
  }

  // Already-linked rental_inventory ids for this workspace.
  const { data: linked } = await supabase
    .from('gear')
    .select('rental_inventory_id')
    .eq('workspace_id', profile.workspace_id)
    .not('rental_inventory_id', 'is', null);
  const linkedIds = new Set(
    (linked ?? [])
      .map((r: { rental_inventory_id: string | null }) => r.rental_inventory_id)
      .filter((v): v is string => !!v),
  );

  let inventoryQuery = supabase
    .from('rental_inventory')
    .select('id, user_id, name, category, serial_number, country_of_origin, purchase_cost, day_rate, day_rate_manual, weight_kg, image_url, notes, created_at')
    .in('user_id', memberIds)
    .order('name', { ascending: true })
    .limit(limit);

  if (q) {
    inventoryQuery = inventoryQuery.or(
      `name.ilike.%${q}%,category.ilike.%${q}%,serial_number.ilike.%${q}%`,
    );
  }

  const { data: inventory, error } = await inventoryQuery;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const items = (inventory ?? []).filter((row: { id: string }) => !linkedIds.has(row.id));
  return NextResponse.json({ items });
}
