import { notFound } from 'next/navigation';
import { BugReportsClient } from '@/components/bug-report/BugReportsClient';
import { getUserAndAdminStatus } from '@/lib/site-admin';
import { listAppPageShell } from '@/components/shell/app-page-shells';

export default async function BugReportsPage() {
  const { user, isAdmin } = await getUserAndAdminStatus();
  if (!user || !isAdmin) {
    notFound();
  }

  return listAppPageShell(
    <div className="flex min-h-0 flex-1 flex-col">
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
  );
}
