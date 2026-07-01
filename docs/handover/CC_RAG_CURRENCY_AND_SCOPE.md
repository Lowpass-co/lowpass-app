# RAG fixes — currency-aware chunks + tour/artist scoping (build #2 polish)

> Live verification of the RAG "ask your history" surface (2026-06-25) surfaced two real accuracy gaps. Both confirmed by reading production data:
>
> 1. **Chunks carry no currency.** `buildBudgetLineItemChunk` prints `row.currency` only when set, but `budget_line_items.currency` is almost always NULL — the real currency lives on the **tour** (`tours.currency`), which `reindex.ts` never fetches. Result: a line like `Audio Rental (Clair) / Actual cost: 115000` embeds with no currency, so the model *guesses* the symbol. It happened to be right for a GBP tour and would be wrong for a USD one (e.g. the "Audio Rental $100" line on the USD "Warning Support" tour). The model also implied a single cross-currency total (£138,250) by summing GBP + USD line items.
> 2. **The ask is workspace-wide with no scope.** Asking from the Charlotte Sands artist returned audio line items from *Ella Langley's* Dandelion tour. By design (workspace index), but "what did we pay" answers blend every artist/tour together with no way to narrow.
>
> This ticket fixes both, plus stops the model summing across currencies. Targets `feat/rag-foundation` (RAG-only after the budget commit was removed), adds commits on top, re-push.

---

## 0. Required reading
1. `CLAUDE.md`
2. `docs/handover/AI_ASSISTANT_ARCHITECTURE.md` — Layer A
3. `docs/handover/CC_RAG_FOUNDATION.md` — what build #2 established
4. `src/lib/ai/rag/sources.ts` — `buildBudgetLineItemChunk` (L138+) already prints `row.currency`; the gap is upstream
5. `src/lib/ai/rag/reindex.ts` — L113-114 selects `budget_line_items` WITHOUT tour currency; L145 already shows the routing-join pattern to copy
6. `src/lib/ai/rag/retrieve.ts` + the `match_rag_chunks` SQL fn (migration 211) — retrieval path to add the scope filter
7. `src/app/api/ai/rag/ask/route.ts` — ask endpoint (system prompt + retrieve call)
8. `src/components/command-palette/CommandPalette.tsx` — `askHistory(curQ)` call site (~L235); where to pass tour context
9. `database/migrations/README.md` — numbering (verify next free ≥ highest across branches)

