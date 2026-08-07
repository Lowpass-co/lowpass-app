/* ============================================
   LOWPASS — rider builder groups (decouple phase B2)

   THE FIXED GROUPS + THE CURATED ADD LIST. Adam's decision, locked
   (RIDER_DECOUPLE_SPEC §3): the builder ships with four groups, offers six
   more from a curated menu, and there is NO freeform group creation — "the
   app is INCREDIBLY customisable at the minute and is verging on
   complicated. some confines are good."

   A section's group lives on rider_sections.metadata.group (no migration —
   metadata is the free-shaped JSONB from migration 100). Anything without a
   valid group — every pre-B2 section — lands in Production.

   Templates map to groups via template_type (the platform seeds from
   migration 111 cover ten of the types). A template whose type has no
   mapping — workspace forks, future seeds — is offered in EVERY group
   rather than silently unreachable.
   ============================================ */

export interface RiderGroup {
  id: string;
  label: string;
  /** Fixed groups always render; curated ones appear once added / populated. */
  fixed: boolean;
}

export const RIDER_GROUPS: readonly RiderGroup[] = [
  { id: 'production', label: 'Production', fixed: true },
  { id: 'technical', label: 'Technical', fixed: true },
  { id: 'hospitality', label: 'Hospitality', fixed: true },
  { id: 'travel', label: 'Travel', fixed: true },
  { id: 'security', label: 'Security', fixed: false },
  { id: 'merch', label: 'Merch', fixed: false },
  { id: 'press_promo', label: 'Press & Promo', fixed: false },
  { id: 'parking_access', label: 'Parking & Access', fixed: false },
  { id: 'catering', label: 'Catering', fixed: false },
  { id: 'local_crew', label: 'Local Crew', fixed: false },
] as const;

const GROUP_IDS = new Set(RIDER_GROUPS.map((g) => g.id));

export const DEFAULT_GROUP_ID = 'production';

/** The group a section belongs to. Ungrouped / unknown → Production. */
export function sectionGroupId(metadata: unknown): string {
  const g =
    metadata && typeof metadata === 'object'
      ? (metadata as { group?: unknown }).group
      : undefined;
  return typeof g === 'string' && GROUP_IDS.has(g) ? g : DEFAULT_GROUP_ID;
}

/** template_type → group. See migration 111's platform seeds. */
const TEMPLATE_GROUP: Record<string, string> = {
  contacts: 'production',
  schedule: 'production',
  audio: 'technical',
  monitoring: 'technical',
  lighting: 'technical',
  backline: 'technical',
  risers: 'technical',
  hospitality: 'hospitality',
  transport: 'travel',
  security: 'security',
  catering: 'catering',
  merch: 'merch',
  labour: 'local_crew',
  /* Migration 263 — rider-centric re-seed's new platform types. */
  dressing_rooms: 'hospitality',
  towels_laundry: 'hospitality',
  bus_stock: 'hospitality',
  guest_list: 'production',
};

/** The group a template belongs under, or null = offer it in every group. */
export function templateGroupId(templateType: string | null | undefined): string | null {
  if (!templateType) return null;
  return TEMPLATE_GROUP[templateType] ?? null;
}

export function groupLabel(id: string): string {
  return RIDER_GROUPS.find((g) => g.id === id)?.label ?? id;
}
