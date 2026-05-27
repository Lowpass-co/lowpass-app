/* ============================================
   LOWPASS — /bugs (IA Cleanup §I4.2)

   Site-admin bug reports surface. Admin gate via
   getUserAndAdminStatus stays. Migrated from shell-v1
   PageShell to ProductShell with active=null per the
   two-tier IA. Reachable from the avatar dropdown (admin
   only) on shell-v2 chrome.
   ============================================ */

import { notFound } from 'next/navigation';
import { BugReportsClient } from '@/components/bug-report/BugReportsClient';
import { getUserAndAdminStatus } from '@/lib/site-admin';
import { ProductShell } from '@/components/shell-v2';

export default async function BugReportsPage() {
  const { user, isAdmin } = await getUserAndAdminStatus();
  if (!user || !isAdmin) {
    notFound();
  }

  return (
    <ProductShell active={null} artistId={null} productName="Bug reports">
      <div className="flex min-h-0 flex-1 flex-col p-4">
        <div className="mb-4">
          <h1 className="text-2xl font-bold" style={{ color: 'var(--lp-text)' }}>
            Bug Reports
          </h1>
          <p className="mt-1 text-sm" style={{ color: 'var(--lp-text-secondary)' }}>
            Triage, assign, and resolve reported issues. Click a row to see full details.
          </p>
        </div>
        <BugReportsClient />
      </div>
    </ProductShell>
  );
}
