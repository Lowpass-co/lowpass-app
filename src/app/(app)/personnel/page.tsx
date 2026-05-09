/* ============================================
   LOWPASS — Workspace Personnel (Sprint 9 §9)

   Replaces the prior /personnel surface (PersonLibraryClient,
   simple DataTable) with the modernised PersonnelLibraryClient
   that adds:
     - 3-action header row (Add new / Import / Assign to tour)
     - Active-issue counts (passport expiring within 180 days,
       visa expired)
     - Per-row ⚠ indicator with tooltip listing the reasons

   The detail slide-over remains the existing 918-line
   PersonnelDetailSlideOver mounted via the entity-routing
   system — no changes there.

   Files API uses the existing personnel-files bucket (the
   Phase 9 mockup said "personnel-documents"; bucket name
   unchanged for backward compat). Migration 085 tightens the
   bucket's RLS to workspace-scoped reads + admin-only delete.
   ============================================ */

import { Suspense } from 'react';
import { listAppPageShell } from '@/components/shell/app-page-shells';
import { createServerSupabaseClient } from '@/lib/supabase-server';
import {
  PersonnelLibraryClient,
  type PersonnelLibraryRow,
} from '@/components/personnel/PersonnelLibraryClient';
import {
  computeCompleteness,
  parseExtendedProfile,
} from '@/lib/personnel-extended-profile';

export const dynamic = 'force-dynamic';

const PASSPORT_EXPIRY_THRESHOLD_DAYS = 180;

interface ExtendedProfilePassport {
  expiry_date?: string;
  [k: string]: unknown;
}

interface ExtendedProfile {
  passports?: ExtendedProfilePassport[];
  visa?: { expiry?: string; [k: string]: unknown };
  [k: string]: unknown;
}

function deriveIssues(
  passportInfoLegacy: Record<string, unknown> | null,
  extendedProfile: ExtendedProfile | null,
): { hasIssue: boolean; labels: string[] } {
  const labels: string[] = [];
  // Server component — Date construction is fine here.
  const today = new Date();
  const thresholdMs = PASSPORT_EXPIRY_THRESHOLD_DAYS * 86400000;

  // Collect all passport expiry strings: legacy + extended.
  const passportExpiries: string[] = [];
  if (
    passportInfoLegacy &&
    typeof passportInfoLegacy === 'object' &&
    typeof (passportInfoLegacy as { expiry?: unknown }).expiry === 'string'
  ) {
    passportExpiries.push((passportInfoLegacy as { expiry: string }).expiry);
  }
  if (Array.isArray(extendedProfile?.passports)) {
    for (const p of extendedProfile?.passports ?? []) {
      if (typeof p?.expiry_date === 'string' && p.expiry_date) {
        passportExpiries.push(p.expiry_date);
      }
    }
  }
  for (const exp of passportExpiries) {
    const d = new Date(exp);
    if (Number.isNaN(d.getTime())) continue;
    const diff = d.getTime() - today.getTime();
    if (diff < 0) {
      labels.push('Passport expired');
      break;
    }
    if (diff < thresholdMs) {
      const days = Math.ceil(diff / 86400000);
      labels.push(`Passport expires in ${days}d`);
      break;
    }
  }

  // Visa expiry: any expiry < today fires.
  const visaExpiry = extendedProfile?.visa?.expiry;
  if (typeof visaExpiry === 'string' && visaExpiry) {
    const d = new Date(visaExpiry);
    if (!Number.isNaN(d.getTime()) && d.getTime() < today.getTime()) {
      labels.push('Visa expired');
    }
  }

  return { hasIssue: labels.length > 0, labels };
}

