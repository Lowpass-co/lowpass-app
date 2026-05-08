/* ============================================
   LOWPASS — /admin/workspaces (Sprint 9 §10)
   ============================================ */

import { AdminSubNav } from '@/components/admin/AdminSubNav';
import { WorkspacesListClient } from '@/components/admin/WorkspacesListClient';

export const dynamic = 'force-dynamic';

export default function AdminWorkspacesPage() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', minHeight: 0 }}>
      <AdminSubNav activeId="workspaces" />
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
            Workspaces
          </h1>
          <p
            style={{
              marginTop: 4,
              fontSize: 'var(--lp-text-sm)',
              color: 'var(--lp-text-secondary)',
            }}
          >
            Cross-workspace listing. Archive soft-deletes (hides from
            non-site-admin views; data preserved).
          </p>
        </header>
        <WorkspacesListClient />
      </div>
    </div>
  );
}
