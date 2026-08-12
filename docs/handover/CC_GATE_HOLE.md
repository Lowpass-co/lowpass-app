# CC — The gate hole. Every check this project runs is static, and every failure this week was dynamic.

Two production incidents in one day. `c9affb9` swapped `getUser()` for `getClaims()` and every signed-in page returned **HTTP 200 with a completely empty document** — no root element, one network request, no subresources. Then `25020ce`: a query against `profiles.full_name`, **a column that does not exist**, producing a reload loop on `/artists`.

Both passed `tsc --noEmit` at 0, `eslint` at 0, a green `next build`, and 538 vitest tests.

They passed because **nothing in this project runs against a real session or the real schema.** Same root as the FX route that 502'd for months with no caller, and the print-labels insert that silently stopped writing when 255 landed. The gates check that the code is well-formed. Nothing checks that it works.

This bank closes that. Topology first as always, but the finding below reframes the whole task, so read it before planning.

---

## GH-0 — There is no CI. Read this first; it changes what "gate" means here.

**`.github/workflows/` does not exist.** No GitHub Actions, no CI of any kind. `package.json` has `lint`, `typecheck`, `test` — and nothing invokes them but a human.

The consequence is worse than "tests run late". `src/lib/auth/route-guard-coverage.test.tsx` — the ratchet, the mechanism this project leans on hardest to stop unguarded mutating routes regrowing — is documented as *"a new mutating route with no guard must fail CI."* **It cannot fail CI. There is no CI.** It fails only if someone remembers to run vitest. The same is true of the money harnesses that every prompt in `docs/handover/` treats as a gate.

So there are two problems and they need to be solved in the right order: the checks that exist aren't wired to anything, and the checks that would have caught this week don't exist. **GH-3 wires them; GH-1 and GH-2 write them.** Do not build the smoke and then run it by hand forever — that reproduces the current situation with more steps.

## GH-1 — An authenticated smoke that asserts on CONTENT

**The assertion that matters is not "200".** The outage returned 200 on every page. Any smoke checking status codes would have gone green through the whole incident and told Adam production was fine.

Build `scripts/smoke-prod.mjs`, runnable as `npm run smoke:prod`:

- **Sign in as a real user** against the deployed origin. `puppeteer-core` is already a dependency (the PDF export uses it) — driving the actual login form is more robust than hand-constructing the `@supabase/ssr` cookie, whose chunked base64 format is an implementation detail that will change under you. If you can make a cookie-based `fetch` approach work reliably, it's faster and I'd prefer it; if it's brittle, take the browser. **Report which and why** — this is the one real engineering choice in the bank.
- **Credentials from env**, never committed: `SMOKE_EMAIL` / `SMOKE_PASSWORD` / `SMOKE_ORIGIN`. Adam creates a dedicated smoke user. It must be a **normal member of a real workspace**, not an admin and not a fresh empty account — an empty workspace renders empty pages legitimately, which would make the smoke blind to the exact failure it exists to catch.
- **For each route, assert three things:** HTTP 200, a document with a real root element and body text above a floor (say 500 chars), **and a route-specific content marker** — an artist name on `/artists`, a column header on a budget page. The marker is what makes it a test rather than a ping.
- **Cover one route per scope**, because the incident was layout-scoped and a single page would have missed it: workspace (`/artists`), artist (`/artists/[id]`), all three tour modes (`/operations/[tourId]/routing`, `/budget/[tourId]`, `/advance/[tourId]/[routingId]`), You (`/settings`). Plus **one signed-out assertion** — `/artists` unauthenticated must redirect to `/login` — because that path stayed healthy throughout and is what made the site look fine from outside.
- **Exit non-zero on any failure**, print the route, what was expected, and the first 300 chars of what came back. A smoke that fails without saying what it saw sends you to the browser anyway.
- Take the target origin as an argument so it can run against a preview deployment before promotion, not only production after.

## GH-2 — Generated Supabase types. Stage this; it has a large blast radius.

`profiles.full_name` compiled because **no Supabase client in this repo is typed.** There is no generated `Database` type — `src/lib/types/` is eleven hand-written files, and all four factories (`supabase-client`, `supabase-server`, `supabase-middleware`, `supabase-admin`) call `createClient` / `createServerClient` with no type parameter. Every `.from('x').select('y')` is `any` all the way down. A column that doesn't exist is indistinguishable from one that does.

The fix is `supabase gen types typescript --project-id pcurvjrnfkuagiuocruk > src/lib/types/database.ts`, then threading `Database` through the factories.

**Do not do that in one move, and do not start it before you have measured it.** Typing four factories at once will surface every hand-rolled query in ~200 route files simultaneously. That could be a handful of errors or several hundred, and the difference decides whether this is one bank or five.

So: **generate the type, thread it through ONE factory (`supabase-server`), run `tsc`, and report the error count before changing anything else.** Then Adam decides the sequencing. If it's small, carry on. If it's hundreds, the honest options are typing one factory per bank, or `Database` on new code only with a documented migration path — say which you'd pick and why.

One thing to name rather than discover later: **migrations are hand-pasted, so nothing regenerates these types when the schema moves.** A stale `database.ts` is worse than none — it would have *confirmed* `full_name` if it were generated before that column was dropped. The type needs a regeneration step in the migration ritual (`database/migrations/README.md`) and, ideally, a check that the committed type matches the live schema. Propose the mechanism; don't silently rely on discipline.

## GH-3 — Wire it up, or none of the above changes anything

Create `.github/workflows/ci.yml`:

- **On every push and PR:** `npm ci`, `tsc --noEmit`, `eslint`, `vitest run`, and the three money harnesses via `node --experimental-strip-types` — `src/lib/payroll/reconcile.harness.ts` (**72**), `src/lib/payroll/fees.test.ts` (**27**), `src/lib/settlement/reconcile.harness.ts` (**40**). Those counts are current as of 2026-08-09 and replace the 64/21/15 that older prompts cite. Note the known flake in the RoutingEditor + pdfProbe suites — if you add a retry, cap it at one and make the retry visible in the log rather than silent.
- **This is what finally arms the route-guard ratchet.** Say so in the workflow comments; it's the whole reason the test was written.
- **A separate post-deploy job** running `smoke:prod` against the deployment, with the smoke credentials as repository secrets. If it can't be triggered by Vercel's deployment event cleanly, a manual `workflow_dispatch` taking an origin is an acceptable first cut — say which you did.

**Adam has to create the smoke user and add the secrets.** Deliver the exact list of secret names and what each needs to contain, and stop there. Do not put credentials in any file.

---

## Order

GH-0 is a finding, not work. **GH-3's push/PR job first** — it's the smallest change with the largest immediate effect, because it arms checks that already exist and have been running on trust. Then GH-1. Then GH-2's measurement, then Adam rules on its sequencing.

## Gates

The usual floor, plus the obvious: **this bank's own CI job must pass on its own PR.** Report the harness numbers you actually observe rather than the ones written above — if they disagree, the numbers here are stale and I want to know rather than have you match them.

Do not weaken any existing check to make the pipeline green. If something that has been passing locally fails in CI, that is a finding — report it and stop. A red first run is the expected outcome of pointing a real gate at code that has never been gated, and papering over it would waste the entire exercise.
