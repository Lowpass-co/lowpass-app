/* ============================================
   LOWPASS — Operations · Personnel (Sprint 9 §6)

   /operations/[tourId]/personnel — replaces the placeholder.
   Three-way role branching:
     1. Admin/manager OR readonly with operations.personnel.read
        grant → render <PersonnelManagerClient>.
     2. Readonly with operations.personnel.my_schedule.read
        grant (auto-seeded for 'crew' tag holders) → render
        <CrewMyScheduleClient>.
     3. Otherwise → in-body 403 panel; sub-nav still visible so
        the user can navigate sideways.

   Layout chrome (ProductShell + TourHeader) is provided by the
   parent layout at /operations/[tourId]/layout.tsx — same
   pattern as Phase 5's Routing page.
   ============================================ */

import { notFound, redirect } from 'next/navigation';
import Link from 'next/link';
import { createServerSupabaseClient } from '@/lib/supabase-server';
import { OperationsSubNav } from '@/components/operations/OperationsSubNav';
import { PersonnelManagerClient } from '@/components/operations/personnel/PersonnelManagerClient';
import { CrewMyScheduleClient } from '@/components/operations/personnel/CrewMyScheduleClient';
import {
  getActiveMembership,
  fetchActiveGrants,
  canAccess,
} from '@/lib/permissions/server';

export const dynamic = 'force-dynamic';

interface OperationsPersonnelPageProps {
  params: Promise<{ tourId: string }>;
}

const SUB_NAV: Array<{
  id: string;
  label: string;
  slug: string;
  resource_id: string;
}> = [
  { id: 'personnel', label: 'Tour Personnel', slug: 'personnel', resource_id: 'operations.personnel' },
  { id: 'routing', label: 'Routing', slug: 'routing', resource_id: 'operations.routing' },
  { id: 'channel-list', label: 'Channel list', slug: 'channel-list', resource_id: 'operations.channel_list' },
  { id: 'payroll', label: 'Payroll', slug: 'payroll', resource_id: 'operations.payroll' },
  { id: 'rooming', label: 'Rooming', slug: 'rooming', resource_id: 'operations.rooming' },
  { id: 'files', label: 'Files', slug: 'files', resource_id: 'operations.files' },
  { id: 'riders', label: 'Riders', slug: 'riders', resource_id: 'operations.riders' },
];

export default async function OperationsTourPersonnelPage({
  params,
}: OperationsPersonnelPageProps) {
  const { tourId } = await params;
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    redirect(`/login?next=/operations/${tourId}/personnel`);
  }

  const membership = await getActiveMembership(supabase, user.id);
  if (!membership) {
    return <NoWorkspacePanel />;
  }

  const grants = await fetchActiveGrants(supabase, membership, user.id);

  const subNavLinks = SUB_NAV.map((s) => ({
    id: s.id,
    label: s.label,
    slug: s.slug,
    visible: canAccess(membership, grants, 'page', s.resource_id, 'read'),
  }));

  // Manager surface: admin/manager get it via role; readonly
  // gets it only with the explicit operations.personnel grant.
  const canManagerView = canAccess(
    membership,
    grants,
    'page',
    'operations.personnel',
    'read',
  );
  const canCrewView = canAccess(
    membership,
    grants,
    'page',
    'operations.personnel.my_schedule',
    'read',
  );

  const { data: tour } = await supabase
    .from('tours')
    .select('id, name, start_date, end_date')
    .eq('id', tourId)
    .maybeSingle();
  if (!tour) notFound();
  const tourRow = tour as {
    id: string;
    name: string;
    start_date: string | null;
    end_date: string | null;
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', minHeight: 0 }}>
      <OperationsSubNav
        tourId={tourId}
        activeSlug="personnel"
        links={subNavLinks}
      />
      <div
        className="mx-auto w-full"
        style={{
          flex: 1,
          minWidth: 0,
          padding: 'var(--lp-space-4)',
        }}
      >
        {canManagerView ? (
          <ManagerSurface
            tourId={tourId}
            tourStartDate={tourRow.start_date}
            tourEndDate={tourRow.end_date}
          />
        ) : canCrewView ? (
          <CrewMyScheduleClient tourId={tourId} />
        ) : (
          <NoAccessPanel />
        )}
      </div>
    </div>
  );
}

function ManagerSurface({
  tourId,
  tourStartDate,
  tourEndDate,
}: {
  tourId: string;
  tourStartDate: string | null;
  tourEndDate: string | null;
}) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--lp-space-3)' }}>
      <header>
        <h1
          style={{
            margin: 0,
            fontSize: 'var(--lp-text-2xl)',
            fontWeight: 'var(--lp-weight-bold)',
            color: 'var(--lp-text)',
          }}
        >
          Personnel
        </h1>
      </header>
      <PersonnelManagerClient
        tourId={tourId}
        tourStartDate={tourStartDate}
        tourEndDate={tourEndDate}
      />
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
        Personnel page is restricted
      </h2>
      <p
        style={{
          marginTop: 'var(--lp-space-1)',
          fontSize: 'var(--lp-text-sm)',
          color: 'var(--lp-text-secondary)',
        }}
      >
        This page requires a workspace role (admin / manager), an
        explicit <code>operations.personnel</code> grant, or the{' '}
        <code>crew</code> tag (which auto-grants{' '}
        <code>operations.personnel.my_schedule</code>). Ask your admin in{' '}
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
      <p
        style={{
          marginTop: 'var(--lp-space-1)',
          fontSize: 'var(--lp-text-sm)',
        }}
      >
        Your account isn&apos;t a member of any workspace, or the active
        workspace has been removed. Contact your admin.
      </p>
    </div>
  );
}
