/* ============================================
   LOWPASS — Budget Receipt signed-URL (Receipts overhaul B1)

   GET ?receipt_id=<uuid> → a short-lived SIGNED URL for the receipt's stored
   file. The `budget-receipts` bucket is PRIVATE (migration 063), so files are
   served via signed URLs, never public ones. Workspace-scoped through the
   receipts row (RLS), so a caller can only sign files in their own workspace.

   `receipt_file_url` holds the storage PATH (what the upload route now returns).
   A legacy full-URL value is returned as-is (it won't render if it was a broken
   public URL, but we don't try to re-derive a path from it).
   ============================================ */

import { NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase-server';

const BUCKET = 'budget-receipts';
const TTL_SECONDS = 3600;

export async function GET(request: Request) {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { data: profile } = await supabase
    .from('profiles')
    .select('workspace_id')
    .eq('id', user.id)
    .maybeSingle();
  if (!profile?.workspace_id) return NextResponse.json({ error: 'No workspace' }, { status: 403 });

  const receiptId = new URL(request.url).searchParams.get('receipt_id');
  if (!receiptId) return NextResponse.json({ error: 'receipt_id is required' }, { status: 400 });

  // RLS + the workspace filter scope this to the caller's workspace.
  const { data: receipt } = await supabase
    .from('expense_receipts')
    .select('receipt_file_url')
    .eq('id', receiptId)
    .eq('workspace_id', profile.workspace_id)
    .maybeSingle();
  if (!receipt) return NextResponse.json({ error: 'Receipt not found' }, { status: 404 });

  const stored = (receipt.receipt_file_url as string | null) ?? null;
  if (!stored) return NextResponse.json({ url: null });
  // Legacy full URL (pre-B1) — hand back unchanged; new rows store a path.
  if (/^https?:\/\//i.test(stored)) return NextResponse.json({ url: stored });

  const { data: signed, error } = await supabase.storage.from(BUCKET).createSignedUrl(stored, TTL_SECONDS);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ url: signed?.signedUrl ?? null });
}
