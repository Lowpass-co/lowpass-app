/* ============================================================
   LOWPASS — "Needs you" queue (Design pass §9 · VIS-WS-04)

   Rule-generated replacement for the workspace activity feed. Every item is a
   derived call to action with a verb + time anchor (§8), sorted most-urgent
   first. Three rules:

     1. Advances untouched × days-to-rehearsal — a tour with show/festival days
        whose advance is missing / not-started, anchored to its first rehearsal
        (or first show).
     2. Ended, unsettled — a tour whose window has closed with show days lacking a
        reconciled settlement.
     3. Unconfirmed crew × days-to-first-show — a tour with tentative /
        awaiting-contract roster rows and shows still to come.

   Self-contained + bounded (fetches keyed by the workspace's tour ids). Reads no
   venue columns — venue-guardrail-clean.
   ============================================================ */

import type { SupabaseClient } from '@supabase/supabase-js';

export interface NeedsYouItem {
  id: string;
  kind: 'advances' | 'settle' | 'crew';
  artistName: string;
  tourName: string;
  /** Derived status line: verb + time anchor, no mood words. */
  status: string;
  href: string;
  /** Sort key — lower = more urgent (ended tours sort to the top as negatives). */
  urgency: number;
}

export interface NeedsYouTour {
  id: string;
  name: string;
  artist_id: string | null;
  status: string | null;
  start_date: string | null;
  end_date: string | null;
}

const SHOW_TYPES = ['show', 'festival'];

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}
function daysFromToday(iso: string, today = todayIso()): number {
  const a = new Date(`${today}T12:00:00`).getTime();
  const b = new Date(`${iso.slice(0, 10)}T12:00:00`).getTime();
  if (Number.isNaN(b)) return Infinity;
  return Math.round((b - a) / 86_400_000);
}
function isShowDay(dayType: string | null): boolean {
  const first = (dayType ?? '').split(',')[0]?.trim().toLowerCase();
  return SHOW_TYPES.includes(first ?? '');
}
function isRehearsal(dayType: string | null): boolean {
  return (dayType ?? '').split(',').some((t) => t.trim().toLowerCase() === 'rehearsal');
}
function plural(n: number, word: string): string {
  return `${n} ${word}${n === 1 ? '' : 's'}`;
}
function inDays(n: number): string {
  if (n <= 0) return 'now';
  return `in ${plural(n, 'day')}`;
}

