/* ============================================
   LOWPASS — /api/tours/[id]/personnel/conflicts (Sprint 9 §6)

   POST — accepts arrays of canonical_person_ids + emails
          (separate keys; email is the fallback for persons
          without canonical_person_id) plus a date window.
          Calls the two batch RPCs in one round-trip each, then
          merges the results into a per-person conflict map.

   Request body:
     {
       canonical_person_ids: string[],
       emails: string[],
       start_date: string,
       end_date: string
     }

   Response:
     {
       by_canonical: { [canonical_person_id]: ConflictRow[] },
       by_email:     { [email]: ConflictRow[] }
     }
   ============================================ */

import { NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase-server';
import {
  getActiveMembership,
  fetchActiveGrants,
  canAccess,
} from '@/lib/permissions/server';

export const dynamic = 'force-dynamic';

interface ConflictRow {
  workspace_id: string;
  workspace_name: string;
  tour_id: string;
  tour_name: string;
  /** Sprint 9 §7.3 — surfaced in ConflictBanner copy. */
  role: string;
  start_date: string | null;
  end_date: string | null;
  status: string;
}

interface CanonicalRpcRow {
  canonical_person_id: string;
  conflict_workspace_id: string;
  conflict_workspace_name: string;
  conflict_tour_id: string;
  conflict_tour_name: string;
  /** Sprint 9 §7.3 — added by migration 084. */
  conflict_role: string;
  conflict_start_date: string | null;
  conflict_end_date: string | null;
  conflict_status: string;
}

interface EmailRpcRow {
  matched_email: string;
  conflict_workspace_id: string;
  conflict_workspace_name: string;
  conflict_tour_id: string;
  conflict_tour_name: string;
  conflict_role: string;
  conflict_start_date: string | null;
  conflict_end_date: string | null;
  conflict_status: string;
}

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id: tourId } = await params;

  const membership = await getActiveMembership(supabase, user.id);
  if (!membership) {
    return NextResponse.json({ error: 'No active workspace' }, { status: 403 });
  }
  const grants = await fetchActiveGrants(supabase, membership, user.id);
  if (!canAccess(membership, grants, 'page', 'operations.personnel', 'read')) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  let body: {
    canonical_person_ids?: unknown;
    emails?: unknown;
    start_date?: unknown;
    end_date?: unknown;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const startDate = typeof body.start_date === 'string' ? body.start_date : '';
  const endDate = typeof body.end_date === 'string' ? body.end_date : '';
  if (!ISO_DATE_RE.test(startDate) || !ISO_DATE_RE.test(endDate)) {
    return NextResponse.json(
      { error: 'start_date and end_date must be YYYY-MM-DD' },
      { status: 400 },
    );
  }

  const canonicalIds = Array.isArray(body.canonical_person_ids)
    ? Array.from(
        new Set(
          (body.canonical_person_ids as unknown[]).filter(
            (v): v is string => typeof v === 'string' && v.length > 0,
          ),
        ),
      )
    : [];
  const emails = Array.isArray(body.emails)
    ? Array.from(
        new Set(
          (body.emails as unknown[])
            .filter((v): v is string => typeof v === 'string' && v.length > 0)
            .map((s) => s.trim().toLowerCase()),
        ),
      )
    : [];

  const byCanonical: Record<string, ConflictRow[]> = {};
  const byEmail: Record<string, ConflictRow[]> = {};

  if (canonicalIds.length > 0) {
    const { data: rows, error } = await supabase.rpc(
      'check_personnel_conflicts_batch',
      {
        p_canonical_person_ids: canonicalIds,
        p_start_date: startDate,
        p_end_date: endDate,
        p_excluding_tour_id: tourId,
      },
    );
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    for (const r of (rows ?? []) as CanonicalRpcRow[]) {
      const key = r.canonical_person_id;
      const arr = byCanonical[key] ?? [];
      arr.push({
        workspace_id: r.conflict_workspace_id,
        workspace_name: r.conflict_workspace_name,
        tour_id: r.conflict_tour_id,
        tour_name: r.conflict_tour_name,
        role: r.conflict_role,
        start_date: r.conflict_start_date,
        end_date: r.conflict_end_date,
        status: r.conflict_status,
      });
      byCanonical[key] = arr;
    }
  }

  if (emails.length > 0) {
    const { data: rows, error } = await supabase.rpc(
      'check_personnel_conflicts_by_email_batch',
      {
        p_emails: emails,
        p_start_date: startDate,
        p_end_date: endDate,
        p_excluding_tour_id: tourId,
      },
    );
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    for (const r of (rows ?? []) as EmailRpcRow[]) {
      const key = r.matched_email;
      const arr = byEmail[key] ?? [];
      arr.push({
        workspace_id: r.conflict_workspace_id,
        workspace_name: r.conflict_workspace_name,
        tour_id: r.conflict_tour_id,
        tour_name: r.conflict_tour_name,
        role: r.conflict_role,
        start_date: r.conflict_start_date,
        end_date: r.conflict_end_date,
        status: r.conflict_status,
      });
      byEmail[key] = arr;
    }
  }

  return NextResponse.json({ by_canonical: byCanonical, by_email: byEmail });
}
