/* ============================================
   POST /api/public/file-link/[token]/download
   body: { password?: string, fileId: string, name?: string } → { url }

   PUBLIC — token (+ password) is the grant. Returns a 60-second signed URL
   that forces a download (never renders in the browser) for a file that
   fileInLink() confirms is inside the link. Logs the download.
   ============================================ */

import { NextResponse } from 'next/server';
import { createServiceSupabaseClient } from '@/lib/supabase-server';
import { downloadUrl, openLink, supabaseShareStorage } from '@/server/files/shareLinks';
import { NO_STORE, readJson, shareErrorResponse, str } from '@/server/files/shareResponse';

export const dynamic = 'force-dynamic';

export async function POST(request: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const body = await readJson(request);
  try {
    const service = createServiceSupabaseClient();
    const link = await openLink(service, token, str(body.password));
    const url = await downloadUrl(service, supabaseShareStorage(service), link, str(body.fileId) ?? '', str(body.name));
    return NextResponse.json({ url }, { headers: NO_STORE });
  } catch (e) {
    return shareErrorResponse(e);
  }
}
