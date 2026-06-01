/* ============================================
   LOWPASS — /admin/workspaces (Sprint 9 §10)
   ============================================ */

import { AdminSubNav } from '@/components/admin/AdminSubNav';
import { WorkspacesListClient } from '@/components/admin/WorkspacesListClient';
import { PageHeader } from '@/components/ui/PageHeader';

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
        <PageHeader
          title="Workspaces"
          subtitle="Cross-workspace listing. Archive soft-deletes (hides from non-site-admin views; data preserved)."
          className="mb-3"
        />
        <WorkspacesListClient />
      </div>
    </div>
  );
}
