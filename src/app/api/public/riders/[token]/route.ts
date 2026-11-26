/* ============================================
   POST /api/public/riders/[token] — what a promoter does on the live rider
   (no session: the unguessable token IS the grant; service role after the
   token check in server/riders/public.ts).
     { action: 'ack',   versionId, name, company?, email? }  "I've read vX.Y"
     { action: 'reply', blockId, body, name? }               a note on a line
   Capped per link per hour (counted from the rows themselves).
   ============================================ */

import { NextResponse } from 'next/server';
import type { SupabaseClient } from '@supabase/supabase-js';
import { createServiceSupabaseClient } from '@/lib/supabase-server';
import { readJson } from '@/server/advance/routeGuard';
import { ackPublic, replyPublic, TOKEN_RE } from '@/server/riders/public';
import { riderErrorResponse } from '@/server/riders/http';

export const dynamic = 'force-dynamic';

export async function POST(request: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  if (!TOKEN_RE.test(token)) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  const body = (await readJson<Record<string, unknown>>(request)) ?? {};
  const service = createServiceSupabaseClient() as unknown as SupabaseClient;
  try {
    if (body.action === 'ack') return NextResponse.json(await ackPublic(service, token, body));
    if (body.action === 'reply') return NextResponse.json({ reply: await replyPublic(service, token, body) });
    return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
  } catch (e) {
    return riderErrorResponse(e, `public:${String(body.action)}`);
  }
}
