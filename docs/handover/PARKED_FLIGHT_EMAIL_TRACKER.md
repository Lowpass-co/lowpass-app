# PARKED — Flight Email Tracker

**Status:** Parked. Revisit when Phase B, IA Cleanup, Channel List polish, Payroll, Rooming, and Rider editor rebuild are all merged to main. ~4-6 weeks of CC work ahead of this.

**Goal in one sentence:** Scrape Adam's email accounts daily (or on-demand) for travel-agent ticket/receipt/invoice PDFs, extract structured flight data via Claude, store in the existing `flights` table with attachment links, and surface in a Flights Inbox tab on the workspace dashboard.

**Why parked:** The app has bigger gaps (Budget polish in flight, IA Cleanup in flight, four Operations features still half-built). Building Flight Tracker now would mean polishing a peripheral feature while core surfaces stay clunky. Adam's actual workflow needs the core to feel right first.

---

## Where it fits in the product

After IA Cleanup §I2 ships, the workspace dashboard has tabs: **Artists · Personnel · Equipment**. This work adds a **fourth tab: Flights**.

Each tab is a workspace-level surface. Flights are workspace-scoped (tour assignment is optional — many flights get booked before they're assigned to a tour).

```
Workspace dashboard tabs (post-IA-Cleanup-plus-this-work):
  Artists · Personnel · Equipment · Flights
```

The Flights tab shows:
- Every flight in the workspace, sortable by departure date
- Manual "Sync Now" button + connection status of email accounts
- Tour-assigned flights show their tour chip; unassigned flights show an amber "Unassigned" badge
- Row click → existing `FlightSlideOver` opens (with new Attachments section + "Assign to tour" affordance)

---

## Sequencing constraints

This work depends on:

1. **IA Cleanup §I2 merged** — the workspace dashboard structure (`(workspace)` route group + tabs) must exist before Flights becomes a tab. Otherwise we mount Flights in a layout that's about to change.
2. **`@anthropic-ai/sdk` and `pdf-parse` and `googleapis`** — already installed, no new core deps needed.
3. **§SAFE auth + rate-limit helpers** (already in main) — `src/lib/auth/workspace-check.ts` and `src/lib/rate-limit.ts`. Used by the sync endpoint.
4. **Standardized AI model** — `claude-haiku-4-5-20251001` (current convention from §SAFE). NOT `claude-3-5-haiku-20241022` as the original co-work plan specified.

Do NOT start this work until §1 above is in main.

---

## Original problem statement (Adam's framing)

> "I want to make sure I don't miss flights that my travel agent sends me. I book LOTS of flights. They are ticketed and then she sends me an invoice, a receipt and the ticket. I want claude to scrape my email accounts daily, or on click, and collate a table of all my booked/ticketed flights, with links to the receipts and proof of payment. This will help me not miss flights. I am currently building a tour management software with claude too, this needs to be able to plug into that at some point."

Key facts from the brief:
- High flight volume — manual entry into the existing `flights` table is the friction
- Travel agent sends 3 PDFs per booking (ticket + receipt + invoice)
- Need to view the PDFs from the app for proof of payment
- Daily sync + manual sync both required
- Plugs into existing Lowpass tour management app (this point only became relevant after the co-work session looked at the codebase)

---

## Architectural approach

**Build it INTO Lowpass, not as a separate system.**

The original co-work plan (first iteration) designed a standalone monorepo with its own Fastify server, PostgreSQL, React app, S3 storage. That was wrong on every dimension because the canonical `public.flights` table already exists in Lowpass with RLS, tour relationships, and a working slide-over.

Revised approach (correct):

```
Email Sources (Gmail API)
        ↓
  Sync API route (/api/flights/import/sync)
        ↓
  PDF download (Gmail attachments API)
        ↓
  pdf-parse → raw text
        ↓
  Claude Haiku 4.5 → structured JSON (Zod-validated)
        ↓
  Existing public.flights table + new public.flight_attachments
        ↓
  Existing FlightSlideOver + new Flights Inbox workspace tab
```

No new server. No new database. No new monorepo. Next.js API routes + Supabase Storage + the tables we already have.

---

## Migration shape (106)

**File:** `database/migrations/106_flight_email_import.sql`

NOTE: by the time this ships, the migration number may need to shift to 107 or higher depending on what's landed since. Verify the highest migration number on `main` before writing.

**Four schema changes in one migration:**

```sql
-- 1. Make tour_id nullable on flights
-- Email-imported flights arrive before being assigned to a tour.
ALTER TABLE public.flights
  ALTER COLUMN tour_id DROP NOT NULL;

-- 2. Add import metadata to flights
ALTER TABLE public.flights
  ADD COLUMN IF NOT EXISTS email_imported    boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS import_message_id text,
  ADD COLUMN IF NOT EXISTS import_source     text;  -- 'gmail' | 'imap'

CREATE INDEX IF NOT EXISTS flights_import_message_id_idx
  ON public.flights(import_message_id)
  WHERE import_message_id IS NOT NULL;

-- 3. New table: workspace_integrations (designed generically — reusable for future Stripe/Spotify/etc.)
CREATE TABLE IF NOT EXISTS public.workspace_integrations (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id    uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  user_id         uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  provider        text NOT NULL CHECK (provider IN ('gmail','imap')),  -- extend as more providers land
  account_email   text NOT NULL,
  refresh_token   text NOT NULL,  -- encrypted at rest via INTEGRATION_ENCRYPTION_KEY
  access_token    text,
  expires_at      timestamptz,
  connected_at    timestamptz NOT NULL DEFAULT now(),
  UNIQUE (workspace_id, user_id, provider, account_email)
);

ALTER TABLE public.workspace_integrations ENABLE ROW LEVEL SECURITY;
CREATE POLICY wi_select ON public.workspace_integrations
  FOR SELECT USING (workspace_id = public.get_my_workspace_id());
CREATE POLICY wi_insert ON public.workspace_integrations
  FOR INSERT WITH CHECK (workspace_id = public.get_my_workspace_id());
CREATE POLICY wi_update ON public.workspace_integrations
  FOR UPDATE USING (workspace_id = public.get_my_workspace_id())
    WITH CHECK (workspace_id = public.get_my_workspace_id());
CREATE POLICY wi_delete ON public.workspace_integrations
  FOR DELETE USING (workspace_id = public.get_my_workspace_id());

-- 4. New table: flight_attachments
CREATE TABLE IF NOT EXISTS public.flight_attachments (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id    uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  flight_id       uuid NOT NULL REFERENCES public.flights(id) ON DELETE CASCADE,
  attachment_type text NOT NULL CHECK (attachment_type IN ('ticket','receipt','invoice','unknown')),
  filename        text NOT NULL,
  storage_key     text NOT NULL UNIQUE,
  file_size_bytes int,
  created_at      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX fa_workspace_idx ON public.flight_attachments(workspace_id);
CREATE INDEX fa_flight_idx    ON public.flight_attachments(flight_id);

ALTER TABLE public.flight_attachments ENABLE ROW LEVEL SECURITY;
CREATE POLICY fa_select ON public.flight_attachments
  FOR SELECT USING (workspace_id = public.get_my_workspace_id());
CREATE POLICY fa_insert ON public.flight_attachments
  FOR INSERT WITH CHECK (workspace_id = public.get_my_workspace_id());
CREATE POLICY fa_delete ON public.flight_attachments
  FOR DELETE USING (workspace_id = public.get_my_workspace_id() AND public.is_workspace_admin());

-- 5. New table: email_sync_runs (audit log)
CREATE TABLE IF NOT EXISTS public.email_sync_runs (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id    uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  triggered_by    text NOT NULL CHECK (triggered_by IN ('scheduler','manual')),
  status          text NOT NULL DEFAULT 'running' CHECK (status IN ('running','completed','failed')),
  emails_found    int NOT NULL DEFAULT 0,
  flights_created int NOT NULL DEFAULT 0,
  flights_skipped int NOT NULL DEFAULT 0,
  errors          jsonb NOT NULL DEFAULT '[]',
  started_at      timestamptz NOT NULL DEFAULT now(),
  completed_at    timestamptz
);

ALTER TABLE public.email_sync_runs ENABLE ROW LEVEL SECURITY;
CREATE POLICY esr_select ON public.email_sync_runs
  FOR SELECT USING (workspace_id = public.get_my_workspace_id());
CREATE POLICY esr_insert ON public.email_sync_runs
  FOR INSERT WITH CHECK (workspace_id = public.get_my_workspace_id());
CREATE POLICY esr_update ON public.email_sync_runs
  FOR UPDATE USING (workspace_id = public.get_my_workspace_id())
    WITH CHECK (workspace_id = public.get_my_workspace_id());

-- 6. Storage bucket for PDFs
INSERT INTO storage.buckets (id, name, public)
VALUES ('flight-attachments', 'flight-attachments', false)
ON CONFLICT (id) DO NOTHING;

-- Storage RLS — workspace-scoped via path prefix flight-attachments/{workspaceId}/{flightId}/{filename}
-- See migration that created rider-assets bucket for the pattern reference.
```

---

## Code surface

### New files

```
src/app/api/flights/import/gmail/auth/route.ts         # OAuth consent redirect
src/app/api/flights/import/gmail/callback/route.ts     # OAuth callback handler
src/app/api/flights/import/sync/route.ts               # Manual + scheduled sync trigger
src/app/api/flights/import/sync/[runId]/route.ts       # Poll sync run status
src/app/api/flights/[id]/attachments/route.ts          # Signed URL generator for PDF view

src/lib/flights/email-extractor.ts                     # Claude API call + Zod validation
src/lib/flights/gmail-client.ts                        # googleapis wrapper, OAuth + message fetch
src/lib/flights/pdf-extractor.ts                       # pdf-parse wrapper + image-PDF detection
src/lib/flights/sync-orchestrator.ts                   # Pipeline: fetch → parse → extract → upsert
src/lib/integrations/encryption.ts                     # AES-256 wrapper for refresh tokens

src/app/(app)/(workspace)/flights/page.tsx             # The Flights Inbox tab (assumes (workspace) route group from IA Cleanup §I2)
src/components/flights/FlightsInboxTable.tsx           # DataTable instance
src/components/flights/SyncStatusBar.tsx               # "Last synced: 2h ago · Sync Now"
src/components/flights/ConnectGmailButton.tsx          # OAuth initiation UI
```

### Existing files modified

```
src/components/flights/FlightSlideOver.tsx             # Add Attachments section + "Assign to tour" affordance
src/components/(workspace)/WorkspaceTabs.tsx           # Add Flights tab (4th entry)
```

---

## AI extraction approach

**Model:** `claude-haiku-4-5-20251001` (NOT `claude-3-5-haiku-20241022` as the original plan said — current Lowpass convention from §SAFE)

**Prompt template:**

```
Extract flight booking data from this travel document. Return ONLY valid JSON — no prose, no markdown.

{
  "airline": string | null,
  "flight_number": string | null,    // include prefix, e.g. "BA0275"
  "pnr": string | null,              // booking reference / PNR
  "origin_airport": string | null,   // IATA code only, e.g. "LHR"
  "destination_airport": string | null,
  "depart_at": string | null,        // ISO 8601 with timezone if available
  "arrive_at": string | null,
  "cost_amount": number | null,
  "cost_currency": string | null,    // ISO 4217, e.g. "GBP"
  "document_type": "ticket" | "receipt" | "invoice" | "unknown",
  "passenger_name": string | null,
  "confidence": "high" | "medium" | "low",
  "confidence_reason": string
}

Rules:
- null for genuinely absent fields. Never guess.
- IATA codes only (3 letters).
- Depart/arrive times MUST include timezone offset if shown in the document.
- confidence is "high" if all flight + time fields are present and unambiguous, "medium" if minor gaps, "low" if significant uncertainty.

<document>${pdfText}</document>
```

**Validation:** Zod schema on the JSON before insert. If validation fails, log to `email_sync_runs.errors` and skip — don't crash the sync.

**Upsert key:** `(pnr, flight_number, depart_at)` — same booking from multiple PDFs (ticket + receipt + invoice) merges to ONE flight record, with all three attachments linked.

**Image-PDF detection:** if `pdfText.trim().length < 50` after parsing, flag the attachment as `requires_ocr` in `email_sync_runs.errors` and skip. OCR (via Tesseract) is a future enhancement.

---

## Cost projection

Per extraction: ~3K input tokens + 500 output tokens on Haiku 4.5 ≈ $0.005

Adam books ~30 flights/year, 3 PDFs per booking → 90 extractions/year ≈ $0.45/year.

Trivial. Worth stating so future contributors don't accidentally over-engineer caching.

If volume grows 10x (300 flights/year), still under $5/year.

---

## Security requirements

1. **Refresh tokens MUST be encrypted at rest.** AES-256 via a new `INTEGRATION_ENCRYPTION_KEY` env var. New helper at `src/lib/integrations/encryption.ts`. Key gets generated once, stored in Vercel env, rotated only via deliberate migration.

2. **OAuth scopes minimal.** Gmail OAuth requests `gmail.readonly` only — nothing broader. No labels, no send, no delete.

3. **Workspace scope on every endpoint.** Use `requireUserAndWorkspace` from `src/lib/auth/workspace-check.ts`. No naked endpoints.

4. **Rate limit on sync endpoint.** 1 sync per 60 seconds per user (in-memory map via `src/lib/rate-limit.ts`). Prevents accidental Sync Now button hammering.

5. **Signed URLs for PDFs.** Storage objects served via 1-hour signed URLs generated server-side at fetch time. Never store URLs in the DB.

6. **OAuth state param.** Short-lived cookie to prevent CSRF on the callback.

---

## Phased delivery sequence

Each phase ships as one CC commit. Halt-and-report at 400 LOC per spec convention.

| Phase | Scope | Est LOC |
|---|---|---|
| §F0 | Migration 106 + Storage bucket + paste-ready SQL | ~150 |
| §F1 | Gmail OAuth wiring (auth + callback routes + encryption helper + workspace_integrations CRUD UI) | ~350 |
| §F2 | Sync orchestrator + PDF extractor + Claude extractor + Zod validation | ~400 |
| §F3 | `/api/flights/import/sync` POST endpoint + sync run polling endpoint | ~250 |
| §F4 | Flights Inbox workspace tab (DataTable + sync status bar + Connect Gmail button) | ~350 |
| §F5 | FlightSlideOver additions (Attachments section + Assign to tour affordance) | ~200 |
| §F6 | Vercel cron config (every 2 hours via `vercel.json`) — already pattern established for /api/cron/dispatch-notifications | ~50 |
| §F7 | IMAP adapter — only if needed after Gmail is in production. New dep: `imapflow`. | ~300 |

Total ~2000 LOC across 7-8 commits. ~2 weeks of CC time at current pace.

---

## Known risks + mitigations

| Risk | Mitigation |
|---|---|
| LLM extracts wrong departure time / timezone | Always store raw LLM output in `email_sync_runs.errors` for low-confidence rows. UI flags `confidence='low'` rows with a warning badge. Manual edit via existing FlightSlideOver always available. |
| Travel agent changes PDF template | Haiku handles layout variance natively. Monitor `email_sync_runs.errors` for a confidence-distribution spike. |
| Gmail OAuth token expires / revoked | Refresh on 401, alert email to user on auth failure (silent stop is worse than loud failure). |
| Same flight stored twice (agent resends itinerary) | Upsert on `(pnr, flight_number, depart_at)`. Idempotency check on `import_message_id`. |
| Image-based PDF can't be parsed | Detect via empty text output, flag for OCR follow-up, don't crash sync. |
| `tour_id` becoming nullable breaks existing code | Audit every `flights.tour_id` reference in code before shipping migration 106. Pre-flight recon required. Some places likely assume non-null and need defensive handling. |
| Vercel function timeout (60s on Pro plan) on large sync | If sync exceeds 60s, switch to background job pattern: return runId immediately, process async, poll for status. Pattern already exists for some other endpoints — verify before scaling. |

---

## Open questions to decide when picking up

1. **IMAP support — needed or skip?** Adam mentioned multiple email accounts in the original brief. If all are Gmail, skip §F7 (IMAP adapter). If any are not Gmail (work email, etc.), need IMAP. Confirm at resume time.
2. **Scheduler cadence — every 2 hours or daily?** Original plan said daily; my review pushed back to every 2 hours because "if travel agent sends ticket and you fly the next morning, daily is too slow." Adam to confirm at resume time.
3. **Multi-user workspaces — sync runs as which user?** Currently the spec assumes one user per workspace doing the sync. If Lowpass adds multi-user workspaces before this ships, need to decide: sync per-user OR sync per-workspace with a designated "sync user."
4. **Cancellation / change handling.** Travel agents sometimes send updated itineraries when flights are rescheduled or cancelled. The current spec's upsert handles this transparently. But should a status change (e.g. flight cancelled) trigger a notification to Adam? Probably yes via Resend (already wired). Worth deciding before §F2.
5. **Attachment retention.** Should Adam be able to delete a flight's attachments without deleting the flight? Currently `CASCADE` on `flight_id` deletes both. Probably fine but worth confirming.

---

## Decisions already made (no need to revisit)

| Decision | Choice | Why |
|---|---|---|
| Build location | Inside Lowpass, not standalone | The canonical `flights` table already exists. Building parallel is architectural disaster. |
| Inbox UI placement | Workspace dashboard tab (4th tab alongside Artists/Personnel/Equipment) | Matches the two-tier IA decided in IA Cleanup §I2. Flights are workspace-scoped, fit the workspace tier. |
| PDF storage | Supabase Storage bucket `flight-attachments` | Same pattern as `rider-assets` bucket. No new infra. |
| AI model | `claude-haiku-4-5-20251001` | Current Lowpass convention from §SAFE. |
| Extraction approach | LLM-based with Zod validation | Regex against varying PDF templates is brittle. One prompt handles any layout. |
| Idempotency | `import_message_id` check on insert | Standard. |
| Upsert key | `(pnr, flight_number, depart_at)` | Handles multi-PDF same-booking merge. |
| OAuth scope | `gmail.readonly` only | Minimum required. |
| Encryption | AES-256 via `INTEGRATION_ENCRYPTION_KEY` env var | Refresh tokens are effectively permanent credentials. |
| Slide-over reuse | Existing `FlightSlideOver` + Attachments section | Don't rebuild what works. |
| Vercel cron | `vercel.json` config, same pattern as notification dispatcher | Already proven. |

---

## Reference: original co-work plan iterations

### First iteration (the wrong one — saved for context)

The original plan designed a standalone monorepo with Fastify, PostgreSQL, React app, S3. Wrong on every dimension because it ignored the existing Lowpass codebase. It WAS correctly self-corrected after the other Claude was given access to the Lowpass folder.

Key wrong assumptions in the first plan (do NOT revisit these):

- Separate Fastify server (Lowpass is Next.js — use API routes)
- Separate PostgreSQL (use Supabase, which is Postgres anyway, and reuse `public.flights`)
- Separate React app (reuse Lowpass UI primitives, mount in workspace dashboard)
- S3 for PDFs (use Supabase Storage)
- New `FlightRecord` type (use existing `Flight` type at `src/lib/types/flight.ts`)
- New `flights` table (use existing one)
- Webhook push to "tour management" (the tour management IS Lowpass — no external system to push to)

### Second iteration (the basis for this doc)

After being granted folder access, the other Claude correctly identified:
- `public.flights` table exists
- `@anthropic-ai/sdk`, `googleapis`, `pdf-parse` already installed
- `FlightSlideOver` already built
- Next.js + Supabase is the stack
- The `Flight` type is the canonical integration contract

Their revised plan is essentially what this doc captures, with the following additional corrections from my review:

- AI model version corrected (Haiku 4.5, not 3.5)
- §SAFE auth helpers + rate limit pattern enforced
- `workspace_integrations` table designed generically (not gmail-specific) for future reuse
- Storage bucket creation made explicit in the migration
- Cost projection added
- Sequencing pinned to IA Cleanup §I2 dependency
- Option A vs B resolved (fourth workspace tab — matches the IA)

---

## Resume instructions

When picking this up:

1. **Verify the dependencies are still installed.** `npm ls @anthropic-ai/sdk googleapis pdf-parse zod` — confirm all present.
2. **Check migration numbering.** What's the highest migration on main? Update the "106" in this doc to the correct next number.
3. **Confirm `(workspace)` route group exists.** IA Cleanup §I2 should have created it. Without it, this work has no place to mount the Flights tab.
4. **Confirm `workspace_integrations` doesn't already exist.** If it was added for some other integration (Stripe?), reuse it instead of recreating.
5. **Re-recon `public.flights` schema.** Schema may have evolved. Verify columns match what this doc assumes: `airline`, `flight_number`, `pnr`, `origin_airport`, `destination_airport`, `depart_at`, `arrive_at`, `cost_amount`, `cost_currency`, `passenger_name`, `tour_id`, `workspace_id`, etc.
6. **Confirm `FlightSlideOver` location and structure.** Path was `src/components/flights/FlightSlideOver.tsx` at parking time. Verify still there.
7. **Re-confirm the 5 open questions** at the top of this doc with Adam before any code starts.
8. **Set `INTEGRATION_ENCRYPTION_KEY`** in Vercel env (generate via `openssl rand -base64 32`) BEFORE §F1 ships, otherwise OAuth callback will crash on first connection.
9. **Set up Google Cloud Console OAuth client** (client ID + secret) and add `GMAIL_OAUTH_CLIENT_ID` + `GMAIL_OAUTH_CLIENT_SECRET` to Vercel env. Authorize redirect URI: `https://lowpass.co/api/flights/import/gmail/callback` (and the Vercel preview equivalent for testing).
10. **Write a proper CC spec** (`docs/handover/CC_FLIGHT_TRACKER.md`) following the same pattern as `CC_BUDGET_PHASE_B.md` — sub-phases, halt-and-report, file:line precision. This doc is a parking placeholder, not a spec.

---

## Why this gets parked

In rough order of pain:

1. **Phase B Budget** — Adam's daily-driver, currently mid-polish. Finish first.
2. **IA Cleanup** — workspace dashboard structure needs to exist before this can mount anywhere. Already in flight.
3. **Channel list polish** — small fixes, quick win.
4. **Payroll product build** — biggest workflow pain Adam has TODAY. Bigger ROI than flight tracking.
5. **Rooming polish** — half-built workflow.
6. **Rider editor rebuild** — biggest "this isn't usable" complaint Adam has had.
7. **Phase B.5 / B5 redux** — Budget grid migration + density propagation.
8. **Phase C data frontloading** — architectural foundation that makes everything feel faster.
9. **THIS — Flight Tracker.** Useful but peripheral. Slots in here once the core feels right.

Total ahead of this: ~6-8 weeks of CC work at the current pace.

---

## File path

`/Users/lowpass/Documents/lowpass-app/docs/handover/PARKED_FLIGHT_EMAIL_TRACKER.md`
