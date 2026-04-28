import { notFound } from 'next/navigation';
import { getUserAndAdminStatus } from '@/lib/site-admin';
import SpreadsheetPlaygroundClient from './SpreadsheetPlaygroundClient';

export default async function SpreadsheetPlaygroundPage() {
  const { user, isAdmin } = await getUserAndAdminStatus();
  if (!user || !isAdmin) {
    notFound();
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="mb-4">
        <h1 className="text-2xl font-bold" style={{ color: 'var(--lp-text)' }}>
          SpreadsheetGrid playground
        </h1>
        <p className="mt-1 text-sm" style={{ color: 'var(--lp-text-secondary)' }}>
          UX06 — data-entry grid (admin only). Budget, payroll, and channel list mocks.
        </p>
      </div>
      <SpreadsheetPlaygroundClient />
    </div>
  );
}
