# Security audit — remediation (2026-06-07)

Implements the fixes from the prioritized attack-surface audit, plus the
follow-up ask: **meter + rate-limit every Google and Anthropic API call**,
reusing the existing AI-usage table (`ai_usage_events`, migration 114).

All code typechecks (`tsc` on `src`) and lints clean. Nothing was applied to
the live database or git — see **Manual steps** below.

---

## What changed (by finding)

| Finding | Change | Files |
|---|---|---|
| **H1** headers/CSP | Added `headers()`: HSTS, X-Frame-Options, nosniff, Referrer-Policy, Permissions-Policy, enforced CSP `frame-ancestors 'self'`; full CSP as **Report-Only** for safe rollout | `next.config.ts` |
| **H2** open Google proxies | All 7 now require auth + are rate-limited + metered | `geocode`, `directions`, `places/{autocomplete,details,nearby,airports}`, `equipment/find-image` |
| **H3** cron fail-open | `authorized()` now fails **closed** in production when `CRON_SECRET` unset | `api/cron/dispatch-notifications/route.ts` |
| **M1** flights mass-assign | Whitelisted writable columns; `workspace_id` forced server-side | `api/flights/route.ts` |
| **M2** share-token secret | Dropped the `SUPABASE_SERVICE_ROLE_KEY` HMAC fallback; requires dedicated `ADVANCE_SHARE_HMAC_SECRET` | `lib/advance/publicShareToken.ts`, share-link route |
| **M3 + L4** CSRF / no middleware | New `middleware.ts`: Origin allowlist on POST/PUT/PATCH/DELETE + Supabase session refresh | `src/middleware.ts` |
| **M5** storage policy | artist-assets INSERT/UPDATE/DELETE scoped to own `uid/` folder (public read retained) | migration `206` |
| **L1** error leakage | `jsonError()` helper; applied on the flights route (pattern for the rest) | `lib/http/errors.ts`, `api/flights/route.ts` |
| **L2** admin list exposure | `GET /api/admins` now site-admin-only | `api/admins/route.ts` |
| — | Anthropic: the one uncapped route (`stage-plot/icons/generate`) now routes through `withAiUsage` | that route |
| — | Google: new wrapper logs every call to `ai_usage_events` (`provider='google'`) + per-user/per-workspace request-count limit | `lib/external/googleUsage.ts`, `lib/google/pricing.ts`, migration `205` |
| — | extra: `equipment/import-sheet` (open proxy) now requires auth | that route |

### Google/Anthropic metering design
- **Anthropic** — already capped by `withAiUsage` (per-user hard cap + workspace monthly $ budget). The last bypassing route is now wrapped, so **every** Anthropic call is capped + logged.
- **Google** — `guardGoogleCall(endpoint)` authenticates, then enforces a request-count rate limit (default **300/user/hour**, **5,000/workspace/day**, override via `GOOGLE_RL_USER_PER_HOUR` / `GOOGLE_RL_WS_PER_DAY`). `logGoogleCall()` writes one `ai_usage_events` row per call with an approximate per-request cost. The limiter **fails closed** (blocks) if it can't read the count.
- Migration `205` adds `ai_usage_events.provider`. The Anthropic $-cap sum (`sumMonthCost`) now filters `provider <> 'google'`, so Google volume never consumes the Anthropic budget.

---

## Manual steps (only you can do these)

1. **Apply migrations 205 + 206 BEFORE deploying** the code:
   `npm run db:migrate:dry-run` then `npm run db:migrate`.
   ⚠️ Deploy order matters — `withGoogleUsage` writes `provider`, which 205 adds. If code ships before the migration, the Google limiter fails closed (maps features blocked) until it's applied.
2. **Set `ADVANCE_SHARE_HMAC_SECRET`** (a long random string) in every env that issues advance share links. Until set, share-link creation returns 503. Existing links signed with the old service-key fallback stop verifying — reissue them.
3. **Confirm `CRON_SECRET` is set in Vercel prod** (the cron now denies all callers in prod without it).
4. **Rotate the two Google keys in `.mcp.json`** (Stitch + Google AI) and scope them — they were in cleartext on disk. Not in git, but rotate to be safe.
5. **Graduate the CSP** from Report-Only to enforced once you've watched the browser console for violations: rename `Content-Security-Policy-Report-Only` → `Content-Security-Policy` in `next.config.ts` and tighten `script-src` (drop `'unsafe-inline'`/`'unsafe-eval'` once a nonce strategy is in place).
6. **Verify the build** locally with the project's webpack build (`npm run build`) before deploy — the sandbox can't run the full Next build.
7. Review the diff and commit (I did not run git).

## Still open / recommended follow-ups
- **L1 error sanitization** is applied on the flights route only; ~180 routes still return raw `error.message`. Mechanical but wide — do a dedicated sweep with `jsonError()`.
- **GDPR (M6)** is the dedicated next task: DSAR export, self-service erasure-with-anonymization, IP/PII retention job, processor register.
- Approximate Google price cards in `lib/google/pricing.ts` are marked FRAGILE — verify against current Google pricing at the next billing review.
