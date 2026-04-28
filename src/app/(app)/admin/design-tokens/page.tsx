import { notFound } from 'next/navigation';
import { getUserAndAdminStatus } from '@/lib/site-admin';
import { DesignTokensClient } from '@/components/admin/DesignTokensClient';
import { topBarOnlyAppPageShell } from '@/components/shell/app-page-shells';

export default async function DesignTokensPage() {
  const { user, isAdmin } = await getUserAndAdminStatus();
  if (!user || !isAdmin) {
    notFound();
  }

  return topBarOnlyAppPageShell(
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="mb-4">
        <h1 className="text-2xl font-bold" style={{ color: 'var(--lp-text)' }}>
          Design Tokens
        </h1>
        <p className="mt-1 text-sm" style={{ color: 'var(--lp-text-secondary)' }}>
          Visual reference for every Lowpass design token. Use this page when authoring components.
        </p>
      </div>
      <DesignTokensClient />
    </div>
  );
}
