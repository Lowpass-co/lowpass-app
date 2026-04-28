import { notFound } from 'next/navigation';
import { getUserAndAdminStatus } from '@/lib/site-admin';
import ShellPlaygroundClient from './ShellPlaygroundClient';

export default async function ShellPlaygroundPage() {
  const { user, isAdmin } = await getUserAndAdminStatus();
  if (!user || !isAdmin) {
    notFound();
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="mb-4">
        <h1 className="text-2xl font-bold" style={{ color: 'var(--lp-text)' }}>
          Shell playground
        </h1>
        <p className="mt-1 text-sm" style={{ color: 'var(--lp-text-secondary)' }}>
          TopBar, LeftRail, and PageShell (UX02) plus UX07 TimelineDashboard and DocumentCanvas demos.
        </p>
      </div>
      <ShellPlaygroundClient />
    </div>
  );
}
