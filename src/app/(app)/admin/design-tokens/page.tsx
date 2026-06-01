import { notFound } from 'next/navigation';
import { getUserAndAdminStatus } from '@/lib/site-admin';
import { DesignTokensClient } from '@/components/admin/DesignTokensClient';
import { topBarOnlyAppPageShell } from '@/components/shell/app-page-shells';
import { PageHeader } from '@/components/ui/PageHeader';

export default async function DesignTokensPage() {
  const { user, isAdmin } = await getUserAndAdminStatus();
  if (!user || !isAdmin) {
    notFound();
  }

  return topBarOnlyAppPageShell(
    <div className="flex min-h-0 flex-1 flex-col">
      <PageHeader
        title="Design Tokens"
        subtitle="Visual reference for every Lowpass design token. Use this page when authoring components."
        className="mb-4"
      />
      <DesignTokensClient />
    </div>
  );
}
