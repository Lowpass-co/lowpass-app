/* ============================================
   LOWPASS — Operations · Tour landing (Sprint 9 §8)

   Real summary page replacing the placeholder. Server component
   that fetches tour basics, routing rows, tour_personnel +
   persons, audit_log, conflict counts, and pending tasks in
   parallel; renders OperationsSubNav (no active link) +
   <OperationsSummaryClient>.

   Permission gate: page renders if caller has read access to
   either operations.routing OR operations.personnel. The summary
   itself doesn't expose anything new; falls back to NoAccess
   only when neither sub-page is reachable.
   ============================================ */

import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { createServerSupabaseClient } from '@/lib/supabase-server';
import { OperationsSubNav } from '@/components/operations/OperationsSubNav';
import { OperationsSummaryClient } from '@/components/operations/summary/OperationsSummaryClient';
import {
  canAccess,
  fetchActiveGrants,
  getActiveMembership,
} from '@/lib/permissions/server';

export const dynamic = 'force-dynamic';

interface OperationsTourPageProps {
  params: Promise<{ tourId: string }>;
}

const SUB_NAV: Array<{
  id: string;
  label: string;
  slug: string;
  resource_id: string;
}> = [
  { id: 'personnel', label: 'Personnel', slug: 'personnel', resource_id: 'operations.personnel' },
  { id: 'routing', label: 'Routing', slug: 'routing', resource_id: 'operations.routing' },
  { id: 'channel-list', label: 'Channel list', slug: 'channel-list', resource_id: 'operations.channel_list' },
  { id: 'payroll', label: 'Payroll', slug: 'payroll', resource_id: 'operations.payroll' },
  { id: 'rooming', label: 'Rooming', slug: 'rooming', resource_id: 'operations.rooming' },
  { id: 'files', label: 'Files', slug: 'files', resource_id: 'operations.files' },
  { id: 'riders', label: 'Riders', slug: 'riders', resource_id: 'operations.riders' },
];

interface TourPersonnelJoined {
  id: string;
  person_id: string;
  role: string;
  status: string;
}

interface PersonRow {
  id: string;
  full_name: string;
  preferred_name: string | null;
  email: string | null;
  canonical_person_id: string | null;
}

