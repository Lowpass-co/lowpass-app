/* ============================================
   LOWPASS — Settlement File Upload (day-of sheet, deal memo)

   POST: multipart form with "file", "routing_id", "field" (day_of_file | deal_memo_file).
   Uploads to bucket "budget-receipts" path: settlement/{tour_id}/{routing_id}/{field}/{filename}
   Returns { url }.
   ============================================ */

import { NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase-server';

const BUCKET = 'budget-receipts';
const MAX_SIZE = 10 * 1024 * 1024;
const ALLOWED_TYPES = ['application/pdf', 'image/jpeg', 'image/png', 'image/gif', 'image/webp'];

export async function POST(request: Request) {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { data: profile } = await supabase.from('profiles').select('workspace_id').eq('id', user.id).single();
  if (!profile?.workspace_id) return NextResponse.json({ error: 'No workspace' }, { status: 403 });

  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return NextResponse.json({ error: 'Invalid form data' }, { status: 400 });
  }

  const file = formData.get('file') as File | null;
  const routingId = formData.get('routing_id') as string | null;
  const field = formData.get('field') as string | null;

  if (!file || !routingId?.trim() || !field?.trim()) {
    return NextResponse.json({ error: 'Missing file, routing_id, or field' }, { status: 400 });
  }
  if (!['day_of_file', 'deal_memo_file'].includes(field)) {
    return NextResponse.json({ error: 'field must be day_of_file or deal_memo_file' }, { status: 400 });
  }

  const { data: routing } = await supabase.from('routing').select('tour_id').eq('id', routingId).single();
  if (!routing?.tour_id) return NextResponse.json({ error: 'Routing not found' }, { status: 404 });

  const { data: tour } = await supabase.from('tours').select('id').eq('id', routing.tour_id).eq('workspace_id', profile.workspace_id).single();
  if (!tour) return NextResponse.json({ error: 'Tour not found' }, { status: 404 });

  if (!ALLOWED_TYPES.includes(file.type)) {
    return NextResponse.json({ error: 'Allowed: PDF, JPEG, PNG, GIF, WebP' }, { status: 400 });
  }
  if (file.size > MAX_SIZE) return NextResponse.json({ error: 'File too large (max 10MB)' }, { status: 400 });

  const ext = file.name.split('.').pop()?.toLowerCase() || 'bin';
  const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 80) || 'file';
  const filename = `${safeName}-${Date.now()}.${ext}`;
  const path = `settlement/${routing.tour_id}/${routingId}/${field}/${filename}`;

  const buffer = Buffer.from(await file.arrayBuffer());
  const { data, error } = await supabase.storage.from(BUCKET).upload(path, buffer, { contentType: file.type, upsert: true });
  if (error) {
    if (error.message?.includes('Bucket not found')) return NextResponse.json({ error: 'Storage bucket not found' }, { status: 503 });
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  const { data: urlData } = supabase.storage.from(BUCKET).getPublicUrl(data.path);
  return NextResponse.json({ url: urlData.publicUrl });
}
