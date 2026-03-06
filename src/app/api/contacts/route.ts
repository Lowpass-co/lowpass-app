/* ============================================
   LOWPASS — Workspace Contact Book API

   GET: List contacts (?search= fuzzy name/role/venue, ?venue= exact venue)
   POST: Create contact
   PATCH: Update contact (id in body)
   DELETE: Delete contact (?id=)
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
  const search = searchParams.get('search')?.trim();
  const venue = searchParams.get('venue')?.trim();

  let query = supabase
    .from('contacts')
    .select('id, first_name, last_name, phone, email, role, venue_name, notes, created_at, updated_at')
    .eq('workspace_id', workspaceId)
    .order('last_name')
    .order('first_name');

  if (venue) {
    query = query.eq('venue_name', venue);
  }

  const { data: rows, error } = await query;

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  let contacts = rows ?? [];

  if (search) {
    const q = search.toLowerCase();
    contacts = contacts.filter(
      (c) =>
        (c.first_name ?? '').toLowerCase().includes(q) ||
        (c.last_name ?? '').toLowerCase().includes(q) ||
        `${(c.first_name ?? '').toLowerCase()} ${(c.last_name ?? '').toLowerCase()}`.includes(q) ||
        `${(c.last_name ?? '').toLowerCase()} ${(c.first_name ?? '').toLowerCase()}`.includes(q) ||
        (c.role ?? '').toLowerCase().includes(q) ||
        (c.venue_name ?? '').toLowerCase().includes(q)
    );
  }

  return NextResponse.json({ contacts });
}

export async function POST(request: Request) {
  const supabase = await createServerSupabaseClient();
  const workspaceId = await getWorkspaceId(supabase);
  if (!workspaceId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let body: {
    first_name: string;
    last_name?: string;
    phone?: string;
    email?: string;
    role?: string;
    venue_name?: string;
    notes?: string;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const first_name = typeof body.first_name === 'string' ? body.first_name.trim() : '';
  if (!first_name) {
    return NextResponse.json({ error: 'first_name is required' }, { status: 400 });
  }

  const { data: contact, error } = await supabase
    .from('contacts')
    .insert({
      workspace_id: workspaceId,
      first_name,
      last_name: typeof body.last_name === 'string' ? body.last_name.trim() : '',
      phone: body.phone ?? null,
      email: body.email ?? null,
      role: body.role ?? '',
      venue_name: body.venue_name ?? null,
      notes: body.notes ?? null,
    })
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(contact);
}

export async function PATCH(request: Request) {
  const supabase = await createServerSupabaseClient();
  const workspaceId = await getWorkspaceId(supabase);
  if (!workspaceId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let body: {
    id: string;
    first_name?: string;
    last_name?: string;
    phone?: string;
    email?: string;
    role?: string;
    venue_name?: string;
    notes?: string;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const { id, ...updates } = body;
  if (!id) {
    return NextResponse.json({ error: 'id is required' }, { status: 400 });
  }

  const payload: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (updates.first_name !== undefined) payload.first_name = updates.first_name;
  if (updates.last_name !== undefined) payload.last_name = updates.last_name;
  if (updates.phone !== undefined) payload.phone = updates.phone;
  if (updates.email !== undefined) payload.email = updates.email;
  if (updates.role !== undefined) payload.role = updates.role;
  if (updates.venue_name !== undefined) payload.venue_name = updates.venue_name;
  if (updates.notes !== undefined) payload.notes = updates.notes;

  const { data: contact, error } = await supabase
    .from('contacts')
    .update(payload)
    .eq('id', id)
    .eq('workspace_id', workspaceId)
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(contact);
}

export async function DELETE(request: Request) {
  const supabase = await createServerSupabaseClient();
  const workspaceId = await getWorkspaceId(supabase);
  if (!workspaceId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const id = searchParams.get('id');
  if (!id) {
    return NextResponse.json({ error: 'id query param is required' }, { status: 400 });
  }

  const { error } = await supabase
    .from('contacts')
    .delete()
    .eq('id', id)
    .eq('workspace_id', workspaceId);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return new Response(null, { status: 204 });
}
