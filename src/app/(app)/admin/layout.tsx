/* ============================================
   LOWPASS — /admin layout (Sprint 9 §10)

   Gates the entire /admin tree on profiles.is_site_admin.
   Non-site-admins land on a 403 panel. The layout doesn't
   wrap children in <ProductShell> — admin chrome stands
   apart from per-product chrome.

   Excludes /admin/{shell-playground, data-table-playground,
   design-tokens, spreadsheet-playground} — those are dev
   sandboxes that don't share this layout (they live in their
   own subdirectories with no shared layout). Adam confirmed
   leave-alone in the Phase 10 sign-off.
   ============================================ */

import type { ReactNode } from 'react';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { listAppPageShell } from '@/components/shell/app-page-shells';
import { getUserAndAdminStatus } from '@/lib/site-admin';

export const dynamic = 'force-dynamic';

interface AdminLayoutProps {
  children: ReactNode;
}

export default async function AdminLayout({ children }: AdminLayoutProps) {
  const { user, isAdmin } = await getUserAndAdminStatus();
  if (!user) {
    redirect('/login?next=/admin');
  }
  if (!isAdmin) {
    return listAppPageShell(<NotSiteAdminPanel />);
  }
  return listAppPageShell(<>{children}</>);
}

function NotSiteAdminPanel() {
  return (
    <div className="mx-auto" style={{ maxWidth: 720, padding: 'var(--lp-space-6)' }}>
      <div
        role="alert"
        style={{
          padding: 'var(--lp-space-5)',
          background: 'var(--lp-panel)',
          border: '1px solid var(--lp-border-strong)',
          borderRadius: 'var(--lp-radius-md)',
        }}
      >
        <h1
          style={{
            margin: 0,
            fontSize: 'var(--lp-text-xl)',
            fontWeight: 'var(--lp-weight-bold)',
            color: 'var(--lp-text)',
          }}
        >
          Site admin only
        </h1>
        <p
          style={{
            marginTop: 'var(--lp-space-2)',
            fontSize: 'var(--lp-text-sm)',
            color: 'var(--lp-text-secondary)',
          }}
        >
          The /admin area is restricted to platform site admins.
          Workspace-level admin (the role you may have on a
          specific workspace) does not grant access here.
        </p>
        <div style={{ marginTop: 'var(--lp-space-3)' }}>
          <Link
            href="/"
            style={{
              fontSize: 'var(--lp-text-sm)',
              color: 'var(--color-lp-orange)',
              textDecoration: 'underline',
            }}
          >
            Back to home
          </Link>
        </div>
      </div>
    </div>
  );
}
