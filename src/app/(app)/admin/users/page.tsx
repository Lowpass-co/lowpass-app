/* ============================================
   LOWPASS — /admin/users (Sprint 9 §10)
   ============================================ */

import { redirect } from 'next/navigation';
import { createServerSupabaseClient } from '@/lib/supabase-server';
import { AdminSubNav } from '@/components/admin/AdminSubNav';
import { UsersListClient } from '@/components/admin/UsersListClient';

export const dynamic = 'force-dynamic';

export default async function AdminUsersPage() {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login?next=/admin/users');

  return (
    <div style={{ display: 'flex', flexDirection: 'column', minHeight: 0 }}>
      <AdminSubNav activeId="users" />
      <div
        className="mx-auto w-full"
        style={{
          flex: 1,
          minWidth: 0,
          padding: 'var(--lp-space-4)',
          maxWidth: 1200,
        }}
      >
        <header style={{ marginBottom: 'var(--lp-space-3)' }}>
          <h1
            style={{
              margin: 0,
              fontSize: 'var(--lp-text-2xl)',
              fontWeight: 'var(--lp-weight-bold)',
              color: 'var(--lp-text)',
            }}
          >
            Users
          </h1>
          <p
            style={{
              marginTop: 4,
              fontSize: 'var(--lp-text-sm)',
              color: 'var(--lp-text-secondary)',
            }}
          >
            Cross-workspace user management. All actions are audit-logged.
          </p>
        </header>
        <UsersListClient currentUserId={user.id} />
      </div>
    </div>
  );
}
