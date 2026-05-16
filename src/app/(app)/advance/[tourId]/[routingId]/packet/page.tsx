/* ============================================
   LOWPASS — Advance Packet page (Sprint 12 §11b)

   /advance/[tourId]/[routingId]/packet — server component
   that fetches the manifest + active share link and mounts
   the client packet view.

   Lives under /advance/[tourId]/layout.tsx so it inherits
   <ProductShell> + <TourHeader> automatically — keeps the
   nav consistent with the rest of the Advance product.
   ============================================ */

import { notFound } from 'next/navigation';
import { createServerSupabaseClient } from '@/lib/supabase-server';
import { getPacketManifest } from '@/lib/advance-packet/manifest';
import { PacketView } from '@/components/advance-packet/PacketView';

export const dynamic = 'force-dynamic';

interface PacketLinkRow {
  id: string;
  token: string;
  password_hash: string | null;
  created_at: string;
  last_viewed_at: string | null;
}

export default async function AdvancePacketPage({
  params,
}: {
  params: Promise<{ tourId: string; routingId: string }>;
}) {
  const { tourId, routingId } = await params;

  const supabase = await createServerSupabaseClient();
  const manifest = await getPacketManifest(supabase, tourId, routingId);
  if (!manifest) notFound();

  /* Latest non-revoked share link for this packet. RLS limits
     us to the caller's workspace automatically. */
  const { data: linkRow } = await supabase
    .from('advance_packet_links')
    .select('id, token, password_hash, created_at, last_viewed_at')
    .eq('tour_id', tourId)
    .eq('routing_id', routingId)
    .is('revoked_at', null)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle<PacketLinkRow>();

  const initialLink = linkRow
    ? {
        id: linkRow.id,
        token: linkRow.token,
        has_password: !!linkRow.password_hash,
        created_at: linkRow.created_at,
        last_viewed_at: linkRow.last_viewed_at,
      }
    : null;

  return (
    <PacketView
      tourId={tourId}
      routingId={routingId}
      manifest={manifest}
      initialLink={initialLink}
    />
  );
}
