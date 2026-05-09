/* ============================================
   Personnel extended_profile JSON shape (DB column)
   Mirrors common touring "personnel details" spreadsheets.

   Sprint 9 §13.B (Q6) — Daysheets-style sections layered ON TOP
   of the existing flat shape. New optional array fields support
   "add as needed" lists for emergency contacts, passports,
   visas, frequent flier, dietary requirements, and merch sizes.
   The legacy flat fields (single emergency_contact, two-element
   passports, single dietary string, single clothing_sizes
   block, transport_extra.frequent_flyer_N) still write so any
   downstream consumer (rooming sheets, advance docs, exports)
   continues to read unchanged. New UI primarily writes the new
   arrays + lifts data from the legacy fields the first time a
   row is saved through the v2 slide-over.

   Per Q6: no migration. JSONB stays untyped at the DB layer;
   shape lives here and is enforced by the UI.
   ============================================ */

export interface PersonnelAddress {
  line1?: string;
  line2?: string;
  city?: string;
  region?: string;
  postcode?: string;
  country?: string;
}

export interface PersonnelEmergencyContact {
  name?: string;
  relationship?: string;
  phone?: string;
  email?: string;
}

/** First / middle / surname as on paperwork */
export interface PersonnelNameParts {
  first_name?: string;
  middle_names?: string;
  surname?: string;
  nickname?: string;
}

/** One passport block (form often has Passport 1 & 2) */
export interface PersonnelPassportDetail {
  number?: string;
  type?: string;
  code?: string;
  authority?: string;
  date_of_birth?: string;
  place_of_birth?: string;
  valid_from?: string;
  expiry_date?: string;
  empty_pages?: string;
  empty_double_pages?: string;
  citizenship?: string;
}

export interface PersonnelUsOnly {
  social_security_number?: string;
  green_card_number?: string;
}

export interface PersonnelTransportExtra {
  tsa_precheck?: string;
  aisle_window?: string;
  frequent_flyer_1?: string;
  frequent_flyer_2?: string;
  frequent_flyer_3?: string;
  frequent_flyer_4?: string;
}

export interface PersonnelHealthBlock {
  allergies_medicine?: string;
  medical_conditions?: string;
  criminal_convictions?: string;
  insurance_info_crew?: string;
}

export interface PersonnelMerchExtras {
  coffee_order?: string;
  pizza_order?: string;
}

/** Uploaded file stored in Supabase Storage (personnel-files bucket) */
export interface PersonnelStoredDocument {
  url: string;
  path: string;
  file_name: string;
  uploaded_at: string;
  content_type?: string;
}

export interface PersonnelDocumentsBlock {
  head_shot?: PersonnelStoredDocument | null;
  passport_scans?: PersonnelStoredDocument[];
}

/* ============================================
   Sprint 9 §13.B (v2) — Daysheets-style array fields
   ============================================ */

/** Additional contact channel beyond the primary email/phone on
 *  the personnel row. Either kind, value required at write time.
 *  Optional label ("Personal", "Manager", etc.). */
export interface PersonnelAdditionalContact {
  kind: 'email' | 'phone';
  value: string;
  label?: string;
}

export interface PersonnelEmergencyContactV2 {
  name: string;
  relationship: string;
  phone: string;
  email?: string;
}

/** Daysheets-style passport entry. Distinct from
 *  <PersonnelPassportDetail> (the legacy "form-style" passport
 *  with empty-pages / authority / etc.) — this is the canonical
 *  v2 shape with semantic fields only. The slide-over edits v2
 *  passports and writes BOTH (passports_v2 + the legacy
 *  passports[] mirror) so legacy readers keep working. */
export interface PersonnelPassportV2 {
  country: string;
  number: string;
  given_names: string;
  surname: string;
  date_of_issue?: string;
  date_of_expiry: string;
  place_of_birth?: string;
  /** Path inside the personnel-files bucket. */
  photo_path?: string;
}

