// 303 — the curated advance catalogue. A database shaped like production's
// (003 + 259 seeds, a double-pasted section, a workspace fork, a section the
// workspace made itself, starter + custom templates, days using them), then
// 303 pasted twice.
import fs from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
import { check, done } from './permissions_base.mjs';

const ROOT = process.env.ROOT ?? '';
const m303 = fs.readFileSync(ROOT + 'database/migrations/303_advance_catalog_curated.sql', 'utf8');
const db = new PGlite();
const WS = '00000000-0000-0000-0000-0000000000a1';

await db.exec(`
CREATE TABLE public.advance_templates (
  id uuid primary key default gen_random_uuid(), workspace_id uuid, template_type text not null,
  name text not null, description text not null default '', icon text not null default 'clipboard',
  fields jsonb not null default '[]', suggested_for_day_types text[], created_at timestamptz not null default now(),
  sort_order int, tm_only boolean not null default false, forked_from_id uuid references public.advance_templates(id) on delete set null
);
-- Production enforces "contact questions only in Key Contacts" (076) as a trigger.
CREATE FUNCTION public.contact_only() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
  IF NEW.name <> 'Key Contacts' AND EXISTS (SELECT 1 FROM jsonb_array_elements(COALESCE(NEW.fields, '[]'::jsonb)) f WHERE f->>'type' = 'contact')
  THEN RAISE EXCEPTION 'contact fields only in Key Contacts'; END IF; RETURN NEW; END $$;
CREATE TRIGGER contact_only BEFORE INSERT OR UPDATE ON public.advance_templates FOR EACH ROW EXECUTE FUNCTION public.contact_only();
CREATE TABLE public.advance_layout_templates (id uuid primary key default gen_random_uuid(), workspace_id uuid, name text, sections jsonb, updated_at timestamptz default now());
CREATE TABLE public.advance_form_configs (id uuid primary key default gen_random_uuid(), tour_id uuid, routing_id uuid, name text, sections jsonb, layout_template_id uuid, customised boolean not null default false);
`);

const seed = async (name, fields, extra = {}) => {
  const r = await db.query(
    `INSERT INTO public.advance_templates (workspace_id, template_type, name, fields, tm_only, forked_from_id) VALUES ($1, 'section', $2, $3, $4, $5) RETURNING id`,
    [extra.ws ?? null, name, JSON.stringify(fields), extra.tm ?? false, extra.fork ?? null],
  );
  return r.rows[0].id;
};
const F = (id, label = id, type = 'text') => ({ id, label, type });

const old = {};
for (const n of ['Production', 'Hospitality', 'Schedule', 'Transport', 'Hotel', 'Flights', 'Venue Info', 'Merch', 'Security', 'Local Info', 'Settlement',
  'Event Basics', 'Documents and Maps', 'Bus and Trailer', 'Driver and Hotels', 'Personal Vehicle Parking', 'Venue Amenities',
  'Runner', 'Comps and Ticketing', 'Airport and Local Distances', 'Outdoor Venue and Final Confirmation', 'Deal Info']) {
  old[n] = await seed(n, [F('doors_open'), F('load_in')]);
}
old['Key Contacts'] = await seed('Key Contacts', [F('promoter_buyer', 'Promoter/buyer', 'contact')]);
const dressingA = await seed('Dressing Rooms', [F('num_dressing_rooms')]);
const dressingB = await seed('Dressing Rooms', [F('num_dressing_rooms')]); // double paste
const fork = await seed('Hospitality', [F('x')], { ws: WS, fork: old['Hospitality'] });
const mine = await seed('Our own checklist', [F('thing')], { ws: WS });

const lay = async (name) => (await db.query(`INSERT INTO public.advance_layout_templates (workspace_id, name, sections) VALUES ($1, $2, '[]') RETURNING id`, [WS, name])).rows[0].id;
const headline = await lay('Headline show day');
const custom = await lay('My club day');
const day = async (layout, customised) =>
  (await db.query(`INSERT INTO public.advance_form_configs (sections, layout_template_id, customised) VALUES ('[{"template_id":"x"}]', $1, $2) RETURNING id`, [layout, customised])).rows[0].id;
