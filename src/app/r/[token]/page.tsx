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
  searchParams,
}: {
  params: Promise<{ token: string }>;
  /* Sprint 12 §10 — ?print=1 strips the password form chrome
     + applies the @media print page-break stylesheet so the
     browser's built-in "Save as PDF" gives the same output as
     /api/rider-packs/[id]/pdf. Not consulted by Puppeteer
     itself (the API route renders server-side) — this is the
     user-facing "print this rider yourself" path. */
  searchParams: Promise<{ print?: string }>;
}) {
  const [{ token }, sp] = await Promise.all([params, searchParams]);
  const printMode = sp.print === '1';
  return <PublicRiderView token={token} printMode={printMode} />;
}