export type PersonnelFrequentFlierTier = 'basic' | 'silver' | 'gold' | 'platinum';

export interface PersonnelFrequentFlierV2 {
  airline: string;
  member_number: string;
  tier?: PersonnelFrequentFlierTier;
}

export interface PersonnelVisaV2 {
  country: string;
  type: string;
  /** Sprint 9 §14.14 — visa identifier as printed on the
   *  document. Distinct from passport number. */
  visa_number?: string;
  /** Sprint 9 §14.14 — issuing consulate / embassy / agency. */
  issuing_authority?: string;
  /** Sprint 9 §14.14 — true when the visa permits multiple
   *  entries during its validity window. False / undefined =
   *  single entry. Surfaced in routing + advance docs. */
  multi_entry?: boolean;
  valid_from?: string;
  valid_to: string;
  /** Path inside the personnel-files bucket. */
  photo_path?: string;
  notes?: string;
}

export type PersonnelDietaryType =
  | 'vegetarian'
  | 'vegan'
  | 'gluten_free'
  | 'kosher'
  | 'halal'
  | 'custom';

export interface PersonnelDietaryV2 {
  type: PersonnelDietaryType;
  notes?: string;
}

export type PersonnelGarment =
  | 't_shirt'
  | 'hoodie'
  | 'jacket'
  | 'pants'
  | 'shoes';

export interface PersonnelMerchSizeV2 {
  garment: PersonnelGarment;
  size: string;
}

/** Spec 13.B.1 Pay block — admin/manager only. Layered on top
 *  of the existing personnel.standard_rates column (which the
 *  rooming + payroll readers consume). The slide-over keeps the
 *  legacy column populated; this struct is for forward-looking
 *  per-territory commission bands. */
export interface PersonnelCommissionBand {
  territory: string;
  /** Percentage 0-100 stored as a number. */
  rate_percent: number;
  notes?: string;
}

export interface PersonnelPayBlock {
  /** Per-territory commission rates layered on top of the flat
   *  standard_rates column. Consumed by Payroll / advance docs
   *  when present; legacy single-rate readers fall back to the
   *  column. */
  commissions?: PersonnelCommissionBand[];
}

export interface PersonnelExtendedProfile {
  name_parts?: PersonnelNameParts;
  marital_status?: string;
  sex?: string;
  partner_name?: string;
  legal_name?: string;
  pronouns?: string;
  date_of_birth?: string;
  nationality?: string;
  address?: PersonnelAddress;
  emergency_contact?: PersonnelEmergencyContact;
  us_only?: PersonnelUsOnly;
  /** Up to two passports; UI edits [0] and [1] */
  passports?: PersonnelPassportDetail[];
  transport_extra?: PersonnelTransportExtra;
  health?: PersonnelHealthBlock;
  visa?: { status?: string; expiry?: string; notes?: string };
  drivers_license?: { number?: string; country?: string; expiry?: string };
  clothing_sizes?: {
    shirt?: string;
    jacket?: string;
    waist?: string;
    inseam?: string;
    shoe?: string;
    hat?: string;
  };
  merch_extras?: PersonnelMerchExtras;
  travel_notes?: string;
  union?: { local?: string; member_id?: string };
  instruments?: string;
  medical_notes?: string;
  social?: { instagram?: string; twitter?: string };
  /** TM-only notes — not shown to the person */
  internal_notes?: string;
  /** Sprint 10 §2.2 — workspace-defined group keys driving the
   *  personnel grid badges + the by-group filter chip. v1 set:
   *  admin / artist / band / crew / mgmt / tour_manager /
   *  production. The set is intentionally open — workspaces
   *  can extend with custom keys (rendered as a fallback grey
   *  chip in the grid). */
  groups?: string[];
  /** Head shot + passport scan uploads (URLs in personnel-files bucket) */
  documents?: PersonnelDocumentsBlock;

