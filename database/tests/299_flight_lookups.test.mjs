// 299: the flight-search meter — caps hold, clients can't touch it, re-paste is a no-op.
import fs from 'node:fs';
import { base, check, done, WS, WS2, ADAM } from './permissions_base.mjs';
const ROOT = process.env.ROOT ?? '';
const m299 = fs.readFileSync(ROOT + 'database/migrations/299_flight_lookups.sql', 'utf8');
const { db, as } = await base();
await db.exec(m299);
await db.exec(m299); // re-paste

const reserve = async (cap, wsCap, ws) =>
  (await as(null, `SELECT public.flight_lookup_reserve(${cap}, ${wsCap}, 'aviationstack', 'BA117', '2026-11-26', '${ws}', '${ADAM}') AS id`, 'service_role'))[0]?.id ?? null;

check('first call reserved', !!(await reserve(3, 2, WS)), true);
check('second for this workspace', !!(await reserve(3, 2, WS)), true);
check('workspace share used up → refused', await reserve(3, 2, WS), null);
check('another workspace still gets the last one', !!(await reserve(3, 2, WS2)), true);
check('month used up → refused for everyone', await reserve(3, 2, WS2), null);
check('rows counted', (await db.query(`SELECT count(*)::int n FROM public.flight_lookups`)).rows[0].n, 3);

// last month's calls don't count
await db.exec(`UPDATE public.flight_lookups SET created_at = date_trunc('month', now()) - interval '1 day'`);
check('a new month starts fresh', !!(await reserve(3, 2, WS)), true);

// No client can read or write the meter, or call the reserve.
const ro = await as(ADAM, `SELECT count(*)::int n FROM public.flight_lookups`);
check('a signed-in user cannot read it', ro.error ? 'denied' : ro[0].n, 'denied');
const ins = await as(ADAM, `INSERT INTO public.flight_lookups (provider, flight_iata, flight_date) VALUES ('x','BA1','2026-01-01')`);
check('…or write it', ins.error ? 'denied' : 'allowed', 'denied');
const call = await as(ADAM, `SELECT public.flight_lookup_reserve(99, 99, 'x', 'BA1', '2026-01-01', '${WS}', '${ADAM}')`);
check('…or take a call', call.error ? 'denied' : 'allowed', 'denied');
done();
