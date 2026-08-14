#!/usr/bin/env node
/* ============================================================================
   LOWPASS — authenticated production smoke.  npm run smoke:prod [origin]

   WHY THIS EXISTS, and why it asserts on CONTENT rather than status.
   On 2026-08-09 a getUser() → getClaims() swap made every signed-in page return
   HTTP 200 with a completely empty document: no root element, one network
   request, no subresources. A smoke checking status codes would have gone green
   through the entire outage and told Adam production was fine. So every route
   here asserts three things, and the third is the one that makes it a test
   rather than a ping:

     1. HTTP 200
     2. a real root element AND body text above a floor (500 chars)
     3. a route-specific content MARKER — an artist name, a column header

   Same day, a query against profiles.full_name (a column that does not exist)
   produced a reload loop. Both passed tsc at 0, eslint at 0, a green build and
   538 unit tests. Everything this project gates on is static; both failures
   were dynamic.

   ── THE ONE REAL ENGINEERING CHOICE: BROWSER, NOT COOKIE ───────────────────
   The brief offered a cookie-based fetch as the faster path if it could be made
   reliable. It cannot, and the reason is this week's own evidence: the
   @supabase/ssr session cookie is chunked base64 whose format is an
   implementation detail — exactly the kind of detail that shifted underneath us
   when getUser() became getClaims(). A smoke that hand-constructs that cookie
   is coupled to the thing most likely to break, and would fail for its own
   reasons on the day it is needed most. Driving the real login form exercises
   the real middleware, the real session refresh, and the real layout chain. It
   is slower and it is correct.

   Browser comes from @sparticuz/chromium, already a dependency because the PDF
   export uses it (src/lib/rider-packs/puppeteer.ts) — so CI needs no extra
   install and local/CI parity is free.

   ── CREDENTIALS ────────────────────────────────────────────────────────────
   SMOKE_EMAIL / SMOKE_PASSWORD / SMOKE_ORIGIN, from env, never committed.
   The user MUST be a normal member of a REAL workspace — not an admin, and not
   a fresh empty account. An empty workspace renders empty pages legitimately,
   which would make this smoke blind to the exact failure it exists to catch.
   ========================================================================= */

import puppeteer from 'puppeteer-core';
import chromium from '@sparticuz/chromium';

const ORIGIN = (process.argv[2] ?? process.env.SMOKE_ORIGIN ?? '').replace(/\/$/, '');
const EMAIL = process.env.SMOKE_EMAIL;
const PASSWORD = process.env.SMOKE_PASSWORD;

if (!ORIGIN || !EMAIL || !PASSWORD) {
  console.error(
    'smoke:prod needs SMOKE_ORIGIN (or argv[2]), SMOKE_EMAIL and SMOKE_PASSWORD.\n' +
      'Never commit these — see .github/workflows/smoke.yml for the secret names.',
  );
  process.exit(2);
}

const BODY_FLOOR = 500;

/* ── MARKERS ARE NOT FILLED IN YET, AND THAT IS A REAL GAP ──────────────────
   The brief is right that the marker is what makes this a test rather than a
   ping. Every checkPage call below passes `null` because I could not run any of
   these pages from my environment, and inventing a marker I have not seen
   rendered would be worse than an honest absence — a wrong marker fails
   forever and gets deleted, which is how a smoke dies.

   The other two assertions still catch THE outage: 200-with-empty-document
   fails the root-element and 500-char checks outright. What is missing is the
   weaker-but-broader class — a page that renders chrome and no data.

   FIRST PERSON TO RUN THIS: fill them in from what you actually see. An artist
   name on /artists, a column header on /budget. One string each, and this
   becomes a real test. */
const failures = [];

function fail(route, expected, got) {
  failures.push({ route, expected, got });
  console.error(`\n✗ ${route}\n  expected: ${expected}\n  got:      ${String(got).slice(0, 300)}`);
}

