/* ============================================
   LOWPASS — flight search: the pure rules (Nov 2026, Adam: "lets do
   aviationstack … just have the search function. just make sure we don't
   burn those 100 requests")

   ONE search = flight number + date → airline, from, to, local departure /
   arrival times. No alerts (Adam: "remove the notifs").

   What protects the 100 calls a month (all here or in the server):
     1. Only an explicit "Find" — never on typing.
     2. A bad flight number is refused before anything is sent.
     3. A date the plan can't answer is refused before anything is sent
        (`inPlanWindow`): the FREE plan only sees flights flying around
        today (fragile — from Aviationstack's plan notes as we understood
        them; set AVIATIONSTACK_PLAN to a paid plan to lift it).
     4. Cache (`cacheFresh`): the same flight + date is answered from the
        flight_lookups table — a flown flight for good, otherwise for hours.
     5. A monthly cap, counted in the database (migration 299), below the
        provider's 100, and a per-workspace share of it.

   FRAGILE (unverified until the first real call): Aviationstack's
   scheduled / estimated times carry a "+00:00" offset but are the airport's
   LOCAL clock — we keep the clock reading and drop the offset, which is
   what the flight form wants (local date + local time).
   ============================================ */

export type FlightFound = {
  airline: string | null;
  flightNumber: string;
  from: string | null; // IATA
  to: string | null;
  fromName: string | null;
  toName: string | null;
  /** Local wall clock at the airport, 'YYYY-MM-DDTHH:MM'. */
  departLocal: string | null;
  arriveLocal: string | null;
  status: string | null;
  terminal: string | null;
  gate: string | null;
};

/** "ba 117", "BA-0117" → "BA117". Null when it isn't a flight number. */
export function normaliseFlightNumber(raw: string): string | null {
  const s = raw.toUpperCase().replace(/[\s-]/g, '');
  const m = /^([A-Z0-9]{2}[A-Z]?)(\d{1,4})([A-Z]?)$/.exec(s);
  if (!m) return null;
  // the airline part needs at least one letter (e.g. "U2", "9W" fine; "12" not)
  if (!/[A-Z]/.test(m[1]!)) return null;
  return `${m[1]}${String(Number(m[2]))}${m[3]}`;
}

export const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

function dayDiff(a: string, b: string): number {
  return Math.round((Date.parse(`${a}T00:00:00Z`) - Date.parse(`${b}T00:00:00Z`)) / 86_400_000);
}

/** Can this plan answer this date at all? Free: yesterday … tomorrow (UTC
 *  days, so every timezone's "today" is inside). Paid: any date. */
export function inPlanWindow(plan: string, flightDate: string, today: string): boolean {
  if (plan !== 'free') return true;
  return Math.abs(dayDiff(flightDate, today)) <= 1;
}

export type CachedRow = { status: string; created_at: string; flight_date: string };

/** May a stored answer be reused instead of a new call? A flown flight's
 *  answer is final; otherwise a found flight for 6 h, a miss for 3 h. An
 *  error is never reused (the next try may work) — but it still COUNTED. */
export function cacheFresh(row: CachedRow, now: Date): boolean {
  const ageH = (now.getTime() - Date.parse(row.created_at)) / 3_600_000;
  const today = now.toISOString().slice(0, 10);
  if (row.status === 'ok') return dayDiff(row.flight_date, today) < -1 || ageH < 6;
  if (row.status === 'not_found') return ageH < 3;
  if (row.status === 'pending') return ageH < 0.05; // someone else's call in flight (3 min)
  return false;
}

const clock = (v: unknown): string | null => (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(v) ? v.slice(0, 16) : null);
const str = (v: unknown): string | null => (typeof v === 'string' && v.trim() ? v.trim() : null);

type AsRow = {
  flight_date?: string;
  flight_status?: string;
  departure?: Record<string, unknown>;
  arrival?: Record<string, unknown>;
  airline?: { name?: string; iata?: string };
  flight?: { iata?: string; number?: string; codeshared?: unknown };
};

/** The Aviationstack /flights answer → the one flight on that date, or null.
 *  Prefers the operating flight over a codeshare listing of it. */
export function parseAviationstack(json: unknown, flightIata: string, flightDate: string): FlightFound | null {
  const data = (json as { data?: unknown })?.data;
  if (!Array.isArray(data)) return null;
  const rows = (data as AsRow[]).filter(
    (r) => r && (r.flight?.iata ?? '').toUpperCase() === flightIata && (!r.flight_date || r.flight_date === flightDate),
  );
  const pick = rows.find((r) => !r.flight?.codeshared) ?? rows[0];
  if (!pick) return null;
  const d = pick.departure ?? {};
  const a = pick.arrival ?? {};
  return {
    airline: str(pick.airline?.name),
    flightNumber: flightIata,
    from: str(d.iata),
    to: str(a.iata),
    fromName: str(d.airport),
    toName: str(a.airport),
    departLocal: clock(d.scheduled),
    arriveLocal: clock(a.scheduled),
    status: str(pick.flight_status),
    terminal: str(d.terminal),
    gate: str(d.gate),
  };
}

/** Aviationstack's error body → a sentence for the TM (+ whether it means
 *  the KEY / PLAN is wrong, so we stop trying). */
export function aviationstackError(json: unknown): { message: string; fatal: boolean } | null {
  const e = (json as { error?: { code?: string; message?: string } })?.error;
  if (!e) return null;
  const code = String(e.code ?? '');
  if (code === 'https_access_restricted')
    return { message: 'Your Aviationstack plan doesn’t allow secure (HTTPS) calls.', fatal: true };
  if (code === 'usage_limit_reached') return { message: 'The flight-search allowance for this month is used up.', fatal: true };
  if (code === 'invalid_access_key' || code === 'missing_access_key') return { message: 'The flight-search key is wrong.', fatal: true };
  if (code === 'function_access_restricted') return { message: 'Your Aviationstack plan can’t search that date.', fatal: true };
  return { message: e.message ? String(e.message) : 'Flight search failed.', fatal: false };
}
