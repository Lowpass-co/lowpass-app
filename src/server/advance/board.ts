/* ============================================
   loadAdvanceBoard — everything the tour's Advance board shows, in one pass.

   Reads: tour, routing (venue through resolveAdvanceVenue — never the gated
   venue_* columns directly), advance instances + their form configs, TM-only
   flags (one lookup), pending venue/pack answers, intake links, templates.
   Writes nothing.
   ============================================ */

import type { SupabaseClient } from '@supabase/supabase-js';
import {
  boardColumns,
  changeCount,
  columnKey,
  dayChanges,
  requestLabel,
  requestState,
  summariseShow,
  type AdvData,
  type AdvSection,
  type CellState,
  type IntakeLinkLite,
  type RequestState,
} from '@/lib/advance/board';
import { resolveAdvanceVenue, type AdvanceVenueSection } from '@/lib/advance/venue';
import type { RoutingVenueSource } from '@/lib/venues/resolveVenue';
import { markTmOnly } from './advanceSections';
import { dayHasAdvance, loadTemplateSet, templateForDay, type TemplateSet } from './templates';
import { isEmptyAnswer } from '@/lib/advance/intake';

export const ROUTING_VENUE_SELECT =
  'id, date, day_type, city, country, address, venue_name, venue_website, venue_phone, venue_capacity, canonical_venue_id, venue_frozen_at, canonical:canonical_venues(id, name, address, city, country, capacity)';

export interface BoardCell {
  state: CellState;
  answered: number;
  total: number;
  toReview: number;
}

export interface BoardShowRow {
  kind: 'show';
  routingId: string;
  date: string;
  dayType: string;
  venue: string | null;
  city: string | null;
  templateName: string | null;
  changes: number;
  started: boolean;
  cells: Record<string, BoardCell | null>;
  request: RequestState & { label: string };
  answered: number;
  total: number;
  toReview: number;
  /** label/value pairs for search, plus venue/city. */
  answers: { section: string; label: string; value: string }[];
}

export interface BoardGapRow {
  kind: 'gap';
  key: string;
  from: string;
  to: string;
  label: string;
}

export type BoardRow = BoardShowRow | BoardGapRow;

export interface BoardData {
  tour: { id: string; name: string; workspaceId: string };
  columns: { key: string; label: string }[];
  rows: BoardRow[];
  counts: { shows: number; review: number; waiting: number; notSent: number; done: number };
  templates: { id: string; name: string }[];
  hasMapping: boolean;
}

type RoutingRow = RoutingVenueSource & { id: string; date: string; day_type: string | null };
type InstanceRow = { id: string; routing_id: string; form_config_id: string | null; data: AdvData | null };
type ConfigRow = { id: string; sections: AdvSection[] | null; layout_template_id: string | null };

function valueText(v: unknown): string {
  if (typeof v === 'string') return v;
  if (typeof v === 'boolean') return v ? 'Yes' : 'No';
  if (typeof v === 'number') return String(v);
  return JSON.stringify(v);
}

const DAY_TYPE_WORDS: Record<string, string> = { travel: 'Travel', off: 'Day off', rehearsal: 'Rehearsal', press: 'Press', show: 'Show', festival: 'Festival' };

