/* ============================================
   LOWPASS — /grid-demo gate (Nav & entry fixpack, item 5)

   /grid-demo is a throwaway dev harness for the canonical <Grid> (see
   docs/smoke-tests/grid.md), not a product surface — but it had no gate,
   so any authenticated user could reach it in production. Gate it behind
   the site-admin check (mirrors /bugs → notFound for non-admins). The
   client page below is unchanged; this server layout does the gating.
   ============================================ */

import type { ReactNode } from 'react';
import { notFound } from 'next/navigation';
import { getUserAndAdminStatus } from '@/lib/site-admin';

export const dynamic = 'force-dynamic';

export default async function GridDemoLayout({ children }: { children: ReactNode }) {
  const { isAdmin } = await getUserAndAdminStatus();
  if (!isAdmin) notFound();
  return <>{children}</>;
}