## 1. Hard rules
1. No new dependencies. No `any` / `@ts-ignore`. Tokens via `var(--lp-…)`.
2. Lint clean (no new warnings), `tsc --noEmit` zero, build `next build --webpack`.
3. RLS unchanged: `match_rag_chunks` stays `SECURITY INVOKER`; the new scope filter is ON TOP of the existing `workspace_id` clause, never instead of it. Cross-workspace isolation must still hold (RAG-04).
4. PII invariant unchanged: the only new field entering a chunk is **currency** (a 3-letter code — not personal). Do not add any other column.
5. **Re-embedding required:** F1 changes chunk *text*, so existing chunks must be re-indexed. Call it out in the done report; do NOT assume old chunks update themselves.
6. Commits in order: **F1 → F3 → F2 → V** (currency first; it's the higher-value fix and needs no migration).

---

## F1 — Currency-aware budget chunks (no migration)

**`reindex.ts`** (the budget_line_items path, ~L113):
- Keep selecting `currency` on the line.
- Additionally resolve each line's **tour currency**: collect the distinct `tour_id`s in the batch, `svc.from('tours').select('id, currency').in('id', ids)` (mirror the routing-join helper at L145), build a `Map<tourId, currency>`.
- Pass an **effective currency** into the builder: `effectiveCurrency = line.currency ?? tourCurrencyMap.get(line.tour_id) ?? null`. Simplest wiring: set `row.currency = effectiveCurrency` on the object handed to `buildChunk` (the builder already prints `row.currency`, so no change needed there). If you prefer not to mutate, add `tour_currency?: string|null` to `BudgetLineItemSource` and have the builder print `row.currency ?? row.tour_currency` — your call, document which.

**`sources.ts`**: only touch if you took the `tour_currency` route. Otherwise unchanged.

### F1 acceptance
- [ ] After re-index, a chunk for a GBP-tour line reads `Actual cost: 115000 GBP`; a USD-tour line reads `... 100 USD`.
- [ ] `match_rag_chunks` PII test still clean — no new personal data, just a currency code.

---

## F3 — Stop cross-currency summing (ask system prompt)

**`src/app/api/ai/rag/ask/route.ts`** — in the system/instruction prompt to Haiku, add explicit guidance:
- "Each line shows its own currency. **Never add amounts across different currencies into one total.** If results span multiple currencies, report a subtotal per currency and state that converting to one figure needs exchange rates not provided."
- Keep the existing "answer only from provided context / cite sources" instructions.

### F3 acceptance
- [ ] Asking a question whose hits span GBP + USD returns per-currency subtotals (e.g. "GBP: £137,650 across 2 lines; USD: $100 across 1 line"), NOT a single blended number.

---

## F2 — Optional tour/artist scope on the ask

**Retrieval filter.** The chunk `metadata` already carries `tour_id`. Add an optional scope to retrieval:
- Preferred: extend `match_rag_chunks` with an optional `p_tour_id uuid default null` param and `AND (p_tour_id IS NULL OR (metadata->>'tour_id')::uuid = p_tour_id)` in the WHERE. That's a new migration (next free number ≥ verify across branches; supersede the function with `CREATE OR REPLACE`, keep `SECURITY INVOKER`, keep the existing `workspace_id = ws` clause). Down-block + idempotent per README.
- Acceptable no-migration fallback: pass `tourId` to `retrieve.ts`, fetch a larger `k`, filter by `hit.metadata.tour_id` in JS. Note the tradeoff (effective k shrinks) if you choose this.
- Artist scope: a tour belongs to one artist; resolve artist→tour_ids and filter to that set (same mechanism, an `IN` list). Optional — do tour scope first; add artist only if trivial.

**`/api/ai/rag/ask`**: accept optional `tour_id` (and `artist_id`) in the body, pass to retrieve. Absent = workspace-wide (current behaviour, preserved).

**`CommandPalette.tsx`** (~L235, the `askHistory` call): if the current route is inside a tour (`/operations|budget|advance/[tourId]`) or an artist (`/artists/[id]`), pass that id so the ask **defaults to the scope you're looking at**, with a small visible toggle — "This tour ▾ / Whole workspace" — so the blending is a deliberate choice, not a surprise. If there's no tour/artist context (e.g. workspace dashboard), default to workspace-wide. Gate + opt-in behaviour from build #1 unchanged.

### F2 acceptance
- [ ] From within Dandelion '26, "what did we pay for audio hire" returns only that tour's audio lines.
- [ ] Switching the toggle to "Whole workspace" reproduces the blended (now currency-grouped) answer.
- [ ] From the workspace dashboard (no tour context) it defaults to workspace-wide.
- [ ] RAG-04 still passes: a second workspace still gets nothing (scope filter is additive to the workspace clause).

---

## V — Verify (name the files/lines you changed; don't claim runtime you didn't run)
- [ ] `tsc` clean, lint no new warnings, `next build --webpack` ok.
- [ ] Re-index a workspace; spot-check 3 chunks now carry currency (one GBP, one USD).
- [ ] F3: a multi-currency question yields per-currency subtotals, no blended total.
- [ ] F2: tour-scoped vs workspace-wide both work; default follows the page context.
- [ ] RAG-04 isolation re-confirmed (two workspaces).
- [ ] Add/extend smoke IDs in `docs/smoke-tests/rag.md`: RAG-08 (chunk carries currency), RAG-09 (no cross-currency sum), RAG-10 (tour-scoped ask), and update RAG-04 note for the additive filter.

## When done
```
RAG currency + scope fixes done.
- F1: reindex resolves tour currency; budget chunks now embed "<amount> <CUR>".
  REQUIRES re-index (chunk text changed). Files: reindex.ts (+tours currency
  join), sources.ts (<if tour_currency route>).
- F3: ask system prompt forbids cross-currency summing; multi-currency answers
  give per-currency subtotals.
- F2: optional tour_id/artist_id scope on /api/ai/rag/ask + match_rag_chunks
  (migration NNN, SECURITY INVOKER, workspace clause intact); ⌘K defaults to the
  current tour/artist with a workspace-wide toggle.
- RAG-04 isolation re-verified. Smoke IDs RAG-08..10 added.
- Adam: after deploy, RE-INDEX each workspace so chunks pick up currency.
```

If `match_rag_chunks` can't cleanly take the optional param, or the ⌘K route-context plumbing is unclear, surface it rather than guessing — per CLAUDE.md, scope filter must not weaken the workspace isolation clause.
