/* ============================================
   LOWPASS — /settings (IA Cleanup §I4.1)

   Workspace settings root. Migrated from shell-v1 PageShell
   to ProductShell with active=null per the two-tier IA — no
   product is the destination, but ProductRail stays visible
   so users get one-click jump-back. Reachable from:
     - WorkspaceTopBar avatar dropdown
     - ProductRail bottom gear icon (artist + tour tiers)
   ============================================ */

import { getUserAndAdminStatus } from '@/lib/site-admin';
import { ProductShell } from '@/components/shell-v2';
import { SiteAdminsCard } from '@/components/settings/SiteAdminsCard';
import { SettingsSubNav } from '@/components/settings/SettingsSubNav';

export default async function SettingsPage() {
  const { user, isAdmin } = await getUserAndAdminStatus();

  return (
    <ProductShell active={null} artistId={null} productName="Settings">
      <SettingsSubNav pathname="/settings" />
      <div
        className="mx-auto w-full max-w-3xl"
        style={{ padding: 'var(--lp-space-4)' }}
      >
        <header className="mb-6">
          <h1 className="text-2xl font-bold text-lp-text">Settings</h1>
          <p className="mt-1 text-sm text-lp-text-secondary">
            Workspace settings, roles, and permissions.
          </p>
        </header>

        {isAdmin && user && (
          <div className="space-y-6">
            <SiteAdminsCard currentUserId={user.id} />
          </div>
        )}
      </div>
    </ProductShell>
  );
}
