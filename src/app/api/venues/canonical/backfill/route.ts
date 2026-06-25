/* ============================================
   LOWPASS — Canonical venue backfill (run-once, admin)

   POST → for the caller's workspace, resolve routing rows that have a
   free-text venue_name but no canonical_venue_id to a Google Place ID,
   then:
     • HIGH CONFIDENCE (top suggestion clearly contains the typed name)
       → find-or-create the canonical venue + link the routing row.
     • AMBIGUOUS / low confidence → write a canonical_venue_candidates
       row (status='pending') for manual confirm/reject. NEVER auto-link
       a weak match (that's how "Ally Pally" and "Alexandra Palace, North
       Greenwich" wrongly merge/split).

   Idempotent: rows already linked are skipped; candidates upsert on
   (workspace, source_kind, source_id). Re-runnable.

   Admin-gated. Places calls ride the google rate-limit lane. This is the
   backfill the ticket describes — Adam runs it once per workspace.
   ============================================ */

import { NextResponse } from 'next/server';
import { createServerSupabaseClient, createServiceSupabaseClient } from '@/lib/supabase-server';
import { guardGoogleCall, logGoogleCall } from '@/lib/external/googleUsage';
import { findOrCreateCanonicalVenue } from '@/lib/venues/canonical';

const PLACES_AUTOCOMPLETE_URL = 'https://places.googleapis.com/v1/places:autocomplete';
/** Cap distinct names per run so one call can't fan out unbounded. */
const MAX_NAMES_PER_RUN = 200;

function normalize(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

/** High confidence iff the top suggestion's normalized text CONTAINS the
 *  typed name (and the typed name is substantial). Conservative on purpose:
 *  aliases like "Ally Pally" → "Alexandra Palace" don't contain-match, so
 *  they fall through to manual review rather than mis-linking. */
function isHighConfidence(rawName: string, suggestionText: string): boolean {
  const a = normalize(rawName);
  const b = normalize(suggestionText);
  if (a.length < 4 || !b) return false;
  return b === a || b.includes(a);
}

interface PlacesSuggestion {
  placeId: string;
  text: string;
}

async function placesAutocomplete(input: string, key: string): Promise<PlacesSuggestion[]> {
  const res = await fetch(PLACES_AUTOCOMPLETE_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Goog-Api-Key': key,
      'X-Goog-FieldMask': 'suggestions.placePrediction.placeId,suggestions.placePrediction.text.text',
    },
    body: JSON.stringify({ input }),
  });
  if (!res.ok) return [];
  const data = (await res.json()) as {
    suggestions?: Array<{ placePrediction?: { placeId?: string; text?: { text?: string } } }>;
  };
  return (data.suggestions ?? [])
    .map((s) => s.placePrediction)
    .filter((p): p is { placeId?: string; text?: { text?: string } } => !!p?.placeId)
    .map((p) => ({ placeId: p.placeId!, text: p.text?.text ?? '' }))
    .filter((s) => s.text);
}

export async function POST() {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { data: isAdmin, error: rpcErr } = await supabase.rpc('is_workspace_admin');
  if (rpcErr) return NextResponse.json({ error: 'Admin check failed' }, { status: 500 });
  if (!isAdmin) return NextResponse.json({ error: 'Workspace admin required' }, { status: 403 });

  const { data: profile } = await supabase
    .from('profiles')
    .select('workspace_id')
    .eq('id', user.id)
    .single();
  if (!profile?.workspace_id) return NextResponse.json({ error: 'No workspace' }, { status: 403 });
  const workspaceId = profile.workspace_id as string;

  const key = process.env.GOOGLE_PLACES_API_KEY;
  if (!key) return NextResponse.json({ error: 'Places API not configured' }, { status: 503 });

  // Pre-flight google rate-limit (one guard for the run; each call logged).
  const g = await guardGoogleCall('google.places.autocomplete');
  if (!g.ok) return g.response;

  // Unlinked routing rows for this workspace (RLS scopes to the workspace).
  const { data: rows } = await supabase
    .from('routing')
    .select('id, venue_name, city')
    .is('canonical_venue_id', null)
    .not('venue_name', 'is', null);

  // Group rows by normalised name so we resolve each distinct venue once.
  const groups = new Map<string, { name: string; city: string | null; ids: string[] }>();
  for (const r of (rows ?? []) as Array<{ id: string; venue_name: string | null; city: string | null }>) {
    const name = (r.venue_name ?? '').trim();
    if (!name) continue;
    const k = normalize(name);
    if (!k) continue;
    const g0 = groups.get(k) ?? { name, city: r.city, ids: [] };
    g0.ids.push(r.id);
    groups.set(k, g0);
  }

  const distinct = [...groups.values()];
  const truncated = distinct.length > MAX_NAMES_PER_RUN;
  const toProcess = distinct.slice(0, MAX_NAMES_PER_RUN);

  const svc = createServiceSupabaseClient();
  let linked = 0;
  let candidates = 0;
  const reviewExamples: string[] = [];

  for (const grp of toProcess) {
    const query = grp.city ? `${grp.name}, ${grp.city}` : grp.name;
    const suggestions = await placesAutocomplete(query, key);
    await logGoogleCall(g.ctx, suggestions.length >= 0 ? 'ok' : 'error');
    const top = suggestions[0];

    if (top && isHighConfidence(grp.name, top.text)) {
      const canonicalId = await findOrCreateCanonicalVenue(
        { placeId: top.placeId, name: top.text, city: grp.city },
        svc,
      );
      if (canonicalId) {
        // Link every routing row that shared this name (session client → RLS).
        await supabase.from('routing').update({ canonical_venue_id: canonicalId }).in('id', grp.ids);
        linked += grp.ids.length;
        continue;
      }
    }

    // Ambiguous / no confident match → review queue (one row per source row).
    for (const id of grp.ids) {
      const { error } = await svc.from('canonical_venue_candidates').upsert(
        {
          workspace_id: workspaceId,
          source_kind: 'routing',
          source_id: id,
          raw_name: grp.name,
          raw_city: grp.city,
          suggested_place_id: top?.placeId ?? null,
          suggested_name: top?.text ?? null,
          confidence: top ? 0.5 : 0,
          status: 'pending',
        },
        { onConflict: 'workspace_id,source_kind,source_id' },
      );
      if (!error) candidates += 1;
    }
    if (reviewExamples.length < 10) reviewExamples.push(grp.name);
  }

  return NextResponse.json({
    ok: true,
    distinct_names: distinct.length,
    processed: toProcess.length,
    truncated,
    linked_rows: linked,
    candidates,
    review_examples: reviewExamples,
    note: 'Ambiguous matches are in canonical_venue_candidates (status=pending) for admin review.',
  });
}
