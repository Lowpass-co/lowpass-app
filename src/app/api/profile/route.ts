/* ============================================
   LOWPASS — Current User Profile API

   GET: Return current user's profile (name, avatar_url, job_title, phone, day_rate, per_diem_rate, etc.)
   PATCH: Update name, job_title, phone, avatar_url, passport_encrypted, day_rate, per_diem_rate.
   ============================================ */

import { NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase-server';
import { encrypt } from '@/lib/crypto';

export async function GET() {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { data: profile, error } = await supabase
    .from('profiles')
    .select('id, email, name, avatar_url, job_title, phone, passport_encrypted, day_rate, per_diem_rate, workspace_id, role_id, is_site_admin')
    .eq('id', user.id)
    .single();

  if (error || !profile) {
    return NextResponse.json({ error: error?.message ?? 'Profile not found' }, { status: profile ? 500 : 404 });
  }

  return NextResponse.json({
    id: profile.id,
    email: profile.email ?? user.email ?? '',
    name: profile.name ?? '',
    avatar_url: profile.avatar_url ?? null,
    job_title: profile.job_title ?? null,
    phone: profile.phone ?? null,
    has_passport: !!profile.passport_encrypted,
    day_rate: profile.day_rate != null ? Number(profile.day_rate) : null,
    per_diem_rate: profile.per_diem_rate != null ? Number(profile.per_diem_rate) : null,
    workspace_id: profile.workspace_id ?? null,
    role_id: profile.role_id ?? null,
    is_site_admin: !!profile.is_site_admin,
  });
}

export async function PATCH(request: Request) {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let body: {
    name?: string;
    job_title?: string | null;
    phone?: string | null;
    avatar_url?: string | null;
    passport_encrypted?: string | null;
    day_rate?: number | null;
    per_diem_rate?: number | null;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (body.name !== undefined) updates.name = typeof body.name === 'string' ? body.name.trim() : '';
  if (body.job_title !== undefined) updates.job_title = body.job_title ?? null;
  if (body.phone !== undefined) updates.phone = body.phone === null || body.phone === '' ? null : String(body.phone);
  if (body.avatar_url !== undefined) updates.avatar_url = body.avatar_url ?? null;
  if (body.passport_encrypted !== undefined) {
    if (body.passport_encrypted === null || body.passport_encrypted === '') {
      updates.passport_encrypted = null;
    } else {
      try {
        updates.passport_encrypted = encrypt(String(body.passport_encrypted));
      } catch {
        return NextResponse.json({ error: 'Encryption not configured (ENCRYPTION_KEY missing)' }, { status: 500 });
      }
    }
  }
  if (body.day_rate !== undefined) updates.day_rate = body.day_rate === null ? null : Number(body.day_rate);
  if (body.per_diem_rate !== undefined) updates.per_diem_rate = body.per_diem_rate === null ? null : Number(body.per_diem_rate);

  const { data, error } = await supabase
    .from('profiles')
    .update(updates)
    .eq('id', user.id)
    .select('id, email, name, avatar_url, job_title, phone, day_rate, per_diem_rate')
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({
    id: data.id,
    email: data.email ?? '',
    name: data.name ?? '',
    avatar_url: data.avatar_url ?? null,
    job_title: data.job_title ?? null,
    phone: data.phone ?? null,
    day_rate: data.day_rate != null ? Number(data.day_rate) : null,
    per_diem_rate: data.per_diem_rate != null ? Number(data.per_diem_rate) : null,
  });
}
