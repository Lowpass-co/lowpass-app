# AI usage tracking smoke tests

> **Last bulk verification**: (pending — feat/ai-usage-tracking)

Walk these after changes to AI cost tracking / caps / the dashboard.
Format defined in `docs/smoke-tests/README.md`. Prefix: `AIU`.
**Prereq: migrations 114 applied; `RESEND_API_KEY` set for AIU-05.**

## Attribution

#### AIU-01 — A call is recorded + attributed

**Do**: Trigger an OCR receipt scan (or any AI feature). Open
`/admin/ai-usage` → Recent events.

**Expect**: A row appears within ~5s, attributed to your user, with
the right endpoint + model, non-zero input/output tokens, and
cost > $0.

**Last verified**:

## Enforcement

#### AIU-02 — Per-user hard cap blocks

**Do**: Settings → AI limits → set a user's hard cap to $0.01 (or use an
override). Trigger an AI call as that user.

**Expect**: 429 `{ error:'ai_usage_cap_exceeded', reason:'user_hard_cap' }`;
a toast "You've hit your personal AI usage limit…"; an `ai_usage_events`
row with `status='blocked_cap'` and no Anthropic spend.

**Last verified**:

#### AIU-03 — Workspace budget blocks

**Do**: Set the workspace monthly budget to $0.01. Trigger an AI call as a
user who is under their own cap.

**Expect**: 429 with `reason:'workspace_budget'`; toast about the
workspace budget; `blocked_cap` event.

**Last verified**:

## Dashboard

#### AIU-04 — Breakdowns reconcile

**Do**: Reset caps to sane values. On `/admin/ai-usage`, compare the
By-user and By-endpoint tabs against the KPI "This month" total.

**Expect**: By-user costs sum to the workspace total; By-endpoint costs
sum to the same; the sparkline's daily bars sum to it too.

**Last verified**:

#### AIU-06 — Dashboard is site-admin only

**Do**: As a non-site-admin, navigate to `/admin/ai-usage`.

**Expect**: 404 (notFound) — the dashboard is site-admin gated.

**Last verified**:

## Alerts

#### AIU-05 — Budget alert email fires

**Do**: With `RESEND_API_KEY` set + an `ai_usage_limits` row, push spend to
≥ 50% of the monthly budget (a small budget + a couple calls).

**Expect**: Within one AI call after crossing, a "… AI budget at 50%"
email lands at `alert_recipients` (or the workspace admins). Crossing the
same threshold again the same month does NOT re-send.

**Last verified**:

## Settings

#### AIU-07 — AI limits page is workspace-admin only

**Do**: As a non-admin workspace member, open `/settings/ai-limits`.

**Expect**: A read-only notice ("AI limits are managed by workspace
admins"), no edit controls; the write APIs 403 if called directly.

**Last verified**:

#### AIU-08 — Personal usage widget matches the dashboard

**Do**: Open `/settings` → "Your AI usage this month". Compare to your row
on `/admin/ai-usage` → By user.

**Expect**: Calls / tokens / cost match; the progress bar colour reflects
your position vs the soft (amber) / hard (red) caps.

**Last verified**:

## Suggestions opt-in gate

> Migration 210 applied; workspace default OFF
> (`ai_usage_limits.ai_suggestions_default_enabled = false`).

#### AIU-09 — Panel does not auto-fire when suggestions off

**Do**: With the preference OFF (default), open several budget
line-item detail panels. Watch the Network tab.

**Expect**: Zero POSTs to `/api/budget/ai/suggest` on open. The
suggestions area shows a "Get suggestions" button + "AI suggestions are
off — fetch them on demand any time."

**Last verified**:

#### AIU-10 — Manual trigger fetches once

**Do**: With the preference OFF, open a line-item panel and click "Get
suggestions".

**Expect**: Exactly one POST to `/api/budget/ai/suggest` (+ one to
`/api/budget/rules-check`); suggestions / findings render; the button is
replaced by the results and a "Refresh" affordance.

**Last verified**:

#### AIU-11 — Opt-in restores auto-fire

**Do**: `PATCH /api/ai/preferences { "suggestions_enabled": true }`
(curl / dev control), then open a line-item panel.

**Expect**: After the preference cache refetches (no page reload
required), panels auto-load suggestions on open again.
`GET /api/ai/preferences` returns `suggestions_enabled: true`,
`user_override: true`.

**Last verified**:

#### AIU-12 — Per-user preference isolation

**Do**: User A `PATCH`es `suggestions_enabled: true`; user B in the same
workspace leaves it default. Each opens a line-item panel.

**Expect**: A's panels auto-fire; B's do not. B cannot read A's
`user_ai_preferences` row (RLS — non-admin self-only SELECT).

**Last verified**:

#### AIU-13 — Rules finding fires for EU-no-carnet, no model call

**Do**: On a tour whose continent is EU with no `/carnet/i` line item,
satisfy the gate (manual or opt-in) and open a line-item panel.

**Expect**: A "No carnet budgeted" finding renders above any LLM
suggestions. `/api/budget/rules-check` adds **no** `ai_usage_events`
row (deterministic, no Anthropic call). A clean tour yields no findings.

**Last verified**:

## Known broken

#### AIU-A — Pricing rates need a real-bill confirmation

**Currently**: `src/lib/ai/pricing.ts` uses Haiku 4.5 $1/$5 (in/out) +
Sonnet/Opus cards, claimed-verified against the pricing page. Confirm
against an actual Anthropic invoice — the rates drive every cost + cap.

#### AIU-B — Alert email omits top users/endpoints

**Currently**: §AI-6 email shows spend / budget / % + a dashboard link;
the spec's "top users / top endpoints" lines were deferred (the dashboard
carries the breakdown).

## Retired

(None yet.)
