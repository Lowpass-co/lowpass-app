import { Suspense } from 'react';
import { listAppPageShell } from '@/components/shell/app-page-shells';
import { createServerSupabaseClient } from '@/lib/supabase-server';
import { PersonLibraryClient, type PersonLibraryRow } from '@/components/personnel/PersonLibraryClient';

export const dynamic = 'force-dynamic';

export default async function LibraryPersonnelPage() {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return listAppPageShell(
      <div className="mx-auto max-w-6xl">
        <p className="text-lp-text-secondary">Please sign in.</p>
      </div>
    );
  }

  const { data: profile } = await supabase.from('profiles').select('workspace_id').eq('id', user.id).single();
  if (!profile?.workspace_id) {
    return listAppPageShell(
      <div className="mx-auto max-w-6xl">
        <p className="text-lp-text-secondary">No workspace.</p>
      </div>
    );
  }

  const { data: persons } = await supabase
    .from('persons')
    .select('*')
    .eq('workspace_id', profile.workspace_id)
    .order('full_name', { ascending: true });

  const personIds = ((persons ?? []) as Array<{ id: string }>).map((p) => p.id);
  const { data: tourPersonnel } =
    personIds.length > 0
      ? await supabase
          .from('tour_personnel')
          .select('person_id, tours(start_date)')
          .in('person_id', personIds)
      : {
          data: [] as Array<{
            person_id: string;
            tours: { start_date: string | null } | Array<{ start_date: string | null }> | null;
          }>,
        };

  const usage = new Map<string, { totalTours: number; lastTouredAt: string | null }>();
  for (const row of (tourPersonnel ?? []) as Array<{
    person_id: string;
    tours: { start_date: string | null } | Array<{ start_date: string | null }> | null;
  }>) {
    if (!row.person_id) continue;
    const tourRel = Array.isArray(row.tours) ? row.tours[0] : row.tours;
    const startDate = tourRel?.start_date ?? null;
    const current = usage.get(row.person_id) ?? { totalTours: 0, lastTouredAt: null };
    const nextTotal = current.totalTours + 1;
    const nextLast =
      !current.lastTouredAt || (startDate && startDate > current.lastTouredAt)
        ? (startDate ?? current.lastTouredAt)
        : current.lastTouredAt;
    usage.set(row.person_id, { totalTours: nextTotal, lastTouredAt: nextLast });
  }

  const rows: PersonLibraryRow[] = ((persons ?? []) as Array<Record<string, unknown>>).map((p) => {
    const id = String(p.id);
    const stat = usage.get(id) ?? { totalTours: 0, lastTouredAt: null };
    return {
      id,
      workspaceId: String(p.workspace_id ?? ''),
      fullName: String(p.full_name ?? ''),
      preferredName: p.preferred_name == null ? null : String(p.preferred_name),
      pronouns: p.pronouns == null ? null : String(p.pronouns),
      email: p.email == null ? null : String(p.email),
      phone: p.phone == null ? null : String(p.phone),
      emergencyContact: p.emergency_contact == null ? null : String(p.emergency_contact),
      passportFullName: p.passport_full_name == null ? null : String(p.passport_full_name),
      passportNumber: p.passport_number == null ? null : String(p.passport_number),
      passportExpiry: p.passport_expiry == null ? null : String(p.passport_expiry),
      passportCountry: p.passport_country == null ? null : String(p.passport_country),
      dateOfBirth: p.date_of_birth == null ? null : String(p.date_of_birth),
      dietary: p.dietary == null ? null : String(p.dietary),
      notes: p.notes == null ? null : String(p.notes),
      createdAt: String(p.created_at ?? new Date().toISOString()),
      updatedAt: String(p.updated_at ?? new Date().toISOString()),
      lastTouredAt: stat.lastTouredAt,
      totalTours: stat.totalTours,
    };
  });

  return listAppPageShell(
    <div className="mx-auto max-w-7xl space-y-6 pb-12">
      <div>
        <h1 className="text-2xl font-bold text-lp-text">Personnel library</h1>
        <p className="mt-1 text-sm text-lp-text-secondary">
          Workspace roster with quick visibility into recency and tour usage.
        </p>
      </div>
      <Suspense
        fallback={<div className="h-48 animate-pulse rounded-xl border border-lp-border bg-lp-surface/50" />}
      >
        <PersonLibraryClient initial={rows} />
      </Suspense>
    </div>
  );
}