export async function loadAdvanceBoard(client: SupabaseClient, tourId: string, now = Date.now()): Promise<BoardData | null> {
  const { data: tour } = await client.from('tours').select('id, name, workspace_id').eq('id', tourId).maybeSingle<{
    id: string;
    name: string;
    workspace_id: string;
  }>();
  if (!tour) return null;

  const [{ data: routingRows, error: rErr }, set] = await Promise.all([
    client.from('routing').select(ROUTING_VENUE_SELECT).eq('tour_id', tourId).order('date', { ascending: true }),
    loadTemplateSet(client, tour.workspace_id),
  ]);
  if (rErr) throw new Error(`advance board routing: ${rErr.message}`);
  const routing = (routingRows ?? []) as RoutingRow[];
  const ids = routing.map((r) => r.id);

  const { data: instRows } = ids.length
    ? await client.from('advance_instances').select('id, routing_id, form_config_id, data').in('routing_id', ids)
    : { data: [] };
  const instances = (instRows ?? []) as InstanceRow[];
  const instByRouting = new Map(instances.map((i) => [i.routing_id, i]));

  const configIds = [...new Set(instances.map((i) => i.form_config_id).filter((x): x is string => !!x))];
  const { data: cfgRows } = configIds.length
    ? await client.from('advance_form_configs').select('id, sections, layout_template_id').in('id', configIds)
    : { data: [] };
  const configs = (cfgRows ?? []) as ConfigRow[];
  const marked = await markTmOnly(client, configs.map((c) => (Array.isArray(c.sections) ? c.sections : [])));
  const sectionsByConfig = new Map(configs.map((c, i) => [c.id, marked[i]]));
  const configById = new Map(configs.map((c) => [c.id, c]));

  const instanceIds = instances.map((i) => i.id);
  const [{ data: pendRows }, { data: linkRows }] = await Promise.all([
    instanceIds.length
      ? client
          .from('intake_pending_answers')
          .select('advance_instance_id, section_id')
          .in('advance_instance_id', instanceIds)
          .eq('status', 'pending')
      : Promise.resolve({ data: [] }),
    client
      .from('advance_intake_links')
      .select('routing_id, status, created_at, sent_at, last_viewed_at, submitted_at, revoked_at, expires_at')
      .eq('tour_id', tourId),
  ]);
  const pending = new Map<string, Record<string, number>>();
  for (const p of (pendRows ?? []) as { advance_instance_id: string; section_id: string }[]) {
    const m = pending.get(p.advance_instance_id) ?? {};
    m[p.section_id] = (m[p.section_id] ?? 0) + 1;
    pending.set(p.advance_instance_id, m);
  }
  const linksByRouting = new Map<string, IntakeLinkLite[]>();
  for (const l of (linkRows ?? []) as (IntakeLinkLite & { routing_id: string })[]) {
    const list = linksByRouting.get(l.routing_id) ?? [];
    list.push(l);
    linksByRouting.set(l.routing_id, list);
  }

  const templateById = new Map(set.templates.map((t) => [t.id, t]));
  type Built = { row: BoardShowRow; sections: AdvSection[]; data: AdvData | null; pend: Record<string, number>; live: boolean };
  const built: (Built | { gap: RoutingRow })[] = [];

  for (const r of routing) {
    const inst = instByRouting.get(r.id) ?? null;
    if (!dayHasAdvance(set, r.day_type, !!inst)) {
      built.push({ gap: r });
      continue;
    }
    const cfg = inst?.form_config_id ? configById.get(inst.form_config_id) ?? null : null;
    const tpl = cfg?.layout_template_id ? templateById.get(cfg.layout_template_id) ?? null : templateForDay(set, r.day_type);
    const sections: AdvSection[] = inst?.form_config_id ? sectionsByConfig.get(inst.form_config_id) ?? [] : tpl?.sections ?? [];
    const data = inst?.data ?? null;
    const pend = inst ? pending.get(inst.id) ?? {} : {};
    const links = linksByRouting.get(r.id) ?? [];
    const pre = requestState(links, 0, false, now);
    const summary = summariseShow(sections, data, pend, pre.live);
    const req = requestState(links, summary.toReview, summary.complete, now);
    const venue = resolveAdvanceVenue(r, sections as unknown as AdvanceVenueSection[], data);
    const answers: BoardShowRow['answers'] = [];
    for (const s of sections) {
      for (const f of s.fields ?? []) {
        const v = data?.[s.template_id]?.[f.id];
        if (!isEmptyAnswer(v)) answers.push({ section: s.label, label: f.label, value: valueText(v) });
      }
    }
    built.push({
      sections,
      data,
      pend,
      live: req.live,
      row: {
        kind: 'show',
        routingId: r.id,
        date: r.date,
        dayType: r.day_type ?? '',
        venue: venue.name,
        city: venue.city ?? r.city ?? null,
        templateName: tpl?.name ?? null,
        changes: cfg && tpl ? changeCount(dayChanges(sections, tpl.sections)) : 0,
        started: !!inst,
        cells: {},
        request: { ...req, label: requestLabel(req, now) },
        answered: summary.answered,
        total: summary.total,
        toReview: summary.toReview,
        answers,
      },
    });
  }

  const shows = built.filter((b): b is Built => 'row' in b);
  const columns = boardColumns(shows.map((s) => ({ sections: s.sections })));
  for (const s of shows) {
    const summary = summariseShow(s.sections, s.data, s.pend, s.live);
    const byKey = new Map(summary.sections.map((p) => [columnKey(p.label), p]));
    for (const c of columns) {
      const p = byKey.get(c.key);
      s.row.cells[c.key] = p ? { state: p.state, answered: p.answered, total: p.total, toReview: p.toReview } : null;
    }
  }

  // Days without an advance fold into one thin row per run.
  const rows: BoardRow[] = [];
  let run: RoutingRow[] = [];
  const flush = () => {
    if (!run.length) return;
    const words = [...new Set(run.map((r) => DAY_TYPE_WORDS[(r.day_type ?? '').split(',')[0].trim().toLowerCase()] ?? 'No advance'))];
    rows.push({ kind: 'gap', key: run[0].id, from: run[0].date, to: run[run.length - 1].date, label: words.join(', ') });
    run = [];
  };
  for (const b of built) {
    if ('gap' in b) run.push(b.gap);
    else {
      flush();
      rows.push(b.row);
    }
  }
  flush();

  const counts = { shows: shows.length, review: 0, waiting: 0, notSent: 0, done: 0 };
  for (const s of shows) {
    const k = s.row.request.kind;
    if (k === 'done') counts.done++;
    else if (s.row.toReview > 0) counts.review++;
    else if (k === 'sent' || k === 'opened') counts.waiting++;
    else if (k === 'not_sent' || k === 'made') counts.notSent++;
  }

  return {
    tour: { id: tour.id, name: tour.name, workspaceId: tour.workspace_id },
    columns,
    rows,
    counts,
    templates: set.templates.map((t) => ({ id: t.id, name: t.name })),
    hasMapping: Object.keys(set.mapping).length > 0,
  };
}

export type { TemplateSet };