const dayPlain = await day(headline, false);
const dayCustomised = await day(headline, true);
const dayCustom = await day(custom, false);

// An answer stored against Schedule's row + doors_open must survive.
await db.exec(m303);
const after1 = (await db.query(`SELECT id, name, fields, show_when, tm_only, workspace_id FROM public.advance_templates ORDER BY name`)).rows;
await db.exec(m303); // re-paste
const after2 = (await db.query(`SELECT id, name, fields, show_when, tm_only, workspace_id FROM public.advance_templates ORDER BY name`)).rows;
check('a second paste changes nothing', JSON.stringify(after2), JSON.stringify(after1));

const builtIn = after2.filter((r) => r.workspace_id === null).map((r) => r.name);
check('built-in sections = the 15 in the catalogue', builtIn, [
  'Arrival & Parking', 'Catering & Hospitality', 'Documents Received', 'Dressing Rooms', 'Festival', 'Guests & Credentials',
  'Key Contacts', 'Local Info', 'Merch', 'Production', 'Runner', 'Schedule', 'Security & Safety', 'Show', 'Weather & Outdoor',
]);
const byName = Object.fromEntries(after2.filter((r) => r.workspace_id === null).map((r) => [r.name, r]));
check('Schedule kept its row (answers keyed by it survive)', byName['Schedule'].id, old['Schedule']);
check('Show took over Event Basics’ row', byName['Show'].id, old['Event Basics']);
check('Arrival & Parking took over Bus and Trailer (Transport deleted)', byName['Arrival & Parking'].id, old['Bus and Trailer']);
check('Catering & Hospitality took over Hospitality', byName['Catering & Hospitality'].id, old['Hospitality']);
check('one Dressing Rooms, the older row', [byName['Dressing Rooms'].id === dressingA || byName['Dressing Rooms'].id === dressingB, builtIn.filter((n) => n === 'Dressing Rooms').length], [true, 1]);
check('Festival is new, at its fixed id', byName['Festival'].id, '30300000-0000-4000-8000-00000000000f');
check('Weather shows only when outdoor / covered', byName['Weather & Outdoor'].show_when, { in: ['Outdoor', 'Covered'], field: 'indoor_outdoor' }); // jsonb orders keys
check('Documents Received is only for the tour', byName['Documents Received'].tm_only, true);
check('contact questions only in Key Contacts', after2.filter((r) => r.name !== 'Key Contacts' && r.fields.some((f) => f.type === 'contact')).length, 0);
const allIds = after2.filter((r) => r.workspace_id === null).flatMap((r) => r.fields.map((f) => f.id));
check('every question is asked once', allIds.length, new Set(allIds).size);
check('the workspace fork is gone; your own section stays', after2.filter((r) => r.workspace_id === WS).map((r) => r.id), [mine]);
check('fork id gone', after2.some((r) => r.id === fork), false);

const lays = Object.fromEntries((await db.query(`SELECT id, sections FROM public.advance_layout_templates`)).rows.map((r) => [r.id, r.sections]));
check('Headline template rebuilt: 14 sections in order', lays[headline].map((s) => s.label), [
  'Key Contacts', 'Show', 'Schedule', 'Arrival & Parking', 'Production', 'Dressing Rooms', 'Catering & Hospitality',
  'Runner', 'Merch', 'Guests & Credentials', 'Security & Safety', 'Weather & Outdoor', 'Local Info', 'Documents Received',
]);
check('its Weather section carries the condition', lays[headline].find((s) => s.label === 'Weather & Outdoor').show_when, { in: ['Outdoor', 'Covered'], field: 'indoor_outdoor' }); // jsonb orders keys
check('its Documents section is marked tm_only', lays[headline].find((s) => s.label === 'Documents Received').tm_only, true);
check('a custom template is left alone', lays[custom], []);

const days = Object.fromEntries((await db.query(`SELECT id, sections, customised FROM public.advance_form_configs`)).rows.map((r) => [r.id, r]));
check('a plain day gets the new sections', days[dayPlain].sections.length, 14);
check('a customised day too, and is no longer customised', [days[dayCustomised].sections.length, days[dayCustomised].customised], [14, false]);
check('a day on a custom template is left alone', days[dayCustom].sections, [{ template_id: 'x' }]);
done();
