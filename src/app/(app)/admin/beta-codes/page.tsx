/* /admin/beta-codes — make a code for a tester's email, send it, turn it off. */
import { redirect } from 'next/navigation';
import { createServerSupabaseClient } from '@/lib/supabase-server';
import { AdminSubNav } from '@/components/admin/AdminSubNav';
import { PageHeader } from '@/components/ui/PageHeader';
import { BetaCodesClient } from '@/components/admin/BetaCodesClient';

export const dynamic = 'force-dynamic';

export default async function AdminBetaCodesPage() {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login?next=/admin/beta-codes');
  return (
    <div style={{ display: 'flex', flexDirection: 'column', minHeight: 0 }}>
      <AdminSubNav activeId="beta-codes" />
      <div className="mx-auto w-full" style={{ flex: 1, minWidth: 0, padding: 'var(--lp-space-4)', maxWidth: 900 }}>
        <PageHeader
          title="Beta codes"
          subtitle="Sign-up is by code only. One code per tester, for their email — they make their own workspace with it."
          className="mb-3"
        />
        <BetaCodesClient />
      </div>
    </div>
  );
}