export default async function OperationsTourLandingPage({
  params,
}: OperationsTourPageProps) {
  const { tourId } = await params;
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    redirect(`/login?next=/operations/${tourId}`);
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

  const canReadRouting = canAccess(membership, grants, 'page', 'operations.routing', 'read');
  const canReadPersonnel = canAccess(membership, grants, 'page', 'operations.personnel', 'read');
  const canRead = canReadRouting || canReadPersonnel;
  const canWriteRouting = canAccess(membership, grants, 'page', 'operations.routing', 'write');
  const canWritePersonnel = canAccess(membership, grants, 'page', 'operations.personnel', 'write');
  const canWrite = canWriteRouting || canWritePersonnel;

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

  if (!canRead) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column' }}>
        <OperationsSubNav tourId={tourId} activeSlug="" links={subNavLinks} />
        <div className="mx-auto w-full" style={{ padding: 'var(--lp-space-4)' }}>
          <NoAccessPanel />
        </div>
      </div>
    );
  }

  // Server component — Date.now / new Date are fine here; the
  // lint rule treats these as impure but RSC renders aren't
  // subject to the React purity contract that flags those.
  // eslint-disable-next-line react-hooks/purity
  const now = Date.now();
  const todayIso = new Date(now).toISOString().slice(0, 10);
  const sevenDaysAgoIso = new Date(now - 7 * 86400000).toISOString();

  const [routingRes, tpRes, auditRes] = await Promise.all([
    supabase
      .from('routing')
      .select('id, date, day_type, city, venue_name, venue_capacity')
      .eq('tour_id', tourId)
      .order('date'),
    supabase
      .from('tour_personnel')
      .select('id, person_id, role, status')
      .eq('tour_id', tourId),
    supabase
      .from('audit_log')
      .select('id, action, entity_type, actor_user_id, field_changes, created_at')
      .eq('workspace_id', membership.workspace_id)
      .in('entity_type', ['routing', 'tour_personnel', 'tour'])
      .gte('created_at', sevenDaysAgoIso)
      .order('created_at', { ascending: false })
      .limit(5),
  ]);

  const routing = (routingRes.data ?? []) as Array<{
    id: string;
    date: string;
    day_type: string | null;
    city: string | null;
    venue_name: string | null;
    venue_capacity: number | null;
  }>;
  const tourPersonnel = (tpRes.data ?? []) as TourPersonnelJoined[];
  const auditRows = (auditRes.data ?? []) as Array<{
    id: string;
    action: string;
    entity_type: string;
    actor_user_id: string | null;
    field_changes: Record<string, unknown> | null;
    created_at: string;
  }>;

  const personIds = Array.from(new Set(tourPersonnel.map((tp) => tp.person_id)));
  const actorIds = Array.from(
    new Set(
      auditRows
        .map((a) => a.actor_user_id)
        .filter((v): v is string => !!v),
    ),
  );

  const [personsRes, profilesRes] = await Promise.all([
    personIds.length > 0
      ? supabase
          .from('persons')
          .select('id, full_name, preferred_name, email, canonical_person_id')
          .in('id', personIds)
      : Promise.resolve({ data: [] as PersonRow[] }),
    actorIds.length > 0
      ? supabase
          .from('profiles')
          .select('id, name')
          .in('id', actorIds)
      : Promise.resolve({ data: [] as Array<{ id: string; name: string | null }> }),
  ]);

  const personById = new Map(
    ((personsRes.data ?? []) as PersonRow[]).map((p) => [p.id, p]),
  );
  const actorNameById = new Map(
    ((profilesRes.data ?? []) as Array<{ id: string; name: string | null }>).map(
      (p) => [p.id, p.name],
    ),
  );

  // Conflict count via batch RPC. Empty canonical-id list returns
  // zero rows so this is safe to call unconditionally.
  const canonicalIds = Array.from(
    new Set(
      tourPersonnel
        .map((tp) => personById.get(tp.person_id)?.canonical_person_id ?? null)
        .filter((v): v is string => !!v),
    ),
  );
  let conflictCount = 0;
  if (
    canonicalIds.length > 0 &&
    tourRow.start_date &&
    tourRow.end_date
  ) {
    const { data: conflicts } = await supabase.rpc(
      'check_personnel_conflicts_batch',
      {
        p_canonical_person_ids: canonicalIds,
        p_start_date: tourRow.start_date,
        p_end_date: tourRow.end_date,
        p_excluding_tour_id: tourId,
      },
    );
    conflictCount = (conflicts ?? []).length;
  }

  // Pending tasks
  const awaitingContract = tourPersonnel
    .filter((tp) => tp.status === 'awaiting_contract')
    .map((tp) => {
      const p = personById.get(tp.person_id);
      return {
        id: tp.id,
        display_name:
          p?.preferred_name?.trim() || p?.full_name?.trim() || 'Unknown',
        role: tp.role,
        status: tp.status,
      };
    });
  const tentative = tourPersonnel
    .filter((tp) => tp.status === 'tentative')
    .map((tp) => {
      const p = personById.get(tp.person_id);
      return {
        id: tp.id,
        display_name:
          p?.preferred_name?.trim() || p?.full_name?.trim() || 'Unknown',
        role: tp.role,
        status: tp.status,
      };
    });
  const showsWithoutVenue = routing
    .filter((r) => {
      const types = (r.day_type ?? '').split(',').map((s) => s.trim());
      return types.includes('show') && (!r.venue_name || r.venue_name.trim() === '');
    })
    .map((r) => ({
      id: r.id,
      date: r.date,
      city: r.city,
    }));

  // Summary card derivations
  const showRows = routing.filter((r) => {
    const types = (r.day_type ?? '').split(',').map((s) => s.trim());
    return types.includes('show') || types.includes('festival');
  });
  const upcomingShows = showRows
    .filter((r) => r.date >= todayIso)
    .slice(0, 5)
    .map((r) => ({
      id: r.id,
      date: r.date,
      city: r.city,
      venue_name: r.venue_name,
      venue_capacity: r.venue_capacity,
    }));
  const nextShowDate = upcomingShows[0]?.date ?? null;

  const activityWithNames = auditRows.map((a) => ({
    id: a.id,
    action: a.action,
    entity_type: a.entity_type,
    created_at: a.created_at,
    actor_name: a.actor_user_id ? actorNameById.get(a.actor_user_id) ?? null : null,
    field_changes: a.field_changes,
  }));

  const allRoutingDates = routing.map((r) => ({
    id: r.id,
    date: r.date,
    city: r.city,
    venue_name: r.venue_name,
  }));

  const excludePersonIds = Array.from(
    new Set(tourPersonnel.map((tp) => tp.person_id)),
  );

  return (
    <div style={{ display: 'flex', flexDirection: 'column', minHeight: 0 }}>
      <OperationsSubNav tourId={tourId} activeSlug="" links={subNavLinks} />
      <div
        className="mx-auto w-full"
        style={{
          flex: 1,
          minWidth: 0,
          padding: 'var(--lp-space-4)',
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
            Operations
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
          tourStartDate={tourRow.start_date}
          tourEndDate={tourRow.end_date}
          shows={{ count: showRows.length, nextShowDate }}
          crew={{
            count: tourPersonnel.length,
            excludePersonIds,
          }}
          conflicts={{ count: conflictCount }}
          pending={{
            awaitingContract,
            tentative,
            showsWithoutVenue,
          }}
          recentActivity={activityWithNames}
          upcomingShows={upcomingShows}
          allRoutingDates={allRoutingDates}
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
        You don&apos;t have read access to any Operations sub-page in
        this workspace. Ask an admin to grant{' '}
        <code>operations.routing</code> or <code>operations.personnel</code>{' '}
        in{' '}
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
        Your account isn&apos;t a member of any workspace.
      </p>
    </div>
  );
}
