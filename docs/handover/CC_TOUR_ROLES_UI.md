# CC — Tour roles on Personnel: one vocabulary, real descriptions, and a read/edit axis that does not exist yet

Adam: *"on the personnel area of the tour, that's where you add people and define roles. There should be tooltips that show what each one does on hover. There should be a read/edit toggle for each role too."*

All three asks are right. None of them is a UI change. Read this whole file before planning — the surface Adam is describing does not currently contain the thing he wants to put tooltips on.

---

## The finding: there are THREE role vocabularies on the same people, and they never speak

| # | Field | Values | What it actually does | Where it's set |
|---|---|---|---|---|
| 1 | `tour_personnel.role` | freeform text | Display string. `'Sound Engineer'`. Nothing reads it for behaviour. | Personnel page |
| 2 | `tour_personnel.role_tag` | 10 (`tm,tm2,pm,foh,mons,ld,backline,band,management,other`) | **Rider variable substitution only** — `{contact.<tag>.*}`. The UI label says so honestly: *"Role tag (for rider variables)"*. | Personnel page |
| 3 | `tour_roles.role` | 7 (`tm,production,accountant,crew,driver,band,management`) | **The actual permission.** Drives `sliceFor()` → which Day blocks load. | **The DAY page** |

A fourth axis sits on top: `resolveViewerTourRole` (`src/lib/roles/server.ts:41`) short-circuits `admin`/`manager` workspace membership to `'tm'` before reading `tour_roles` at all.

**They are entirely independent — verified, not assumed.** `POST /api/tours/[id]/personnel` (`:276-394`) inserts the roster row, writes an audit entry, seeds rates — and never touches `tour_roles`. Migration 245 has no backfill and no trigger. Grep confirms no file imports both `role-tags.ts` and `lib/roles/`. A person can be `role_tag='foh'` with no permission row at all (the common case), or `role_tag='band'` with `tour_roles.role='tm'`, and nothing objects.

The single point of contact is a read that throws the answer away: `api/tours/[id]/roles/route.ts:41-50` fetches the roster for the person-picker and exposes `roster_role`, which `TourRolesPanel.tsx:19` then drops from its `Candidate` interface.

**So Adam's premise is half true.** Personnel *is* where you add people and set roles — but only vocabularies 1 and 2, neither of which is a permission. The permission role is assigned by `<TourRolesPanel>`, mounted in exactly one place: `src/app/(app)/operations/[tourId]/day/page.tsx:55`. He is asking for tooltips on a control that is on a different page.

## ⚠️ P-0 — The permission model cannot currently identify a logged-in user. Establish this first.

`assignTourRole` (`src/lib/roles/server.ts:79-96`) upserts `{tour_id, workspace_id, person_id, role, created_by}`. **It never sets `user_id`.** Every `tour_roles` row therefore has `user_id IS NULL`.

And `resolveViewerTourRole` (`:35-49`) looks the viewer up by `(tour_id, user_id)`.

**Those cannot match.** The tour-role permission model works only through the tokenized `/m/day/[token]` link, which resolves via `tour_role_links` and never needs `user_id`. For an actual logged-in crew member it resolves nothing and falls through to the fail-closed `'crew'` default.

Confirm this against the live data before building anything on top of it:

```sql
select count(*) as total,
       count(*) filter (where user_id is null) as without_user_id
from public.tour_roles;
```

If `without_user_id = total`, the read/edit toggle Adam wants would have no effect on any signed-in person, and the bridge has to be built first. The available join is `persons.id == personnel.id` (a convention codified in migration 050 and maintained **best-effort in app code**, `api/personnel/route.ts:125-149`, with a `console.error` on failure — it is not FK-enforced) then `personnel.user_id`. **Report whether that convention actually holds in production before relying on it**:

```sql
select count(*) as persons_without_matching_personnel
from public.persons p
where not exists (select 1 from public.personnel n where n.id = p.id);
```

## P-1 — The read/edit axis does not exist in the contract

Adam wants a read/edit toggle per role. **`src/lib/roles/slices.ts` has no write axis at all.** A `RoleSlice` is `{ blocks, products }` — what you can *see*. Nothing anywhere expresses what you can *change*.

The proof is in the matrix itself: **`tm` and `management` are byte-identical** — same blocks, same products. The only thing distinguishing them is a code comment reading *"Read-most — everything, like tm but not an editor."* That distinction is currently a comment and nothing else.

So this is a contract change, not a checkbox:

- Extend `RoleSlice` with a write dimension. **Proposed:** `writes: ReadonlySet<ProductKey>` — a role may *see* Budget and not *edit* it. Per-block write is finer than anything the app can enforce today and would be false precision.
- `management` becomes `tm`'s blocks and products with an empty `writes` set — which finally makes the comment true.
- **Every consumer of `sliceFor()` must be checked.** `loadDay.ts:196` gates queries on `blocks`; adding `writes` must not change a single existing read. `roleAllowsMoney`, `canSeeBlock`, `canSeeProduct` keep their current semantics exactly.
- Fail closed, as `sliceFor` already does: unknown role → `crew` → empty `writes`.

**This is where enforcement has to be real, not cosmetic.** A read/edit toggle that only greys out buttons is theatre — this week proved the route layer and RLS can disagree in both directions. The toggle must reach `requireWrite`, and `requireWrite` currently ignores its `resource` parameter entirely (all 203 call sites use the bare form). **Do not attempt that wiring in this bank** — flag it, ship the model and the UI, and let Adam sequence the enforcement pass. Say clearly in your report that until then the toggle is advisory.

