/* ============================================
   LOWPASS — Current User Profile

   GET: Return current user's profile (name, avatar_url, job_title, phone, etc.)
   PATCH: Update name, job_title, phone, avatar_url.
   ============================================ */

import { NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase-server';

export async function GET() {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { data: profile, error } = await supabase
    .from('profiles')
    .select('id, email, name, avatar_url, job_title, phone, workspace_id, role_id')
    .eq('id', user.id)
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  if (!profile) {
    return NextResponse.json({ error: 'Profile not found' }, { status: 404 });
  }
  return NextResponse.json(profile);
}

export async function PATCH(request: Request) {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let body: { name?: string; job_title?: string | null; phone?: string | null; avatar_url?: string | null };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (body.name !== undefined) updates.name = body.name;
  if (body.job_title !== undefined) updates.job_title = body.job_title ?? null;
  if (body.phone !== undefined) updates.phone = body.phone ?? null;
  if (body.avatar_url !== undefined) updates.avatar_url = body.avatar_url ?? null;

  const { data, error } = await supabase
    .from('profiles')
    .update(updates)
    .eq('id', user.id)
    .select('id, email, name, avatar_url, job_title, phone')
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json(data);
}
