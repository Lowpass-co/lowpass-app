import { notFound } from 'next/navigation';
import { topBarOnlyAppPageShell } from '@/components/shell/app-page-shells';
import { getUserAndAdminStatus } from '@/lib/site-admin';
import { PageHeader } from '@/components/ui/PageHeader';
import SpreadsheetPlaygroundClient from './SpreadsheetPlaygroundClient';

export default async function SpreadsheetPlaygroundPage() {
  const { user, isAdmin } = await getUserAndAdminStatus();
  if (!user || !isAdmin) {
    notFound();
  }

  return topBarOnlyAppPageShell(
    <div className="flex min-h-0 flex-1 flex-col">
      <PageHeader
        title="SpreadsheetGrid playground"
        subtitle="UX06 — data-entry grid (admin only). Budget, payroll, and channel list mocks."
        className="mb-4"
      />
      <SpreadsheetPlaygroundClient />
    </div>
  );
}
