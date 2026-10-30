/* ============================================
   LOWPASS — Advance export data (Oct 2026)

   Two documents, both through the shared export shell:
     - 'advance'           one show's filled advance (the TM's record);
     - 'advance-questions' the questions sent to a venue, with room to answer.

   Read-only. The show comes from loadAdvanceShow (the same reads as the show
   page, RLS-scoped); the venue sheet's questions are the venue form's own
   schema (buildIntakeFormSchema: never TM-only groups, never contacts/files)
   cut down to what the request asked (limitSchemaToAsked) — so the PDF can
   never show a venue something the online form wouldn't.
   ============================================ */

import type { SupabaseClient } from '@supabase/supabase-js';
import { loadAdvanceShow, type AdvanceShowData, type FieldSource } from '@/server/advance/show';
import { countedFields, questionSections } from '@/lib/advance/board';
import { buildIntakeFormSchema, isEmptyAnswer, type IntakeSection } from '@/lib/advance/intake';
import { limitSchemaToAsked } from '@/lib/advance/askFields';
import { listLaborCallsForRouting } from '@/lib/labor-calls/server';
import type { LaborCall } from '@/lib/labor-calls/types';
import { resolveArtistLogoUrl } from '@/lib/artists/imageUrl';

export interface AdvanceExportHead {
  artist: { name: string | null; logoUrl: string | null };
  tour: { id: string; name: string; start_date: string | null; end_date: string | null };
  show: {
    date: string;
    dayType: string;
    city: string | null;
    venue: AdvanceShowData['venue'];
    templateName: string | null;
  };
}

export interface AnswerRow {
  label: string;
  type: string;
  /** Display text, or null when there's no answer yet. */
  value: string | null;
  /** Where it came from, in words ("Tech pack p.3", "Venue", "Earlier show"), or null. */
  source: string | null;
}

export interface AdvanceExportData extends AdvanceExportHead {
  groups: { label: string; tmOnly: boolean; rows: AnswerRow[]; answered: number; total: number }[];
  progress: { answered: number; total: number };
  contacts: { name: string; role: string; phone: string; email: string }[];
  crewCalls: LaborCall[];
  linked: AdvanceShowData['linked'];
  documents: { name: string; pages: number | null; added: string }[];
}

export interface QuestionRow {
  label: string;
  type: string;
  options: string[];
  help: string | null;
  /** The answer already held (printed only when the template asks to prefill). */
  current: string | null;
}

export interface AdvanceQuestionsData extends AdvanceExportHead {
  groups: { label: string; rows: QuestionRow[] }[];
  /** The online form for this request, when the sheet comes from one. */
  link: string | null;
  recipientName: string | null;
}

/** An answer as words. Booleans read Yes/No; lists and objects never print raw JSON. */
export function displayValue(v: unknown): string | null {
  if (isEmptyAnswer(v)) return null;
  if (typeof v === 'boolean') return v ? 'Yes' : 'No';
  if (typeof v === 'number') return String(v);
  if (typeof v === 'string') return v.trim() || null;
  if (Array.isArray(v)) {
    const parts = v.map((x) => displayValue(x)).filter((x): x is string => !!x);
    return parts.length ? parts.join(', ') : null;
  }
  return null;
}

export function sourceLabel(src: FieldSource | undefined): string | null {
  if (!src) return null;
  if (src.kind === 'pack') {
    const name = (src.file_name ?? 'Info pack').replace(/\.[a-z0-9]+$/i, '');
    return src.page ? `${name}, p.${src.page}` : name;
  }
  if (src.kind === 'venue') return 'Venue';
  if (src.kind === 'previous') return 'Earlier show';
  return null; // typed by you — nothing to say
}

async function loadHead(client: SupabaseClient, show: AdvanceShowData): Promise<AdvanceExportHead> {
  const { data: tour } = await client
    .from('tours')
    .select('id, name, start_date, end_date, artist_id')
    .eq('id', show.tour.id)
    .maybeSingle<{ id: string; name: string; start_date: string | null; end_date: string | null; artist_id: string | null }>();
  const { data: artist } = tour?.artist_id
    ? await client
        .from('artists')
        .select('name, branding, spotify_id, spotify_image_url')
        .eq('id', tour.artist_id)
        .maybeSingle<{ name: string; branding: unknown; spotify_id: string | null; spotify_image_url: string | null }>()
    : { data: null };
  return {
    artist: { name: artist?.name ?? show.tour.artistName, logoUrl: artist ? await resolveArtistLogoUrl(artist) : null },
    tour: { id: show.tour.id, name: tour?.name ?? show.tour.name, start_date: tour?.start_date ?? null, end_date: tour?.end_date ?? null },
    show: { date: show.routing.date, dayType: show.routing.dayType, city: show.routing.city, venue: show.venue, templateName: show.template?.name ?? null },
  };
}