export async function computeNeedsYou(
  supabase: SupabaseClient,
  tours: NeedsYouTour[],
  artistNameById: Map<string, string>,
): Promise<NeedsYouItem[]> {
  const tourIds = tours.map((t) => t.id);
  if (tourIds.length === 0) return [];
  const today = todayIso();

  // Bounded fetches keyed by the workspace's tours (RLS scopes to workspace).
  const [routingRes, personnelRes] = await Promise.all([
    supabase.from('routing').select('id, tour_id, date, day_type').in('tour_id', tourIds),
    supabase.from('tour_personnel').select('tour_id, status').in('tour_id', tourIds),
  ]);
  type RoutingRow = { id: string; tour_id: string; date: string; day_type: string | null };
  const routing = (routingRes.data ?? []) as RoutingRow[];
  const personnel = (personnelRes.data ?? []) as Array<{ tour_id: string; status: string | null }>;

  const showRoutingIds = routing.filter((r) => isShowDay(r.day_type)).map((r) => r.id);
  const [advanceRes, settlementRes] =
    showRoutingIds.length > 0
      ? await Promise.all([
          supabase.from('advance_instances').select('routing_id, status').in('routing_id', showRoutingIds),
          supabase.from('settlement').select('routing_id, status').in('routing_id', showRoutingIds),
        ])
      : [{ data: [] as unknown[] }, { data: [] as unknown[] }];
  const advanceByRouting = new Map<string, string>();
  for (const a of (advanceRes.data ?? []) as Array<{ routing_id: string; status: string | null }>) {
    advanceByRouting.set(a.routing_id, a.status ?? 'not_started');
  }
  const reconciledRouting = new Set<string>();
  for (const s of (settlementRes.data ?? []) as Array<{ routing_id: string; status: string | null }>) {
    if (s.status === 'reconciled') reconciledRouting.add(s.routing_id);
  }

  const routingByTour = new Map<string, RoutingRow[]>();
  for (const r of routing) {
    const list = routingByTour.get(r.tour_id) ?? [];
    list.push(r);
    routingByTour.set(r.tour_id, list);
  }
  const unconfirmedCrewByTour = new Map<string, number>();
  for (const p of personnel) {
    if (p.status === 'tentative' || p.status === 'awaiting_contract') {
      unconfirmedCrewByTour.set(p.tour_id, (unconfirmedCrewByTour.get(p.tour_id) ?? 0) + 1);
    }
  }

  const items: NeedsYouItem[] = [];

  for (const t of tours) {
    const artistName = (t.artist_id && artistNameById.get(t.artist_id)) || 'Artist';
    const rows = (routingByTour.get(t.id) ?? []).slice().sort((a, b) => a.date.localeCompare(b.date));
    const showDays = rows.filter((r) => isShowDay(r.day_type));
    const upcomingShows = showDays.filter((r) => daysFromToday(r.date, today) >= 0);
    const firstShow = upcomingShows[0] ?? null;
    const firstRehearsal = rows.find((r) => isRehearsal(r.day_type) && daysFromToday(r.date, today) >= 0) ?? null;
    const ended = !!t.end_date && daysFromToday(t.end_date, today) < 0;

    // Rule 1 — advances untouched (upcoming shows only).
    const untouched = upcomingShows.filter((r) => {
      const st = advanceByRouting.get(r.id);
      return !st || st === 'not_started';
    }).length;
    if (untouched > 0 && (firstRehearsal || firstShow)) {
      const anchorDays = daysFromToday((firstRehearsal ?? firstShow!).date, today);
      const anchorLabel = firstRehearsal ? `rehearsals ${inDays(anchorDays)}` : `first show ${inDays(anchorDays)}`;
      items.push({
        id: `adv-${t.id}`,
        kind: 'advances',
        artistName,
        tourName: t.name,
        status: `${plural(untouched, 'advance')} not started · ${anchorLabel}`,
        href: `/advance/${t.id}`,
        urgency: anchorDays,
      });
    }

    // Rule 2 — ended, unsettled.
    if (ended && showDays.length > 0) {
      const unsettled = showDays.filter((r) => !reconciledRouting.has(r.id)).length;
      if (unsettled > 0) {
        const d = new Date(`${t.end_date!.slice(0, 10)}T12:00:00`);
        const endLabel = Number.isNaN(d.getTime())
          ? t.end_date
          : d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short' });
        items.push({
          id: `settle-${t.id}`,
          kind: 'settle',
          artistName,
          tourName: t.name,
          status: `Ended ${endLabel} · ${unsettled === showDays.length ? 'not settled' : `${plural(unsettled, 'show')} unsettled`}`,
          href: `/budget/${t.id}/settlement`,
          urgency: daysFromToday(t.end_date!, today), // negative — ended tours float up
        });
      }
    }

    // Rule 3 — unconfirmed crew × days-to-first-show.
    const crew = unconfirmedCrewByTour.get(t.id) ?? 0;
    if (crew > 0 && firstShow) {
      const anchorDays = daysFromToday(firstShow.date, today);
      items.push({
        id: `crew-${t.id}`,
        kind: 'crew',
        artistName,
        tourName: t.name,
        status: `${plural(crew, 'crew member')} unconfirmed · first show ${inDays(anchorDays)}`,
        href: `/operations/${t.id}/personnel`,
        urgency: anchorDays,
      });
    }
  }

  // Most urgent first: ended-unsettled (negative urgency) → soonest anchors.
  // Pre-flight — dedupe by id BEFORE slicing so the "N to act on" count can never
  // exceed the rendered rows. NeedsYouQueue keys each row on item.id, so a
  // duplicate id (e.g. the same tour appearing twice upstream) silently collapses
  // to one DOM row while the raw length still counted both — the observed
  // "8 to act on" over 4 rows. One source now: this deduped list.
  const seen = new Set<string>();
  const deduped = items.filter((it) => {
    if (seen.has(it.id)) return false;
    seen.add(it.id);
    return true;
  });
  deduped.sort((a, b) => a.urgency - b.urgency);
  return deduped.slice(0, 8);
}
