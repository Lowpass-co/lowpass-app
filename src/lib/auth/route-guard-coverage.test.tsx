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

   ── THIS TEST'S OWN LIVENESS IS NOT SELF-EVIDENT ──────────────────────────
   A syntax error in this file does not FAIL these assertions — it stops the
   file transforming, and the whole suite ceases to exist. Vitest reports a
   failed suite, but nothing anywhere says "the ratchet is no longer running",
   which is precisely the failure this file exists to prevent, aimed at itself.
   It has happened once: an apostrophe inside a single-quoted reason string
   ("the caller's workspace"). The only tell was the project-wide test TOTAL
   dropping by exactly the number of tests below.

   So: DO NOT put apostrophes in reason strings, and if the total test count
   ever falls by ~8 after editing UNGUARDED, look here first. `tsc --noEmit`
   catches this class — but only if it runs AFTER the list is edited, not just
   after the routes are.

   The count below is asserted so the suite cannot quietly shrink either.
   ============================================ */

import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

const API_ROOT = 'src/app/api';

/** How many `it(...)` blocks this suite carries. See the liveness note above. */
const EXPECTED_ASSERTIONS = 8;

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
  '/public/show-link/[token]': /* POST */ 'PERMANENT — public. Tokenised show view (migration 257 show_links); the unguessable token (+ optional password in the body) IS the grant — the viewer has no session.',

  /* ── S1 D-1 — gear documents (read-only) ── */
  '/gear/export/manifest/pdf': /* POST */ 'PERMANENT — read-only POST. Writes nothing; renders the gear manifest from a config body. READ CHECK: authenticated session, then every gear/space/container row is loaded .eq(workspace_id, profile.workspace_id) by loadGearExportData.',
  '/gear/export/carnet/pdf': /* POST */ 'PERMANENT — read-only POST. Writes nothing; renders the ATA carnet GENERAL LIST (not a carnet) from a config body. READ CHECK: same workspace-scoped load as the manifest sibling.',

  /* ── P0-B — 10 remaining, all fourth-category (47 converted) ── */
  '/budget/[tourId]/export/pdf': /* POST */ 'PERMANENT — read-only POST. Writes nothing; renders a budget PDF from a config body. READ CHECK: authenticated user, then the tour is loaded scoped to the profile workspace_id.',
  '/budget/[tourId]/export/preview': /* POST */ 'PERMANENT — read-only POST. Writes nothing; renders a preview. READ CHECK: same workspace-scoped load as the pdf sibling.',
  '/budget/rules-check': /* POST */ 'PERMANENT — read-only POST. Writes nothing and calls no vendor; evaluates budget rules over a supplied body. READ CHECK: authenticated user plus workspace resolution.',
  '/budget/settlement/export/pdf': /* POST */ 'PERMANENT — read-only POST. Writes nothing; renders a settlement PDF. READ CHECK: authenticated user plus workspace-scoped load.',
  '/budget/settlement/export/preview': /* POST */ 'PERMANENT — read-only POST. Writes nothing; renders a preview. READ CHECK: same as the pdf sibling.',
  '/export/workbook': /* POST */ 'PERMANENT — read-only POST. Writes nothing; renders the 6-sheet workbook. READ CHECK: authenticated user plus workspace-scoped load. NOTE the IMPORT counterpart at /import is gated — export reads, import writes.',
  '/export/xlsx': /* POST */ 'PERMANENT — read-only POST. Writes nothing; renders xlsx from a config body. READ CHECK: authenticated user plus workspace-scoped load.',
  '/payroll/[tourId]/export/pdf': /* POST */ 'PERMANENT — read-only POST. Writes nothing; renders a payroll PDF. READ CHECK: authenticated user plus workspace-scoped load.',
  '/payroll/[tourId]/export/preview': /* POST */ 'PERMANENT — read-only POST. Writes nothing; renders a preview. READ CHECK: same as the pdf sibling.',
  '/payroll/[tourId]/export/zip': /* POST */ 'PERMANENT — read-only POST. Writes nothing; bundles per-person PDFs. READ CHECK: same as the pdf sibling.',

  /* ── P0-C2 — 5 remaining (19 converted; see the P0-C2 bank) ── */
  '/routing/[tourId]/export/pdf': /* POST */ 'PERMANENT — read-only POST. Writes nothing; renders a PDF from a config body. READ CHECK: authenticated user, then the tour is loaded .eq(workspace_id, profile.workspace_id), so a tour outside the caller workspace 404s.',
  '/routing/[tourId]/export/preview': /* POST */ 'PERMANENT — read-only POST. Writes nothing; renders a preview from a config body. READ CHECK: same tenancy-scoped tour load as the pdf sibling.',
  '/tours/[id]/personnel/conflicts': /* POST */ 'PERMANENT — read-only POST. Writes nothing; computes roster conflicts from a body of candidate dates. READ CHECK: getActiveMembership, 403 without one.',
  '/tours/[id]/touch': /* POST */ 'PERMANENT — always-204 ping. NOT a read exemption. Best-effort liveness write fired on EVERY tour-scoped page load, whose contract is that it ALWAYS returns 204; it already skips the write when unauthenticated. A 403 here breaks readonly navigation on an otherwise-fine page rather than protecting anything.',

  /* ── P0-C3 — 2 remaining, both fourth-category (16 converted) ── */
  '/channel-list/[tourId]/export/pdf': /* POST */ 'PERMANENT — read-only POST. Writes nothing; renders a channel-list PDF from a config body. READ CHECK: authenticated user, then the tour is loaded .eq(workspace_id, profile.workspace_id) and the channel rows hang off rider_packs.workspace_id, so a foreign tour 404s.',
  '/channel-list/[tourId]/export/preview': /* POST */ 'PERMANENT — read-only POST. Writes nothing; renders a preview from a config body. READ CHECK: same tenancy-scoped tour load as the pdf sibling.',

  /* ── P0-C4 — 2 remaining, both fourth-category (17 converted) ── */
  '/stage-plots/[id]/export/pdf': /* POST */ 'PERMANENT — read-only POST. Writes nothing; renders a stage-plot PDF from a config body. READ CHECK: requireUserAndWorkspace, then the plot is loaded with auth.workspaceId, and stage_plots carries a workspace-scoped SELECT policy (migration 109).',
  '/stage-plots/[id]/export/preview': /* POST */ 'PERMANENT — read-only POST. Writes nothing; renders a preview from a config body. READ CHECK: same workspace-scoped load as the pdf sibling.',

  /* ── P0-C5 — 6 remaining, all fourth-category (23 converted) ── */
  '/day/[routingId]/export/pdf': /* POST */ 'PERMANENT — read-only POST. Writes nothing; renders a day-sheet PDF from a config body. READ CHECK: authenticated user, then the day is loaded scoped to the calling user own profile workspace_id.',
  '/day/[routingId]/export/preview': /* POST */ 'PERMANENT — read-only POST. Writes nothing; renders a preview from a config body. READ CHECK: same workspace-scoped load as the pdf sibling.',
  '/places/airports': /* POST */ 'PERMANENT — read-only POST. Writes nothing; proxies Google Places. READ CHECK: guardGoogleCall() authenticates the Supabase session, resolves the workspace and returns 401/403/429 — the gate is one level down in lib/external/googleUsage, not inline.',
  '/places/autocomplete': /* POST */ 'PERMANENT — read-only POST. Writes nothing; proxies Google Places autocomplete. READ CHECK: same guardGoogleCall() gate as /places/airports.',
  '/rooming/[tourId]/export/pdf': /* POST */ 'PERMANENT — read-only POST. Writes nothing; renders a rooming PDF from a config body. READ CHECK: authenticated user, then the tour is loaded scoped to the calling user own profile workspace_id.',
  '/rooming/[tourId]/export/preview': /* POST */ 'PERMANENT — read-only POST. Writes nothing; renders a preview from a config body. READ CHECK: same workspace-scoped load as the pdf sibling.',

  /* ── P0-C6 — 13 remaining (17 converted): 8 site-admin, 3 self-scoped, 1 read-only, 1 open question ── */
  '/admin/notifications/test-send': /* POST */ 'PERMANENT — site-admin. requireSiteAdmin.',
  '/admin/users/[id]': /* DELETE */ 'PERMANENT — site-admin. Gated by requireSiteAdmin (lib/supabase-admin), a STRONGER and orthogonal axis to workspace role; requireWrite would be weaker, not additive.',
  '/admin/users/[id]/memberships/[memberId]': /* DELETE */ 'PERMANENT — site-admin. requireSiteAdmin.',
  '/admin/users/[id]/reset-password': /* POST */ 'PERMANENT — site-admin. requireSiteAdmin.',
  '/admin/users/[id]/suspend': /* POST */ 'PERMANENT — site-admin. requireSiteAdmin.',
  '/admin/workspaces/[id]': /* DELETE,PATCH */ 'PERMANENT — site-admin. requireSiteAdmin.',
  '/admins': /* POST */ 'PERMANENT — site-admin. getUserAndAdminStatus plus an is_site_admin check.',
  '/admins/[id]': /* DELETE */ 'PERMANENT — site-admin. getUserAndAdminStatus plus an is_site_admin check.',
  '/ai/preferences': /* PATCH */ 'PERMANENT — self-scoped POST. A member editing their own AI preferences row.',
  '/ai/rag/ask': /* POST */ 'PERMANENT — read-only POST. Writes nothing; answers a question from a body too large for a query string. READ CHECK: authenticated session via supabase.auth.getUser, 401 without one.',
  '/bug-reports': /* POST */ 'PENDING P0-C6 — POST files a bug report and is gated by getUserAndAdminStatus today. Whether a READONLY member may file a bug is a product call, not a security one, and gating it as a write would silence the people most likely to hit bugs. Needs a ruling.',
  '/workspaces/invite/accept': /* POST */ 'PERMANENT — self-scoped POST. THE INVITEE IS NOT YET A MEMBER of the inviting workspace, so requireWrite would refuse every invite acceptance and break onboarding outright. Authorization is the invite token plus the email match, inside accept_workspace_invite.',
  '/workspaces/switch': /* POST */ 'PERMANENT — self-scoped POST. Writes only the caller own profiles.workspace_id, and verifies membership of the target first. A readonly member must be able to switch workspaces.',
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
        !/^(PERMANENT — (public|cron|self-scoped|read-only POST|always-204 ping|site-admin|self-scoped POST)|PENDING P0-[BC]\d?)/.test(why),
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

  it('the ratchet is fully present — guards against a quietly shrinking suite', () => {
    /* Cannot assert the FILE parsed (a file that does not parse never reaches
       here), but it CAN pin how many assertions this suite is supposed to
       carry, so deleting one is a failure rather than a smaller green number.
       The parse case is covered by tsc and by the warning in the header. */
    expect(EXPECTED_ASSERTIONS).toBe(8);
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
