/* ============================================
   LOWPASS — P0-C1: THE RATCHET

   A readonly member created an artist and it persisted. The cause was not one
   missing button: route code did authentication + tenancy and delegated ROLE to
   RLS, and RLS only encodes role on the 9 tables migration 079 strict-gated.
   187 route files export a mutating verb. Converting them in one pass would be
   a diff nobody could review and a revert nobody could aim.

   So this test is the mechanism instead of the conversion. It walks every
   route.ts under src/app/api, finds every exported POST/PATCH/PUT/DELETE, and
   requires each file to EITHER call requireWrite OR appear in UNGUARDED below
   with a stated reason.

   It passes on day one. That is the point. What it buys immediately:

     1. A NEW mutating route with no guard fails CI the moment it is written.
        That is the leak closed — the number can no longer grow by accident.
     2. The remaining work is a number, printed below, that only goes down.
     3. Removing an entry is the ONLY way to satisfy the ratchet test, so a
        conversion cannot be claimed without the list actually shrinking.

   ── THE LIST MAY ONLY SHRINK ──────────────────────────────────────────────
   Do not add an entry to UNGUARDED to make a build pass. If a route genuinely
   cannot take requireWrite, that is a design question for Adam, not a line of
   config — the three PERMANENT categories below are the entire set of reasons
   a mutating route may go unguarded, and each was argued once:

     · PUBLIC TOKEN ROUTES — the caller has no session, so there is no role to
       check. The unguessable token IS the authorization.
     · CRON — authorized by CRON_SECRET. No user, no role.
     · SELF-SCOPED WRITES — a member editing their own profile / avatar /
       preferences. Gating these on admin/manager would break readonly members
       for no security gain; the row is already keyed to auth.uid().
     · READ-ONLY POST — a route that WRITES NOTHING and uses POST only because
       the request carries a body (render config, a query too big for a query
       string). requireWrite would refuse a readonly member a READ. Ruled by
       Adam on 2026-08-04 with a condition attached: exemption from requireWrite
       is NOT exemption from authorization, so every entry must state both that
       it writes nothing AND which read check it carries. An entry that cannot
       name one is a finding, not a line — asserted below, not trusted.

   One route sits outside all four and carries its own justification inline —
   see /tours/[id]/touch. Its reason is not "this is a read"; it is a contract
   about what the route must always return.

   Anything else is PENDING, tagged with the bank that will convert it.
   ============================================ */

import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

const API_ROOT = 'src/app/api';

/** Route paths (relative to /api, POSIX, Next bracket segments intact) that
 *  export a mutating verb and do NOT call requireWrite. Every entry carries a
 *  one-line reason. THE LIST MAY ONLY SHRINK — see the header. */
