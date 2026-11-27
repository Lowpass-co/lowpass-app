/* ============================================
   GET /api/public/riders/[token]/logo — the artist's logo for the promoter
   page (Nov 2026). The same image the PDF prints (`loadRiderLogo`: our own
   upload from Storage, anything else only through safeFetch), served
   same-origin so the page never asks an outside host for it. Token check
   first; 404 when the link is dead or there's no usable logo.
   ============================================ */

import type { SupabaseClient } from '@supabase/supabase-js';
import { createServiceSupabaseClient } from '@/lib/supabase-server';
import { TOKEN_RE, tourForRiderToken } from '@/server/riders/public';
import { loadRiderLogo, logoResponse } from '@/server/riders/logo';

export const dynamic = 'force-dynamic';

export async function GET(_request: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  if (!TOKEN_RE.test(token)) return logoResponse(null, 'no-store');
  const service = createServiceSupabaseClient() as unknown as SupabaseClient;
  const tourId = await tourForRiderToken(service, token).catch(() => null);
  if (!tourId) return logoResponse(null, 'no-store');
  return logoResponse(await loadRiderLogo(service, tourId), 'private, max-age=3600');
}