## P-2 — Descriptions must be authored, not generated

The knowledge of what each role does exists in exactly one place — `slices.ts` — as code comments. Nothing renders it. `TourRolesPanel` shows bare `ROLE_LABELS` strings; the only `title=` in the file is `"Remove role"`.

The obvious move is to generate tooltip text from the slice sets. **It does not work, and here is why:**

- **`crew` and `band` have identical block sets** — `['venue','schedule','hotel','flights','contacts']`. A generated tooltip reads the same for both, which tells an operator nothing about why they'd pick one.
- **`tm` and `management` are identical** on both axes today (see P-1).
- **`driver`** differs from `crew` only by lacking `contacts` — technically true, useless as an explanation.

So: an authored description table, `ROLE_DESCRIPTIONS: Record<TourRole, string>`, living beside `ROLE_LABELS` in `slices.ts` so the copy sits next to the matrix it describes and drifts visibly rather than silently.

Mirror the shape already in use: `src/lib/permissions/resources.ts` uses `{ id, label, description, sensitive }` and `PermissionMatrix.tsx:210` renders `description` as secondary text under the label. `role-tags.ts:46-64` does the same for the rider tags and calls it *"Long-form gloss shown in tooltips"*.

**Write descriptions in terms of consequence, not mechanism.** "Sees the day sheet, hotels and flights. No money, no internal notes." — not "blocks: venue, schedule, hotel". Adam is the domain expert here; **draft all seven and have him rewrite them.** They are the entire user-facing surface of the permission model.

Add a **generated line beneath the authored one** — "Money: no · Internal notes: no · Products: none" derived from the actual slice. Authored copy explains, generated copy cannot lie. If they disagree the generated one is right, and that disagreement is the signal.

## P-3 — Move role assignment onto Personnel

`<TourRolesPanel>` lives on the Day index. Adam expects it on Personnel, and he is right: that is where you add a person, so it is where you say what they can do.

The join is one hop and the page already holds everything it needs. `PersonnelListItem` carries `person_id` (`api/tours/[id]/personnel/route.ts:47,157`), and `tour_roles` is UNIQUE on `(tour_id, person_id)` — its exact key.

- Add an **Access** column to `PersonnelManagerClient` showing the assigned role, or "No access" when there is no row. Most rows will read "No access" today; that is accurate and worth seeing.
- Set it in **`PersonnelManageSlideOver`**, which already autosaves via debounced PATCH. Role select + read/edit toggle + the description rendered inline.
- **Keep `<TourRolesPanel>` on the Day page** — it also mints and revokes the `/m/day/[token]` links, which is a different job and belongs where the Day is. Do not move that half. Do not fork the assignment logic either: both surfaces call `POST /api/tours/[id]/roles`.

**The cardinality wrinkle, and it needs Adam's ruling rather than your guess.** `tour_personnel` is UNIQUE on `(tour_id, person_id, role)` — one person can hold two roster rows on one tour (e.g. "FOH" and "Bus Driver"). `tour_roles` is UNIQUE on `(tour_id, person_id)` — one permission row per person. **A per-row control is ambiguous for that person: editing either row edits the same underlying permission.** Options: show the control on every row and make the shared effect explicit in the UI, or hoist it to a person-level panel. Ask; do not pick.

## P-4 — While you are on this surface

Two real bugs found in passing, both cheap:

- **`AddPersonnelSlideOver`'s "create new person" path sends no `role_tag`** (`:207-215`), so every person created that way silently lands on `'other'` — invisible to every rider variable. The "pick existing person" path (`:240-260`) sends it correctly.
- **Two API routes carry a stale error string.** `api/tours/[id]/personnel/[memberId]/route.ts:94` and `api/tour-personnel/[id]/route.ts:42` both say `role_tag must be one of tm|tm2|pm|foh|mons|ld|backline|management|other` — missing `band`, which migration 227 added and `isRoleTag` accepts. The guard is correct; only the message lies.

---

## What Adam owes before this can be finished

1. **The seven role descriptions** — draft them, he rewrites. They are the product.
2. **The cardinality ruling** (P-3) — per-roster-row control or per-person panel.
3. **Whether `role_tag` and `tour_roles.role` should converge.** They overlap confusingly (`tm`, `band`, `management` appear in both) and mean different things. My recommendation: leave them separate but **relabel in the UI** — `role_tag` is already honestly labelled "for rider variables"; the new control should be labelled "Access" or "Permissions", never "Role", or the page will have three things called Role. **Do not merge them in this bank.**

## Order

P-0 probe (blocking — the model may not reach logged-in users at all) → P-1 contract → P-2 descriptions → P-3 UI → P-4 the two bugs.

## Gates

Floor green · **money harnesses 72 / 27 / 40 untouched** — this is not money, so if one moves, stop · vitest 538, known RoutingEditor/pdfProbe flake, rerun once · **`slices.ts` changes need unit tests proving no existing `blocks`/`products` set changed** — that file gates what `loadDay` fetches, and a widened slice is a data leak, not a bug · migrations idempotent and paste-gated if any are needed (P-0 may require one for the `user_id` bridge).

**And the one this week keeps teaching: verify with a real session.** A permission surface verified by `tsc`, `eslint` and unit tests is verified by four gates that cannot see permissions. Assign a role to a second account and confirm the Day sheet actually omits the blocks — server-side absence, not hidden markup.
