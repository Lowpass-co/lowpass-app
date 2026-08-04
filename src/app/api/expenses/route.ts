/* ============================================
   LOWPASS — Expenses API (canonical table, UX19)

   GET ?tour_id= (required for list), ?limit=, ?q= optional search on category/description
   POST multipart: expense fields + file
   ============================================ */

import { NextResponse } from 'next/server';
import { requireWrite } from '@/lib/auth/workspace-check';
import { createServerSupabaseClient } from '@/lib/supabase-server';

const BUCKET = 'receipts';
const MAX_BYTES = 10 * 1024 * 1024;

function safeFilename(name: string): string {
  const ext = name.split('.').pop()?.toLowerCase() ?? 'jpg';
  const safeExt = ['jpg', 'jpeg', 'png', 'gif', 'webp', 'heic'].includes(ext) ? ext : 'jpg';
  const base = name.replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 72) || 'receipt';
  return `${base.replace(/\.[^.]+$/, '')}-${Date.now()}.${safeExt}`;
}

export async function GET(request: Request) {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('workspace_id')
    .eq('id', user.id)
    .single();

  if (!profile?.workspace_id) {
    return NextResponse.json({ error: 'No workspace' }, { status: 403 });
  }

  const url = new URL(request.url);
  const tourId = url.searchParams.get('tour_id');
  const q = (url.searchParams.get('q') ?? '').trim();
  const limit = Math.min(50, Math.max(1, parseInt(url.searchParams.get('limit') ?? '25', 10)));

  if (!tourId) {
    return NextResponse.json({ error: 'tour_id is required' }, { status: 400 });
  }

  let query = supabase
    .from('expenses')
    .select('*')
    .eq('workspace_id', profile.workspace_id)
    .eq('tour_id', tourId)
    .order('submitted_at', { ascending: false })
    .limit(limit);

  if (q.length > 0) {
    query = query.or(`category.ilike.%${q}%,description.ilike.%${q}%`);
  }

  const { data: rows, error } = await query;

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const expenses = [];
  for (const row of rows ?? []) {
    let receipt_signed_url: string | null = null;
    const path = row.receipt_url as string | null;
    if (path) {
      const { data: signed } = await supabase.storage.from(BUCKET).createSignedUrl(path, 3600);
      receipt_signed_url = signed?.signedUrl ?? null;
    }
    expenses.push({ ...row, receipt_signed_url });
  }

  return NextResponse.json({ expenses });
}

export async function POST(request: Request) {
  const supabase = await createServerSupabaseClient();
  const auth = await requireWrite(supabase);
  if ('error' in auth) return auth.error;
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('workspace_id')
    .eq('id', user.id)
    .single();

  if (!profile?.workspace_id) {
    return NextResponse.json({ error: 'No workspace' }, { status: 403 });
  }

  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return NextResponse.json({ error: 'Invalid form data' }, { status: 400 });
  }

  const file = formData.get('file') as File | null;
  const expenseId = (formData.get('id') as string | null)?.trim();
  const tourId = (formData.get('tour_id') as string | null)?.trim();
  const category = (formData.get('category') as string | null)?.trim();
  const currency = ((formData.get('currency') as string | null) ?? 'GBP').trim().toUpperCase();
  const amountRaw = formData.get('amount') as string | null;
  const spentAt = (formData.get('spent_at') as string | null)?.trim();
  const showId = (formData.get('show_id') as string | null)?.trim() || null;
  const description = (formData.get('description') as string | null)?.trim() || null;
  const city = (formData.get('city') as string | null)?.trim() || null;
  const country = (formData.get('country') as string | null)?.trim() || null;
  const personId = (formData.get('person_id') as string | null)?.trim() || null;

  if (!file || !expenseId || !tourId || !category || !spentAt) {
    return NextResponse.json(
      { error: 'Missing required fields: file, id, tour_id, category, spent_at' },
      { status: 400 }
    );
  }

  const amount = Number(amountRaw);
  if (!Number.isFinite(amount) || amount <= 0) {
    return NextResponse.json({ error: 'Invalid amount' }, { status: 400 });
  }

  if (file.size > MAX_BYTES) {
    return NextResponse.json({ error: 'File too large (max 10MB)' }, { status: 400 });
  }

  const { data: tour } = await supabase
    .from('tours')
    .select('id')
    .eq('id', tourId)
    .eq('workspace_id', profile.workspace_id)
    .single();

  if (!tour) {
    return NextResponse.json({ error: 'Tour not found' }, { status: 404 });
  }

  if (showId) {
    const { data: rt } = await supabase
      .from('routing')
      .select('id')
      .eq('id', showId)
      .eq('tour_id', tourId)
      .single();
    if (!rt) {
      return NextResponse.json({ error: 'Invalid show / routing for this tour' }, { status: 400 });
    }
  }

  if (personId) {
    const { data: p } = await supabase
      .from('persons')
      .select('id')
      .eq('id', personId)
      .eq('workspace_id', profile.workspace_id)
      .single();
    if (!p) {
      return NextResponse.json({ error: 'Invalid person' }, { status: 400 });
    }
  }

  const filename = safeFilename(file.name);
  const storagePath = `${profile.workspace_id}/${expenseId}/${filename}`;
  const buffer = Buffer.from(await file.arrayBuffer());
  const contentType = file.type || 'image/jpeg';

  const { error: upErr } = await supabase.storage.from(BUCKET).upload(storagePath, buffer, {
    contentType,
    upsert: true,
  });

  if (upErr) {
    if (upErr.message?.includes('Bucket not found')) {
      return NextResponse.json(
        { error: 'Storage bucket "receipts" not configured. Run migration 055 and create bucket in Supabase.' },
        { status: 503 }
      );
    }
    return NextResponse.json({ error: upErr.message }, { status: 500 });
  }

  const { data: inserted, error: insertErr } = await supabase
    .from('expenses')
    .insert({
      id: expenseId,
      workspace_id: profile.workspace_id,
      tour_id: tourId,
      show_id: showId,
      amount,
      currency,
      category,
      description,
      spent_at: spentAt,
      city,
      country,
      receipt_url: storagePath,
      receipt_filename: filename,
      submitted_by: user.id,
      person_id: personId,
      status: 'submitted',
    })
    .select()
    .single();

  if (insertErr) {
    await supabase.storage.from(BUCKET).remove([storagePath]);
    return NextResponse.json({ error: insertErr.message }, { status: 500 });
  }

  let receipt_signed_url: string | null = null;
  const { data: signed } = await supabase.storage.from(BUCKET).createSignedUrl(storagePath, 3600);
  receipt_signed_url = signed?.signedUrl ?? null;

  return NextResponse.json({
    expense: { ...inserted, receipt_signed_url },
  });
}
