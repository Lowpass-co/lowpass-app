# AI Suggestions — Opt-in Gate + Rules Engine (first AI-assistant ticket)

> `LineItemDetailPanel.tsx` **auto-fires** `/api/budget/ai/suggest` on panel open (`useEffect` at ~L238–242, calling `fetchSuggestions`). That spends the Anthropic key without the user asking and forces AI into the UI — it directly violates the product's non-invasive principle. This ticket fixes that AND builds the shared "recommendation surface" floor that every future AI layer (private RAG, the Community) will plug into: a proactive prompt that respects a per-user opt-in, fed initially by a cheap deterministic **rules engine**.
>
> This is build #1 of the plan in `AI_ASSISTANT_ARCHITECTURE.md`. Read that first for the why. This prompt is the what.

---

## 0. Required reading

1. `CLAUDE.md`
2. `docs/handover/AI_ASSISTANT_ARCHITECTURE.md` — the strategy this implements (esp. §2 Layer B, §4 build order, §5 open decisions)
3. `database/migrations/README.md` — numbering + runner (`npm run db:migrate`)
4. `database/migrations/114_ai_usage_tracking.sql` — `ai_usage_events`, `ai_usage_limits`, `ai_usage_user_overrides` (you EXTEND `ai_usage_limits`; you do NOT touch `ai_usage_user_overrides` — see §1.7)
5. `src/lib/ai/usage.ts` — the metering wrapper (unchanged here; context only)
6. `src/app/api/budget/ai/suggest/route.ts` — the LLM suggest endpoint + the inline carnet/haulage logic you extract in Phase R
7. `src/components/detail-panel/LineItemDetailPanel.tsx` — L208–242: `fetchSuggestions` + the auto-fire `useEffect` you gate
8. `src/lib/rate-limit.ts` — `getCached`/`setCached` (context)
9. `src/lib/grid/formula.test.ts` — the unit-test style to mirror for the rules module
10. `database/migrations/060_roles_wiring.sql` (in history) — the RLS pattern for a self-vs-admin readable table; and the `/settings/team` page it created, which is where opt-out status will surface later (NOT built here)

---

## 1. Hard rules

1. No new dependencies.
2. All visual values via `var(--lp-…)` tokens. For orange tints use hex+alpha or `color-mix(...)`, never JS string concat of a CSS var.
3. No `any`, no `// @ts-ignore`.
4. Lint clean — no new warnings above the current baseline. Typecheck zero errors (`tsc --noEmit`).
5. Build via `next build --webpack` only (never Turbopack).
6. Migration: clean-break numbering (≥200). Verify the next free number BEFORE writing — `main` highest is currently `205`, but check feature branches per `README.md` §Numbering:
   ```bash
   ls database/migrations/[0-9][0-9][0-9]_*.sql | sort | tail -1
   git fetch origin main && git ls-tree origin/main database/migrations/ | grep -E "[0-9]{3}_" | sort | tail -3
   for b in $(git branch -r | grep -v HEAD); do echo "=== $b ==="; git ls-tree -r "$b" database/migrations/ 2>/dev/null | grep -E "[0-9]{3}_" | sort | tail -1; done
   ```
   Pick the next free number ≥206 above ALL results. Mirror it in the file header. Idempotent. Down block at the end. Apply via `npm run db:migrate` (the "paste into Supabase" workflow is retired).
