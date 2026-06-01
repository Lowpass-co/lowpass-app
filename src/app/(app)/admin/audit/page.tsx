/* ============================================
   LOWPASS — /admin/audit (Sprint 9 §10)
   ============================================ */

import { AdminSubNav } from '@/components/admin/AdminSubNav';
import { AuditLogClient } from '@/components/admin/AuditLogClient';
import { PageHeader } from '@/components/ui/PageHeader';

export const dynamic = 'force-dynamic';

export default function AdminAuditPage() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', minHeight: 0 }}>
      <AdminSubNav activeId="audit" />
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
          title="Audit log"
          subtitle="Cross-workspace audit trail. Offset pagination — switch to keyset on (created_at, id) when audit_log exceeds ~10K rows (Sprint 12+)."
          className="mb-3"
        />
        <AuditLogClient />
      </div>
    </div>
  );
}
