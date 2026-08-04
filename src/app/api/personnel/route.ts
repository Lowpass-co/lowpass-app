/* ============================================
   LOWPASS — Workspace Personnel (roster)

   GET: List personnel in current user's workspace.
   POST: Create person (LP-##### id auto).
   ============================================ */

import { NextResponse } from 'next/server';
import { requireWrite } from '@/lib/auth/workspace-check';
import { createServerSupabaseClient } from '@/lib/supabase-server';
import {
  DEFAULT_PERSONNEL_STANDARD_RATES,
  nextPersonnelLpId,
} from '@/lib/personnel-workspace';

export async function GET() {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { data: profile } = await supabase
    .from('profiles')
    .select('workspace_id')
    .eq('id', user.id)
    .single();

  if (!profile?.workspace_id) {
    return NextResponse.json({ error: 'No workspace' }, { status: 403 });
  }

  const { data, error } = await supabase
    .from('personnel')
    .select('*')
    .eq('workspace_id', profile.workspace_id)
    .order('lp_id', { ascending: true });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ personnel: data ?? [] });
}

export async function POST(request: Request) {
  const supabase = await createServerSupabaseClient();
  const auth = await requireWrite(supabase);
  if ('error' in auth) return auth.error;
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { data: profile } = await supabase
    .from('profiles')
    .select('workspace_id')
    .eq('id', user.id)
    .single();

  if (!profile?.workspace_id) {
    return NextResponse.json({ error: 'No workspace' }, { status: 403 });
  }

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const name = typeof body.name === 'string' ? body.name.trim() : '';
  if (!name) return NextResponse.json({ error: 'Name is required' }, { status: 400 });

  const lp_id = await nextPersonnelLpId(supabase, profile.workspace_id);

  const standard_rates = {
    ...DEFAULT_PERSONNEL_STANDARD_RATES,
    ...(typeof body.standard_rates === 'object' && body.standard_rates !== null
      ? (body.standard_rates as Record<string, unknown>)
      : {}),
  };

  const passport_info =
    typeof body.passport_info === 'object' && body.passport_info !== null
      ? body.passport_info
      : {};
  const extended_profile =
    typeof body.extended_profile === 'object' && body.extended_profile !== null
      ? body.extended_profile
      : {};

  const insert = {
    workspace_id: profile.workspace_id,
    lp_id,
    name,
    role: typeof body.role === 'string' ? body.role : '',
    email: body.email != null ? String(body.email).trim() || null : null,
    phone: body.phone != null ? String(body.phone).trim() || null : null,
    home_airport: body.home_airport != null ? String(body.home_airport).trim() || null : null,
    dietary_needs: body.dietary_needs != null ? String(body.dietary_needs).trim() || null : null,
    merch_size: body.merch_size != null ? String(body.merch_size).trim() || null : null,
    preferences: body.preferences != null ? String(body.preferences).trim() || null : null,
    standard_rates,
    passport_info,
    extended_profile,
  };

  let { data, error } = await supabase.from('personnel').insert(insert).select().single();

  if (
    error &&
    (error.message?.includes('extended_profile') || error.message?.includes('schema cache'))
  ) {
    const { extended_profile: _e, ...withoutExt } = insert as typeof insert & { extended_profile?: unknown };
    const retry = await supabase.from('personnel').insert(withoutExt).select().single();
    data = retry.data;
    error = retry.error;
  }

  if (error) {
    if (error.code === '23505') {
      return NextResponse.json({ error: 'Duplicate LP id — retry' }, { status: 409 });
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Sprint 9 §13.A.5 — keep the personnel.id == persons.id
  // convention (codified by migration 050) for NEW rows. Without
  // a parallel persons row, entityRouting.open({ kind: 'person',
  // id }) would surface "Person not found" because the entity
  // registry queries the persons table. Best-effort UPSERT
  // (ignore failure — the personnel row is still usable; the
  // detail slide-over via personnel routes still works).
  if (data?.id) {
    const { error: personErr } = await supabase
      .from('persons')
      .upsert(
        {
          id: data.id as string,
          workspace_id: profile.workspace_id,
          full_name: name,
          email: typeof body.email === 'string' ? body.email.trim() || null : null,
          phone: typeof body.phone === 'string' ? body.phone.trim() || null : null,
        },
        { onConflict: 'id', ignoreDuplicates: false },
      );
    if (personErr) {
      // Don't fail the create — log + continue. Worst case the
      // user lands on the personnel row but entity routing
      // briefly says "not found" until they refresh.
      console.error('[personnel POST] persons sibling upsert failed:', personErr);
    }
  }

  return NextResponse.json(data);
}