7. **Adam's product locks (do not relitigate):**
   - **Workspace default for AI suggestions is OFF (opt-in).** ⚠️ *Adam: confirm or flip the seed default — this is the faithful read of your "don't force AI on people" stance, and it's a one-line change.*
   - **The per-user override is self-service** — a user sets their OWN preference without needing an admin. (This is why you do NOT reuse `ai_usage_user_overrides`, which is admin-write-only.)
   - **A manual "Get suggestions" trigger is ALWAYS available**, regardless of preference. Opt-out removes the *automatic* firing, not the on-demand option.
   - **Opt-out status must be readable by workspace admins** (for the future `/settings/team` team-profile view). Make the data admin-readable; do NOT build that UI here.
   - **For v1 the gate governs the WHOLE in-panel assistant surface** — both LLM suggestions and rules findings. (Rules aren't strictly "AI"; Adam may later want them always-on. Not now.)
8. Commits in order: **M → A → U → R → V**. M+A+U is the shippable core (gate + fix); R adds the rules value; they can land in the same PR.

---

## M. Migration — per-user preference + workspace default

### M.1 Number
Next free ≥206 (verify per §1.6). Filename `NNN_ai_suggestions_preferences.sql`.

### M.2 SQL (adapt the number)

```sql
-- ============================================
-- LOWPASS — AI suggestions opt-in preference
-- Migration NNN
--
-- Adds a per-user, self-service preference for whether the in-panel
-- AI assistant (LLM suggestions + rules findings) fires automatically,
-- plus a per-workspace default. Tristate user pref: NULL = follow the
-- workspace default; TRUE/FALSE = explicit user choice.
--
-- NOTE: deliberately a NEW table, not a column on ai_usage_user_overrides
-- — that table is admin-write-only (migration 114); this preference is
-- self-service, so it needs its own self-write RLS.
-- ============================================

-- 1. Workspace default (extend the existing limits table)
ALTER TABLE public.ai_usage_limits
  ADD COLUMN IF NOT EXISTS ai_suggestions_default_enabled boolean NOT NULL DEFAULT false;

-- 2. Per-user preference (tristate)
CREATE TABLE IF NOT EXISTS public.user_ai_preferences (
  workspace_id        uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  user_id             uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  suggestions_enabled boolean,           -- NULL = follow workspace default
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (workspace_id, user_id)
);

ALTER TABLE public.user_ai_preferences ENABLE ROW LEVEL SECURITY;

-- SELECT: the user reads their own row; workspace admins read all rows in
-- their workspace (for the future /settings/team opt-out display).
DROP POLICY IF EXISTS user_ai_preferences_select ON public.user_ai_preferences;
CREATE POLICY user_ai_preferences_select ON public.user_ai_preferences
  FOR SELECT USING (
    workspace_id = public.get_my_workspace_id()
    AND (user_id = auth.uid() OR public.is_workspace_admin())
  );

-- INSERT/UPDATE/DELETE: a user writes ONLY their own row, in their workspace.
DROP POLICY IF EXISTS user_ai_preferences_write ON public.user_ai_preferences;
CREATE POLICY user_ai_preferences_write ON public.user_ai_preferences
  FOR ALL USING (
    workspace_id = public.get_my_workspace_id() AND user_id = auth.uid()
  )
  WITH CHECK (
    workspace_id = public.get_my_workspace_id() AND user_id = auth.uid()
  );

-- ============================================
-- DOWN (manual)
-- DROP TABLE IF EXISTS public.user_ai_preferences CASCADE;
-- ALTER TABLE public.ai_usage_limits DROP COLUMN IF EXISTS ai_suggestions_default_enabled;
-- ============================================
```

### M.3 Acceptance
- [ ] `npm run db:migrate:dry-run` lists the new migration; `npm run db:migrate` applies it cleanly, and a second run is a no-op (idempotent).
- [ ] `user_ai_preferences` is RLS-enabled with the two policies above.
- [ ] `ai_usage_limits.ai_suggestions_default_enabled` exists, default `false`.

### M.4 Commit
```
feat(migrations): NNN — AI suggestions opt-in preference

Per-user self-service preference (tristate; NULL = follow workspace
default) for whether the in-panel AI assistant fires automatically,
plus ai_usage_limits.ai_suggestions_default_enabled (default false).
New table rather than a column on ai_usage_user_overrides because the
latter is admin-write-only and this preference is self-service.

Made-with: Claude Code (AI suggestions gate)
```

---

## A. Preference resolution + API

### A.1 Resolver — `src/lib/ai/suggestions-pref.ts`
Pure-ish server helper:
```ts
// getSuggestionsEnabled(svc, workspaceId, userId): Promise<boolean>
//   1. read user_ai_preferences.suggestions_enabled for (workspaceId,userId)
//   2. if non-null → return it
//   3. else read ai_usage_limits.ai_suggestions_default_enabled (default false if no row)
```
Use the service-role client (`createServiceSupabaseClient`) for reads here, mirroring `usage.ts`, OR the user session client — your call, but be consistent and document it. No `any`.

### A.2 API — `src/app/api/ai/preferences/route.ts`
- **GET** → `{ suggestions_enabled: boolean }` (the *resolved* effective value for the current user) plus `{ user_override: boolean | null, workspace_default: boolean }` so the UI can show all three states.
- **PATCH** body `{ suggestions_enabled: boolean | null }` → upserts the caller's `user_ai_preferences` row (`null` reverts to workspace default). Auth: signed-in user; resolve workspace via `profiles.workspace_id` (mirror the pattern in `budget/ai/suggest/route.ts` L27–41). RLS already restricts writes to the caller's own row — belt-and-braces, set `user_id` to the session user server-side, never from the body.
- No Anthropic call here. No `withAiUsage`.

### A.3 Acceptance
- [ ] GET returns the resolved value + the override/default breakdown.
- [ ] PATCH `true`/`false`/`null` persists and round-trips; a second user in the same workspace is unaffected (per-user isolation).
- [ ] A non-admin cannot read another user's preference row (RLS).

### A.4 Commit
```
feat(ai): suggestions preference resolver + /api/ai/preferences

Resolver folds per-user tristate over the workspace default. GET
returns the effective value; PATCH upserts the caller's own row
(null reverts to default). No model calls.

Made-with: Claude Code (AI suggestions gate)
```

---

## U. Gate the panel + manual trigger

File: `src/components/detail-panel/LineItemDetailPanel.tsx`.

### U.1 Stop the auto-fire
The `useEffect` at ~L238–242 currently calls `fetchSuggestions()` whenever the panel opens / line item changes. Gate it on the resolved preference:
- Read the preference once. **Preferred wiring:** a small client hook `useSuggestionsEnabled()` backed by a context provider mounted high (e.g. in `ProductShell`) so it isn't re-fetched per panel. **Acceptable fallback:** fetch `GET /api/ai/preferences` once on mount and cache in the provider/module. Don't fetch per-open.
- Only auto-fire `fetchSuggestions()` when the resolved value is `true`.

### U.2 Manual trigger (always present)
- When suggestions are disabled (or simply not yet loaded), render a subtle, token-styled **"Get suggestions"** button in the suggestions area that calls `fetchSuggestions()` on click. This is the always-available on-demand path (§1.7).
- When enabled, keep current behaviour (auto-load) but ALSO keep a "Refresh suggestions" affordance.
- Loading + empty + dismissed states already exist (`suggestionsLoading`, `suggestionsDismissed`) — reuse them; don't fork the rendering.

### U.3 Acceptance
- [ ] With preference OFF (default): opening a line-item panel makes **no** call to `/api/budget/ai/suggest` (verify in Network tab — this is the core fix).
- [ ] The "Get suggestions" button is present and fetches once on click when OFF.
- [ ] With preference ON: behaviour matches today (auto-load on open).
- [ ] Toggling via PATCH (or a temporary dev control) flips the behaviour without reload after the provider refetches.
- [ ] No token/lint/type regressions.

### U.4 Commit
```
fix(budget): gate AI line-item suggestions behind opt-in preference

Panel no longer auto-fires /api/budget/ai/suggest on open — it only
auto-loads when the resolved per-user preference is true (default
off). A manual "Get suggestions" button is always available for the
on-demand path. Removes the forced-AI behaviour; builds the surface
future AI layers plug into.

Made-with: Claude Code (AI suggestions gate)
```

---

## R. Rules engine (deterministic, no AI)

### R.1 Module — `src/lib/budget/rules.ts`
Extract the carnet/haulage logic currently inline in `budget/ai/suggest/route.ts` (the `hasCarnet`/`hasHaulage` derivations) into pure, testable functions.
```ts
export interface BudgetFinding {
  id: string;                 // stable, e.g. 'eu-shows-no-carnet'
  severity: 'info' | 'warn';
  title: string;              // short
  detail: string;             // one sentence
  suggestedAction?: { kind: 'add_line_item'; label: string; category?: string };
}
export interface BudgetRulesInput {
  showCount: number;
  hasEuShows: boolean;        // derive from routing (continent/country)
  lineItems: { category?: string; label?: string; proposed_cost?: number }[];
}
export function runBudgetRules(input: BudgetRulesInput): BudgetFinding[];
```
Seed rules (Adam owns the list — keep it small and obvious for v1):
- `eu-shows-no-carnet` — EU shows present, no line item matching `/carnet/i`.
- `no-haulage` — show count > N, no `/haulage|freight|truck/i` line item.
- `large-room-no-pa` — a routing venue with capacity ≥ threshold and no `/PA|sound|audio/i` rental line. (Capacity needs venue data; if not readily available in this input, stub the rule behind a TODO and ship the first two.)

### R.2 Tests — `src/lib/budget/rules.test.ts`
Mirror `src/lib/grid/formula.test.ts`. Cover each rule firing and not-firing. Pure, no network.

### R.3 Endpoint — `src/app/api/budget/rules-check/route.ts`
- POST `{ tour_id }` → `{ findings: BudgetFinding[] }`. Workspace-gated (mirror `budget/ai/suggest` auth). Pulls routing + line items, builds `BudgetRulesInput`, returns `runBudgetRules(...)`.
- **No Anthropic, no `withAiUsage`** — this is free and deterministic.

### R.4 Render in the panel
- Behind the same gate as U (v1): when enabled (or on manual trigger), call `rules-check` alongside `fetchSuggestions` and render findings in the same proactive-prompt area, above the LLM suggestions, using the existing dismiss mechanism. Findings with a `suggestedAction` show an "Add it" affordance (wire to the existing line-item create path if trivial; otherwise render the suggestion text only and leave the action as a TODO — do NOT invent a new write path in this ticket).

### R.5 Acceptance
- [ ] `rules.ts` is pure; `rules.test.ts` passes; the suggest route imports the shared `hasCarnet`/`hasHaulage` logic instead of duplicating it (DRY — remove the inline copies).
- [ ] `rules-check` returns findings for a tour with EU shows + no carnet; empty for a clean tour. Makes no model call.
- [ ] Findings render in the panel only when the gate is satisfied; dismiss works.

### R.6 Commit
```
feat(budget): deterministic rules engine + rules-check endpoint

Extracts carnet/haulage detection out of the LLM suggest prompt into
a pure, unit-tested src/lib/budget/rules.ts (BudgetFinding shape).
New /api/budget/rules-check returns findings with no model call.
Findings render in the line-item panel behind the same opt-in gate.

Made-with: Claude Code (AI suggestions gate)
```

---

## V. Verify (do NOT skip — prior CC work has over-claimed; name the files/lines you changed)

### V.1 The core fix
1. Set workspace default OFF (the migration default). Open several budget line-item panels. **Network tab: zero calls to `/api/budget/ai/suggest`.** This is the headline acceptance — if it still auto-fires, the ticket failed.
2. Click "Get suggestions" → exactly one call, suggestions render.
3. PATCH your preference to `true` (curl/Postman or a dev control) → after the provider refetches, panels auto-load again.

### V.2 Isolation
4. Two users, same workspace: user A sets `true`, user B stays default. B's panels don't auto-fire; A's do. Confirms per-user isolation + RLS.

### V.3 Rules
5. On a tour with EU shows and no carnet line: a finding appears (after gate satisfied). On a clean tour: none. Confirm `rules-check` makes no Anthropic call (check `ai_usage_events` gains no row for it).
6. `npm test` (or the repo's test command) — `rules.test.ts` green.

### V.4 Hygiene
7. `tsc --noEmit` clean. Lint no new warnings. `next build --webpack` succeeds.

Record actual file paths + line ranges changed in the done report.

### V.5 Smoke test IDs
Add the new behaviours to `docs/smoke-tests/ai-usage.md` (follow `docs/smoke-tests/README.md` / `_template.md` format, stable `XYZ-NN` IDs). At minimum: "panel does not auto-fire when suggestions off", "manual trigger fetches once", "rules finding fires for EU-no-carnet".

---

## When done

```
AI suggestions gate + rules engine done.
Commits: <M>, <A>, <U>, <R>, <V>.
- Migration NNN: user_ai_preferences (self-service tristate) +
  ai_usage_limits.ai_suggestions_default_enabled (default OFF).
- /api/ai/preferences (GET resolved + breakdown, PATCH self upsert);
  resolver in src/lib/ai/suggestions-pref.ts.
- LineItemDetailPanel no longer auto-fires /api/budget/ai/suggest;
  gated on the resolved preference; manual "Get suggestions" always
  available. (Files/lines: <list>.)
- src/lib/budget/rules.ts + rules.test.ts; /api/budget/rules-check
  (no model call); findings render behind the gate. suggest route
  now imports the shared carnet/haulage logic (de-duped).
- Smoke IDs added to docs/smoke-tests/ai-usage.md.
- tsc clean, lint no new warnings, built via next build --webpack.
- Adam: confirm the OFF default (§1.7); apply migration via
  npm run db:migrate.
```

If anything is ambiguous — the preference-provider wiring (U.1), whether `large-room-no-pa` has the venue data it needs (R.1), or the "Add it" write path (R.4) — surface it in the done report rather than inventing a new data path. Per CLAUDE.md: when uncertain, ask Adam; don't guess at schema or invent a write surface.
