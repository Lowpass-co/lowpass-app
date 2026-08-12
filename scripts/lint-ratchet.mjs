#!/usr/bin/env node
/* ============================================================================
   LOWPASS — the lint ratchet.

   WHY THIS EXISTS. `npm run lint` had never been run repo-wide. Every check in
   this project's history — including every one in this session — was
   `npx eslint <subdir>`, which is how 51 errors across 50 files stayed
   invisible while the "baseline" was reported as 6 warnings. Scoping the
   linter is the same failure as an audit assertion that tests the pre-state,
   or a smoke that checks HTTP 200 on an empty page: the check ran, and it was
   not looking at the thing.

   Fixing all 50 at once is not the right trade. 44 of them are
   react-hooks/set-state-in-effect, a React-Compiler-era rule that flags a
   pattern which is often legitimate (syncing external state, deriving from
   props). Mechanically rewriting 44 effect bodies is a large behavioural change
   in a week that already produced two production incidents from changes nobody
   exercised. Rewriting them blind would be the same class of mistake.

   So: the count is PINNED and may only go DOWN. A new error fails the build
   immediately, which is the leak closed. The existing 50 are a debt with a
   number attached rather than an unbounded fog, and burning them down is a
   separate, reviewable bank per rule.

   Same mechanism as the P0 route-guard ratchet — that one took unguarded
   mutating routes from 186 to 1 the same way, and the shape is proven here.

   Usage:  node scripts/lint-ratchet.mjs         # check against the baseline
           node scripts/lint-ratchet.mjs --write # re-pin AFTER fixing (down only)
   ========================================================================= */

import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';

const BASELINE = 'scripts/lint-baseline.json';

function measure() {
  let out;
  try {
    out = execFileSync('npx', ['eslint', '--format', 'json'], {
      encoding: 'utf8',
      maxBuffer: 64 * 1024 * 1024,
    });
  } catch (err) {
    /* A non-zero exit is the NORMAL path here: the linter exits non-zero
       whenever it finds errors, and its stdout still holds the JSON we need.
       (Deliberately not starting this comment with the linter's own name — a
       block comment beginning with that word is parsed as an inline config
       directive, which is how this script scored an error against itself on
       its first run.) */
    out = err.stdout ?? '';
  }
  const files = JSON.parse(out);
  const errors = files.reduce((n, f) => n + f.errorCount, 0);
  const warnings = files.reduce((n, f) => n + f.warningCount, 0);

  /* Per-rule, because a total that holds steady can still hide one rule
     growing while another shrinks. The route-guard ratchet learned this: the
     number going down is not the same as nothing new arriving. */
  const byRule = {};
  for (const f of files) {
    for (const m of f.messages) {
      if (m.severity !== 2 || !m.ruleId) continue;
      byRule[m.ruleId] = (byRule[m.ruleId] ?? 0) + 1;
    }
  }
  return { errors, warnings, byRule };
}

const now = measure();

if (process.argv.includes('--write')) {
  if (existsSync(BASELINE)) {
    const prev = JSON.parse(readFileSync(BASELINE, 'utf8'));
    if (now.errors > prev.errors) {
      console.error(
        `REFUSING TO RE-PIN UPWARDS: ${prev.errors} → ${now.errors}.\n` +
          'The baseline may only shrink. Fix the new errors instead.',
      );
      process.exit(1);
    }
  }
  writeFileSync(BASELINE, `${JSON.stringify(now, null, 2)}\n`);
  console.log(`Pinned: ${now.errors} errors, ${now.warnings} warnings.`);
  process.exit(0);
}

if (!existsSync(BASELINE)) {
  console.error(`No ${BASELINE}. Run with --write once to establish it.`);
  process.exit(1);
}
const base = JSON.parse(readFileSync(BASELINE, 'utf8'));

let failed = false;
if (now.errors > base.errors) {
  console.error(`LINT ERRORS WENT UP: ${base.errors} → ${now.errors}.`);
  failed = true;
}

/* A rule appearing for the first time, or growing, fails even when the total
   fell — otherwise fixing ten unused-vars would buy room for a new
   rules-of-hooks violation, and the ratchet would applaud. */
for (const [rule, count] of Object.entries(now.byRule)) {
  const was = base.byRule[rule] ?? 0;
  if (count > was) {
    console.error(`  ${rule}: ${was} → ${count}`);
    failed = true;
  }
}

if (failed) {
  console.error(
    '\nRun `npx eslint` to see them. Do NOT re-pin to make this pass —\n' +
      'the baseline only moves down, and `--write` refuses an increase.',
  );
  process.exit(1);
}

const delta = base.errors - now.errors;
console.log(
  `Lint ratchet OK — ${now.errors} errors (baseline ${base.errors}` +
    `${delta > 0 ? `, ${delta} FIXED, re-pin with --write` : ''}), ${now.warnings} warnings.`,
);
