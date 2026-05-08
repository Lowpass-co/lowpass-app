import { getUserAndAdminStatus } from '@/lib/site-admin';
import { listAppPageShell } from '@/components/shell/app-page-shells';
import { SiteAdminsCard } from '@/components/settings/SiteAdminsCard';

export default async function SettingsPage() {
  const { user, isAdmin } = await getUserAndAdminStatus();

  return listAppPageShell(
    <div className="mx-auto w-full max-w-3xl">
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
  );
}
