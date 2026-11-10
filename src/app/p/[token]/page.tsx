/* ============================================
   LOWPASS — Driver link to a parking map (Nov 2026, migration 289)

   /p/[token] — what a driver sees. Outside the (app) shell on purpose: no
   account, no app nav. Public via publicRoutes.ts '/p/'; every read goes
   through /api/public/parking/[token], which owns the token, expiry,
   revocation, scope and the 3D-open cap.
   ============================================ */

import { PublicParkingView } from '@/components/parking/PublicParkingView';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Parking map — Lowpass', robots: { index: false, follow: false } };

export default async function DriverParkingPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  return <PublicParkingView token={token} />;
}
