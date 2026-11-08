/* ============================================
   LOWPASS — People search (Nov 2026)

   One box over the People list. Every word must match somewhere — name,
   preferred name, job title, email, phone or group — so "sam crew" finds Sam
   in Crew and "foh" finds every FOH engineer. Case and accents are ignored
   ("zoe" finds Zoë). A query that is only a phone number ("07700 900",
   "+44 7700") is matched on digits, ignoring spaces, dashes, brackets and a
   "(0)", so it finds "+44 (0)7700 900123" however it was typed.
   ============================================ */

export interface SearchablePerson {
  fullName: string;
  preferredName: string | null;
  jobTitle: string | null;
  email: string | null;
  phone: string | null;
  groups: readonly string[];
}

/** Words each group answers to (the badge text and the full name). */
const GROUP_WORDS: Record<string, string> = {
  admin: 'admin',
  artist: 'artist',
  band: 'band',
  crew: 'crew',
  mgmt: 'mgmt management',
  tour_manager: 'tm tour manager',
  production: 'prod production',
};

export const fold = (s: string): string =>
  s
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase();

const digits = (s: string): string => s.replace(/\D/g, '');

export function searchWords(query: string): string[] {
  return fold(query).split(/\s+/).filter(Boolean);
}

/** Digit strings the person's phone answers to: as stored, and with a
 *  "(0)" trunk prefix dropped ("+44 (0)7700" → 447700…). */
function phoneDigits(phone: string | null): string[] {
  if (!phone) return [];
  const raw = digits(phone);
  const noTrunk = digits(phone.replace(/\(\s*0\s*\)/g, ''));
  return raw === noTrunk ? [raw] : [raw, noTrunk];
}

/** The digits of a query that is nothing but a phone number, else null. */
export function phoneQuery(query: string): string | null {
  if (!/^[\d\s+()\-.]+$/.test(query.trim())) return null;
  const d = digits(query);
  return d.length >= 3 ? d : null;
}

export function personMatches(p: SearchablePerson, words: string[], phone: string | null = null): boolean {
  if (phone && phoneDigits(p.phone).some((d) => d.includes(phone))) return true;
  if (words.length === 0) return true;
  const text = fold(
    [p.fullName, p.preferredName, p.jobTitle, p.email, p.phone, ...p.groups.map((g) => GROUP_WORDS[g] ?? g)]
      .filter(Boolean)
      .join(' \u0000 '),
  );
  return words.every((w) => text.includes(w));
}

/** Rows matching the query, in their original order. */
export function searchPeople<T extends SearchablePerson>(rows: readonly T[], query: string): T[] {
  const words = searchWords(query);
  const phone = phoneQuery(query);
  return words.length ? rows.filter((r) => personMatches(r, words, phone)) : [...rows];
}