export default async function PersonnelPage() {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return (
      <div className="mx-auto max-w-6xl">
        <p className="text-lp-text-secondary">Please sign in.</p>
      </div>
    );
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('workspace_id')
    .eq('id', user.id)
    .single();

  if (!profile?.workspace_id) {
    return (
      <div className="mx-auto max-w-6xl">
        <p className="text-lp-text-secondary">No workspace.</p>
      </div>
    );
  }

  // /personnel surface lists the personnel table directly —
  // that's the entity the existing detail slide-over edits and
  // where issue indicators (passport / visa) are computed from.
  // The persons table is a downstream canonical sibling.
  // Sprint 9 §13.B.2 — added home_airport + standard_rates so
  // computeCompleteness can score the row server-side AND read
  // the viewer's role to decide whether the Pay weight applies.
  const [{ data: personnel }, { data: viewerMembership }] = await Promise.all([
    supabase
      .from('personnel')
      .select(
        'id, workspace_id, lp_id, name, email, phone, role, home_airport, standard_rates, passport_info, extended_profile, created_at, updated_at',
      )
      .eq('workspace_id', profile.workspace_id)
      .order('name', { ascending: true }),
    supabase
      .from('workspace_members')
      .select('role')
      .eq('workspace_id', profile.workspace_id)
      .eq('user_id', user.id)
      .maybeSingle(),
  ]);

  // Q5 — non-admin viewers re-normalise the completeness ring
  // without the Pay weight. Site admins always see Pay.
  const viewerRole = (viewerMembership as { role?: string } | null)?.role ?? null;
  const viewerCanSeePay = viewerRole === 'admin' || viewerRole === 'manager';

  const personnelList = (personnel ?? []) as Array<{
    id: string;
    workspace_id: string;
    name: string;
    email: string | null;
    phone: string | null;
    role: string | null;
    home_airport: string | null;
    standard_rates: Record<string, unknown> | null;
    passport_info: Record<string, unknown> | null;
    extended_profile: ExtendedProfile | null;
    updated_at: string;
  }>;

  const personnelIds = personnelList.map((p) => p.id);
  const { data: tourPersonnel } =
    personnelIds.length > 0
      ? await supabase
          .from('tour_personnel')
          .select('person_id, tours(start_date)')
          .in('person_id', personnelIds)
      : {
          data: [] as Array<{
            person_id: string;
            tours:
              | { start_date: string | null }
              | Array<{ start_date: string | null }>
              | null;
          }>,
        };

  const usage = new Map<string, { totalTours: number; lastTouredAt: string | null }>();
  for (const row of (tourPersonnel ?? []) as Array<{
    person_id: string;
    tours:
      | { start_date: string | null }
      | Array<{ start_date: string | null }>
      | null;
  }>) {
    if (!row.person_id) continue;
    const tourRel = Array.isArray(row.tours) ? row.tours[0] : row.tours;
    const startDate = tourRel?.start_date ?? null;
    const current = usage.get(row.person_id) ?? {
      totalTours: 0,
      lastTouredAt: null,
    };
    const nextTotal = current.totalTours + 1;
    const nextLast =
      !current.lastTouredAt || (startDate && startDate > current.lastTouredAt)
        ? (startDate ?? current.lastTouredAt)
        : current.lastTouredAt;
    usage.set(row.person_id, { totalTours: nextTotal, lastTouredAt: nextLast });
  }

  const rows: PersonnelLibraryRow[] = personnelList.map((p) => {
    const stat = usage.get(p.id) ?? { totalTours: 0, lastTouredAt: null };
    const issues = deriveIssues(p.passport_info, p.extended_profile);
    // Sprint 9 §13.B.2 — completeness scored server-side per
    // viewer role (Q5 re-normalisation). The slide-over uses
    // firstMissingId to scroll to the first missing section
    // when the operator clicks the ring.
    const completeness = computeCompleteness(
      {
        name: p.name,
        email: p.email,
        phone: p.phone,
        homeAirport: p.home_airport,
        standardRates: p.standard_rates as
          | { show_day_rate?: number | null }
          | null,
        ext: parseExtendedProfile(p.extended_profile),
      },
      { canSeePay: viewerCanSeePay },
    );
    return {
      id: p.id,
      workspaceId: p.workspace_id,
      fullName: p.name,
      preferredName: null,
      email: p.email,
      phone: p.phone,
      pronouns: null,
      hasIssue: issues.hasIssue,
      issueLabels: issues.labels,
      lastTouredAt: stat.lastTouredAt,
      totalTours: stat.totalTours,
      updatedAt: p.updated_at,
      completenessPercent: completeness.percent,
      completenessMissingLabels: completeness.missingLabels,
      completenessFirstMissingId: completeness.firstMissingId,
    };
  });

  return listAppPageShell(
    <div className="mx-auto max-w-7xl space-y-6 pb-12">
      <div>
        <h1 className="text-2xl font-bold text-lp-text">Personnel</h1>
        <p className="mt-1 text-sm text-lp-text-secondary">
          Workspace roster with LP-IDs. Click a row to open passport
          info, emergency contacts, files, and pay rates.
        </p>
      </div>
      <Suspense
        fallback={
          <div className="h-48 animate-pulse rounded-xl border border-lp-border bg-lp-surface/50" />
        }
      >
        <PersonnelLibraryClient initial={rows} viewerCanSeePay={viewerCanSeePay} />
      </Suspense>
    </div>,
  );
}
