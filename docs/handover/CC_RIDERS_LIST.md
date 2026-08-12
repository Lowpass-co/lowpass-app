# CC — Rider packs list: honest columns, a real status, per-pack visibility

Adam walked `/operations/[tourId]/riders` and called the layout poor. It is, but the layout is the least of it: **three of the five columns are fabricated in JS, one of them lies, and the page implies access control that does not exist in any form.** Adam has ruled on all three. Rulings are recorded below and must not be silently reversed.

Topology first. Confirm every file:line cited here before planning — this doc was written from a read of the tree, not from running it.

---

## R-A — The layout. Cheap, immediate, do it first.

Three stacked causes, all confirmed:

1. **`RiderPacksTourClient.tsx:143`** — `<div className="mx-auto flex min-h-0 max-w-5xl …">`. A 1024px cap on a surface Adam views at ~1900. This is what strands the viewport, not the DataTable (which caps at 1600, `DataTable.tsx:350`).
2. **No column declares `width`, `minWidth` or `flex`**, and `columnWidthsKey` isn't passed, so `resizable === false` and the browser falls to auto-layout.
3. **Every `<td>` carries `max-w-0`** (`DataTableRow.tsx:161`), making cells fully shrinkable. `lastSent` and `updated` escape via `whitespace-nowrap`; **Pack does not**, and its cell content is an `inline-flex` — which wraps rather than truncates. So Pack is the only column the algorithm can squeeze, and it absorbs all the wrapping.

**Do not invent a solution.** `src/components/advance/AdvanceOverview.tsx` already solves exactly this and is the house pattern: `flex: true` on the primary column (`:417`), explicit `width` on the trailing columns (`168 / 132 / 136 / 48`), `columnWidthsKey` (`:596`) to get `tableLayout: 'fixed'` plus persisted drag-resize, a two-line primary cell with a colour rail (`:388-410`), and a real `<ContextMenu>` in the actions column (`:452-456`). Port that shape.

Also: **the `...` today is not a menu.** `RiderPacksTourClient.tsx:120-137` is a single button that opens `RiderPackDetailsSlideOver`. Adam asked for explicit Edit and Copy-link affordances — replace it with `<ContextMenu>` (`src/components/ui/ContextMenu.tsx`, supports `icon` and `variant: 'danger'`).

## R-B — Status becomes a real column. **Adam's ruling.**

Today status is derived at `rider-pack-rows.ts:52-77`, and the derivation is dishonest:

```ts
if (latest.export_type === 'web_link') status = 'signed';
```

**Creating a share link marks the pack "signed."** Nothing in the system records a signature. Delete this derivation; do not merely relabel it.

### Adam's states, given 2026-08-09: **empty · building · sent · out of date**

**These are not a workflow. They are facts about the pack's content, and all four are derivable.** That changes the answer, and it supersedes the "add a stored column" instruction Adam gave before he named the states — he ruled on the states after, and the states are the stronger signal. Build the derivation, not the column.

The reason is `out of date`. It means "sent, then edited since" — a comparison between two timestamps that move independently. **Stored, it is wrong the moment anyone edits a section without remembering to flip it**, and every edit path in the rider editor would have to maintain it. Two sources of one truth is how they drift; this doc already refuses that for `updated_by` two sections down, and the same rule applies here.

**One SSOT derivation function, every reader through it** — the project doctrine for money generalises:

```
empty        → the pack has no sections, or every section is empty
building     → has content, has never been exported
sent         → has an export, and no content edit since the latest export
out of date  → has an export, and content has changed since the latest export
```

### THE TRAP, and it is the whole reason this needs care

**`rider_packs.updated_at` is the wrong timestamp.** The trigger at `034:377` is `FOR EACH ROW ... ON rider_packs` — it fires only on updates to the **pack row itself** (title, cover fields). Editing a section does **not** bump it, and section edits are essentially all editing.

So `pack.updated_at > latest export.exported_at` would report `sent` for a pack whose entire content was rewritten after sending. That is the exact failure Adam is asking this column to prevent, reintroduced by using the obvious field.

Use **`MAX(rider_sections.updated_at)`** for the pack (`111:30` — the column exists), compared against `MAX(rider_pack_exports.exported_at)` (`034`). Take the greater of that and `pack.updated_at` so a title-only change still counts.

**Worth considering and reporting on rather than silently skipping:** `rider_pack_exports.content_snapshot` is a `JSONB` of exactly what was sent. Comparing content beats comparing timestamps — an edit-and-revert, or a no-op save, would not falsely read `out of date`. It is heavier and probably not worth it for a list query. Say which you chose and why; do not just take the timestamp because it is easier.

