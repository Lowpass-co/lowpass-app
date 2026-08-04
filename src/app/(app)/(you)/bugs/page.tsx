/* ============================================
   LOWPASS — /bugs (S-3b)

   Site-admin bug reports surface. Admin gate via getUserAndAdminStatus stays.
   Chrome comes from the (you) layout's <ShellV3Mount> (YOU_RAIL, "Report a
   bug" active); the page renders body only.
   ============================================ */

import { notFound } from 'next/navigation';
import { BugReportsClient } from '@/components/bug-report/BugReportsClient';
import { getUserAndAdminStatus } from '@/lib/site-admin';
import { PageHeader } from '@/components/ui/PageHeader';

export default async function BugReportsPage() {
  const { user, isAdmin } = await getUserAndAdminStatus();
  if (!user || !isAdmin) {
    notFound();
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col p-4">
      {/* UX Audit 2026 — uniform page chrome via <PageHeader>. */}
      <PageHeader
        title="Bug Reports"
        subtitle="Triage, assign, and resolve reported issues. Click a row to see full details."
        className="mb-4"
      />
      <BugReportsClient />
    </div>
  );
}
