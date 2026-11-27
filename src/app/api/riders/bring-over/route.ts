/* ============================================
   POST /api/riders/bring-over — copy every old builder rider into the new
   riders (tour / show packs → that tour's documents; artist packs →
   templates). Admin / manager (requireWrite with no area). Idempotent:
   rider_legacy_imports records each pack. The old rows are never touched.
   ============================================ */

import { NextResponse } from 'next/server';
import type { SupabaseClient } from '@supabase/supabase-js';
import { createServerSupabaseClient } from '@/lib/supabase-server';
import { requireWrite } from '@/lib/auth/workspace-check';
import { bringOver } from '@/server/riders/legacy';
import { riderErrorResponse } from '@/server/riders/http';

export const dynamic = 'force-dynamic';
export const maxDuration = 120;

export async function POST() {
  const supabase = await createServerSupabaseClient();
  const auth = await requireWrite(supabase);
  if ('error' in auth) return auth.error;
  try {
    return NextResponse.json(await bringOver(supabase as unknown as SupabaseClient, auth.workspaceId, auth.user.id));
  } catch (e) {
    return riderErrorResponse(e, 'bring-over');
  }
}
