/* ============================================
   LOWPASS — variable resolver (Sprint 12 §9c1.a)

   Server-side resolution of `{token}` strings into concrete
   text. Used by the public reader endpoint to pre-resolve
   tokens before sending the payload to the client, and (in
   §10) by the PDF render path.

   Flow:
     1. resolveVariableMap(supabase, pack) — runs the DB
        queries and builds a Map<token, value>. Async.
     2. substituteInText(text, map) — replaces tokens in a
        plain string. Pure / sync.
     3. substituteInTiptapDoc(doc, map) — walks a Tiptap doc
        and replaces VariableNode instances with text nodes
        carrying the resolved value. Pure / sync.

   Design choices:
     - Tour-only variables ({tour}, {party_size},
       {contact.*}) return the LITERAL TOKEN STRING when the
       pack is artist-scope. This way an artist-level rider
       template using {contact.tm.phone} keeps the token in
       its content; when the operator later assigns it to a
       tour via §7's snapshot copy, the tour-scope render
       resolves the contact correctly.
     - All resolvers are NULL-safe — missing personnel /
       missing tour / no matching contact ⇒ empty string
       (not '—' so the resolved output stays clean when the
       token sat mid-sentence).
     - One contact lookup per (tag, field) trio: we group by
       tag at query time so each tag costs one row, not
       three.
   ============================================ */

import type { SupabaseClient } from '@supabase/supabase-js';
import { formatOrdinalDate } from '@/lib/text/ordinalDate';
import {
  VARIABLE_TOKEN_REGEX,
  VARIABLE_TOKEN_SET,
  CONTACT_TAGS,
} from './variable-registry';
import type { RiderPack } from './types';

/** Map of `{token}` → resolved string. Lookups against the map
 *  are O(1); the map is built once per rider-page render. */
export type VariableMap = ReadonlyMap<string, string>;

/** Subset of the Tiptap doc shape we care about. The full
 *  Tiptap JSON has additional fields (marks, attrs) that we
 *  pass through unchanged. */
interface TiptapNode {
  type?: string;
  content?: TiptapNode[];
  text?: string;
  marks?: unknown;
  attrs?: Record<string, unknown>;
  [k: string]: unknown;
}

const PARTY_SIZE_STATUSES = ['confirmed'];

interface ContactRow {
  role_tag: string;
  name: string;
  email: string | null;
  phone: string | null;
}

interface PackResolverContext {
  artistName: string;
  tourName: string | null;
  packTitle: string | null;
  partySize: number | null;
  /** Per-tag first-match. Lookup by tag. */
  contactsByTag: Map<string, ContactRow>;
}

/** Build the variable map for a single pack. Runs all DB
 *  queries in parallel where possible. */
export async function resolveVariableMap(
  supabase: SupabaseClient,
  pack: RiderPack,
): Promise<VariableMap> {
  const ctx = await loadPackContext(supabase, pack);
  const map = new Map<string, string>();

  /* Pack-scope (always resolves). */
  map.set('{artist}', ctx.artistName);
  map.set('{rider_type}', ctx.packTitle ?? '');
  map.set('{today}', formatOrdinalDate(new Date()));

  /* Tour-scope variables. When the pack has no tour, leave
     the token unresolved (i.e. omit from the map) so the
     substitution helpers render the literal token text. */
  if (pack.tour_id) {
    map.set('{tour}', ctx.tourName ?? '');
    map.set('{party_size}', String(ctx.partySize ?? 0));

    for (const tag of CONTACT_TAGS) {
      const row = ctx.contactsByTag.get(tag);
      map.set(`{contact.${tag}.name}`, row?.name ?? '');
      map.set(`{contact.${tag}.phone}`, row?.phone ?? '');
      map.set(`{contact.${tag}.email}`, row?.email ?? '');
    }
  }

  return map;
}