### What this means for the build

- **No migration for status.** Delete the dishonest derivation at `rider-pack-rows.ts:52-77` and replace it with the SSOT function above.
- The list query needs section counts and `MAX(updated_at)` per pack. Watch the N+1 — an aggregate join or an RPC, not a query per row.
- `RiderPackDetailsSlideOver` keeps status read-only, correctly, because it is now genuinely derived. Its current text ("Reflects the latest send") becomes true rather than aspirational.
- Do **not** conflate with `rider_sections.status` (`111:64`), which is per-section and stays as it is.
- **If Adam wants a user-settable state as well** — an explicit "approved" or "on hold" that a person asserts — that is a *second*, orthogonal field and a separate conversation. Do not merge it into this one. Ask before building it.

## R-C — Per-pack visibility. **Adam's ruling: build it now.** This is the bank's weight.

### What exists today, stated plainly

There is no visibility model. Not a column, not a join table, not a policy. The live RLS (`061_rls_audit.sql:206-219`) is workspace-scoped on all four verbs:

```sql
CREATE POLICY "rider_packs_select" ON public.rider_packs FOR SELECT
  USING (workspace_id = public.get_my_workspace_id());
-- insert / update / delete: identical predicate
```

Migration 034 originally gated artist-scope writes on `is_workspace_admin()`. **061 removed that.** So every workspace member — including `readonly` — can read, edit and **delete** every rider pack. `079_permissions_rls_helpers.sql:39` names `rider_packs` explicitly as "membership-trusted", i.e. this is by omission rather than decision.

### THE DEPENDENCY — flag it and stop, do not resolve it yourself

**Visibility and write-authorization are different axes, and Adam asked for the first while the hole is the second.** Restricting *who can see* a pack does nothing about a readonly member deleting any pack that remains workspace-visible — which will be most of them, since the default must stay `workspace` to avoid changing behaviour on 100% of existing rows.

Shipping visibility alone would be theatre: a page that displays an access column while a readonly member can still destroy the row.

This lands squarely in **P0-D, which is still undecided** (`CC_P0_WRITE_AUTHORIZATION.md` §P0-D: two role models coexist, `can_access()` lets managers write, `is_workspace_admin()` does not, ~135 policy clauses split between them). **Ask Adam whether this bank also role-gates rider writes, and stop until he answers.** My recommendation: yes, and use `can_access()` so manager can write and readonly cannot — but that is his ruling to make, and making it here would set a precedent for 135 other clauses by accident.

### The model

Two pieces, chosen so existing rows need no behaviour change:

- `rider_packs.visibility TEXT NOT NULL DEFAULT 'workspace' CHECK (visibility IN ('workspace','restricted'))`. Backfill is implicit via the default — **every existing pack stays exactly as visible as it is today.** That property is the reason for this shape; do not replace it with a design that requires a data backfill to preserve current behaviour.
- `rider_pack_access (pack_id, user_id, level TEXT CHECK (level IN ('read','write')), granted_by, created_at)`, PK `(pack_id, user_id)`. Only consulted when `visibility = 'restricted'`.

**Consider the alternative before committing:** `permission_grants` (`078_permissions_foundation.sql:218`) already exists with `resource_type IN ('page','product')`. Extending it with a row-level type would reuse machinery rather than add a parallel one. I lean against — row-level and page-level grants have different lifetimes and cascade needs, and `permission_grants` has no FK to the resource so a deleted pack would leave orphan grants. **But argue it explicitly rather than defaulting to a new table.**

### RLS — the part most likely to go wrong

The four policies get rewritten. **This codebase has a recursion history** (`004_fix_rls_recursion.sql` exists because of it), and a policy on `rider_packs` that subqueries a table which itself has policies referencing `rider_packs` will recurse.

Follow the established pattern: a `SECURITY DEFINER` helper alongside `get_my_workspace_id()` — something like `can_see_rider_pack(pack_id uuid) RETURNS boolean` — with `SET search_path = public`, and call **that** from the policy. Do not inline the join.

`rider_pack_access` needs its own policies, and they must not reference `rider_packs` in a way that closes the loop.

**Test the recursion case explicitly before Adam pastes anything.** A recursive policy takes the riders page down for everyone, and RLS failures do not show up in `tsc`, `eslint` or vitest — the same blind spot that produced this week's two outages.

### The UI

