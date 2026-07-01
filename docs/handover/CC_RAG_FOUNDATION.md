# Private RAG Foundation — per-workspace memory (Layer A substrate)

> Build #2 of `AI_ASSISTANT_ARCHITECTURE.md`. #1 (the suggestions gate) shipped the delivery surface; this builds the **memory** behind it: a per-workspace semantic index over the workspace's own structured records, so the assistant can answer "what did *we* pay for backline in Berlin?" from real history. This ticket is the **substrate + one thin proving surface**, not the rich surfaces (auto-fill, full ⌘K assistant) — those are build #3.
>
> Two locked decisions (Adam, 2026-06-24): **embedding model = Google Gemini Embedding** (rides the existing Google Cloud DPA — no new sub-processor). **First corpus = structured records, not raw documents** — PII is excluded *by construction* using the `DATA_MAP` column classifications, so passport/dietary/DOB data is never embedded.

---

## 0. Required reading

1. `CLAUDE.md`
2. `docs/handover/AI_ASSISTANT_ARCHITECTURE.md` — §2 Layer A, §3 RLS seam, §4 build order
3. `docs/gdpr/DATA_MAP.md` — **the F1/F3 special-category + passport columns are the do-NOT-embed list.** This is load-bearing; the strip is built from it.
4. `database/migrations/README.md` — numbering + `npm run db:migrate`
5. `database/migrations/001_initial_schema.sql` — `venues`, `routing`, `tours`; `database/migrations/053_deal_memos.sql` — `deal_memos`; the `budget_line_items` table (grep its CREATE)
6. `src/lib/ai/usage.ts` + `database/migrations/114_ai_usage_tracking.sql` + `205_ai_usage_provider_google.sql` — metering; **Google calls already have a provider lane (`provider='google'`) + a request-count limiter in `src/lib/external/googleUsage.ts`.** Embedding calls ride this, NOT the Anthropic dollar-cap.
7. `src/lib/google/auth.ts` — existing Google service-account/key plumbing (reuse the project; the Generative Language API is covered by the same Cloud DPA)
8. `src/lib/gdpr/registry.ts` — the erasure registry; the chunk table must join it (a person/record erasure deletes its chunks)
9. `src/lib/search/*` — the existing ⌘K search providers (the thin proving surface plugs in here, NOT a new bespoke UI)

---

## 1. Hard rules

1. **No new npm dependencies for the model call** — call the Gemini embeddings REST endpoint via `fetch` (the codebase already talks to Google over REST). `pgvector` is a Postgres extension, not an npm dep.
2. All visual values via `var(--lp-…)` tokens.
3. No `any`, no `// @ts-ignore`.
4. Lint clean (no new warnings above baseline). Typecheck zero. Build via `next build --webpack` only.
5. Migration numbering: next free ≥**211** (210 is now on `main`). Verify across branches per `README.md` §Numbering before writing. Idempotent. Down block. RLS via `get_my_workspace_id()`.
6. **Privacy invariants — these are the point of the ticket, do not weaken them:**
   - **Per-workspace isolation.** Every chunk row has `workspace_id`; every retrieval query filters `workspace_id = get_my_workspace_id()`. The index is NEVER cross-workspace. (Cross-workspace is the Community layer, a separate future build with its own opt-in + k-anonymity — NOT this.)
   - **PII excluded by construction.** The text that gets embedded is assembled from an explicit allow-list of NON-personal columns per source kind. Special-category + identity columns from `DATA_MAP` F1/F3 (names, email, phone, passport_*, date_of_birth, dietary*, emergency_contact, notes-that-may-contain-PII) are NEVER in the embedded text. When in doubt, exclude — surface the column to Adam rather than embed it.
   - **Erasure cascade.** Deleting a source record deletes its chunks (FK `ON DELETE CASCADE`), and the gdpr erasure flow (`registry.ts`) must also clear chunks for an erased subject.
7. **Adam's locks:** Gemini embeddings (not Voyage/OpenAI/self-host). Structured records first (not raw PDFs). Substrate + one ⌘K ask surface only — defer auto-fill.
8. Commits in order: **M → E → I → Q → S → V.**

---

## M. Migration — pgvector + the chunk index

### M.1 Number
Next free ≥211 (verify). Filename `NNN_rag_document_chunks.sql`.

### M.2 SQL (adapt number; confirm the vector dimension in Phase E first — see E.1)

