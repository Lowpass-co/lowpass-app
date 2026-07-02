/* ============================================
   LOWPASS — role_tag enum + label map (Sprint 12 §9c.0)

   Shared shape for the tour_personnel.role_tag column added
   in migration 101. Used by:
     - AddPersonnelSlideOver / PersonnelManageSlideOver
       (the Role tag select)
     - /api/tours/[id]/personnel  POST  (insert validation)
     - /api/tour-personnel/[id]   PATCH (update validation)
     - Sprint 12 §9c1 variable resolver (filter target for
       {contact.<tag>.*})

   Order in ROLE_TAG_OPTIONS is the display order — 'other'
   sits last because it's the catch-all default rather than a
   meaningful tag.
   ============================================ */

export type RoleTag =
  | 'tm'
  | 'tm2'
  | 'pm'
  | 'foh'
  | 'mons'
  | 'ld'
  | 'backline'
  // revamp #20 — BAND (musicians / performers). DB CHECK widened in migration 227.
  | 'band'
  | 'management'
  | 'other';

export const ROLE_TAG_VALUES: ReadonlyArray<RoleTag> = [
  'tm',
  'tm2',
  'pm',
  'foh',
  'mons',
  'ld',
  'backline',
  'band',
  'management',
  'other',
] as const;

export const ROLE_TAG_SET = new Set<RoleTag>(ROLE_TAG_VALUES);

export interface RoleTagOption {
  value: RoleTag;
  label: string;
  /** Long-form gloss shown in tooltips / autocomplete hints. */
  description: string;
}

export const ROLE_TAG_OPTIONS: ReadonlyArray<RoleTagOption> = [
  { value: 'tm',         label: 'TM',         description: 'Tour Manager' },
  { value: 'tm2',        label: 'TM2',        description: 'Assistant Tour Manager' },
  { value: 'pm',         label: 'PM',         description: 'Production Manager' },
  { value: 'foh',        label: 'FOH',        description: 'Front of House' },
  { value: 'mons',       label: 'MONS',       description: 'Monitors Engineer' },
  { value: 'ld',         label: 'LD',         description: 'Lighting Designer' },
  { value: 'backline',   label: 'BACKLINE',   description: 'Backline Tech' },
  { value: 'band',       label: 'BAND',       description: 'Band member / musician' },
  { value: 'management', label: 'MANAGEMENT', description: 'Artist management' },
  { value: 'other',      label: 'Other',      description: 'Catch-all (no specific role tag)' },
];

export const ROLE_TAG_LABEL: Record<RoleTag, string> = Object.fromEntries(
  ROLE_TAG_OPTIONS.map((o) => [o.value, o.label]),
) as Record<RoleTag, string>;

/** Type guard for runtime validation in API handlers. */
export function isRoleTag(value: unknown): value is RoleTag {
  return typeof value === 'string' && ROLE_TAG_SET.has(value as RoleTag);
}
