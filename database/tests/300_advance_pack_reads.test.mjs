import fs from 'node:fs';
import { base, check, done, WS, ADAM, CREW, T1, R1 } from './permissions_base.mjs';
const { db, as } = await base();
const sql = fs.readFileSync('database/migrations/300_advance_pack_reads.sql', 'utf8');
await db.exec(sql);
await db.exec(sql); // re-run is a no-op
await db.exec(`INSERT INTO public.advance_pack_reads (workspace_id, tour_id, routing_id, user_id, files) VALUES ('${WS}','${T1}','${R1}','${ADAM}','[{"path":"x"}]')`);
const row = (await db.query(`SELECT status, parts_total, parts_done, reviewed_at FROM public.advance_pack_reads`)).rows;
check('one row, reading, nothing done', row, [{ status: 'reading', parts_total: 0, parts_done: 0, reviewed_at: null }]);
let bad = 'no error';
try { await db.exec(`INSERT INTO public.advance_pack_reads (workspace_id, tour_id, routing_id, status) VALUES ('${WS}','${T1}','${R1}','lost')`); } catch (e) { bad = 'refused'; }
check('status is one of reading / done / failed', bad, 'refused');
const seen = async (u) => { const r = await as(u, `SELECT id FROM public.advance_pack_reads`); return Array.isArray(r) ? r.length : 'denied'; };
check('admin client cannot read (service role only)', await seen(ADAM), 'denied');
check('crew client cannot read', await seen(CREW), 'denied');
done();