  /* ============================================
     v2 (Sprint 9 §13.B) — Daysheets-style arrays
     ============================================ */
  /** Additional emails / phones beyond the row's primary
   *  email + phone columns. Sorted by `kind` in the UI. */
  additional_contacts?: PersonnelAdditionalContact[];
  /** Daysheets-style multi-emergency-contact list. The legacy
   *  flat <PersonnelEmergencyContact> stays in sync with the
   *  first entry so older readers continue to work. */
  emergency_contacts?: PersonnelEmergencyContactV2[];
  /** Canonical Daysheets-style passport list. Mirrored down to
   *  the legacy passports[] array (v1 form-style shape) on
   *  save so rooming + advance keep reading without changes. */
  passports_v2?: PersonnelPassportV2[];
  frequent_flier?: PersonnelFrequentFlierV2[];
  visas?: PersonnelVisaV2[];
  /** Single airport code; semantic alias for
   *  <Personnel>.home_airport (also surfaced as a top-level
   *  column on personnel itself). UI prefers this value when
   *  set; otherwise falls back to the column. */
  home_airport?: string;
  dietary?: PersonnelDietaryV2[];
  merch_sizes?: PersonnelMerchSizeV2[];
  /** Pay block. Admin / manager edit-gated; readers downstream
   *  may still read it but the UI hides the section + does not
   *  send these fields back when the viewer lacks role. */
  pay?: PersonnelPayBlock;
}

export function emptyExtendedProfile(): PersonnelExtendedProfile {
  return {};
}

export function parseExtendedProfile(raw: unknown): PersonnelExtendedProfile {
  if (!raw || typeof raw !== 'object') return {};
  return raw as PersonnelExtendedProfile;
}

function emptyPassport(): PersonnelPassportDetail {
  return {};
}

/** Load two passport slots from extended_profile + legacy passport_info */
export function passportsFromPerson(p: {
  passport_info?: unknown;
  extended_profile?: unknown;
}): [PersonnelPassportDetail, PersonnelPassportDetail] {
  const ext = parseExtendedProfile(p.extended_profile);
  const arr = Array.isArray(ext.passports) ? ext.passports : [];
  const first: PersonnelPassportDetail = { ...emptyPassport(), ...arr[0] };
  const second: PersonnelPassportDetail = { ...emptyPassport(), ...arr[1] };
  const legacy = (p.passport_info ?? {}) as {
    number?: string;
    expiry_date?: string;
    country?: string;
    full_name?: string;
  };

  if (!first.number && legacy.number) first.number = legacy.number;
  if (!first.expiry_date && legacy.expiry_date) first.expiry_date = legacy.expiry_date;
  if (!first.citizenship && legacy.country) first.citizenship = legacy.country;
  if (!first.date_of_birth && ext.date_of_birth) first.date_of_birth = ext.date_of_birth;
  if (!first.code && legacy.country) first.code = legacy.country;

  return [first, second];
}

/** Minimal passport_info row for older code paths (rooming, etc.) */
export function legacyPassportInfoFromPrimary(p0: PersonnelPassportDetail): {
  number?: string;
  expiry_date?: string;
  country?: string;
  full_name?: string;
} {
  return {
    number: p0.number,
    expiry_date: p0.expiry_date,
    country: p0.code || p0.citizenship,
    full_name: undefined,
  };
}

/* ============================================
   Sprint 9 §13.B — v2 lift helpers + sync helpers

   These let the Daysheets-style slide-over (a) read existing
   rows where only the legacy flat fields are populated and
   (b) write back BOTH the v2 arrays AND the legacy mirrors so
   downstream readers (rooming, advance, exports) keep working.
   ============================================ */

/** Lift the legacy single emergency_contact into a one-element
 *  v2 list when the v2 list is missing. Caller should prefer
 *  emergency_contacts_v2 if both exist. */
