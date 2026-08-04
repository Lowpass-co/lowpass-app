/* ============================================
   LOWPASS — /settings (S-3b)

   Workspace settings root. Chrome comes from the (you) layout's
   <ShellV3Mount> (YOU_RAIL, "Preferences" active); the page renders body only.
   SettingsSubNav stays: the rail's Preferences item covers /settings and
   /settings/ai-limits without distinguishing them, so the sub-nav still does
   real work inside the section.
   ============================================ */

import { getUserAndAdminStatus } from '@/lib/site-admin';
import { SiteAdminsCard } from '@/components/settings/SiteAdminsCard';
import { SettingsSubNav } from '@/components/settings/SettingsSubNav';
import { MyAiUsage } from '@/components/settings/MyAiUsage';
import { PageHeader } from '@/components/ui/PageHeader';

export default async function SettingsPage() {
  const { user, isAdmin } = await getUserAndAdminStatus();

  return (
    <>
      <SettingsSubNav pathname="/settings" />
      <div
        className="mx-auto w-full max-w-3xl"
        style={{ padding: 'var(--lp-space-4)' }}
      >
        {/* UX Audit 2026 — uniform page chrome via <PageHeader>. */}
        <PageHeader
          title="Settings"
          subtitle="Workspace settings, roles, and permissions."
          className="mb-6"
        />

        <div className="space-y-6">
          {/* §AI-7 — every member sees their own AI usage this month. */}
          <MyAiUsage />

          {isAdmin && user && <SiteAdminsCard currentUserId={user.id} />}
        </div>
      </div>
    </>
  );
}
