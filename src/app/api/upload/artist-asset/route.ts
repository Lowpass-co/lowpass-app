/* ============================================
   LOWPASS — Artist Asset Upload (logo / banner)

   POST: multipart form with "file" and "type" (logo|banner).
   Uploads to Supabase Storage bucket "artist-assets".
   Returns { url } for use in artist branding.
   ============================================ */

import { NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase-server';

const BUCKET = 'artist-assets';
const MAX_SIZE = 5 * 1024 * 1024; // 5MB
const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];

export async function POST(request: Request) {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return NextResponse.json({ error: 'Invalid form data' }, { status: 400 });
  }

  const file = formData.get('file') as File | null;
  const type = formData.get('type') as string | null;
  if (!file || !type || !['logo', 'banner'].includes(type)) {
    return NextResponse.json(
      { error: 'Missing or invalid "file" and "type" (logo or banner)' },
      { status: 400 }
    );
  }

  if (!ALLOWED_TYPES.includes(file.type)) {
    return NextResponse.json(
      { error: 'Allowed types: JPEG, PNG, WebP, GIF' },
      { status: 400 }
    );
  }
  if (file.size > MAX_SIZE) {
    return NextResponse.json({ error: 'File too large (max 5MB)' }, { status: 400 });
  }

  const ext = file.name.split('.').pop()?.toLowerCase() || 'png';
  const safeExt = ['jpg', 'jpeg', 'png', 'webp', 'gif'].includes(ext) ? ext : 'png';
  const path = `${user.id}/${type}-${Date.now()}.${safeExt}`;

  const buffer = Buffer.from(await file.arrayBuffer());
  const { data, error } = await supabase.storage
    .from(BUCKET)
    .upload(path, buffer, {
      contentType: file.type,
      upsert: false,
    });

  if (error) {
    console.error('[artist-asset upload] Supabase storage error:', error);
    if (error.message?.includes('Bucket not found')) {
      return NextResponse.json(
        { error: 'Storage bucket "artist-assets" not found. Create it in Supabase Dashboard → Storage.' },
        { status: 503 }
      );
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const { data: urlData } = supabase.storage.from(BUCKET).getPublicUrl(data.path);
  return NextResponse.json({ url: urlData.publicUrl });
}
