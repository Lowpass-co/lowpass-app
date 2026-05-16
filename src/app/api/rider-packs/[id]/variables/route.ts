/* ============================================
   LOWPASS — GET /api/rider-packs/[id]/variables (Sprint 12 §9c2)

   Returns the current variable map for a pack — the same
   map the public reader's resolver builds at render time,
   but exposed authenticated so the rider editor can resolve
   {variable} tokens client-side when the operator double-
   clicks a chip to override-break it.

   Workspace-scoped via the standard auth + pack lookup. The
   caller must own the pack (RLS scopes by workspace_id).

   Response shape:
     { variables: { "{artist}": "Foo Fighters", … } }

   The JSON object's keys are the bracketed token strings;
   values are the resolved strings (empty string when the
   underlying data is absent — same NULL-safe contract as
   the server resolver).
   ============================================ */

import { NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase-server';
import { resolveVariableMap } from '@/lib/rider-packs/variable-resolver';
import type { RiderPack } from '@/lib/rider-packs/types';

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { id } = await params;
  const { data: pack, error } = await supabase
    .from('rider_packs')
    .select('*')
    .eq('id', id)
    .maybeSingle<RiderPack>();
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  if (!pack) {
    return NextResponse.json({ error: 'Pack not found' }, { status: 404 });
  }

  const map = await resolveVariableMap(supabase, pack);
  /* Map → plain object for JSON serialization. The map's
     Iterator preserves insertion order; consumers shouldn't
     rely on order anyway since they look up by token key. */
  const variables: Record<string, string> = {};
  for (const [token, value] of map.entries()) {
    variables[token] = value;
  }
  return NextResponse.json({ variables });
}
