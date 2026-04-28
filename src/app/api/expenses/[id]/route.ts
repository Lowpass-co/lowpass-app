import { NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase-server';

const BUCKET = 'receipts';

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
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

  const { data: row, error } = await supabase
    .from('expenses')
    .select('*')
    .eq('id', id)
    .eq('workspace_id', profile.workspace_id)
    .single();

  if (error || !row) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  let receipt_signed_url: string | null = null;
  if (row.receipt_url) {
    const { data: signed } = await supabase.storage.from(BUCKET).createSignedUrl(row.receipt_url as string, 3600);
    receipt_signed_url = signed?.signedUrl ?? null;
  }

  return NextResponse.json({ expense: { ...row, receipt_signed_url } });
}
