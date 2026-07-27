/* ============================================
   LOWPASS — read what the FILENAME already tells us (RQ-5, optional half)

   Adam names his receipts before they ever reach the app:

     26:07:2026 | BNA Airport Parking | Nashville airport parking Jul24-26 | $72.00.pdf

   Date, vendor, description, amount — all four, already typed by a human who was
   holding the receipt. When the scan comes back empty, throwing that away and
   showing a blank form is worse than useless: it asks him to retype what he
   already wrote.

   THE HARD RULE: a filename-derived value is a GUESS and must never be dressed
   up as a reading. Everything here is returned with `confidence: 'filename'` and
   the UI labels it — a receipt that says "£72.00" because a human typed it into
   a filename is not the same claim as one that says £72.00 because the total was
   read off the page, and the moment those look identical the feature is lying.

   Only used when extraction returns nothing. A real read always wins.

   Pure: no I/O, no React. Deliberately conservative — it would rather return
   nothing than a wrong vendor, because a wrong pre-fill is harder to notice than
   an empty one.
   ============================================ */

export interface FilenameFacts {
  vendor: string | null;
  date: string | null;
  amount: number | null;
  description: string | null;
  /** Which fields we actually got, for the UI's "from filename" note. */
  fields: string[];
}

/** Currency symbols worth recognising in a filename. */
const CURRENCY = '[$£€¥]';

function stripExtension(name: string): string {
  return name.replace(/\.[a-z0-9]{1,5}$/i, '');
}

/**
 * Normalise the many ways a person writes a date in a filename.
 * Returns ISO (YYYY-MM-DD) or null. DAY-FIRST when ambiguous — Adam writes
 * `26:07:2026`, and this is a British-run tour company; guessing US order would
 * silently swap day and month for the first twelve days of every month.
 */
export function parseFilenameDate(raw: string): string | null {
  const s = raw.trim();

  // ISO first — unambiguous, so it needs no ordering assumption.
  const iso = /(\d{4})[-/.:](\d{1,2})[-/.:](\d{1,2})/.exec(s);
  if (iso) return isoOrNull(+iso[1], +iso[2], +iso[3]);

  // d-m-y with any of : / - . as the separator (Adam uses colons).
  const dmy = /(\d{1,2})[-/.:](\d{1,2})[-/.:](\d{2,4})/.exec(s);
  if (dmy) {
    const [, d, m, y] = dmy;
    let year = Number(y);
    if (year < 100) year += 2000;
    let day = Number(d);
    let month = Number(m);
    // If the first number can't be a day but the second can, it was m-d-y.
    if (day > 12 && month > 12) return null;
    if (day > 31 || (day > 12 && month > 12)) return null;
    if (month > 12) [day, month] = [month, day];
    return isoOrNull(year, month, day);
  }
  return null;
}

function isoOrNull(y: number, m: number, d: number): string | null {
  if (!Number.isFinite(y) || !Number.isFinite(m) || !Number.isFinite(d)) return null;
  if (m < 1 || m > 12 || d < 1 || d > 31) return null;
  const dt = new Date(Date.UTC(y, m - 1, d));
  // Rejects 31 February and friends — the round-trip catches overflow.
  if (dt.getUTCMonth() !== m - 1 || dt.getUTCDate() !== d) return null;
  return dt.toISOString().slice(0, 10);
}

/** The first currency-looking amount in the string, or null. */
export function parseFilenameAmount(raw: string): number | null {
  const m =
    new RegExp(`${CURRENCY}\\s*([0-9][0-9,]*(?:\\.[0-9]{1,2})?)`).exec(raw) ??
    // A bare decimal is only trusted with two places — "Jul24-26" must not read
    // as an amount, and a lone integer in a filename usually isn't money.
    /(?:^|[\s|_-])([0-9][0-9,]*\.[0-9]{2})(?:$|[\s|_-])/.exec(raw);
  if (!m) return null;
  const n = Number(m[1].replace(/,/g, ''));
  return Number.isFinite(n) ? n : null;
}

/**
 * Pull whatever the filename offers. Handles the pipe-delimited convention
 * Adam uses, and degrades to "find a date and an amount anywhere" otherwise.
 */
export function parseReceiptFilename(filename: string): FilenameFacts {
  const base = stripExtension((filename ?? '').trim());
  const empty: FilenameFacts = { vendor: null, date: null, amount: null, description: null, fields: [] };
  if (!base) return empty;

  const parts = base.split('|').map((p) => p.trim()).filter(Boolean);

  let vendor: string | null = null;
  let description: string | null = null;
  let date: string | null = null;
  let amount: number | null = null;

  if (parts.length >= 2) {
    /* The delimited convention: date | vendor | description | amount. Each field
       is identified by WHAT IT LOOKS LIKE rather than by position, so a missing
       description or a reordered name still lands correctly. */
    const rest: string[] = [];
    for (const part of parts) {
      const d = parseFilenameDate(part);
      const a = parseFilenameAmount(part);
      if (d && !date && !/[a-z]{3,}/i.test(part)) { date = d; continue; }
      if (a !== null && amount === null && !/[a-z]{3,}/i.test(part)) { amount = a; continue; }
      rest.push(part);
    }
    if (rest.length) vendor = rest[0];
    if (rest.length > 1) description = rest.slice(1).join(' — ');
  } else {
    // No convention — take only what's unambiguous. A whole filename is NOT a
    // vendor name; guessing one here produces confident nonsense.
    date = parseFilenameDate(base);
    amount = parseFilenameAmount(base);
  }

  // Late pass: the amount may live in the vendor/description text.
  if (amount === null) amount = parseFilenameAmount(base);
  if (!date) date = parseFilenameDate(base);

  const fields: string[] = [];
  if (vendor) fields.push('vendor');
  if (date) fields.push('date');
  if (amount !== null) fields.push('amount');
  if (description) fields.push('description');

  return { vendor, date, amount, description, fields };
}

/** The note the UI shows so a guess never passes as a reading. */
export function filenameNote(facts: FilenameFacts): string | null {
  if (facts.fields.length === 0) return null;
  return `Couldn’t read the file — filled ${facts.fields.join(', ')} from the filename. Please confirm.`;
}
