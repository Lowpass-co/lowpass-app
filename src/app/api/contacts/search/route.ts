/* ============================================
   LOWPASS — Contacts Search API

   GET ?q= — debounced search for name/role/venue.
   ============================================ */

import { NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase-server';

async function getWorkspaceId(supabase: Awaited<ReturnType<typeof createServerSupabaseClient>>) {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const { data: profile } = await supabase
    .from('profiles')
    .select('workspace_id')
    .eq('id', user.id)
    .single();
  return profile?.workspace_id ?? null;
}

export async function GET(request: Request) {
  const supabase = await createServerSupabaseClient();
  const workspaceId = await getWorkspaceId(supabase);
  if (!workspaceId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const q = searchParams.get('q')?.trim();

  const query = supabase
    .from('contacts')
    .select('id, first_name, last_name, phone, email, role, venue_name, notes, created_at, updated_at')
    .eq('workspace_id', workspaceId)
    .order('last_name')
    .order('first_name');

  const { data: rows, error } = await query;

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  let contacts = rows ?? [];
  if (q) {
    const lower = q.toLowerCase();
    contacts = contacts.filter(
      (c) =>
        (c.first_name ?? '').toLowerCase().includes(lower) ||
        (c.last_name ?? '').toLowerCase().includes(lower) ||
        `${(c.first_name ?? '').toLowerCase()} ${(c.last_name ?? '').toLowerCase()}`.includes(lower) ||
        `${(c.last_name ?? '').toLowerCase()} ${(c.first_name ?? '').toLowerCase()}`.includes(lower) ||
        (c.role ?? '').toLowerCase().includes(lower) ||
        (c.venue_name ?? '').toLowerCase().includes(lower)
    );
  }

  return NextResponse.json({ contacts });
}
