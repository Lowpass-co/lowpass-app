/* ============================================
   LOWPASS — Profile Avatar Upload

   POST: Upload avatar image to bucket "avatars", returns public URL.
   ============================================ */

import { NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase-server';

const BUCKET = 'avatars';
const MAX_SIZE = 2 * 1024 * 1024; // 2MB
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
  if (!file) {
    return NextResponse.json({ error: 'Missing file' }, { status: 400 });
  }

  if (!ALLOWED_TYPES.includes(file.type)) {
    return NextResponse.json(
      { error: 'Allowed types: JPEG, PNG, WebP, GIF' },
      { status: 400 }
    );
  }
  if (file.size > MAX_SIZE) {
    return NextResponse.json({ error: 'File too large (max 2MB)' }, { status: 400 });
  }

  const ext = file.name.split('.').pop()?.toLowerCase() || 'png';
  const safeExt = ['jpg', 'jpeg', 'png', 'webp', 'gif'].includes(ext) ? ext : 'png';
  const path = `${user.id}/avatar-${Date.now()}.${safeExt}`;

  const buffer = Buffer.from(await file.arrayBuffer());
  const { data, error } = await supabase.storage
    .from(BUCKET)
    .upload(path, buffer, { contentType: file.type, upsert: false });

  if (error) {
    if (error.message?.includes('Bucket not found')) {
      return NextResponse.json(
        { error: 'Storage bucket "avatars" not found. Create it in Supabase Dashboard → Storage.' },
        { status: 503 }
      );
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const { data: urlData } = supabase.storage.from(BUCKET).getPublicUrl(data.path);
  return NextResponse.json({ url: urlData.publicUrl });
}
