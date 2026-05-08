/* ============================================
   LOWPASS — Operations · Routing (Sprint 9 §5)

   /operations/[tourId]/routing — replaces the placeholder.
   Renders <RoutingEditor> wrapped in:
     - <OperationsSubNav> (filtered by per-resource read access).
     - "Last edit" line from audit_log (Sprint 10's audit surface
       will replace this with a richer view).
     - 403 panel when the caller has no read access for
       operations.routing — sub-nav stays visible so the user
       can navigate sideways to surfaces they can access.

   Permission gate is page-level (TS port of can_access). RLS at
   the DB layer is the second line of defense — even if this
   page renders erroneously, a readonly caller without a grant
   still hits get_my_workspace_id and the underlying tables'
   policies.
   ============================================ */

import { notFound, redirect } from 'next/navigation';
import Link from 'next/link';
import { createServerSupabaseClient } from '@/lib/supabase-server';
import { RoutingEditor } from '@/components/routing/RoutingEditor';
import { OperationsSubNav } from '@/components/operations/OperationsSubNav';
import {
  getActiveMembership,
  fetchActiveGrants,
  canAccess,
} from '@/lib/permissions/server';

export const dynamic = 'force-dynamic';

interface OperationsRoutingPageProps {
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

function relativeTime(iso: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  const diff = Date.now() - d.getTime();
  const m = Math.floor(diff / 60000);
  const h = Math.floor(diff / 3600000);
  const day = Math.floor(diff / 86400000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m}m ago`;
  if (h < 24) return `${h}h ago`;
  if (day < 30) return `${day}d ago`;
  return d.toLocaleDateString();
}

export default async function OperationsTourRoutingPage({
  params,
}: OperationsRoutingPageProps) {
  const { tourId } = await params;
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    redirect(`/login?next=/operations/${tourId}/routing`);
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

  const canRead = canAccess(membership, grants, 'page', 'operations.routing', 'read');
  const canWrite = canAccess(membership, grants, 'page', 'operations.routing', 'write');

  const { data: tour } = await supabase
    .from('tours')
    .select('id, name, start_date, end_date, custom_day_types')
    .eq('id', tourId)
    .maybeSingle();
  if (!tour) notFound();
  const tourRow = tour as {
    id: string;
    name: string;
    start_date: string | null;
    end_date: string | null;
    custom_day_types: string[] | null;
  };

  // "Last edit" — derived from audit_log. Pre-Sprint-9 edits
  // weren't audited so existing tours show no last-edit line
  // until first save under this version.
  let lastEdit: { actor_name: string | null; created_at: string } | null = null;
  if (canRead) {
    const { data: routingIds } = await supabase
      .from('routing')
      .select('id')
      .eq('tour_id', tourId);
    const ids = (routingIds ?? []).map((r: { id: string }) => r.id);
    if (ids.length > 0) {
      const { data: audit } = await supabase
        .from('audit_log')
        .select('actor_user_id, created_at')
        .eq('entity_type', 'routing')
        .in('entity_id', ids)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (audit) {
        const a = audit as { actor_user_id: string | null; created_at: string };
        let actor_name: string | null = null;
        if (a.actor_user_id) {
          const { data: profile } = await supabase
            .from('profiles')
            .select('name')
            .eq('id', a.actor_user_id)
            .maybeSingle();
          actor_name = (profile as { name?: string | null } | null)?.name ?? null;
        }
        lastEdit = { actor_name, created_at: a.created_at };
      }
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', minHeight: 0 }}>
      <OperationsSubNav
        tourId={tourId}
        activeSlug="routing"
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
        <header
          className="flex flex-wrap items-baseline"
          style={{
            gap: 'var(--lp-space-3)',
            marginBottom: 'var(--lp-space-3)',
          }}
        >
          <h1
            style={{
              margin: 0,
              fontSize: 'var(--lp-text-2xl)',
              fontWeight: 'var(--lp-weight-bold)',
              color: 'var(--lp-text)',
            }}
          >
            Routing
          </h1>
          {lastEdit ? (
            <span
              style={{
                fontSize: 'var(--lp-text-xs)',
                color: 'var(--lp-text-tertiary)',
              }}
            >
              Last edit: {relativeTime(lastEdit.created_at)}
              {lastEdit.actor_name ? ` by ${lastEdit.actor_name}` : ''}
            </span>
          ) : null}
        </header>

        {!canRead ? (
          <NoAccessPanel resource="Routing" />
        ) : (
          <RoutingEditor
            tourId={tourId}
            startDate={tourRow.start_date ?? ''}
            endDate={tourRow.end_date ?? ''}
            initialCustomDayTypes={tourRow.custom_day_types ?? []}
            readOnly={!canWrite}
          />
        )}
      </div>
    </div>
  );
}

function NoAccessPanel({ resource }: { resource: string }) {
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
        {resource} is restricted
      </h2>
      <p
        style={{
          marginTop: 'var(--lp-space-1)',
          fontSize: 'var(--lp-text-sm)',
          color: 'var(--lp-text-secondary)',
        }}
      >
        You don&apos;t have read access for this page in the active workspace.
        Ask an admin to grant <code>operations.routing</code> in{' '}
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
