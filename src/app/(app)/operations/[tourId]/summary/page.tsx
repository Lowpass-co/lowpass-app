/* ============================================
   LOWPASS — Operations · Summary (Design pass §9 · TR-01)

   Relocated here from the tour root (/operations/[tourId]) so Routing can
   become the tour landing WITHOUT losing any summary content. Everything the
   old root rendered — the 4 readiness cards, quick actions (Add personnel /
   Edit tour), recent activity, upcoming shows, and both slide-overs — lives
   here unchanged, now reachable via the "Summary" sub-nav tab. The readiness +
   pending subset ALSO surfaces as the de-boxed rail on the Routing landing
   (shared getOperationsReadiness loader).

   Permission gate matches the old root: renders if the caller has read access
   to operations.routing OR operations.personnel.
   ============================================ */

import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { createServerSupabaseClient } from '@/lib/supabase-server';
import { OperationsSummaryClient } from '@/components/operations/summary/OperationsSummaryClient';
import { getOperationsReadiness } from '@/server/operations/getOperationsReadiness';
import {
  canAccess,
  fetchActiveGrants,
  getActiveMembership,
} from '@/lib/permissions/server';

export const dynamic = 'force-dynamic';

interface OperationsSummaryPageProps {
  params: Promise<{ tourId: string }>;
}

export default async function OperationsSummaryPage({
  params,
}: OperationsSummaryPageProps) {
  const { tourId } = await params;
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    redirect(`/login?next=/operations/${tourId}/summary`);
  }

  const membership = await getActiveMembership(supabase, user.id);
  if (!membership) {
    return <NoWorkspacePanel />;
  }
  const grants = await fetchActiveGrants(supabase, membership, user.id);

  const canReadRouting = canAccess(membership, grants, 'page', 'operations.routing', 'read');
  const canReadPersonnel = canAccess(membership, grants, 'page', 'operations.personnel', 'read');
  const canRead = canReadRouting || canReadPersonnel;
  const canWriteRouting = canAccess(membership, grants, 'page', 'operations.routing', 'write');
  const canWritePersonnel = canAccess(membership, grants, 'page', 'operations.personnel', 'write');
  const canWrite = canWriteRouting || canWritePersonnel;

  const { data: tour } = await supabase
    .from('tours')
    .select('id, name, start_date, end_date, currency, continent')
    .eq('id', tourId)
    .maybeSingle();
  if (!tour) notFound();
  const tourRow = tour as {
    id: string;
    name: string;
    currency: string | null;
    continent: string | null;
    start_date: string | null;
    end_date: string | null;
  };

  if (!canRead) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column' }}>
        <div className="mx-auto w-full" style={{ padding: 'var(--lp-space-4)' }}>
          <NoAccessPanel />
        </div>
      </div>
    );
  }

  const readiness = await getOperationsReadiness(supabase, {
    tourId,
    workspaceId: membership.workspace_id,
    tourStartDate: tourRow.start_date,
    tourEndDate: tourRow.end_date,
  });

  return (
    <div style={{ display: 'flex', flexDirection: 'column', minHeight: 0 }}>
      <div
        className="mx-auto w-full"
        style={{ flex: 1, minWidth: 0, padding: 'var(--lp-space-4)' }}
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
            Summary
          </h1>
          <p
            style={{
              marginTop: 4,
              fontSize: 'var(--lp-text-sm)',
              color: 'var(--lp-text-secondary)',
            }}
          >
            {tourRow.name}
          </p>
        </header>
        <OperationsSummaryClient
          tourId={tourId}
          tourName={tourRow.name}
          tourCurrency={tourRow.currency}
          tourContinent={tourRow.continent}
          tourStartDate={tourRow.start_date}
          tourEndDate={tourRow.end_date}
          shows={readiness.shows}
          crew={readiness.crew}
          conflicts={readiness.conflicts}
          pending={readiness.pending}
          recentActivity={readiness.recentActivity}
          upcomingShows={readiness.upcomingShows}
          allRoutingDates={readiness.allRoutingDates}
          canWrite={canWrite}
        />
      </div>
    </div>
  );
}

function NoAccessPanel() {
  return (
    <div
      role="alert"
      style={{
        padding: 'var(--lp-space-4)',
        background: 'var(--lp-panel)',
        border: '1px solid var(--lp-border-strong)',
        borderRadius: 'var(--lp-radius-md)',
      }}
    >
      <h2
        style={{
          margin: 0,
          fontSize: 'var(--lp-text-base)',
          fontWeight: 'var(--lp-weight-semibold)',
          color: 'var(--lp-text)',
        }}
      >
        Operations is restricted
      </h2>
      <p
        style={{
          marginTop: 'var(--lp-space-1)',
          fontSize: 'var(--lp-text-sm)',
          color: 'var(--lp-text-secondary)',
        }}
      >
        You don&apos;t have read access to any Operations sub-page in this
        workspace. Ask an admin to grant <code>operations.routing</code> or{' '}
        <code>operations.personnel</code> in{' '}
        <Link
          href="/settings/members"
          style={{ color: 'var(--color-lp-orange)', textDecoration: 'underline' }}
        >
          /settings/members
        </Link>
        .
      </p>
    </div>
  );
}

function NoWorkspacePanel() {
  return (
    <div
      style={{
        padding: 'var(--lp-space-6)',
        textAlign: 'center',
        color: 'var(--lp-text-secondary)',
      }}
    >
      <h2
        style={{
          margin: 0,
          fontSize: 'var(--lp-text-base)',
          fontWeight: 'var(--lp-weight-semibold)',
          color: 'var(--lp-text)',
        }}
      >
        No active workspace
      </h2>
      <p style={{ marginTop: 'var(--lp-space-1)', fontSize: 'var(--lp-text-sm)' }}>
        Your account isn&apos;t a member of any workspace.
      </p>
    </div>
  );
}
