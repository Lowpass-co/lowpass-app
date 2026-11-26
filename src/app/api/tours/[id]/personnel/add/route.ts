/* ============================================
   POST /api/tours/[id]/personnel/add — the Add crew panel (Nov 2026, Adam)

   Body: { people: [{
     person_id?: string,                       // someone in People, or
     new?: { name, email?, phone? },           // someone new (made in People)
     role?: string, role_tag?: string,         // blank role → their usual role;
                                               // no tag → worked out from the role
     starts_on?: 'YYYY-MM-DD', ends_on?: …,    // blank = the whole tour
     login?: { preset, email? }                // optional app access, THIS tour
   }] }  (1–50 people)

   → { results: [{ name, ok, error?, person_id?, id?, rateCard?, login? }] }

   Admin / manager adds; a `login` needs an ADMIN (the database only lets
   admins invite or change tour access) — checked up front so nothing is
   half-written. Each person is added on their own: one failure (already on
   the tour) doesn't stop the rest, and the response says who failed and why.
   A "new" person whose email already belongs to someone in People is that
   person — no duplicate record.
   ============================================ */

import { NextResponse } from 'next/server';
import { requireWrite } from '@/lib/auth/workspace-check';
import { createServerSupabaseClient } from '@/lib/supabase-server';
import { getActiveMembership } from '@/lib/permissions/server';
import { getViewerAccess, runsTour } from '@/lib/permissions/tourAccess';
import { PRESETS, type Preset } from '@/lib/permissions/areas';
import { addPersonToTour, createPerson } from '@/server/people/addToTour';
import { giveTourLogin, type LoginResult } from '@/server/people/tourLogin';
import { tourFromParams, withDerivedRefresh } from '@/server/budget/withDerivedRefresh';

export const dynamic = 'force-dynamic';

const MAX = 50;

type Entry = {
  person_id?: unknown;
  new?: { name?: unknown; email?: unknown; phone?: unknown } | null;
  role?: unknown;
  role_tag?: unknown;
  starts_on?: unknown;
  ends_on?: unknown;
  login?: { preset?: unknown; email?: unknown } | null;
};

export type AddCrewResult = {
  name: string;
  ok: boolean;
  error?: string;
  person_id?: string;
  id?: string;
  rateCard?: Record<string, unknown> | null;
  login?: LoginResult;
};

const str = (v: unknown) => (typeof v === 'string' ? v.trim() : '');
const isPreset = (v: unknown): v is Preset => typeof v === 'string' && (PRESETS as readonly string[]).includes(v);

async function postHandler(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const supabase = await createServerSupabaseClient();
  // Runs this tour: admin / manager, or a Tour manager on one of theirs (298).
  const auth = await requireWrite(supabase, { runsTour: true, tourId: (await params).id });
  if ('error' in auth) return auth.error;
  const { id: tourId } = await params;
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const membership = await getActiveMembership(supabase, user.id);
  if (!membership) return NextResponse.json({ error: 'No active workspace' }, { status: 403 });
  if (!runsTour(await getViewerAccess(supabase, user.id, tourId))) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const body = (await request.json().catch(() => null)) as { people?: unknown } | null;
  const people = Array.isArray(body?.people) ? (body!.people as Entry[]) : null;
  if (!people || people.length === 0) return NextResponse.json({ error: 'Pick at least one person' }, { status: 400 });
  if (people.length > MAX) return NextResponse.json({ error: `At most ${MAX} at once` }, { status: 400 });

  const { data: tour } = await supabase.from('tours').select('workspace_id').eq('id', tourId).maybeSingle();
  if (!tour) return NextResponse.json({ error: 'Tour not found' }, { status: 404 });
  const workspaceId = (tour as { workspace_id: string }).workspace_id;

  // Validate everything before writing anything.
  for (const e of people) {
    if (!e || typeof e !== 'object') return NextResponse.json({ error: 'Bad entry' }, { status: 400 });
    const hasId = typeof e.person_id === 'string' && e.person_id.length > 0;
    const hasNew = !!e.new && str(e.new.name).length > 0;
    if (hasId === hasNew) return NextResponse.json({ error: 'Each entry needs a person_id or a new name' }, { status: 400 });
    if (e.login != null && !isPreset(e.login.preset)) {
      return NextResponse.json({ error: 'Unknown access preset' }, { status: 400 });
    }
  }
  if (people.some((e) => e.login) && membership.role !== 'admin') {
    return NextResponse.json({ error: 'Only workspace admins can give app access' }, { status: 403 });
  }
  if (people.some((e) => e.login) && membership.workspace_id !== workspaceId) {
    return NextResponse.json({ error: "Switch to this tour's workspace to give app access" }, { status: 409 });
  }

  const origin = new URL(request.url).origin;
  const results: AddCrewResult[] = [];
  for (const e of people) {
    let personId = typeof e.person_id === 'string' ? e.person_id : '';
    let name = str(e.new?.name);

    if (!personId) {
      const email = str(e.new?.email).toLowerCase();
      let existing: { id: string; name: string } | null = null;
      if (email) {
        const { data } = await supabase
          .from('personnel')
          .select('id, name')
          .eq('workspace_id', workspaceId)
          .ilike('email', email.replace(/[%_\\]/g, '\\$&'))
          .limit(1)
          .maybeSingle();
        existing = data as { id: string; name: string } | null;
      }
      if (existing) {
        personId = existing.id;
        name = existing.name;
      } else {
        const made = await createPerson(supabase, workspaceId, {
          name,
          email: email || null,
          phone: str(e.new?.phone) || null,
          role: str(e.role) || null,
        });
        if (!made.ok) {
          results.push({ name, ok: false, error: made.error });
          continue;
        }
        personId = made.id;
      }
    }

    const r = await addPersonToTour(supabase, {
      tourId,
      workspaceId,
      personId,
      role: str(e.role) || null,
      roleTag: e.role_tag,
      startsOn: e.starts_on,
      endsOn: e.ends_on,
      actorUserId: user.id,
    });
    if (!name) {
      const { data } = await supabase.from('persons').select('full_name').eq('id', personId).maybeSingle();
      name = (data as { full_name?: string } | null)?.full_name ?? 'Person';
    }
    if (!r.ok) {
      results.push({ name, ok: false, error: r.error, person_id: personId });
      continue;
    }

    const out: AddCrewResult = { name, ok: true, person_id: personId, id: r.id, rateCard: r.rateCard };
    if (e.login && isPreset(e.login.preset)) {
      out.login = await giveTourLogin(
        supabase,
        { workspaceId, tourId, actorUserId: user.id, origin },
        personId,
        e.login.preset,
        str(e.login.email) || str(e.new?.email) || null,
      );
    }
    results.push(out);
  }

  // 200 when anyone was added (the derived refresh runs); 400 when no one was.
  const anyAdded = results.some((r) => r.ok);
  return NextResponse.json({ results }, { status: anyAdded ? 200 : 400 });
}

// Roster changes move salaries and per diems → refresh the budget's payroll lines.
export const POST = withDerivedRefresh(postHandler, 'payroll', tourFromParams);
