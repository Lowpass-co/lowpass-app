import { notFound } from 'next/navigation';
import { getUserAndAdminStatus } from '@/lib/site-admin';
import DataTablePlaygroundClient from './DataTablePlaygroundClient';

export default async function DataTablePlaygroundPage() {
  const { user, isAdmin } = await getUserAndAdminStatus();
  if (!user || !isAdmin) {
    notFound();
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="mb-4">
        <h1 className="text-2xl font-bold" style={{ color: 'var(--lp-text)' }}>
          DataTable playground
        </h1>
        <p className="mt-1 text-sm" style={{ color: 'var(--lp-text-secondary)' }}>
          UX05 — list primitive (admin only). Four demos + optional loading skeleton.
        </p>
      </div>
      <DataTablePlaygroundClient />
    </div>
  );
}