/** The three assertions. `marker` is what makes this a test. */
async function checkPage(page, route, marker) {
  const res = await page.goto(`${ORIGIN}${route}`, { waitUntil: 'networkidle2', timeout: 45_000 });
  const status = res?.status() ?? 0;
  if (status !== 200) return fail(route, 'HTTP 200', `HTTP ${status}`);

  const shape = await page.evaluate(() => ({
    hasRoot: !!document.querySelector('main, [id="__next"], body > div'),
    text: document.body?.innerText ?? '',
    html: document.documentElement?.outerHTML?.slice(0, 300) ?? '',
  }));

  /* THE OUTAGE ASSERTION. 200 + empty document was the failure mode. */
  if (!shape.hasRoot) return fail(route, 'a real root element', shape.html);
  if (shape.text.length < BODY_FLOOR) {
    return fail(route, `body text >= ${BODY_FLOOR} chars`, `${shape.text.length} chars: ${shape.text}`);
  }
  if (marker && !shape.text.includes(marker)) {
    return fail(route, `content marker ${JSON.stringify(marker)}`, shape.text.slice(0, 300));
  }
  console.log(`✓ ${route}  (${shape.text.length} chars${marker ? `, saw ${JSON.stringify(marker)}` : ''})`);
}

const browser = await puppeteer.launch({
  args: chromium.args,
  executablePath: process.env.PUPPETEER_EXECUTABLE_PATH ?? (await chromium.executablePath()),
  headless: true,
});

try {
  /* ── SIGNED OUT FIRST ────────────────────────────────────────────────────
     This path stayed healthy through the whole outage and is what made the
     site look fine from outside. Asserting it FIRST means a run that only gets
     this far still tells you something true. */
  const anon = await browser.newPage();
  await anon.goto(`${ORIGIN}/artists`, { waitUntil: 'networkidle2', timeout: 45_000 });
  const anonUrl = anon.url();
  if (!anonUrl.includes('/login')) {
    fail('/artists (signed out)', 'redirect to /login', anonUrl);
  } else {
    console.log('✓ /artists (signed out) → /login');
  }
  await anon.close();

  /* ── SIGN IN THROUGH THE REAL FORM ───────────────────────────────────── */
  const page = await browser.newPage();
  await page.goto(`${ORIGIN}/login`, { waitUntil: 'networkidle2', timeout: 45_000 });
  await page.type('input[type="email"], input[name="email"]', EMAIL);
  await page.type('input[type="password"], input[name="password"]', PASSWORD);
  await Promise.all([
    page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 45_000 }).catch(() => null),
    page.click('button[type="submit"]'),
  ]);
  if (page.url().includes('/login')) {
    fail('/login', 'a signed-in session', `still on ${page.url()}`);
    throw new Error('sign-in failed — every downstream check would be meaningless');
  }
  console.log(`✓ signed in → ${page.url()}`);

  /* ── ONE ROUTE PER SCOPE ─────────────────────────────────────────────────
     The outage was LAYOUT-scoped, so a single page would have missed it. IDs
     are DISCOVERED from the workspace page rather than hardcoded: a hardcoded
     id rots the moment the smoke user's workspace changes, and a smoke that
     needs editing to keep passing stops being run. */
  await checkPage(page, '/artists', null);

  const artistHref = await page.evaluate(
    () => document.querySelector('a[href^="/artists/"]')?.getAttribute('href') ?? null,
  );
  if (!artistHref) {
    fail('/artists', 'at least one artist link (is the smoke workspace empty?)', 'none found');
  } else {
    await checkPage(page, artistHref, null);
  }

  /* Tour-scoped routes need a tour id. Discovered the same way. */
  const tourHref = await page.evaluate(() => {
    const a = document.querySelector('a[href^="/operations/"], a[href^="/budget/"]');
    return a?.getAttribute('href') ?? null;
  });
  const tourId = tourHref?.match(/\/(?:operations|budget)\/([^/]+)/)?.[1] ?? null;
  if (!tourId) {
    fail('tour discovery', 'a tour link on the artist page', 'none found');
  } else {
    await checkPage(page, `/operations/${tourId}/routing`, null);
    await checkPage(page, `/budget/${tourId}`, null);

    const routingHref = await page.evaluate(
      () => document.querySelector('a[href*="/advance/"]')?.getAttribute('href') ?? null,
    );
    if (routingHref) await checkPage(page, routingHref, null);
    else console.log('· /advance skipped — no advance link found (not a failure)');
  }

  await checkPage(page, '/settings', null);
} catch (err) {
  fail('smoke run', 'completion', err instanceof Error ? err.message : String(err));
} finally {
  await browser.close();
}

if (failures.length > 0) {
  console.error(`\n${failures.length} smoke failure(s).`);
  process.exit(1);
}
console.log('\nAll smoke checks passed.');