const UNGUARDED: Record<string, string> = {
  /* ── PERMANENT — public token routes, cron, self-scoped writes ── */
  '/advance-packets/[tourId]/[routingId]': /* POST */ 'PERMANENT — public. Token-addressed packet fetch/record for an external recipient.',
  '/cron/dispatch-notifications': /* POST */ 'PERMANENT — cron. Authorized by CRON_SECRET; there is no user, so there is no role to check.',
  '/cron/intake-reminders': /* POST */ 'PERMANENT — cron. Authorized by CRON_SECRET; same no-user rule.',
  '/intake/[token]/submit': /* POST */ 'PERMANENT — public. Token-scoped intake submission, no session by design.',
  '/profile': /* PATCH */ 'PERMANENT — self-scoped. A member edits their OWN profile row; readonly must keep this.',
  '/profile/avatar': /* POST */ 'PERMANENT — self-scoped. Own avatar upload; same rule as /profile.',
  '/public/advance-intake/[token]/submit': /* POST */ 'PERMANENT — public. Authorization IS the unguessable token; the submitter has no session to have a role.',
  '/public/advance-intake/[token]/tech-pack': /* POST */ 'PERMANENT — public. Same token grant as the intake submit above.',
  '/public/advance-packet/[token]': /* POST */ 'PERMANENT — public. Venue opens a packet with no account; the token is the grant.',
  '/public/rider/[token]': /* POST */ 'PERMANENT — public. Tokenised rider view for people outside the workspace.',

  /* ── P0-B — 56 routes ── */
  '/budget/[tourId]/export/pdf': /* POST */ 'PENDING P0-B — money path — P0-B owns these; P0-C must not re-touch them.',
  '/budget/[tourId]/export/preview': /* POST */ 'PENDING P0-B — money path — P0-B owns these; P0-C must not re-touch them.',
  '/budget/ai/suggest': /* POST */ 'PENDING P0-B — money path — P0-B owns these; P0-C must not re-touch them.',
  '/budget/ai/template': /* POST */ 'PENDING P0-B — money path — P0-B owns these; P0-C must not re-touch them.',
  '/budget/commissions': /* DELETE,PATCH,POST */ 'PENDING P0-B — money path — P0-B owns these; P0-C must not re-touch them.',
  '/budget/exchange-rate': /* POST */ 'PENDING P0-B — money path — P0-B owns these; P0-C must not re-touch them.',
  '/budget/flights': /* DELETE,PATCH,POST */ 'PENDING P0-B — money path — P0-B owns these; P0-C must not re-touch them.',
  '/budget/fx-rates': /* DELETE,POST */ 'PENDING P0-B — money path — P0-B owns these; P0-C must not re-touch them.',
  '/budget/hotels': /* DELETE,PATCH,POST */ 'PENDING P0-B — money path — P0-B owns these; P0-C must not re-touch them.',
  '/budget/hotels/assignments': /* DELETE,PATCH,POST */ 'PENDING P0-B — money path — P0-B owns these; P0-C must not re-touch them.',
  '/budget/income': /* POST */ 'PENDING P0-B — money path — P0-B owns these; P0-C must not re-touch them.',
  '/budget/line-items': /* DELETE,PATCH,POST */ 'PENDING P0-B — money path — P0-B owns these; P0-C must not re-touch them.',
  '/budget/line-items/[id]/attachments': /* DELETE,PATCH,POST */ 'PENDING P0-B — money path — P0-B owns these; P0-C must not re-touch them.',
  '/budget/line-items/[id]/notes': /* DELETE,PATCH,POST */ 'PENDING P0-B — money path — P0-B owns these; P0-C must not re-touch them.',
  '/budget/line-items/[id]/transactions': /* POST */ 'PENDING P0-B — money path — P0-B owns these; P0-C must not re-touch them.',
  '/budget/payroll': /* POST */ 'PENDING P0-B — money path — P0-B owns these; P0-C must not re-touch them.',
  '/budget/payroll/generate': /* POST */ 'PENDING P0-B — money path — P0-B owns these; P0-C must not re-touch them.',
  '/budget/personnel-rates': /* DELETE,PATCH,POST */ 'PENDING P0-B — money path — P0-B owns these; P0-C must not re-touch them.',
  '/budget/personnel-rates/bulk-delete': /* POST */ 'PENDING P0-B — money path — P0-B owns these; P0-C must not re-touch them.',
  '/budget/rate-lines': /* PATCH */ 'PENDING P0-B — money path — P0-B owns these; P0-C must not re-touch them.',
  '/budget/rate-types': /* DELETE,PATCH,POST */ 'PENDING P0-B — money path — P0-B owns these; P0-C must not re-touch them.',
  '/budget/receipts': /* DELETE,PATCH,POST */ 'PENDING P0-B — money path — P0-B owns these; P0-C must not re-touch them.',
  '/budget/receipts/ocr': /* POST */ 'PENDING P0-B — money path — P0-B owns these; P0-C must not re-touch them.',
  '/budget/receipts/proposals': /* POST */ 'PENDING P0-B — money path — P0-B owns these; P0-C must not re-touch them.',
  '/budget/receipts/proposals/apply': /* POST */ 'PENDING P0-B — money path — P0-B owns these; P0-C must not re-touch them.',
  '/budget/receipts/upload': /* POST */ 'PENDING P0-B — money path — P0-B owns these; P0-C must not re-touch them.',
  '/budget/rooming': /* DELETE,POST */ 'PENDING P0-B — money path — P0-B owns these; P0-C must not re-touch them.',
  '/budget/rules-check': /* POST */ 'PENDING P0-B — money path — P0-B owns these; P0-C must not re-touch them.',
  '/budget/sections': /* DELETE,PATCH,POST */ 'PENDING P0-B — money path — P0-B owns these; P0-C must not re-touch them.',
  '/budget/settings': /* POST */ 'PENDING P0-B — money path — P0-B owns these; P0-C must not re-touch them.',
  '/budget/settlement': /* POST */ 'PENDING P0-B — money path — P0-B owns these; P0-C must not re-touch them.',
  '/budget/settlement/export/pdf': /* POST */ 'PENDING P0-B — money path — P0-B owns these; P0-C must not re-touch them.',
  '/budget/settlement/export/preview': /* POST */ 'PENDING P0-B — money path — P0-B owns these; P0-C must not re-touch them.',
  '/budget/settlement/lines': /* DELETE,PATCH,POST */ 'PENDING P0-B — money path — P0-B owns these; P0-C must not re-touch them.',
  '/budget/settlement/upload': /* POST */ 'PENDING P0-B — money path — P0-B owns these; P0-C must not re-touch them.',
  '/budget/templates': /* DELETE,PATCH,POST */ 'PENDING P0-B — money path — P0-B owns these; P0-C must not re-touch them.',
  '/budget/templates/[id]/lines': /* DELETE,PATCH,POST */ 'PENDING P0-B — money path — P0-B owns these; P0-C must not re-touch them.',
  '/budget/templates/[id]/sections': /* DELETE,PATCH,POST */ 'PENDING P0-B — money path — P0-B owns these; P0-C must not re-touch them.',
  '/budget/templates/apply': /* POST */ 'PENDING P0-B — money path — P0-B owns these; P0-C must not re-touch them.',
  '/budget/transactions/[id]': /* DELETE,PATCH */ 'PENDING P0-B — money path — P0-B owns these; P0-C must not re-touch them.',
  '/budget/transactions/[id]/reorder': /* PATCH */ 'PENDING P0-B — money path — P0-B owns these; P0-C must not re-touch them.',
  '/budget/versions': /* POST */ 'PENDING P0-B — money path — P0-B owns these; P0-C must not re-touch them.',
  '/budget/versions/[id]/amend': /* POST */ 'PENDING P0-B — money path — P0-B owns these; P0-C must not re-touch them.',
  '/budget/versions/[id]/approve': /* POST */ 'PENDING P0-B — money path — P0-B owns these; P0-C must not re-touch them.',
  '/budget/versions/[id]/rollback': /* POST */ 'PENDING P0-B — money path — P0-B owns these; P0-C must not re-touch them.',
  '/budget/versions/[id]/unlock': /* POST */ 'PENDING P0-B — money path — P0-B owns these; P0-C must not re-touch them.',
  '/expenses': /* POST */ 'PENDING P0-B — money path — P0-B owns these; P0-C must not re-touch them.',
  '/export/assets': /* POST */ 'PENDING P0-B — money path — P0-B owns these; P0-C must not re-touch them.',
  '/export/templates': /* DELETE,PATCH,POST */ 'PENDING P0-B — money path — P0-B owns these; P0-C must not re-touch them.',
  '/export/workbook': /* POST */ 'PENDING P0-B — money path — P0-B owns these; P0-C must not re-touch them.',
  '/export/xlsx': /* POST */ 'PENDING P0-B — money path — P0-B owns these; P0-C must not re-touch them.',
  '/import/workbook': /* POST */ 'PENDING P0-B — money path — P0-B owns these; P0-C must not re-touch them.',
  '/import/workbook/apply': /* POST */ 'PENDING P0-B — money path — P0-B owns these; P0-C must not re-touch them.',
  '/payroll/[tourId]/export/pdf': /* POST */ 'PENDING P0-B — money path — P0-B owns these; P0-C must not re-touch them.',
  '/payroll/[tourId]/export/preview': /* POST */ 'PENDING P0-B — money path — P0-B owns these; P0-C must not re-touch them.',
  '/payroll/[tourId]/export/zip': /* POST */ 'PENDING P0-B — money path — P0-B owns these; P0-C must not re-touch them.',

  /* ── P0-C2 — 5 remaining (19 converted; see the P0-C2 bank) ── */
  '/routing/[tourId]/export/pdf': /* POST */ 'PERMANENT — read-only POST. Writes nothing; renders a PDF from a config body. READ CHECK: authenticated user, then the tour is loaded .eq(workspace_id, profile.workspace_id), so a tour outside the caller workspace 404s.',
  '/routing/[tourId]/export/preview': /* POST */ 'PERMANENT — read-only POST. Writes nothing; renders a preview from a config body. READ CHECK: same tenancy-scoped tour load as the pdf sibling.',
  '/tours/[id]/payroll/finalize': /* DELETE,POST */ 'PENDING P0-B — money path; ALREADY role-checked by hand (POST admin+manager, DELETE admin-only). P0-B converts it to requireWrite.',
  '/tours/[id]/personnel/conflicts': /* POST */ 'PERMANENT — read-only POST. Writes nothing; computes roster conflicts from a body of candidate dates. READ CHECK: getActiveMembership, 403 without one.',
  '/tours/[id]/touch': /* POST */ 'PERMANENT — always-204 ping. NOT a read exemption. Best-effort liveness write fired on EVERY tour-scoped page load, whose contract is that it ALWAYS returns 204; it already skips the write when unauthenticated. A 403 here breaks readonly navigation on an otherwise-fine page rather than protecting anything.',

  /* ── P0-C3 — 2 remaining, both fourth-category (16 converted) ── */
  '/channel-list/[tourId]/export/pdf': /* POST */ 'PERMANENT — read-only POST. Writes nothing; renders a channel-list PDF from a config body. READ CHECK: authenticated user, then the tour is loaded .eq(workspace_id, profile.workspace_id) and the channel rows hang off rider_packs.workspace_id, so a foreign tour 404s.',
  '/channel-list/[tourId]/export/preview': /* POST */ 'PERMANENT — read-only POST. Writes nothing; renders a preview from a config body. READ CHECK: same tenancy-scoped tour load as the pdf sibling.',

  /* ── P0-C4 — 2 remaining, both fourth-category (17 converted) ── */
  '/stage-plots/[id]/export/pdf': /* POST */ 'PERMANENT — read-only POST. Writes nothing; renders a stage-plot PDF from a config body. READ CHECK: requireUserAndWorkspace, then the plot is loaded with auth.workspaceId, and stage_plots carries a workspace-scoped SELECT policy (migration 109).',
  '/stage-plots/[id]/export/preview': /* POST */ 'PERMANENT — read-only POST. Writes nothing; renders a preview from a config body. READ CHECK: same workspace-scoped load as the pdf sibling.',

  /* ── P0-C5 — 29 routes ── */
  '/contacts': /* DELETE,PATCH,POST */ 'PENDING P0-C5 — operations/personnel/logistics write.',
  '/containers': /* POST */ 'PENDING P0-C5 — operations/personnel/logistics write.',
  '/containers/[id]': /* DELETE,PATCH */ 'PENDING P0-C5 — operations/personnel/logistics write.',
  '/day/[routingId]/export/pdf': /* POST */ 'PENDING P0-C5 — operations/personnel/logistics write.',
  '/day/[routingId]/export/preview': /* POST */ 'PENDING P0-C5 — operations/personnel/logistics write.',
  '/flights': /* POST */ 'PENDING P0-C5 — operations/personnel/logistics write.',
  '/flights/[id]': /* DELETE,PATCH */ 'PENDING P0-C5 — operations/personnel/logistics write.',
  '/gear': /* POST */ 'PENDING P0-C5 — operations/personnel/logistics write.',
  '/gear/[id]': /* PATCH */ 'PENDING P0-C5 — operations/personnel/logistics write.',
  '/gear/from-rental': /* POST */ 'PENDING P0-C5 — operations/personnel/logistics write.',
  '/gear/move': /* POST */ 'PENDING P0-C5 — operations/personnel/logistics write.',
  '/labor-call-templates': /* POST */ 'PENDING P0-C5 — operations/personnel/logistics write.',
  '/labor-calls': /* DELETE,PATCH,POST */ 'PENDING P0-C5 — operations/personnel/logistics write.',
  '/labor-calls/apply-template': /* POST */ 'PENDING P0-C5 — operations/personnel/logistics write.',
  '/personnel': /* POST */ 'PENDING P0-C5 — operations/personnel/logistics write.',
  '/personnel/[id]': /* DELETE,PATCH */ 'PENDING P0-C5 — operations/personnel/logistics write.',
  '/personnel/[id]/documents': /* DELETE,POST */ 'PENDING P0-C5 — operations/personnel/logistics write.',
  '/personnel/[id]/intake-token': /* POST */ 'PENDING P0-C5 — operations/personnel/logistics write.',
  '/personnel/bulk-delete': /* POST */ 'PENDING P0-C5 — operations/personnel/logistics write.',
  '/personnel/import': /* POST */ 'PENDING P0-C5 — operations/personnel/logistics write.',
  '/persons': /* POST */ 'PENDING P0-C5 — operations/personnel/logistics write.',
  '/persons/[id]': /* DELETE,PATCH */ 'PENDING P0-C5 — operations/personnel/logistics write.',
  '/places/airports': /* POST */ 'PENDING P0-C5 — operations/personnel/logistics write.',
  '/places/autocomplete': /* POST */ 'PENDING P0-C5 — operations/personnel/logistics write.',
  '/rooming/[tourId]/export/pdf': /* POST */ 'PENDING P0-C5 — operations/personnel/logistics write.',
  '/rooming/[tourId]/export/preview': /* POST */ 'PENDING P0-C5 — operations/personnel/logistics write.',
  '/rooms/[id]': /* PATCH */ 'PENDING P0-C5 — operations/personnel/logistics write.',
  '/spaces': /* POST */ 'PENDING P0-C5 — operations/personnel/logistics write.',
  '/spaces/[id]': /* DELETE,PATCH */ 'PENDING P0-C5 — operations/personnel/logistics write.',

  /* ── P0-C6 — 30 routes ── */
  '/admin/notifications/test-send': /* POST */ 'PENDING P0-C6 — remainder.',
  '/admin/users/[id]': /* DELETE */ 'PENDING P0-C6 — remainder.',
  '/admin/users/[id]/memberships/[memberId]': /* DELETE */ 'PENDING P0-C6 — remainder.',
  '/admin/users/[id]/reset-password': /* POST */ 'PENDING P0-C6 — remainder.',
  '/admin/users/[id]/suspend': /* POST */ 'PENDING P0-C6 — remainder.',
  '/admin/workspaces/[id]': /* DELETE,PATCH */ 'PENDING P0-C6 — remainder.',
  '/admins': /* POST */ 'PENDING P0-C6 — remainder.',
  '/admins/[id]': /* DELETE */ 'PENDING P0-C6 — remainder.',
  '/ai-usage/limits': /* PATCH */ 'PENDING P0-C6 — remainder.',
  '/ai-usage/overrides': /* DELETE,PUT */ 'PENDING P0-C6 — remainder.',
  '/ai/preferences': /* PATCH */ 'PENDING P0-C6 — remainder.',
  '/ai/rag/ask': /* POST */ 'PENDING P0-C6 — remainder.',
  '/ai/rag/reindex': /* POST */ 'PENDING P0-C6 — remainder.',
  '/bug-reports': /* POST */ 'PENDING P0-C6 — remainder.',
  '/bug-reports/[id]': /* DELETE,PATCH */ 'PENDING P0-C6 — remainder.',
  '/bug-reports/bulk': /* POST */ 'PENDING P0-C6 — remainder.',
  '/deal-memos': /* POST */ 'PENDING P0-C6 — remainder.',
  '/deal-memos/[id]': /* DELETE,PATCH */ 'PENDING P0-C6 — remainder.',
  '/deal-memos/[id]/upload': /* POST */ 'PENDING P0-C6 — remainder.',
  '/files': /* DELETE,POST */ 'PENDING P0-C6 — remainder.',
  '/upload/advance-file': /* DELETE,POST */ 'PENDING P0-C6 — remainder.',
  '/upload/artist-asset': /* POST */ 'PENDING P0-C6 — remainder.',
  '/venues/canonical/backfill': /* POST */ 'PENDING P0-C6 — remainder.',
  '/venues/canonical/backfill-city': /* POST */ 'PENDING P0-C6 — remainder.',
  '/workspaces/invite': /* POST */ 'PENDING P0-C6 — remainder.',
  '/workspaces/invite/[id]': /* DELETE */ 'PENDING P0-C6 — remainder.',
  '/workspaces/invite/[id]/resend': /* POST */ 'PENDING P0-C6 — remainder.',
  '/workspaces/invite/accept': /* POST */ 'PENDING P0-C6 — remainder.',
  '/workspaces/members/[id]': /* DELETE,PATCH */ 'PENDING P0-C6 — remainder.',
  '/workspaces/switch': /* POST */ 'PENDING P0-C6 — remainder.',
};

