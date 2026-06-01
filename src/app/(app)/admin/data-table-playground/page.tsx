import { notFound } from 'next/navigation';
import { topBarOnlyAppPageShell } from '@/components/shell/app-page-shells';
import { getUserAndAdminStatus } from '@/lib/site-admin';
import { PageHeader } from '@/components/ui/PageHeader';
import DataTablePlaygroundClient from './DataTablePlaygroundClient';

export default async function DataTablePlaygroundPage() {
  const { user, isAdmin } = await getUserAndAdminStatus();
  if (!user || !isAdmin) {
    notFound();
  }

  return topBarOnlyAppPageShell(
    <div className="flex min-h-0 flex-1 flex-col">
      <PageHeader
        title="DataTable playground"
        subtitle="UX05 — list primitive (admin only). Four demos + optional loading skeleton."
        className="mb-4"
      />
      <DataTablePlaygroundClient />
    </div>
  );
}