async function loadPackContext(
  supabase: SupabaseClient,
  pack: RiderPack,
): Promise<PackResolverContext> {
  const artistPromise = supabase
    .from('artists')
    .select('name')
    .eq('id', pack.artist_id)
    .maybeSingle<{ name: string | null }>();

  const tourPromise = pack.tour_id
    ? supabase
        .from('tours')
        .select('name')
        .eq('id', pack.tour_id)
        .maybeSingle<{ name: string | null }>()
    : Promise.resolve({ data: null });

  const partySizePromise = pack.tour_id
    ? supabase
        .from('tour_personnel')
        .select('id', { count: 'exact', head: true })
        .eq('tour_id', pack.tour_id)
        .in('status', PARTY_SIZE_STATUSES)
    : Promise.resolve({ count: 0 });

  const contactsPromise = pack.tour_id
    ? supabase
        .from('tour_personnel')
        .select('role_tag, person_id, persons(full_name, preferred_name, email, phone)')
        .eq('tour_id', pack.tour_id)
        .in('role_tag', CONTACT_TAGS as unknown as string[])
    : Promise.resolve({ data: [] });

  const [
    { data: artist },
    { data: tour },
    { count: partyCount },
    { data: contactRows },
  ] = await Promise.all([
    artistPromise,
    tourPromise,
    partySizePromise,
    contactsPromise,
  ]);

  /* Build per-tag first-match map. tour_personnel rows for a
     given tag typically number 0 or 1; if there are multiple
     (e.g. shadow TM2), the FIRST one returned wins. Sort by
     starts_on is implicit (rows already come back in a
     stable order). */
  const contactsByTag = new Map<string, ContactRow>();
  const rows = (contactRows ?? []) as Array<{
    role_tag: string;
    persons: { full_name: string | null; preferred_name: string | null; email: string | null; phone: string | null } | { full_name: string | null; preferred_name: string | null; email: string | null; phone: string | null }[] | null;
  }>;
  for (const r of rows) {
    if (contactsByTag.has(r.role_tag)) continue;
    const person = Array.isArray(r.persons) ? r.persons[0] : r.persons;
    if (!person) continue;
    const name = (person.preferred_name?.trim() || person.full_name?.trim() || '').trim();
    contactsByTag.set(r.role_tag, {
      role_tag: r.role_tag,
      name,
      email: person.email,
      phone: person.phone,
    });
  }

  return {
    artistName: artist?.name ?? '',
    tourName: tour?.name ?? null,
    packTitle: pack.title ?? null,
    partySize: typeof partyCount === 'number' ? partyCount : null,
    contactsByTag,
  };
}

/* ============================================
   Sync substitution helpers.

   substituteInText: regex-replace tokens in a plain string.
   Tokens that aren't in the map (e.g. tour-scope tokens on
   an artist-scope pack) pass through unchanged.

   substituteInTiptapDoc: walk a Tiptap doc tree and replace
   VariableNode instances with text nodes carrying the
   resolved value. VariableNodes that have a missing/invalid
   token attr render their original token text so the doc
   survives schema drift gracefully.
   ============================================ */
export function substituteInText(input: string | null | undefined, map: VariableMap): string {
  if (!input) return '';
  return input.replace(VARIABLE_TOKEN_REGEX, (match) => {
    if (!VARIABLE_TOKEN_SET.has(match)) return match;
    return map.get(match) ?? match;
  });
}

/** Deep clone + transform a Tiptap doc. The output JSON keeps
 *  the same shape as the input; VariableNodes are replaced
 *  with `{ type: 'text', text: <resolved> }`. */
export function substituteInTiptapDoc(
  doc: TiptapNode | null | undefined,
  map: VariableMap,
): TiptapNode | null {
  if (!doc) return null;
  return transformNode(doc, map);
}

function transformNode(node: TiptapNode, map: VariableMap): TiptapNode {
  if (node.type === 'variableNode' || node.type === 'variable') {
    const token = typeof node.attrs?.token === 'string' ? node.attrs.token : '';
    /* Resolver expects `{token}` form; the Tiptap node may
       store the bare name (e.g. 'artist') as attrs.token. */
    const wrapped = token.startsWith('{') ? token : `{${token}}`;
    const resolved = map.has(wrapped)
      ? (map.get(wrapped) ?? '')
      : VARIABLE_TOKEN_SET.has(wrapped)
        ? wrapped /* known but unresolved (e.g. tour-scope on artist pack) */
        : wrapped /* unknown token — render the literal */;
    return { type: 'text', text: resolved };
  }
  if (Array.isArray(node.content)) {
    return {
      ...node,
      content: node.content.map((child) => transformNode(child, map)),
    };
  }
  return node;
}
