/* ============================================
   LOWPASS — variable registry (Sprint 12 §9c1.a)

   Closed list of `{token}` strings the rider variable system
   resolves at render time. Source of truth for:
     - server-side resolver (variable-resolver.ts)
     - editor autocomplete (VariableAutocomplete.tsx, §9c1.b)
     - the Tiptap VariableNode extension (§9c1.b)

   Tokens fall into three buckets:

     1. Pack-scope variables: always available regardless of
        scope. {artist}, {rider_type}, {today}.

     2. Tour-scope variables: only available when the pack
        has a tour_id (scope='tour' or 'show'). {tour},
        {party_size}, all {contact.<tag>.*}. Artist-scope
        packs hide these from the autocomplete and the
        resolver returns the literal token string for them
        (so editing an artist-template and assigning it
        later to a tour DOES resolve at the tour-scope
        render).

     3. Contact variables: {contact.<tag>.<field>} with
        <tag> in tm|tm2|pm|foh|mons|ld|backline|management
        and <field> in name|phone|email. Resolved against
        tour_personnel WHERE tour_id=$tour AND role_tag=
        '<tag>' — first match wins (Adam typically has one
        person per tag per tour).
   ============================================ */

import { ROLE_TAG_OPTIONS, type RoleTag } from '@/lib/personnel/role-tags';

/** Contact tags exposed via {contact.<tag>.*} — everything
 *  except the 'other' catch-all (no {contact.other.*} variable
 *  exists; 'other' is a UI-only fallback). */
export const CONTACT_TAGS: ReadonlyArray<Exclude<RoleTag, 'other'>> = [
  'tm',
  'tm2',
  'pm',
  'foh',
  'mons',
  'ld',
  'backline',
  'management',
] as const;

export type ContactField = 'name' | 'phone' | 'email';
export const CONTACT_FIELDS: ReadonlyArray<ContactField> = ['name', 'phone', 'email'];

/** Variable visibility — drives the autocomplete filter. */
export type VariableScope = 'pack' | 'tour' | 'contact';

export interface VariableDefinition {
  /** The exact token text as it appears in saved content,
   *  including the curly braces. Examples: '{artist}',
   *  '{contact.tm.phone}'. */
  token: string;
  /** Short label for the autocomplete menu. */
  label: string;
  /** Long-form gloss for the menu's secondary line. */
  description: string;
  /** Visibility scope. Tour + contact variables hide from the
   *  autocomplete on artist-scope packs. */
  scope: VariableScope;
}

/* Pack-scope (always available). */
const PACK_VARIABLES: ReadonlyArray<VariableDefinition> = [
  {
    token: '{artist}',
    label: 'Artist name',
    description: 'Resolves to artists.name at render time.',
    scope: 'pack',
  },
  {
    token: '{rider_type}',
    label: 'Rider type',
    description: 'Resolves to rider_packs.title.',
    scope: 'pack',
  },
  {
    token: '{today}',
    label: 'Today',
    description: 'Server date when the rider is viewed, e.g. "23rd Mar \'26".',
    scope: 'pack',
  },
];

/* Tour-scope (require a tour context). */
const TOUR_VARIABLES: ReadonlyArray<VariableDefinition> = [
  {
    token: '{tour}',
    label: 'Tour name',
    description: 'Resolves to tours.name. Renders as literal "{tour}" on artist-scope packs.',
    scope: 'tour',
  },
  {
    token: '{party_size}',
    label: 'Party size',
    description: 'Count of confirmed tour_personnel rows on this tour.',
    scope: 'tour',
  },
];

const TAG_LABEL: Record<Exclude<RoleTag, 'other'>, string> = Object.fromEntries(
  ROLE_TAG_OPTIONS.filter((o) => o.value !== 'other').map((o) => [o.value, o.label]),
) as Record<Exclude<RoleTag, 'other'>, string>;

const FIELD_LABEL: Record<ContactField, string> = {
  name: 'Name',
  phone: 'Phone',
  email: 'Email',
};

/* Contact variables — generated programmatically from
   CONTACT_TAGS × CONTACT_FIELDS so the list stays in sync
   with the role_tag enum. */
function buildContactVariables(): VariableDefinition[] {
  const out: VariableDefinition[] = [];
  for (const tag of CONTACT_TAGS) {
    for (const field of CONTACT_FIELDS) {
      out.push({
        token: `{contact.${tag}.${field}}`,
        label: `${TAG_LABEL[tag]} ${FIELD_LABEL[field]}`,
        description: `tour_personnel.${field} where role_tag = '${tag}'.`,
        scope: 'contact',
      });
    }
  }
  return out;
}

const CONTACT_VARIABLES = buildContactVariables();

/** Full registry — display order: pack → tour → contact. */
export const VARIABLE_REGISTRY: ReadonlyArray<VariableDefinition> = [
  ...PACK_VARIABLES,
  ...TOUR_VARIABLES,
  ...CONTACT_VARIABLES,
];

/** Set of valid token strings — for membership checks during
 *  resolution and validation. */
export const VARIABLE_TOKEN_SET: ReadonlySet<string> = new Set(
  VARIABLE_REGISTRY.map((v) => v.token),
);

/** Filter the registry for the autocomplete UI. When pack
 *  scope is 'artist' (no tour context), tour + contact
 *  variables are excluded from suggestions. */
export function variablesForPackScope(
  packScope: 'artist' | 'tour' | 'show',
): ReadonlyArray<VariableDefinition> {
  if (packScope === 'artist') {
    return VARIABLE_REGISTRY.filter((v) => v.scope === 'pack');
  }
  return VARIABLE_REGISTRY;
}

/** Regex matching any registry token in a free-text string.
 *  Captures the token (including braces). Used by the resolver
 *  to walk plain-text fields. */
export const VARIABLE_TOKEN_REGEX = /\{[a-z_]+(?:\.[a-z_]+)*\}/g;
