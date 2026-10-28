/* ============================================
   LOWPASS — Advance · the tour's board (Oct 2026 rebuild)

   /advance/[tourId] — every show and its sections at a glance, the venue
   request per show, search across every answer. Chrome comes from the
   layout (<ShellV3Mount>). Data: loadAdvanceBoard (writes nothing).
   ============================================ */

import { notFound } from 'next/navigation';
import type { SupabaseClient } from '@supabase/supabase-js';
import { createServerSupabaseClient } from '@/lib/supabase-server';
import { loadAdvanceBoard } from '@/server/advance/board';
import { AdvanceBoard } from '@/components/advance/AdvanceBoard';

export const dynamic = 'force-dynamic';

export default async function AdvanceBoardPage({ params }: { params: Promise<{ tourId: string }> }) {
  const { tourId } = await params;
  const supabase = (await createServerSupabaseClient()) as unknown as SupabaseClient;
  const data = await loadAdvanceBoard(supabase, tourId);
  if (!data) notFound();
  return <AdvanceBoard data={data} />;
}
