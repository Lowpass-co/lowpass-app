import Link from 'next/link';
import { redirect } from 'next/navigation';
import { createServerSupabaseClient } from '@/lib/supabase-server';
import { PackEditor } from '@/components/rider-pack/PackEditor';

export const dynamic = 'force-dynamic';

export default async function TourRiderPackEditorPage({
  params,
}: {
  params: Promise<{ id: string; packId: string }>;
}) {
  const { id: tourId, packId } = await params;
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data: pack } = await supabase
    .from('rider_packs')
    .select('id, title, tour_id')
    .eq('id', packId)
    .maybeSingle();

  if (!pack) {
    return <div className="p-6 text-sm text-lp-text-secondary">Pack not found.</div>;
  }

  if (pack.tour_id && pack.tour_id !== tourId) {
    redirect(`/tours/${pack.tour_id}/rider-packs/${packId}`);
  }

  return (
    <div>
      <div className="flex items-center gap-2 border-b border-lp-border bg-lp-surface px-6 py-3 text-sm">
        <Link href={`/tours/${tourId}/rider-packs`} className="text-lp-text-secondary hover:text-lp-text">
          ← Rider packs
        </Link>
        <span className="text-lp-text-tertiary">/</span>
        <span className="font-semibold text-lp-text">{pack.title || '(untitled)'}</span>
      </div>
      <PackEditor packId={packId} />
    </div>
  );
}
