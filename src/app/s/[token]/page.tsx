/* ============================================
   LOWPASS — One show link (rider decouple phase B4)

   /s/[token] — THE venue-facing URL for a show: header
   (artist · show · date · venue) + tabs for Advance form ·
   Rider · Channel list · Stage plot · Downloads. Server
   component just extracts the token; the client handles the
   password flow + data fetch (mirrors /a/[token]).

   Outside the (app) shell on purpose — a venue sees a clean
   branded page, no app nav. Public via publicRoutes.ts '/s/'.
   ============================================ */

import { PublicShowView } from '@/components/show-link/PublicShowView';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Show — Lowpass' };

export default async function PublicShowPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  return <PublicShowView token={token} />;
}