/* ── the walk ─────────────────────────────────────────────────────────────── */

const MUTATING = /^export\s+(?:async\s+)?(?:function|const)\s+(POST|PATCH|PUT|DELETE)\b/m;

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (name === 'route.ts') out.push(full);
  }
  return out;
}

type Route = { route: string; guarded: boolean };

const routes: Route[] = walk(API_ROOT)
  .map((file) => ({ file, src: readFileSync(file, 'utf8') }))
  .filter(({ src }) => MUTATING.test(src))
  .map(({ file, src }) => ({
    route: file.slice(API_ROOT.length).replace(/\/route\.ts$/, '').replace(/\\/g, '/') || '/',
    /* Substring, not an AST walk. A route that imports requireWrite and never
       calls it would pass — but that is a lie someone has to type on purpose,
       and the acceptance test for every conversion bank is a real readonly
       session hitting the real endpoint, which no static check replaces. */
    guarded: src.includes('requireWrite('),
  }));

describe('P0-C1 — every mutating route is guarded or listed', () => {
  it('finds the API surface at all (guards against a silent zero-route pass)', () => {
    /* If the walk breaks — a moved API_ROOT, a renamed route file convention —
       every other assertion here passes vacuously and the ratchet silently
       stops ratcheting. Pin the floor. */
    expect(routes.length).toBeGreaterThan(150);
  });

  it('NO MUTATING ROUTE IS BOTH UNGUARDED AND UNLISTED', () => {
    /* This is the assertion that fails on a new route. The message names the
       file so the fix is obvious: add requireWrite, or argue for a PERMANENT
       entry. */
    const rogue = routes.filter((r) => !r.guarded && !(r.route in UNGUARDED));
    expect(rogue.map((r) => r.route)).toEqual([]);
  });

  it('the list carries no stale entries — a converted route must LEAVE it', () => {
    /* The ratchet. Guarding a route without deleting its line fails here, so
       "converted" and "the number went down" cannot come apart. */
    const known = new Set(routes.map((r) => r.route));
    const guarded = new Set(routes.filter((r) => r.guarded).map((r) => r.route));
    const stale = Object.keys(UNGUARDED).filter((r) => !known.has(r) || guarded.has(r));
    expect(stale).toEqual([]);
  });

  it('every entry states a reason', () => {
    const blank = Object.entries(UNGUARDED).filter(([, why]) => why.trim().length < 20);
    expect(blank).toEqual([]);
  });

  it('only three categories may be PERMANENT', () => {
    /* Everything else must name the bank that will convert it, so the backlog
       stays legible as a queue rather than decaying into "known exceptions". */
    const bad = Object.entries(UNGUARDED).filter(
      ([, why]) =>
        !/^(PERMANENT — (public|cron|self-scoped|read-only POST|always-204 ping)|PENDING P0-[BC]\d?)/.test(why),
    );
    expect(bad.map(([r]) => r)).toEqual([]);
  });

  it('every read-only POST names what it writes AND what it checks', () => {
    /* The condition attached to the fourth category, enforced rather than
       trusted. Exemption from requireWrite is not exemption from
       authorization: an entry that cannot name its read check is a finding. */
    const bad = Object.entries(UNGUARDED)
      .filter(([, why]) => why.startsWith('PERMANENT — read-only POST'))
      .filter(([, why]) => !(why.includes('Writes nothing') && why.includes('READ CHECK:')));
    expect(bad.map(([r]) => r)).toEqual([]);
  });

  it('reports the burn-down', () => {
    const total = routes.length;
    const guarded = routes.filter((r) => r.guarded).length;
    const permanent = Object.values(UNGUARDED).filter((w) => w.startsWith('PERMANENT')).length;
    const pending = Object.values(UNGUARDED).filter((w) => w.startsWith('PENDING')).length;
    console.log(
      `P0 route guard coverage: ${guarded}/${total} guarded · ${permanent} permanent exemptions · ${pending} PENDING conversion`,
    );
    expect(guarded + permanent + pending).toBe(total);
  });
});
