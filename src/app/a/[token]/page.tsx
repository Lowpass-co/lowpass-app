/* ============================================
   LOWPASS — Public Advance Packet page (Sprint 12 §11c)

   /a/[token] — token-gated public reader. Server component
   just extracts the token + mounts the client view; the
   client handles password flow + manifest fetch + download
   button.
   ============================================ */

import { PublicPacketView } from '@/components/advance-packet/PublicPacketView';

export const dynamic = 'force-dynamic';

export default async function PublicPacketPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  return <PublicPacketView token={token} />;
}