export function liftEmergencyContacts(
  ext: PersonnelExtendedProfile,
): PersonnelEmergencyContactV2[] {
  if (Array.isArray(ext.emergency_contacts) && ext.emergency_contacts.length > 0) {
    return ext.emergency_contacts;
  }
  const ec = ext.emergency_contact;
  if (!ec || !ec.name) return [];
  return [
    {
      name: ec.name ?? '',
      relationship: ec.relationship ?? '',
      phone: ec.phone ?? '',
      email: ec.email,
    },
  ];
}

/** Lift the legacy two-passport array into v2 passport entries.
 *  Drops empty entries. */
export function liftPassportsV2(
  ext: PersonnelExtendedProfile,
): PersonnelPassportV2[] {
  if (Array.isArray(ext.passports_v2) && ext.passports_v2.length > 0) {
    return ext.passports_v2;
  }
  const arr = Array.isArray(ext.passports) ? ext.passports : [];
  const lifted: PersonnelPassportV2[] = [];
  for (const p of arr) {
    if (!p || !p.number) continue;
    lifted.push({
      country: p.code ?? p.citizenship ?? '',
      number: p.number,
      // Legacy form had no first/surname split — leave blank
      // so the operator fills it on first save.
      given_names: '',
      surname: '',
      date_of_issue: p.valid_from,
      date_of_expiry: p.expiry_date ?? '',
      place_of_birth: p.place_of_birth,
    });
  }
  return lifted;
}

/** Lift legacy transport_extra.frequent_flyer_N strings into a
 *  v2 list. Each legacy entry is a free-form string ("BA Gold
 *  12345678"); we surface them as airline-only entries with the
 *  string in `member_number` so the operator can normalise on
 *  next save. */
export function liftFrequentFlier(
  ext: PersonnelExtendedProfile,
): PersonnelFrequentFlierV2[] {
  if (Array.isArray(ext.frequent_flier) && ext.frequent_flier.length > 0) {
    return ext.frequent_flier;
  }
  const tx = ext.transport_extra ?? {};
  const lifted: PersonnelFrequentFlierV2[] = [];
  for (const k of ['frequent_flyer_1', 'frequent_flyer_2', 'frequent_flyer_3', 'frequent_flyer_4'] as const) {
    const v = tx[k];
    if (typeof v === 'string' && v.trim()) {
      lifted.push({ airline: '', member_number: v.trim() });
    }
  }
  return lifted;
}

/** Lift the legacy single visa block into a one-element v2 list
 *  when v2 is missing AND the legacy block has at least an
 *  expiry. */
export function liftVisas(ext: PersonnelExtendedProfile): PersonnelVisaV2[] {
  if (Array.isArray(ext.visas) && ext.visas.length > 0) return ext.visas;
  const v = ext.visa;
  if (!v?.expiry) return [];
  return [
    {
      country: '',
      type: v.status ?? '',
      valid_to: v.expiry,
      notes: v.notes,
    },
  ];
}

/** Lift the legacy single dietary_needs string + legacy
 *  clothing_sizes into v2 lists. Caller passes the row's
 *  dietary_needs column value because that's a top-level
 *  Personnel field, not on extended_profile. */
export function liftDietary(dietaryString: string | null | undefined, ext: PersonnelExtendedProfile): PersonnelDietaryV2[] {
  if (Array.isArray(ext.dietary) && ext.dietary.length > 0) return ext.dietary;
  if (!dietaryString || !dietaryString.trim()) return [];
  return [{ type: 'custom', notes: dietaryString.trim() }];
}

const LEGACY_GARMENT_KEYS: ReadonlyArray<{ key: keyof NonNullable<PersonnelExtendedProfile['clothing_sizes']>; garment: PersonnelGarment }> = [
  { key: 'shirt', garment: 't_shirt' },
  { key: 'jacket', garment: 'jacket' },
  { key: 'shoe', garment: 'shoes' },
];

/** Lift legacy clothing_sizes block + the row's merch_size
 *  column (legacy single string) into v2 merch_sizes list. */
