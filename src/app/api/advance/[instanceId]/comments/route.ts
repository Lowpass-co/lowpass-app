/* ============================================
   LOWPASS — Advance Comments API

   GET: Comments for an instance, grouped by section_id
   POST: Create a comment (optionally reply via thread_id)
   ============================================ */

import { NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase-server';

async function ensureAuth() {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { supabase, user: null };
  return { supabase, user };
}

/** Verify current user can access this advance instance (RLS will enforce via routing → tour → workspace) */
async function getInstance(supabase: Awaited<ReturnType<typeof createServerSupabaseClient>>, instanceId: string) {
  const { data } = await supabase
    .from('advance_instances')
    .select('id')
    .eq('id', instanceId)
    .single();
  return data;
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ instanceId: string }> }
) {
  const { supabase, user } = await ensureAuth();
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { instanceId } = await params;
  const instance = await getInstance(supabase, instanceId);
  if (!instance) {
    return NextResponse.json({ error: 'Advance instance not found' }, { status: 404 });
  }

  const { data: comments, error } = await supabase
    .from('advance_comments')
    .select('id, section_id, author_id, content, thread_id, created_at')
    .eq('advance_instance_id', instanceId)
    .order('created_at', { ascending: false });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const authorIds = [...new Set((comments ?? []).map((c) => c.author_id))];
  const { data: profiles } = await supabase
    .from('profiles')
    .select('id, name')
    .in('id', authorIds);

  const nameById = new Map((profiles ?? []).map((p) => [p.id, p.name ?? 'Unknown']));

  const withAuthor = (comments ?? []).map((c) => ({
    id: c.id,
    section_id: c.section_id,
    author_id: c.author_id,
    author_name: nameById.get(c.author_id) ?? 'Unknown',
    content: c.content,
    thread_id: c.thread_id,
    created_at: c.created_at,
  }));

  const bySection: Record<string, typeof withAuthor> = {};
  for (const c of withAuthor) {
    if (!bySection[c.section_id]) bySection[c.section_id] = [];
    bySection[c.section_id].push(c);
  }

  return NextResponse.json({ comments: bySection });
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ instanceId: string }> }
) {
  const { supabase, user } = await ensureAuth();
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { instanceId } = await params;
  const instance = await getInstance(supabase, instanceId);
  if (!instance) {
    return NextResponse.json({ error: 'Advance instance not found' }, { status: 404 });
  }

  let body: { section_id: string; content: string; thread_id?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const section_id = typeof body.section_id === 'string' ? body.section_id.trim() : '';
  const content = typeof body.content === 'string' ? body.content.trim() : '';
  if (!section_id || !content) {
    return NextResponse.json({ error: 'section_id and content are required' }, { status: 400 });
  }

  const { data: created, error } = await supabase
    .from('advance_comments')
    .insert({
      advance_instance_id: instanceId,
      section_id,
      author_id: user.id,
      content,
      thread_id: body.thread_id || null,
    })
    .select('id, section_id, author_id, content, thread_id, created_at')
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('name')
    .eq('id', user.id)
    .single();

  return NextResponse.json({
    ...created,
    author_name: profile?.name ?? 'Unknown',
  });
}
