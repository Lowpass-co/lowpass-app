/* ============================================
   Personnel extended_profile JSON shape (DB column)
   Mirrors common touring “personnel details” spreadsheets.
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
  /** Head shot + passport scan uploads (URLs in personnel-files bucket) */
  documents?: PersonnelDocumentsBlock;
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