```sql
-- ============================================
-- LOWPASS — RAG document chunk index (per-workspace)
-- Migration NNN
--
-- Per-workspace semantic index over the workspace's own STRUCTURED
-- records. Embeddings are Google Gemini (dimension fixed in E.1).
-- PII is excluded upstream (see the ingestion allow-list); this table
-- stores only the already-stripped text that was embedded.
-- ============================================

CREATE EXTENSION IF NOT EXISTS vector;

-- source_kind ∈ ('deal_memo','venue','budget_line_item') for v1.
CREATE TABLE IF NOT EXISTS public.rag_chunks (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id  uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  source_kind   text NOT NULL,
  source_id     uuid NOT NULL,         -- the row this chunk derives from
  content       text NOT NULL,         -- the PII-stripped text that was embedded
  embedding     vector(768) NOT NULL,  -- ⚠️ confirm dim in E.1 before applying
  metadata      jsonb NOT NULL DEFAULT '{}'::jsonb,  -- tour_id, city, date, etc. (non-PII only)
  embed_model   text NOT NULL,         -- e.g. 'gemini-embedding-001@768' (provenance for re-embeds)
  created_at    timestamptz NOT NULL DEFAULT now(),
  UNIQUE (workspace_id, source_kind, source_id)
);

-- Workspace-scoped retrieval + the erasure cascade both need this.
CREATE INDEX IF NOT EXISTS rag_chunks_workspace_idx
  ON public.rag_chunks (workspace_id, source_kind);
-- Per-source lookup for re-embed / erasure of a single record.
CREATE INDEX IF NOT EXISTS rag_chunks_source_idx
  ON public.rag_chunks (source_kind, source_id);
-- HNSW cosine index for retrieval. (Build AFTER backfill in I.4 if the
-- table is large; for a fresh table it's fine here.)
CREATE INDEX IF NOT EXISTS rag_chunks_embedding_idx
  ON public.rag_chunks USING hnsw (embedding vector_cosine_ops);

ALTER TABLE public.rag_chunks ENABLE ROW LEVEL SECURITY;

-- Read: workspace members read their own workspace's chunks.
DROP POLICY IF EXISTS rag_chunks_select ON public.rag_chunks;
CREATE POLICY rag_chunks_select ON public.rag_chunks
  FOR SELECT USING (workspace_id = public.get_my_workspace_id());

-- Writes are service-role only (the ingestion job writes; UI never inserts) —
-- mirror the ai_usage_events pattern (migration 114).
DROP POLICY IF EXISTS rag_chunks_no_client_write ON public.rag_chunks;
CREATE POLICY rag_chunks_no_client_write ON public.rag_chunks
  FOR INSERT WITH CHECK (false);

-- ============================================
-- DOWN (manual)
-- DROP TABLE IF EXISTS public.rag_chunks CASCADE;
-- -- leave the vector extension; other features may use it.
-- ============================================
```

> Note on `source_id` FK: it can't be a single SQL FK (it points at three different tables). Enforce the erasure cascade in the ingestion/erasure layer (Phase I.5) — `ON DELETE CASCADE` to `workspaces` covers workspace deletion; per-record deletion is handled app-side.

### M.3 Acceptance
- [ ] `CREATE EXTENSION vector` succeeds on Supabase; migration applies idempotently via `npm run db:migrate`.
- [ ] `rag_chunks` RLS-enabled: SELECT workspace-scoped, INSERT `false` (service-role only).

---

## E. Gemini embedding client

### E.1 Confirm the model + dimension (do this FIRST — it sets the migration's `vector(N)`)
- Verify against current Google docs (ai.google.dev/gemini-api/docs/embeddings) the embedding model name + that the **Generative Language API** is enabled on the same Cloud project as the existing Google keys (so the Cloud DPA covers it).
- Default plan: `gemini-embedding-001` with `output_dimensionality: 768` (Matryoshka truncation — smaller index, near-full quality). If the current model/dim differs, use the current one and set the migration's `vector(N)` + `embed_model` string to match. **Do not let migration M apply with a dimension that doesn't match the model you call.**

