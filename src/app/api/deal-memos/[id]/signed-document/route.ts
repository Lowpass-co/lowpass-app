import { NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase-server';
import { resolveDealMemoDocStoragePath } from '@/lib/deal-memos/storagePath';

type Params = { params: Promise<{ id: string }> };

/** Signed URL for viewing/downloading the memo document from private bucket. */
export async function GET(_: Request, { params }: Params) {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id } = await params;

  const { data: row } = await supabase.from('deal_memos').select('document_url').eq('id', id).maybeSingle();
  if (!row?.document_url) return NextResponse.json({ error: 'No document' }, { status: 404 });

  const path = resolveDealMemoDocStoragePath(row.document_url as string);
  if (!path) return NextResponse.json({ error: 'No document' }, { status: 404 });

  const { data, error } = await supabase.storage.from('deal-memos').createSignedUrl(path, 3600);
  if (error || !data?.signedUrl) {
    return NextResponse.json({ error: error?.message ?? 'Signed URL failed' }, { status: 500 });
  }

  return NextResponse.json({ url: data.signedUrl });
}
