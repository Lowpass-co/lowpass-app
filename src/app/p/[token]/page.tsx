/* ============================================
   LOWPASS — Driver link to a parking map (Nov 2026, migration 289)

   /p/[token] — what a driver sees. Outside the (app) shell on purpose: no
   account, no app nav. Public via publicRoutes.ts '/p/'; every read goes
   through /api/public/parking/[token], which owns the token, expiry,
   revocation, scope and the 3D-open cap.
   ============================================ */

import type { Metadata } from 'next';
import { PublicParkingView } from '@/components/parking/PublicParkingView';
import { createServiceSupabaseClient } from '@/lib/supabase-server';
import { driverLinkTitle } from '@/server/parking/driverLinks';

export const dynamic = 'force-dynamic';

/** Chat previews name the venue and date ("Parking · The O2 · Fri 20 Nov") so
 *  a driver's links for different shows don't look the same. Read-only — a
 *  preview isn't a view. */
export async function generateMetadata({ params }: { params: Promise<{ token: string }> }): Promise<Metadata> {
  const { token } = await params;
  let title: string | null = null;
  try {
    title = await driverLinkTitle(createServiceSupabaseClient(), token);
  } catch {
    title = null;
  }
  return {
    title: title ?? 'Parking map',
    description: 'Where to park, with directions to the gate.',
    robots: { index: false, follow: false },
    // No openGraph here: a page-level openGraph replaces the root's (and the
    // preview already reads the <title>, as "Parking map | Lowpass" did).
  };
}

export default async function DriverParkingPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  return <PublicParkingView token={token} />;
}