### E.2 Client — `src/lib/ai/embeddings.ts`
- `embedTexts(texts: string[]): Promise<number[][]>` — batched REST call to the Gemini embeddings endpoint via `fetch`, API key from a new env var `GEMINI_API_KEY` (add to `.env.local.example` under the AI section; reuse the existing Google project).
- `embedQuery(text: string): Promise<number[]>` — single-vector convenience (same model/dim; set the task type to retrieval-query if the API distinguishes query vs document embeddings — it does; use `RETRIEVAL_DOCUMENT` for ingestion, `RETRIEVAL_QUERY` for search).
- **Metering:** record each embedding call in `ai_usage_events` with `provider='google'`, `endpoint='ai.embeddings'`, token/char counts — ride the existing Google lane (migration 205 / `googleUsage.ts`), NOT `withAiUsage`'s Anthropic dollar-cap. Respect the existing Google request limiter.
- No `any`. Handle the API error + empty-result paths (return/throw cleanly; ingestion logs and continues, query surfaces a graceful empty).

### E.3 Acceptance
- [ ] `embedTexts(['hello'])` returns one 768-dim (or confirmed-dim) vector; failures don't throw uncaught.
- [ ] An embedding call writes one `ai_usage_events` row with `provider='google'` and does NOT count against the Anthropic monthly budget.
- [ ] `.env.local.example` documents `GEMINI_API_KEY`. `docs/gdpr/PROCESSOR_REGISTER.md` gains a row: Google — Gemini embeddings (purpose: RAG index; data: PII-stripped operational text; covered by Cloud DPA).

---

## I. Ingestion — structured records → stripped text → chunks

### I.1 The PII-safe text builders — `src/lib/ai/rag/sources.ts`
One pure function per source kind that turns a record into the NON-personal text to embed, plus non-PII metadata. **Allow-list only** — list the exact columns included; everything else (especially `DATA_MAP` F1/F3) is excluded.
```ts
// buildDealMemoChunk(row): { content, metadata } | null
//   include: guarantee/terms, transport_from_promoter, backline_provisions,
//            show_date, venue (name only), city  — NOT promoter_name/email/phone, NOT key_contacts
// buildVenueChunk(row): include name, city, country, capacity, technical_specs
//            — NOT contacts (jsonb of people), NOT notes (free text → may hold PII)
// buildBudgetLineItemChunk(row): include category, label, proposed_cost, currency, tour/city/date
//            — figures are commercial, not personal (DATA_MAP §6 confirms)
```
Return `null` when there's nothing non-personal worth embedding. Put a header comment naming the DATA_MAP rows each builder honours.

### I.2 Ingestion job — `src/app/api/ai/rag/reindex/route.ts` (admin-only, workspace-scoped)
- POST `{ source_kind?, since? }` → re-embeds the caller's workspace's records of that kind (or all v1 kinds). Admin-gated (`is_workspace_admin()`), service-role writes.
- For each record: build text (I.1) → `embedTexts` → upsert `rag_chunks` on `(workspace_id, source_kind, source_id)` with `embed_model` provenance. Skip nulls. Batch embed calls (respect the Google limiter).
- Idempotent: re-running updates existing chunks, doesn't duplicate.