- A **Visibility column** on the list: "Everyone in workspace" vs "Restricted · N people", with avatars for restricted packs (`AccountAvatar`, `size={20}` — note **no DataTable in this app renders an avatar today**, so you are first; take the two-line cell structure from `AdvanceOverview`'s date column).
- A **Sharing / access panel** in `RiderPackDetailsSlideOver` to flip visibility and manage the list.
- **Sensitive-grants pattern applies** — see `CLAUDE.md` §"Sensitive-grants policy" and `MemberManageSlideOver`: show the consequence inline the moment it's triggered, rely on Cancel as the safety gate. Restricting a pack is exactly the kind of state where a visible warning beats a confirm modal.

## R-D — Author and editor

- **"Who made it" is free.** `rider_packs.created_by` exists (`034:52`, FK → `profiles`) and **is populated** — it is simply never selected. Add it to the query in `src/app/(app)/operations/[tourId]/riders/page.tsx:38-57` with a `profiles ( name, avatar_url )` embed. **Verify that embed returns rows before building on it** — `profiles` RLS has been recursion-prone historically.
- **"Who edited it" has no column.** There is no `updated_by` on the pack. Do **not** add one without asking — `rider_pack_history` (`034`) already records `changed_by` + `changed_at` on every change via `appendHistory`, and a MAX over it gives last-editor for free with no new write path to keep in sync. Two sources of the same truth is how they drift. Propose the aggregate; let Adam choose.

## R-E — Copy link. **Adam's ruling: copy newest, create if none.**

`rider_web_links` (`034`) is `0..N` per pack, each token individually revocable, some password-protected. There is **no stable per-pack URL**, and the list page currently fetches zero link data.

- Join newest unrevoked link into the list query.
- Row action copies `${origin}/r/${token}` — reuse `buildPublicUrl` from `PackEditor.tsx:1420` rather than writing a second builder.
- **If no link exists, mint one** via the existing `POST /api/rider-packs/[id]/web-links`.
- **That click creates a publicly accessible URL, so the UI must say so** — not a silent side effect. A brief inline confirm on the create path only (copy is silent when a link already exists). This is the one place Adam's chosen option has a sharp edge and he accepted it knowingly; make the edge visible.
- Do **not** hang this off `show_links` (migration 257). That is per-show (`routing_id NOT NULL`), serves `/s/[token]`, and 257's own header says the four existing token mechanisms keep working — it is a venue-facing front door, not a rider share link.

## R-F — Two columns to delete

- **`recipient`** is synthesised from `scope` + artist name (`rider-pack-rows.ts:70-77`) and, because the query filters `.eq('tour_id', tour.id)`, can only ever render one of two strings on this page. It carries no information. Remove it; the width is better spent on author and visibility.
- **The `ScopePill`** (`RiderPacksTourClient.tsx:215-230`) is dead weight here. Artist-scope packs have `tour_id IS NULL` by the CHECK at `034:55`, so "Artist ↘" can never render on this page. Every row reads TOUR or Show. Keep it only if Show packs are common enough to be worth distinguishing — check the data first and say which.

**On Adam's "what tours they're assigned to":** on this page it is always exactly one, its own. Assigning a master **deep-copies** it into a new pack row (`assign-to-tour/route.ts:212-235`), and unique indexes (`034:63-68`) enforce one pack per `(artist_id, tour_id)`. A tour pack cannot belong to two tours. That ask belongs on the artist masters page (`/artists/[id]/riders`), which already renders "On N tours" (`ArtistTemplateList.tsx:278`) — and where fetching the tour *names* rather than just the count is a small extension of an existing query. **Tell Adam that's where it lands; don't fake a column here.**

---

## Order

R-A (layout, zero risk, immediate visible win) → R-D (author, one query line) → R-F (delete the fake columns) → R-E (copy link) → R-B (status migration, after Adam rules on the state set) → **R-C last, and not until Adam rules on the write-authorization dependency.**

R-C is the only part that can take the page down. Everything above it is independently shippable, so bank them separately rather than holding the layout fix hostage to the permissions work.

## Gates

Floor green · **money harnesses 72 / 27 / 40** (`payroll/reconcile.harness.ts`, `payroll/fees.test.ts`, `settlement/reconcile.harness.ts`) — riders are not money, so these must be untouched; if one moves, stop · vitest **538**, known flake in RoutingEditor + pdfProbe, rerun once · migrations idempotent with down-blocks, delivered as paste-SQL, and **wait for Adam to say "pasted"** · every new mutating route calls `requireWrite` or the ratchet fails.

**And the one that matters most here: RLS changes are invisible to every gate this project has.** Before Adam pastes R-C, prove the policies with a real second session — a readonly member and a restricted pack — not by reading the SQL. Two production outages this week both passed tsc, eslint, a green build and 538 tests.
