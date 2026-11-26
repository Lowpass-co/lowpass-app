/* ============================================
   LOWPASS — Crew (/operations/[tourId]/personnel)

   Tour access (Nov 2026):
     1. Logistics on this tour → the crew list (<PersonnelManagerClient>);
        admins / managers can add, edit and remove (canEdit), Members
        read only. Rates mirror below needs Payroll as well.
     2. Anyone else who can open the tour → their own schedule
        (<CrewMyScheduleClient>).
     3. Otherwise → an in-body "no access" panel.
   ?assign=<personId> (People › Assign to tour) opens Add crew with that
   person ticked. Chrome comes from the tour layout (<ShellV3Mount>).
   ============================================ */

import { notFound, redirect } from 'next/navigation';
import Link from 'next/link';
import { createServerSupabaseClient } from '@/lib/supabase-server';
import { PersonnelManagerClient } from '@/components/operations/personnel/PersonnelManagerClient';
import { CrewMyScheduleClient } from '@/components/operations/personnel/CrewMyScheduleClient';
import {
  PersonnelRatesMirror,
  type RateMirrorRow,
} from '@/components/operations/personnel/PersonnelRatesMirror';
import { loadTourRateContext, rateAmountsFor } from '@/lib/payroll/loadRateLines';
import type { PersonnelRate } from '@/types';
import { getActiveMembership } from '@/lib/permissions/server';
import { getViewerAccess, viewerAllows, runsTour } from '@/lib/permissions/tourAccess';

export const dynamic = 'force-dynamic';

interface OperationsPersonnelPageProps {
  params: Promise<{ tourId: string }>;
  searchParams: Promise<{ filter?: string; assign?: string }>;
}

/* Sprint 9 §14.11 — SUB_NAV moved to layout. */

export default async function OperationsTourPersonnelPage({
  params,
  searchParams,
}: OperationsPersonnelPageProps) {
  const { tourId } = await params;
  const { filter, assign } = await searchParams;
  const conflictsOnly = filter === 'conflicts';
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    redirect(`/login?next=/operations/${tourId}/personnel`);
  }

  /* F-3(b) — the permission chain and the tour row were four SEQUENTIAL awaits
     (getUser → membership → grants → tour). Only the permission chain is ordered;
     the tour row depends on none of it (RLS scopes it regardless), so it was
     paying for two round-trips for nothing. Run it alongside. */
  const [membership, tourRes] = await Promise.all([
    getActiveMembership(supabase, user.id),
    supabase.from('tours').select('id, name, currency, start_date, end_date, workspace_id').eq('id', tourId).maybeSingle(),
  ]);
  if (!membership) {
    return <NoWorkspacePanel />;
  }

  // Tour access (Nov 2026): the crew list is the Logistics area; its rates
  // mirror is money, so it also needs Payroll. Anyone else who can open the
  // tour gets their own schedule (a login always reads its own crew rows).
  const access = await getViewerAccess(supabase, user.id, tourId);
  const canManagerView = viewerAllows(access, 'logistics');
  const canSeeRates = viewerAllows(access, 'payroll');
  const canCrewView = !!access;

  const { data: tour } = tourRes;
  if (!tour) notFound();
  const tourRow = tour as {
    id: string;
    name: string;
    currency: string | null;
    start_date: string | null;
    end_date: string | null;
    workspace_id: string;
  };

  // PAY-09 — read-only rates mirror (name/role/type/rate/per-diem). Sourced
  // from the rates SSOT (personnel_rate_lines via rateAmountsFor), loaded here
  // only for the manager surface so the crew / no-access branches don't pay for
  // the query. Every value links back to Payroll — the one write surface.
  let rateMirror: RateMirrorRow[] = [];
  if (canManagerView && canSeeRates) {
    /* F-3(b) — these two were sequential, but loadTourRateContext takes only
       (tourId, workspaceId) — it never reads rateRows. Fetch both at once. The
       only cost is one wasted context query on a tour with zero rate rows; the
       common case saves a full round-trip on the rates mirror, which is the block
       that has to paint for this page to feel loaded. */
    const [rateRowsRes, rateCtx] = await Promise.all([
      supabase
        .from('personnel_rates')
        .select('id, person_name, role, rate_type, order_index')
        .eq('tour_id', tourId)
        .eq('workspace_id', membership.workspace_id)
        .order('order_index', { ascending: true }),
      loadTourRateContext(supabase, tourId, membership.workspace_id),
    ]);
    const { data: rateRows } = rateRowsRes;
    if (rateRows && rateRows.length > 0) {
      rateMirror = (rateRows as Array<
        Pick<PersonnelRate, 'id' | 'person_name' | 'role' | 'rate_type'>
      >).map((r) => {
        const a = rateAmountsFor(rateCtx, r.id);
        return {
          id: r.id,
          person_name: r.person_name,
          role: r.role,
          rate_type: r.rate_type,
          // Primary daily fee: day-rate card → its flat day amount (off), else
          // the split Show rate.
          rate: r.rate_type === 'day_rate' ? a.offRate : a.showRate,
          perDiem: a.perDiem,
        };
      });
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', minHeight: 0 }}>
      {/* Sprint 9 §14.11 — sub-nav now mounted by the layout. */}
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
            conflictsOnly={conflictsOnly}
            canEdit={runsTour(access)}
            canChangeLogin={access?.role === 'admin' && membership.workspace_id === tourRow.workspace_id}
            assignPersonId={typeof assign === 'string' && assign ? assign : null}
            currency={tourRow.currency ?? 'GBP'}
            rateMirror={rateMirror}
            showRates={canSeeRates}
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
  conflictsOnly,
  canEdit,
  canChangeLogin,
  assignPersonId,
  currency,
  rateMirror,
  showRates,
}: {
  tourId: string;
  tourStartDate: string | null;
  tourEndDate: string | null;
  conflictsOnly: boolean;
  canEdit: boolean;
  canChangeLogin: boolean;
  assignPersonId: string | null;
  currency: string;
  rateMirror: RateMirrorRow[];
  /** Rates are money — only with Payroll access. */
  showRates: boolean;
}) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--lp-space-3)' }}>
      <header>
        <h1 className="lp-page-title" style={{ margin: 0, color: 'var(--lp-text)' }}>
          Crew
        </h1>
      </header>
      <PersonnelManagerClient
        tourId={tourId}
        tourCurrency={currency}
        tourStartDate={tourStartDate}
        tourEndDate={tourEndDate}
        conflictsOnly={conflictsOnly}
        canEdit={canEdit}
        canChangeLogin={canChangeLogin}
        assignPersonId={assignPersonId}
      />
      {/* PAY-09 — read-only rates mirror; the ONE write surface is Payroll. */}
      {showRates ? <PersonnelRatesMirror tourId={tourId} currency={currency} rows={rateMirror} /> : null}
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
