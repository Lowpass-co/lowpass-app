/* ============================================
   LOWPASS — /admin/audit (Sprint 9 §10)
   ============================================ */

import { AdminSubNav } from '@/components/admin/AdminSubNav';
import { AuditLogClient } from '@/components/admin/AuditLogClient';

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
        <header style={{ marginBottom: 'var(--lp-space-3)' }}>
          <h1
            style={{
              margin: 0,
              fontSize: 'var(--lp-text-2xl)',
              fontWeight: 'var(--lp-weight-bold)',
              color: 'var(--lp-text)',
            }}
          >
            Audit log
          </h1>
          <p
            style={{
              marginTop: 4,
              fontSize: 'var(--lp-text-sm)',
              color: 'var(--lp-text-secondary)',
            }}
          >
            Cross-workspace audit trail. Offset pagination — switch
            to keyset on (created_at, id) when audit_log exceeds
            ~10K rows (Sprint 12+).
          </p>
        </header>
        <AuditLogClient />
      </div>
    </div>
  );
}