export function liftMerchSizes(merchSizeString: string | null | undefined, ext: PersonnelExtendedProfile): PersonnelMerchSizeV2[] {
  if (Array.isArray(ext.merch_sizes) && ext.merch_sizes.length > 0) return ext.merch_sizes;
  const out: PersonnelMerchSizeV2[] = [];
  const cs = ext.clothing_sizes ?? {};
  for (const { key, garment } of LEGACY_GARMENT_KEYS) {
    const v = cs[key];
    if (typeof v === 'string' && v.trim()) {
      out.push({ garment, size: v.trim() });
    }
  }
  if (out.length === 0 && typeof merchSizeString === 'string' && merchSizeString.trim()) {
    out.push({ garment: 't_shirt', size: merchSizeString.trim() });
  }
  return out;
}

/** Sync v2 emergency_contacts down to legacy single
 *  emergency_contact (first entry wins). Used when saving so
 *  legacy readers (rooming, advance) keep working. */
export function syncEmergencyContactLegacy(
  ext: PersonnelExtendedProfile,
  v2: PersonnelEmergencyContactV2[],
): PersonnelExtendedProfile {
  const out: PersonnelExtendedProfile = { ...ext, emergency_contacts: v2 };
  out.emergency_contact = v2[0]
    ? {
        name: v2[0].name,
        relationship: v2[0].relationship,
        phone: v2[0].phone,
        email: v2[0].email,
      }
    : undefined;
  return out;
}

/** Sync v2 passports_v2 down to legacy passports[] (first two
 *  entries) so passportsFromPerson() + the legacy form-style
 *  consumers keep working. */
export function syncPassportsLegacy(
  ext: PersonnelExtendedProfile,
  v2: PersonnelPassportV2[],
): PersonnelExtendedProfile {
  const legacy: PersonnelPassportDetail[] = v2.slice(0, 2).map((p) => ({
    number: p.number,
    code: p.country,
    citizenship: p.country,
    valid_from: p.date_of_issue,
    expiry_date: p.date_of_expiry,
    place_of_birth: p.place_of_birth,
  }));
  // Pad to length 2 so [0]/[1] indexed reads stay safe.
  while (legacy.length < 2) legacy.push({});
  return { ...ext, passports_v2: v2, passports: legacy };
}

/* ============================================
   Sprint 9 §13.B.2 — Profile completeness scoring

   Weighted score against required + optional fields. Per Q5,
   non-admin viewers re-normalise the score so the missing Pay
   weight doesn't leave their ring permanently incomplete.

   Returns 0-100 (rounded) plus the list of missing-section
   labels for the tooltip + click-to-section flow.
   ============================================ */

export interface CompletenessSection {
  /** Stable id used to scroll the slide-over to the missing
   *  section when the user clicks the ring. Maps to a
   *  data-section attribute mounted on the section container. */
  id: string;
  /** Human-readable label rendered in the tooltip. */
  label: string;
  /** 0-100 weight. Sum of all sections (admin view) is 100. */
  weight: number;
  /** Whether this section is "filled" given the row's data. */
  filled: boolean;
  /** Whether this section's weight should be excluded for
   *  non-admin viewers (Q5 re-normalisation rule). */
  adminOnly: boolean;
}

interface CompletenessInputs {
  /** Top-level Personnel columns. */
  name: string;
  email: string | null;
  phone: string | null;
  homeAirport: string | null;
  standardRates: { show_day_rate?: number | null } | null | undefined;
  /** Parsed extended_profile JSONB. */
  ext: PersonnelExtendedProfile;
}

export interface CompletenessResult {
  /** 0-100, rounded. */
  percent: number;
  /** Labels of the sections that contributed missing weight. */
  missingLabels: string[];
  /** Stable id of the FIRST missing section, or null if 100%.
   *  Slide-over scrolls to data-section={firstMissingId} on
   *  click-through from the ring. */
  firstMissingId: string | null;
  /** Full per-section breakdown (for debugging / future UI). */
  sections: CompletenessSection[];
}

