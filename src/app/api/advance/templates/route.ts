/* ============================================
   LOWPASS — Advance Section Templates API

   GET: List advance section templates (platform + workspace) for the current user
   ============================================ */

import { NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase-server';

async function ensureAuth() {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { supabase, user: null };
  return { supabase, user };
}

export async function GET() {
  const { supabase, user } = await ensureAuth();
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // RLS on advance_templates: workspace_id IS NULL (platform) OR workspace_id = get_my_workspace_id()
  const { data: templates, error } = await supabase
    .from('advance_templates')
    .select('id, name, description, icon, fields, suggested_for_day_types')
    .order('name');

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({
    templates: templates ?? [],
  });
}
