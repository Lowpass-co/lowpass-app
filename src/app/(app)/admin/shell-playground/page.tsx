import { notFound } from 'next/navigation';
import { getUserAndAdminStatus } from '@/lib/site-admin';
import { PageHeader } from '@/components/ui/PageHeader';
import ShellPlaygroundClient from './ShellPlaygroundClient';

export default async function ShellPlaygroundPage() {
  const { user, isAdmin } = await getUserAndAdminStatus();
  if (!user || !isAdmin) {
    notFound();
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <PageHeader
        title="Shell playground"
        subtitle="TopBar, LeftRail, and PageShell (UX02) plus UX07 TimelineDashboard and DocumentCanvas demos."
        className="mb-4"
      />
      <ShellPlaygroundClient />
    </div>
  );
}
