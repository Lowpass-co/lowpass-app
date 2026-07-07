/* ============================================
   LOWPASS — /tour-fingerprint-demo gate (Design pass §7)

   A grading harness for the signature <TourFingerprint> so Adam can eyeball the
   three sizes + the popover/wheel/draw-in interactions without the full
   workspace wiring. Site-admin only (mirrors /grid-demo).
   ============================================ */

import type { ReactNode } from 'react';
import { notFound } from 'next/navigation';
import { getUserAndAdminStatus } from '@/lib/site-admin';

export const dynamic = 'force-dynamic';

export default async function TourFingerprintDemoLayout({ children }: { children: ReactNode }) {
  const { isAdmin } = await getUserAndAdminStatus();
  if (!isAdmin) notFound();
  return <>{children}</>;
}
