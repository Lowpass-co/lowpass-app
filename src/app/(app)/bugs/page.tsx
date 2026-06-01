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
import { PageHeader } from '@/components/ui/PageHeader';

export default async function BugReportsPage() {
  const { user, isAdmin } = await getUserAndAdminStatus();
  if (!user || !isAdmin) {
    notFound();
  }

  return (
    <ProductShell active={null} artistId={null} productName="Bug reports">
      <div className="flex min-h-0 flex-1 flex-col p-4">
        {/* UX Audit 2026 — uniform page chrome via <PageHeader>. */}
        <PageHeader
          title="Bug Reports"
          subtitle="Triage, assign, and resolve reported issues. Click a row to see full details."
          className="mb-4"
        />
        <BugReportsClient />
      </div>
    </ProductShell>
  );
}
