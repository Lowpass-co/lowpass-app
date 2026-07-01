# Lowpass — AI Assistant Architecture (strategy of record)

**Date:** 2026-06-24 · **Status:** design record. This is the durable map; individual builds get their own `CC_*.md` prompts. Read this before touching anything AI-related so you don't re-derive it.

> The vision (Adam's words): an app that reads a routing and says *"9/10 tour managers who play Alexandra Palace rent a PA — usually +$15k to the budget. Add it?"*, remembers history to make recommendations, **and** spots issues we miss. This doc decomposes that into buildable layers and records the decisions already made.

---

## 0. The core correction (don't lose this)

"Train an LLM on years of documents" is **not** what we're building, and trying to would be wrong. We are not fine-tuning. The model stays stock (currently Haiku 4.5). Intelligence comes from three sources, in increasing order of risk:

1. **Retrieval** — putting the right past documents *in context* at query time (RAG). Per-workspace, private.
2. **Rules** — deterministic checks over structured data. No model involved.
3. **Aggregation** — cross-workspace statistics ("9/10 TMs…"). This is a SQL/data problem with the LLM as a phrasing layer, **not** a memory or model problem.

Conflating these three is the main way this goes wrong. They have different data topologies, different costs, and wildly different privacy/legal profiles.

---

## 1. What already exists (audited 2026-06-24)

So future agents don't re-discover it:

- **AI is live, not greenfield.** Six Anthropic endpoints route through one metering wrapper: `advance/extract-deal-memo`, `budget/ai/{suggest,template,alerts}`, `budget/receipts/ocr`, `rider-packs/[id]/advance-summary/generate`. All on `claude-haiku-4-5`. (A 7th, stage-plot icons, may use Google.)
- **Usage metering is built and good** — `src/lib/ai/usage.ts` (`withAiUsage`): pre-flight per-user + per-workspace cap check, per-call token + micro-USD accounting to `ai_usage_events` (migration 114), budget alerts, rate limiting (`src/lib/rate-limit.ts`). Defaults: workspace $25/mo, per-user soft $2 / hard $8.
- **Document extraction is built** — `advance/extract-deal-memo` does PDF (`pdf-parse`) + image vision → structured JSON. This is the stateless in-context extraction pattern. No RAG.
- **No RAG / no vector store** — zero `pgvector`, zero embeddings. The "memory over years of documents" does not exist yet.
- **Venues are NOT canonical** — `venues` is workspace-scoped (migration 001), no cross-tenant identity. `routing.venue_id` is a *nullable* FK with a free-text `venue_name` escape hatch → links are unreliable. Venue is not one of the 5 canonical entities (`person, flight, room, gear, show`).
- **Google Places is wired** (`GOOGLE_PLACES_API_KEY`, `api/places/nearby`) — the cross-tenant venue spine already exists in the stack, unused as an identity anchor.
- **One invasive behaviour shipped** — `LineItemDetailPanel.tsx` auto-fires `budget/ai/suggest` on panel open (see `CC_AI_SUGGESTIONS_GATE.md`). Contradicts the non-invasive principle; first ticket fixes it.

---

## 2. The three layers

| Layer | Example | Powered by | Privacy risk | Prereq |
|---|---|---|---|---|
| **A. Private memory** | "What did *we* pay for backline in Berlin?" | Per-workspace RAG over own docs | Low (isolated) | none |
| **B. Rules / heuristics** | "EU shows, no carnet budgeted." | Deterministic code, no AI | Low | none |
| **C. The Community** | "9/10 TMs here rent a PA, +$15k" | Cross-workspace anonymised aggregates | **High** (legal + trust) | canonical venues |

These are different builds. Do not merge them into "an AI feature."

### Layer A — Private memory (RAG), two surfaces

- **A1 Auto-fill** — at document intake (rider/advance extraction, budget builder). Pre-fills blanks from semantically-similar past records.
- **A2 Ask-anything** — a query surface (the ⌘K palette is the natural home). "What did we pay for X last year."
- Storage: `pgvector` inside the existing Supabase Postgres (keeps retrieval under RLS). Per-workspace: `workspace_id` on every chunk; every retrieval filtered by `get_my_workspace_id()`. **Never a shared index.**
- Embeddings provider is a NEW sub-processor (Anthropic has no first-party embeddings API — confidence moderate-high; verify). Choose one with a no-train DPA; add it to `docs/gdpr/PROCESSOR_REGISTER.md`. Embedding = doc text leaves our server, so it's a real privacy event.
- **PII strip before embedding:** never embed special-category fields the GDPR map flags — passport number/DOB/dietary/emergency contact (F1/F3). Embed operational content only.
- Erasure: RAG is a second place PII lives. An Art. 17 deletion must delete/re-embed affected chunks → wire into `src/lib/gdpr/registry.ts`.
- RAG tolerates dirty data (semantic match), so A does **not** depend on canonical venues.

### Layer B — Rules / heuristics (no AI)

- Pure, deterministic, unit-tested functions over the budget/routing/advance data. Cheap, reliable, zero AI bill.
- Already partially present: the carnet/haulage detection inlined in `budget/ai/suggest`. First ticket extracts it into a real module.
- Output shape: structured findings `{ id, severity, title, detail, suggestedAction? }` rendered in the same proactive-prompt surface the LLM uses.
- Adam owns the rule list. Seed rules: EU shows without carnet; haulage/freight missing; known large-capacity room without a PA line.

### Layer C — The Community (cross-workspace) — opt-in, reciprocal, anonymised

**Decisions made (Adam, 2026-06-24):**
- **Non-personal data only.** Pool venue→gear→cost *operational* facts. Never pool people (names, passports, dietary, crew). The pooled facts must not be personal data — that's what keeps it lawful without per-data-subject consent.
- **Explicit disclosure.** Be crystal-clear, in product, about exactly what is pooled and tracked vs. what never leaves the workspace. No silent mining. Silent pooling is the thing that ends trust in a secretive industry.
- **Tiered participation.** Users choose how involved they are (maps to the three layers / increasing contribution).
- **Reciprocity — contribute to consume.** You cannot read Community insights without contributing anonymised data. No one-way partners.
- **Name:** "the Community."

**Engineering guardrails:**
- **k-anonymity floor** — never surface a statistic drawn from fewer than ~5 distinct workspaces. "1/1 tour at this club rented a PA" identifies one company; "9/10" across 10 workspaces does not.
- The LLM only phrases the result. The number is a SQL aggregate over canonical venue + linked rentals/costs.
- Cold-start reality: the magic only exists once enough workspaces contribute. Build C **last**.

---

## 3. The prerequisite gating Layer C — canonical venues via Google Place ID

Community aggregation is **impossible on today's schema**. To say "tours that played Ally Pally," every tour must point at the same real-world venue identity.

Plan (its own project, mirrors the personnel-unification work in migration 204):
1. **`canonical_venues`** — platform-scoped (`workspace_id NULL`), keyed on **Google Place ID** (globally unique, stable; Google occasionally retires/merges IDs and provides a refresh path — document it). Each workspace `venues` row maps to a canonical venue.
2. **Reliable `routing.venue_id`** — Places autocomplete on routing entry; backfill existing free-text `venue_name` → Place ID (fuzzy, human-confirmed for ambiguous matches).
3. Then the aggregation layer reads canonical venue → linked rentals/costs across opted-in workspaces.

### The RLS seam (get this right or the whole thing leaks)

A global `canonical_venues` table breaks the invariant that *everything* is workspace-scoped via `get_my_workspace_id()`.
- Canonical venue **facts** (name, Place ID, capacity) — non-personal, may be world-readable.
- The **mapping** of which workspace played where, and the **aggregates** — must sit behind the k-anonymity gate and the reciprocity check.
- Get this boundary wrong and the Community becomes a tool for one promoter to read another's routing. Map both sides before writing the table.

---

## 4. Build order

1. **Recommendation surface + opt-in gate + dumb rules engine** ← FIRST. See `CC_AI_SUGGESTIONS_GATE.md`. Builds the shared delivery floor (proactive prompt + preference plumbing) and ships Layer B value, cheaply, while fixing the live invasive auto-fire.
2. **Private RAG (Layer A)** — unblocked, safe, the first "real memory." Auto-fill then ask-anything.
3. **Canonical venues** (§3) — the Layer C prerequisite, as its own project.
4. **The Community (Layer C)** — last, behind reciprocity + k-anonymity + tiered opt-in.

Rationale for #1 first: every layer surfaces through the same "we noticed X — add it?" prompt that respects the user's opt-in. Build that floor once with cheap rules behind it; prove the interaction model (do TMs even want proactive nudges?) before spending on embeddings infra. Then swap progressively smarter sources behind the same UX: rules → private RAG → Community.

---

## 5. Open decisions (Adam owns)

- **Suggestions default state** — first ticket sets workspace default **OFF** (opt-in) per the anti-invasive stance. Confirm or flip.
- **Do deterministic rules also respect the opt-in gate, or are they always-on?** First ticket gates everything (conservative). Rules aren't strictly "AI" — Adam may want them always visible.
- **Embedding provider** for Layer A (new sub-processor).
- **Community: build it at all?** Confirmed yes, but it's the highest-trust-risk feature; revisit before starting §3/C.

---

## 6. Cross-references

- `docs/gdpr/DATA_MAP.md` — PII classification (F1/F3 = the no-embed list).
- `docs/gdpr/PROCESSOR_REGISTER.md` — sub-processors; add the embedding provider here.
- `src/lib/ai/usage.ts`, `database/migrations/114_ai_usage_tracking.sql` — metering.
- `CC_AI_SUGGESTIONS_GATE.md` — first ticket.
- Migration 204 (personnel unification) — the canonicalisation pattern to mirror for venues.
