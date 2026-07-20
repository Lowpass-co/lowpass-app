/* ============================================
   LOWPASS — Tour role-link token smoke (D1-4 · ROLE-01/03)

   Proves the tokenized-link grammar WITHOUT a database: a fake service client
   feeds tour_role_links + tour_roles rows into resolveDayToken(), asserting a
   valid token yields the role/tour scope (which then drives loadDay's crew slice
   — money/notes absent, proven in loadDay.test), and a revoked / expired /
   missing token resolves to a reason so the public page 404s (ROLE-03).

   Run:  npx tsx src/lib/roles/token.test.ts
   Exits 0 ("role token: N checks passed") or throws.
   ============================================ */

import assert from 'node:assert/strict';
import { resolveDayToken, pickDayRouting } from '@/lib/roles/token';

let checks = 0;

function makeService(store: Record<string, unknown>) {
  function qb(table: string) {
    const single = { data: store[table] ?? null, error: null };
    const b: Record<string, unknown> = {};
    Object.assign(b, {
      select: () => b,
      eq: () => b,
      update: () => ({ eq: () => Promise.resolve({ error: null }) }),
      maybeSingle: () => Promise.resolve(single),
    });
    return b;
  }
  return { from: (t: string) => qb(t) } as never;
}

async function main() {
  // (1) valid crew token → role + scope resolved.
  const ok = await resolveDayToken(
    makeService({
      tour_role_links: { id: 'l1', tour_id: 't1', workspace_id: 'w1', tour_role_id: 'tr1', status: 'pending', expires_at: null, revoked_at: null },
      tour_roles: { role: 'crew', person_id: 'p1' },
    }),
    'tok-crew',
  );
  assert.equal(ok.ok, true, 'valid token resolves');
  if (ok.ok) {
    assert.equal(ok.role, 'crew', 'role = crew');
    assert.equal(ok.tourId, 't1', 'tourId carried');
    assert.equal(ok.workspaceId, 'w1', 'workspaceId carried (service-role scoping)');
  }
  checks += 4;

  // (2) revoked token → reason revoked (ROLE-03).
  const revoked = await resolveDayToken(
    makeService({ tour_role_links: { id: 'l2', tour_id: 't1', workspace_id: 'w1', tour_role_id: 'tr1', status: 'revoked', expires_at: null, revoked_at: '2026-07-01T00:00:00Z' } }),
    'tok-revoked',
  );
  assert.deepEqual(revoked, { ok: false, reason: 'revoked' }, 'revoked → reason revoked');
  checks++;

  // (3) expired token → reason expired.
  const expired = await resolveDayToken(
    makeService({ tour_role_links: { id: 'l3', tour_id: 't1', workspace_id: 'w1', tour_role_id: 'tr1', status: 'pending', expires_at: '2000-01-01T00:00:00Z', revoked_at: null } }),
    'tok-expired',
  );
  assert.deepEqual(expired, { ok: false, reason: 'expired' }, 'expired → reason expired');
  checks++;

  // (4) missing token → reason missing.
  const missing = await resolveDayToken(makeService({}), 'nope');
  assert.deepEqual(missing, { ok: false, reason: 'missing' }, 'missing → reason missing');
  checks++;

  // (5) unknown role value fails closed to crew.
  const weird = await resolveDayToken(
    makeService({
      tour_role_links: { id: 'l4', tour_id: 't1', workspace_id: 'w1', tour_role_id: 'trX', status: 'pending', expires_at: null, revoked_at: null },
      tour_roles: { role: 'nonsense', person_id: 'p2' },
    }),
    'tok-weird',
  );
  assert.equal(weird.ok && weird.role, 'crew', 'bad role value → fail-closed crew');
  checks++;

  // (6) pickDayRouting: today, else next, else last, else null.
  const rows = [
    { id: 'a', date: '2026-09-01' },
    { id: 'b', date: '2026-09-10' },
    { id: 'c', date: '2026-09-20' },
  ];
  assert.equal(pickDayRouting(rows, '2026-09-10'), 'b', 'picks today');
  assert.equal(pickDayRouting(rows, '2026-09-05'), 'b', 'picks next upcoming');
  assert.equal(pickDayRouting(rows, '2026-12-01'), 'c', 'falls back to last past');
  assert.equal(pickDayRouting([], '2026-09-10'), null, 'empty → null');
  checks += 4;

  console.log(`role token: ${checks} checks passed — valid resolves to slice; revoked/expired/missing 404`);
}

main().catch((e) => { console.error(e); process.exit(1); });
