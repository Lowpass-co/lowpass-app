/* ============================================
   LOWPASS — GET /api/rider-section-templates (§RA5)

   Lists rider section templates for the library palette: platform
   templates (workspace_id IS NULL, seeded in migration 111) +
   workspace-custom templates. RLS (rst_select) scopes visibility to
   platform + the caller's workspace. Ordered by sort_order so
   Contacts (10) leads.
   ============================================ */

import { NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase-server';

export const dynamic = 'force-dynamic';

export async function GET() {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { data, error } = await supabase
    .from('rider_section_templates')
    .select('id, template_type, name, description, icon, fields, workspace_id, sort_order')
    .order('sort_order', { ascending: true });

  if (error) return NextResponse.json({ templates: [] });
  return NextResponse.json({ templates: data ?? [] });
}