/** Pure: the show's question groups as printable rows. */
export function answerGroups(show: Pick<AdvanceShowData, 'sections' | 'data' | 'sources'>, withSources: boolean): AdvanceExportData['groups'] {
  return questionSections(show.sections).map((s) => {
    const rows = countedFields(s).map((f) => {
      const value = displayValue(show.data[s.template_id]?.[f.id]);
      return {
        label: f.label,
        type: f.type,
        value,
        source: withSources && value ? sourceLabel(show.sources[`${s.template_id}:${f.id}`]) : null,
      };
    });
    const answered = rows.filter((r) => r.value).length;
    return { label: s.label, tmOnly: !!s.tm_only, rows, answered, total: rows.length };
  });
}

/** Pure: every contact held on the show, de-duplicated. */
export function showContacts(data: AdvanceShowData['data']): AdvanceExportData['contacts'] {
  const out: AdvanceExportData['contacts'] = [];
  const seen = new Set<string>();
  for (const sec of Object.values(data ?? {})) {
    const list = (sec as Record<string, unknown> | null)?.contacts;
    if (!Array.isArray(list)) continue;
    for (const c of list as Record<string, unknown>[]) {
      const str = (k: string) => (typeof c?.[k] === 'string' ? (c[k] as string).trim() : '');
      const name = [str('first_name'), str('last_name')].filter(Boolean).join(' ');
      if (!name && !str('email') && !str('phone')) continue;
      const key = `${name}|${str('email')}|${str('phone')}`.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      out.push({ name, role: str('role'), phone: str('phone'), email: str('email') });
    }
  }
  return out;
}

export async function loadAdvanceExportData(
  client: SupabaseClient,
  tourId: string,
  routingId: string,
  opts: { sources: boolean },
): Promise<AdvanceExportData | null> {
  const show = await loadAdvanceShow(client, tourId, routingId);
  if (!show) return null;
  const [head, crewCalls] = await Promise.all([loadHead(client, show), listLaborCallsForRouting(client, show.tour.workspaceId, routingId).catch(() => [] as LaborCall[])]);
  const groups = answerGroups(show, opts.sources);
  const answered = groups.reduce((n, g) => n + g.answered, 0);
  const total = groups.reduce((n, g) => n + g.total, 0);
  return {
    ...head,
    groups,
    progress: { answered, total },
    contacts: showContacts(show.data),
    crewCalls,
    linked: show.linked,
    documents: show.documents.map((d) => ({ name: d.file_name, pages: d.page_count, added: d.created_at })),
  };
}

/** Pure: the venue form's questions, cut to what was asked. */
export function questionGroups(
  show: Pick<AdvanceShowData, 'allSections' | 'data'>,
  askFields: string[] | null,
): AdvanceQuestionsData['groups'] {
  const schema = limitSchemaToAsked(buildIntakeFormSchema(show.allSections as unknown as IntakeSection[]), askFields);
  return schema.sections.map((s) => ({
    label: s.label,
    rows: s.fields.map((f) => ({
      label: f.label,
      type: f.type,
      options: (f.options ?? []).filter((o) => typeof o === 'string'),
      help: f.helpText ?? null,
      current: displayValue(show.data[s.template_id]?.[f.id]),
    })),
  }));
}

export async function loadAdvanceQuestionsData(
  client: SupabaseClient,
  tourId: string,
  routingId: string,
  opts: { linkId: string | null; origin: string },
): Promise<AdvanceQuestionsData | null> {
  const show = await loadAdvanceShow(client, tourId, routingId);
  if (!show) return null;
  let askFields: string[] | null = null;
  let link: string | null = null;
  let recipientName: string | null = show.request.recipientName;
  if (opts.linkId) {
    // The request this sheet belongs to: its questions and its online form.
    const { data: l } = await client
      .from('advance_intake_links')
      .select('id, token, routing_id, ask_fields, recipient_name, revoked_at')
      .eq('id', opts.linkId)
      .eq('routing_id', routingId)
      .maybeSingle<{ id: string; token: string; routing_id: string; ask_fields: string[] | null; recipient_name: string | null; revoked_at: string | null }>();
    if (l) {
      askFields = l.ask_fields;
      if (!l.revoked_at) link = `${opts.origin}/advance-intake/${l.token}`;
      recipientName = l.recipient_name ?? recipientName;
    }
  }
  const head = await loadHead(client, show);
  return { ...head, groups: questionGroups(show, askFields), link, recipientName };
}
