/* ============================================
   LOWPASS — Public rider page

   Server component. Just extracts the token from
   the URL and renders the client component that
   handles password flow + fetch + render.
   ============================================ */

import { PublicRiderView } from '@/components/rider-pack/PublicRiderView';

export const dynamic = 'force-dynamic';

export default async function PublicRiderPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  return <PublicRiderView token={token} />;
}
