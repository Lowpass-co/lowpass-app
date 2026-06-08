/* ============================================
   LOWPASS — Site admins API (collection)

   GET:  list current site admins.
         Any authenticated user can view the list (no secrets here);
         the UI that renders it is gated on is_site_admin.

   POST: promote a user to site admin by email.
         Requires the caller to be a site admin.
         Body: { email: string }

   Backed by the Postgres functions in migration 037:
     list_site_admins(), promote_site_admin_by_email(email).
   ============================================ */

import { NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase-server';
import { getUserAndAdminStatus } from '@/lib/site-admin';

export const runtime = 'nodejs';

export async function GET() {
  // Security audit §L2 — the site-admin list (names + emails) is PII and
  // recon value; restrict it to site admins instead of any authenticated
  // user. The settings UI that renders it is already admin-gated.
  const { user, isAdmin } = await getUserAndAdminStatus();
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  if (!isAdmin) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase.rpc('list_site_admins');
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ admins: data ?? [] });
}

export async function POST(request: Request) {
  const { user, isAdmin } = await getUserAndAdminStatus();
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  if (!isAdmin) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  let body: { email?: string } | null;
  try {
    body = (await request.json()) as { email?: string };
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const email = body?.email?.trim().toLowerCase();
  if (!email) {
    return NextResponse.json({ error: 'Email is required' }, { status: 400 });
  }

  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase
    .rpc('promote_site_admin_by_email', { target_email: email })
    .single();

  if (error) {
    const status = error.code === 'P0002' ? 404 : error.code === '42501' ? 403 : 400;
    return NextResponse.json({ error: error.message }, { status });
  }

  return NextResponse.json({ admin: data });
}
