/* ============================================
   LOWPASS — Rider web-links collection

   GET  /api/rider-packs/[id]/web-links
        Returns all links (active + revoked) for the pack.

   POST /api/rider-packs/[id]/web-links
        Body: { password?: string }
        Creates a new link. Password is hashed server-side.
   ============================================ */

import { NextResponse } from 'next/server';
import { requireWrite } from '@/lib/auth/workspace-check';
import { createServerSupabaseClient } from '@/lib/supabase-server';
import { generateToken, hashPassword, type WebLinkPublic } from '@/lib/rider-packs/web-links';

type Row = {
  id: string;
  pack_id: string;
  token: string;
  password_hash: string | null;
  created_by: string | null;
  created_at: string;
  revoked_at: string | null;
  revoked_reason: string | null;
};

function toPublic(row: Row): WebLinkPublic {
  return {
    id: row.id,
    pack_id: row.pack_id,
    token: row.token,
    has_password: row.password_hash != null,
    created_by: row.created_by,
    created_at: row.created_at,
    revoked_at: row.revoked_at,
    revoked_reason: row.revoked_reason,
  };
}

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

  const { id: packId } = await params;
  const { data, error } = await supabase
    .from('rider_web_links')
    .select('*')
    .eq('pack_id', packId)
    .order('created_at', { ascending: false });
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({
    links: (data as Row[]).map(toPublic),
  });
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const supabase = await createServerSupabaseClient();
  const auth = await requireWrite(supabase);
  if ('error' in auth) return auth.error;
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { id: packId } = await params;
  let body: { password?: unknown } = {};
  try {
    body = (await request.json()) as { password?: unknown };
  } catch {
    // Empty body is fine.
  }

  const password =
    typeof body.password === 'string' && body.password.length > 0 ? body.password : null;

  const { data: pack } = await supabase
    .from('rider_packs')
    .select('id')
    .eq('id', packId)
    .maybeSingle();
  if (!pack) {
    return NextResponse.json({ error: 'Pack not found' }, { status: 404 });
  }

  const passwordHash = password ? await hashPassword(password) : null;

  for (let attempt = 0; attempt < 3; attempt += 1) {
    const token = generateToken();
    const { data: inserted, error } = await supabase
      .from('rider_web_links')
      .insert({
        pack_id: packId,
        token,
        password_hash: passwordHash,
        created_by: user.id,
      })
      .select()
      .single();

    if (!error && inserted) {
      return NextResponse.json(toPublic(inserted as Row), { status: 201 });
    }

    if (error && error.code !== '23505') {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
  }

  return NextResponse.json(
    { error: 'Failed to generate a unique token after 3 attempts' },
    { status: 500 },
  );
}
