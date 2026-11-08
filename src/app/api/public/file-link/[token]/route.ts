/* ============================================
   POST /api/public/file-link/[token]   body: { password?: string }
   → what the link shows: { kind, access, title, tourName, artistName,
     expiresAt, files, folders, gone }

   PUBLIC — no session. The unguessable token (+ optional password) is the
   grant; resolved with the service-role client, and every file is checked
   against the link's scope in src/server/files/shareLinks.ts. POST (not GET)
   so a password never sits in a URL or a log line.
   ============================================ */

import { NextResponse } from 'next/server';
import { createServiceSupabaseClient } from '@/lib/supabase-server';
import { linkContents, openLink } from '@/server/files/shareLinks';
import { NO_STORE, readJson, shareErrorResponse, str } from '@/server/files/shareResponse';

export const dynamic = 'force-dynamic';

export async function POST(request: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const body = await readJson(request);
  try {
    const service = createServiceSupabaseClient();
    const link = await openLink(service, token, str(body.password));
    return NextResponse.json(await linkContents(service, link), { headers: NO_STORE });
  } catch (e) {
    return shareErrorResponse(e);
  }
}