### I.3 Incremental upkeep
- On create/update of a `deal_memo` / `venue` / `budget_line_item`, enqueue a re-embed of that one record. Simplest v1: call a shared `reindexRecord(kind, id)` helper from the existing PATCH/POST routes for those entities (fire-and-forget, never block the user's save; log failures). Don't build a queue system — a direct best-effort call is fine at this scale.

### I.4 Backfill
- The reindex endpoint IS the backfill — Adam runs it once per workspace (or a service-role script iterates workspaces). Document the one-liner in the done report.

### I.5 Erasure cascade
- `reindexRecord` on delete → delete the record's chunks (`source_kind, source_id`).
- Wire into `src/lib/gdpr/registry.ts`: an erasure of a subject whose data fed a chunk (e.g. a venue/deal-memo tied to an erased person) must delete the affected chunks. Add `rag_chunks` to the erasure walk. **If the registry's shape makes this non-trivial, surface it — don't half-wire erasure.**

### I.6 Acceptance
- [ ] Reindex a workspace → `rag_chunks` populated; counts match non-null source records.
- [ ] No chunk `content` contains an email, phone, passport number, or DOB (spot-check + a grep-style test over a sample).
- [ ] Re-running reindex doesn't duplicate rows (upsert).
- [ ] Deleting a deal_memo removes its chunk.

---

## Q. Retrieval

### Q.1 `src/lib/ai/rag/retrieve.ts`
- `retrieve(workspaceId, queryText, k=8): Promise<RagHit[]>` — `embedQuery` → cosine search via a Supabase RPC or parameterised query: `SELECT ... ORDER BY embedding <=> $queryVec LIMIT k` **with `workspace_id = $ws`** (belt-and-braces in SQL even though RLS also gates it). Return `{ source_kind, source_id, content, metadata, distance }`.
- Add a SQL function `match_rag_chunks(ws uuid, query vector, k int)` in the migration (or a follow-up) marked `SECURITY INVOKER` so RLS applies. Confirm RLS is enforced for the calling role.

### Q.2 Acceptance
- [ ] A query returns workspace-scoped hits ordered by similarity.
- [ ] **Cross-workspace isolation test:** workspace A's query never returns workspace B's chunks (seed two workspaces, verify). This is the critical privacy test — make it explicit in `docs/smoke-tests/`.

---

## S. One thin proving surface — ⌘K "ask your history"

Keep this minimal — it exists to prove the pipeline, not to be the final UX.
- Add a provider to the existing `src/lib/search/*` ⌘K system: when the query looks like a question (or behind a small "Ask" affordance), call a new endpoint `POST /api/ai/rag/ask { question }` that: `retrieve(...)` → passes the hits as context to a Haiku call (via `withAiUsage`, endpoint `ai.rag.ask`) → returns a short grounded answer + the source chips it used.
- Gate it behind the **same opt-in preference from build #1** (`getSuggestionsEnabled` / the `useSuggestionsPreference` hook) — consistent non-invasive behaviour.
- Render the answer with source attribution (which deal-memo/venue/line-item it drew from) so it's verifiable, not a black box.

### S.1 Acceptance
- [ ] With suggestions enabled, asking "what did we pay for backline in <city>?" returns a grounded answer citing real line items; with it disabled, the Ask surface doesn't appear/fire.
- [ ] The answer cites sources; no hallucinated figures (the numbers come from retrieved chunks).

---

## V. Verify (name files/lines; don't claim runtime you didn't run)

- [ ] Migration applies; `rag_chunks` + extension + RLS present.
- [ ] `embedTexts` returns correct-dim vectors; metered as `provider='google'`; no Anthropic-budget impact.
- [ ] Reindex populates chunks; **PII spot-check clean** (no email/phone/passport/DOB in any `content`).
- [ ] **Cross-workspace retrieval isolation holds** (two-workspace test) — the headline privacy acceptance.
- [ ] Erasure: deleting a source record clears its chunks; gdpr registry walk includes `rag_chunks`.
- [ ] ⌘K Ask: grounded answer with sources when enabled; absent when the opt-in is off.
- [ ] `tsc --noEmit` clean, lint no new warnings, `next build --webpack` succeeds.
- [ ] Smoke IDs added to a new `docs/smoke-tests/rag.md` (follow the README format): reindex, cross-workspace isolation, PII-exclusion, ask-with-sources, opt-in-gate.

Adam runs: apply the migration (`npm run db:migrate` on this branch), set `GEMINI_API_KEY`, run the reindex once per workspace, then the cross-workspace isolation + PII spot-check.

---

## When done

```
RAG foundation done.
Commits: <M>, <E>, <I>, <Q>, <S>, <V>.
- Migration NNN: pgvector + rag_chunks (per-workspace, RLS, service-role
  writes), HNSW cosine index, match_rag_chunks() retrieval fn.
- Gemini embedding client (src/lib/ai/embeddings.ts), metered via the
  google provider lane (not the Anthropic budget). GEMINI_API_KEY added.
- Ingestion: PII-safe text builders (allow-list per DATA_MAP), reindex
  endpoint + per-record incremental upkeep + erasure cascade wired into
  gdpr registry. First corpus: deal_memos, venues, budget_line_items.
- Retrieval (workspace-scoped, cross-tenant isolation tested).
- ⌘K "ask your history" proving surface, gated by the build-#1 opt-in.
- PROCESSOR_REGISTER updated (Google — Gemini embeddings).
- Smoke IDs in docs/smoke-tests/rag.md.
- tsc/lint/build clean.
- Adam: set GEMINI_API_KEY, apply migration, run reindex per workspace.
```

Surface anything where you can't see both sides of the bridge — especially (a) the exact current Gemini model/dimension (E.1), (b) whether the gdpr registry can cleanly include `rag_chunks` in the erasure walk (I.5), and (c) any source column you're unsure is non-personal (I.1). Per CLAUDE.md: exclude-and-ask beats embed-and-leak.
```
