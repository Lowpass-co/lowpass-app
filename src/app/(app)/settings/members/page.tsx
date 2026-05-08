/* ============================================
   LOWPASS — /settings/members (Sprint 9 §3)

   Admin-only members management page. Wraps
   <MembersListClient> in the existing settings document-shell
   chrome so the sidebar layout matches /settings/* siblings.

   Admin gating happens at TWO layers:
     1. This page reads workspace_members.role for the caller.
        Non-admins see a 403 panel with a link back to /settings.
     2. The /api/workspaces/members endpoint internally calls
        list_workspace_members RPC which returns empty for
        non-admins. So even if a non-admin gets the page (via
        race or stale render), they see no data.

   Sprint 9 §3 commit message will list both gates.
   ============================================ */

import Link from 'next/link';
import { redirect } from 'next/navigation';
import { documentSectionsAppPageShell } from '@/components/shell/app-page-shells';
import { getSettingsLeftRail } from '@/lib/shell/rails/settingsSections';
import { createServerSupabaseClient } from '@/lib/supabase-server';
import { getUserAndAdminStatus } from '@/lib/site-admin';
import { MembersListClient } from '@/components/settings/members/MembersListClient';

export const dynamic = 'force-dynamic';

export default async function SettingsMembersPage() {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login?next=/settings/members');

  // Resolve active workspace + admin role for this workspace.
  const { data: profile } = await supabase
    .from('profiles')
    .select('workspace_id')
    .eq('id', user.id)
    .maybeSingle();
  const workspaceId = (profile as { workspace_id?: string | null } | null)
    ?.workspace_id ?? null;

  let isAdmin = false;
  let workspaceName = '';
  if (workspaceId) {
    const { data: membership } = await supabase
      .from('workspace_members')
      .select('role')
      .eq('user_id', user.id)
      .eq('workspace_id', workspaceId)
      .maybeSingle();
    isAdmin = (membership as { role?: string } | null)?.role === 'admin';

    const { data: ws } = await supabase
      .from('workspaces')
      .select('name')
      .eq('id', workspaceId)
      .maybeSingle();
    workspaceName = (ws as { name?: string } | null)?.name ?? '';
  }

  const { isAdmin: isSiteAdmin } = await getUserAndAdminStatus();

  return documentSectionsAppPageShell(
    <div
      className="mx-auto w-full"
      style={{ maxWidth: 880, padding: 'var(--lp-space-4)' }}
    >
      <header style={{ marginBottom: 'var(--lp-space-4)' }}>
        <h1
          style={{
            fontSize: 'var(--lp-text-2xl)',
            fontWeight: 'var(--lp-weight-bold)',
            color: 'var(--lp-text)',
          }}
        >
          {workspaceName || 'Workspace'}
        </h1>
        <p
          style={{
            marginTop: 4,
            fontSize: 'var(--lp-text-sm)',
            color: 'var(--lp-text-secondary)',
          }}
        >
          Manage who can see and edit data in this workspace.
        </p>
      </header>

      {!isAdmin ? (
        <div
          role="alert"
          style={{
            padding: 'var(--lp-space-4)',
            background: 'var(--lp-panel)',
            border: '1px solid var(--lp-border-strong)',
            borderRadius: 'var(--lp-radius-md)',
          }}
        >
          <h2
            style={{
              margin: 0,
              fontSize: 'var(--lp-text-base)',
              fontWeight: 'var(--lp-weight-semibold)',
              color: 'var(--lp-text)',
            }}
          >
            Admin only
          </h2>
          <p
            style={{
              marginTop: 'var(--lp-space-1)',
              fontSize: 'var(--lp-text-sm)',
              color: 'var(--lp-text-secondary)',
            }}
          >
            Members management is restricted to workspace admins. Ask an admin to
            adjust your role if you need access.
          </p>
          <div style={{ marginTop: 'var(--lp-space-3)' }}>
            <Link
              href="/settings"
              style={{
                fontSize: 'var(--lp-text-sm)',
                color: 'var(--color-lp-orange)',
                textDecoration: 'underline',
              }}
            >
              Back to settings
            </Link>
          </div>
        </div>
      ) : (
        <MembersListClient currentUserId={user.id} />
      )}
    </div>,
    getSettingsLeftRail('members', { isSiteAdmin }),
  );
}
