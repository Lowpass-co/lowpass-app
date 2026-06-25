# RAG (private memory) smoke tests

> **Last bulk verification**: (pending — feat/rag-foundation)

Walk these after changes to the per-workspace RAG substrate (build #2 of
`docs/handover/AI_ASSISTANT_ARCHITECTURE.md`). Format defined in
`docs/smoke-tests/README.md`. Prefix: `RAG`.
**Prereq: migration 211 applied; `GEMINI_API_KEY` set; reindex run once
per workspace (`POST /api/ai/rag/reindex` as a workspace admin).**

## Ingestion

#### RAG-01 — Reindex populates chunks

**Do**: As a workspace admin, `POST /api/ai/rag/reindex` (empty body).
Then count `rag_chunks` for your workspace.

**Expect**: `{ ok: true, results: [...] }`; one chunk per non-null
deal memo / venue / budget line item. A second run does not duplicate
rows (upsert on workspace+kind+source_id).

**Last verified**:

#### RAG-02 — Embedding rides the google lane, not the Anthropic cap

**Do**: Run a reindex. Inspect the new `ai_usage_events` rows.

**Expect**: Rows with `provider='google'`, `endpoint='ai.embeddings'`.
The Anthropic monthly budget is unaffected (sumMonthCost filters
`provider <> 'google'`).

**Last verified**:

## Privacy (the headline acceptances)

#### RAG-03 — No PII in any embedded content

**Do**: Seed a deal memo with promoter name/email/phone + notes, a venue
with a `contacts` JSONB + notes, a line item with notes. Reindex. Grep
`SELECT content FROM rag_chunks` for the email, phone, passport, DOB.

**Expect**: Zero hits. Only commercial figures + business venue facts
are present. (Unit-enforced too: `src/lib/ai/rag/sources.test.ts`.)

**Last verified**:

#### RAG-04 — Cross-workspace isolation (CRITICAL)

**Do**: Seed two workspaces A and B, each with distinct records. Reindex
both. As a member of A, `POST /api/ai/rag/ask` with a query that matches
B's data.

**Expect**: A's answer + sources are drawn ONLY from A's chunks; B's data
never appears. `match_rag_chunks` is SECURITY INVOKER, so A's RLS forbids
reading B's rows even though the function is shared. NOTE: the optional
tour/artist scope (`p_tour_ids`, migration 212) is ADDITIVE — it sits on
top of the `workspace_id = ws` clause, never replaces it, so isolation is
unchanged whether or not a scope is passed.

**Last verified**:

#### RAG-05 — Delete cascades to chunks

**Do**: Delete a deal memo (and a budget line item). Re-check `rag_chunks`
for that `source_id`.

**Expect**: The chunk is gone (per-record erasure cascade via the entity
DELETE route). NOTE: subject-level GDPR erasure is NOT wired — no executor
exists yet (see done report / migration 207).

**Last verified**:

## Ask surface (⌘K)

#### RAG-06 — Ask returns a grounded, cited answer when opted in

**Do**: With the build-#1 suggestions preference ON, open ⌘K and type a
question ("what did we pay for backline in <city>?"). Click "Ask your
history".

**Expect**: A short answer whose figures come from real line items, plus
source chips (kind · city · date). No invented numbers.

**Last verified**:

#### RAG-07 — Ask surface is gated by the opt-in

**Do**: Set the suggestions preference OFF. Open ⌘K, type a question.

**Expect**: No "Ask your history" affordance appears. Calling
`POST /api/ai/rag/ask` directly returns `{ gated: true }` and makes no
model call.

**Last verified**:

#### RAG-08 — Budget chunks carry currency

**Do**: After a re-index (post-migration-212 deploy), `SELECT content FROM
rag_chunks WHERE source_kind='budget_line_item'` for a GBP tour and a USD
tour. (Most `budget_line_items.currency` are NULL — the value comes from
`tours.currency`.)

**Expect**: Lines read `Proposed cost: 115000 GBP` / `Actual cost: 100
USD` — the tour currency, not a bare number. (Unit-enforced:
`src/lib/ai/rag/sources.test.ts` currency-fallback checks.)

**Last verified**:

#### RAG-09 — No cross-currency summing

**Do**: With suggestions ON, ask a workspace-wide question whose hits span
a GBP tour and a USD tour ("what did we pay for audio").

**Expect**: Per-currency subtotals (e.g. "GBP: £137,650 across 2 lines;
USD: $100 across 1 line"), NOT a single blended total. The model is told
exchange rates aren't provided.

**Last verified**:

#### RAG-10 — Tour-scoped ask

**Do**: From inside a tour (`/budget/[tourId]` etc.), open ⌘K, ask a
question. Confirm the scope pill reads "This tour". Then toggle it to
"Whole workspace" and re-ask.

**Expect**: Scoped → only that tour's lines (e.g. Dandelion '26 audio,
not Ella Langley's). Workspace-wide → the blended (currency-grouped)
answer. From the workspace dashboard (no tour/artist in the URL) there's
no pill and it defaults to workspace-wide.

**Last verified**:

## Known broken

#### RAG-90 — Subject-level GDPR erasure cascade not wired

**Do**: N/A — structural.

**Expect**: When the Art. 17 erasure executor is built, it must call
`deleteSourceChunks()` for erased deal_memos/venues/budget_line_items.

**Currently**: No erasure executor exists (migration 207 defers it; nothing
imports `gdpr/registry.ts`). Per-record DELETE cascades work; the
subject-walk hook is documented in `registry.ts` + `reindex.ts`.

**Tracked in**: AI_ASSISTANT_ARCHITECTURE.md build order / GDPR tooling.

## Retired

(None yet.)
