/* ============================================
   LOWPASS — Budget Receipt File Upload

   POST: multipart form with "file", "tour_id", "receipt_id".
   Uploads to Supabase Storage bucket "budget-receipts".
   Path: tours/{tour_id}/receipts/{receipt_id}/{filename}
   Returns { url }. Client should PATCH receipt with receipt_file_url.
   ============================================ */

import { NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase-server';

const BUCKET = 'budget-receipts';
const MAX_SIZE = 10 * 1024 * 1024; // 10MB
const ALLOWED_TYPES = ['application/pdf', 'image/jpeg', 'image/png', 'image/gif', 'image/webp'];
const ALLOWED_EXT = ['pdf', 'jpg', 'jpeg', 'png', 'gif', 'webp'];

export async function POST(request: Request) {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
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
  const tourId = formData.get('tour_id') as string | null;
  const receiptId = formData.get('receipt_id') as string | null;

  if (!file || !tourId?.trim() || !receiptId?.trim()) {
    return NextResponse.json(
      { error: 'Missing file, tour_id, or receipt_id' },
      { status: 400 }
    );
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

  if (!ALLOWED_TYPES.includes(file.type)) {
    return NextResponse.json(
      { error: 'Allowed types: PDF, JPEG, PNG, GIF, WebP' },
      { status: 400 }
    );
  }
  if (file.size > MAX_SIZE) {
    return NextResponse.json({ error: 'File too large (max 10MB)' }, { status: 400 });
  }

  const ext = file.name.split('.').pop()?.toLowerCase() || '';
  const safeExt = ALLOWED_EXT.includes(ext) ? ext : 'bin';
  const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 80) || 'file';
  const baseName = safeName.replace(/\.[^.]+$/, '');
  const filename = `${baseName}-${Date.now()}.${safeExt}`;
  const path = `tours/${tourId}/receipts/${receiptId}/${filename}`;

  const buffer = Buffer.from(await file.arrayBuffer());
  const { data, error } = await supabase.storage
    .from(BUCKET)
    .upload(path, buffer, {
      contentType: file.type,
      upsert: true,
    });

  if (error) {
    if (error.message?.includes('Bucket not found')) {
      return NextResponse.json(
        { error: 'Storage bucket "budget-receipts" not found. Create it in Supabase Dashboard → Storage.' },
        { status: 503 }
      );
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const { data: urlData } = supabase.storage.from(BUCKET).getPublicUrl(data.path);
  return NextResponse.json({ url: urlData.publicUrl });
}