/** Compute completeness sections at admin weighting (full 100%
 *  spread including Pay). Caller chooses whether to apply the
 *  non-admin re-normalisation via {@link normaliseForViewer}. */
export function computeCompletenessSections(
  i: CompletenessInputs,
): CompletenessSection[] {
  const ext = i.ext ?? {};
  const passports = liftPassportsV2(ext);
  const emergencyContacts = liftEmergencyContacts(ext);
  const dietary = liftDietary(undefined, ext);
  const merchSizes = liftMerchSizes(undefined, ext);
  const frequentFlier = liftFrequentFlier(ext);

  const dob = ext.date_of_birth ?? passports[0]?.date_of_issue;

  return [
    {
      id: 'identity',
      label: 'Identity (full name + DOB)',
      weight: 20,
      filled: i.name.trim().length > 0 && !!dob,
      adminOnly: false,
    },
    {
      id: 'contact',
      label: 'Contact (email + phone)',
      weight: 15,
      filled: !!i.email?.trim() && !!i.phone?.trim(),
      adminOnly: false,
    },
    {
      id: 'passports',
      label: 'Passport with valid expiry',
      weight: 15,
      filled: passports.some((p) => !!p.number && !!p.date_of_expiry),
      adminOnly: false,
    },
    {
      id: 'emergency',
      label: 'Emergency contact',
      weight: 15,
      filled: emergencyContacts.length > 0,
      adminOnly: false,
    },
    {
      id: 'home-airport',
      label: 'Home airport',
      weight: 5,
      filled: !!(i.homeAirport ?? ext.home_airport)?.trim(),
      adminOnly: false,
    },
    {
      id: 'dietary',
      label: 'Dietary entry',
      weight: 5,
      filled: dietary.length > 0,
      adminOnly: false,
    },
    {
      id: 'merch-sizes',
      label: 'Merch size',
      weight: 5,
      filled: merchSizes.length > 0,
      adminOnly: false,
    },
    {
      id: 'frequent-flier',
      label: 'Frequent flier entry',
      weight: 5,
      filled: frequentFlier.length > 0,
      adminOnly: false,
    },
    {
      id: 'pay',
      label: 'Pay rates',
      weight: 15,
      filled: !!i.standardRates && (i.standardRates.show_day_rate ?? 0) > 0,
      adminOnly: true,
    },
  ];
}

/** Apply Q5 re-normalisation: if the viewer can't see Pay,
 *  redistribute the Pay weight across remaining sections so
 *  the ring is still reachable to 100%. */
export function normaliseForViewer(
  sections: CompletenessSection[],
  viewer: { canSeePay: boolean },
): CompletenessSection[] {
  if (viewer.canSeePay) return sections;
  // Drop admin-only sections entirely; remaining weights scale
  // proportionally so the new total still sums to 100.
  const visible = sections.filter((s) => !s.adminOnly);
  const total = visible.reduce((acc, s) => acc + s.weight, 0);
  if (total === 0) return visible;
  const scale = 100 / total;
  return visible.map((s) => ({ ...s, weight: s.weight * scale }));
}

/** End-to-end: given inputs + viewer role, return the user-
 *  facing completeness number + the data the ring tooltip +
 *  click-to-section need. */
export function computeCompleteness(
  i: CompletenessInputs,
  viewer: { canSeePay: boolean },
): CompletenessResult {
  const sections = normaliseForViewer(computeCompletenessSections(i), viewer);
  let earned = 0;
  let total = 0;
  const missingLabels: string[] = [];
  let firstMissingId: string | null = null;
  for (const s of sections) {
    total += s.weight;
    if (s.filled) {
      earned += s.weight;
    } else {
      missingLabels.push(s.label);
      if (firstMissingId === null) firstMissingId = s.id;
    }
  }
  const percent = total > 0 ? Math.round((earned / total) * 100) : 0;
  return { percent, missingLabels, firstMissingId, sections };
}
