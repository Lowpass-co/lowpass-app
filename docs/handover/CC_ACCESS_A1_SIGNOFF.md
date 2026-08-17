# CC — A-1 catalogue: APPROVED with four changes. A-2 through A-5 are unblocked.

Adam has signed off `docs/design/ACCESS_AREA_CATALOGUE_PROPOSAL.md` (`c5c3703`) subject to the changes below. Apply them to the catalogue, then proceed to A-2 per `CC_ACCESS_PHASE1.md`.

The previous session's corrections are accepted: 106 RLS-bearing tables is a floor not a fact (`pg_policy` is the authority), 6 dead entries not 8, and `ResourceDef` is `{ id, type, group, label, description, sensitive }` — the brief omitted `type` and `group`, which was my error. Keep both fields.

The Driver ruling stands as argued: **split the Day into sub-areas, no built-in override.** The reasoning is right — an override would make Driver the only preset whose meaning cannot be read from `access_role_presets`, which defeats having a queryable preset table.

---

## Change 1 — The Day is missing two sub-areas, and one of them is Adam's own ruling

`slices.ts` defines **seven** day blocks: `venue`, `schedule`, `hotel`, `flights`, `contacts`, **`notes`**, **`pnl`**. The proposal maps four (hotel + flights collapsing to `day.travel` is fine) and drops `notes` and `pnl` entirely.

`notes` is the internal operator note Adam ruled on directly — `slices.ts:18-22` records it: *"routing.notes is an INTERNAL operator note that may hold things never meant for crew. In v1 the `notes` block is in the tm / production / accountant slices ONLY."* **With no `day.notes` area the model cannot express that ruling**, and Band + Crew would inherit notes from any `day` prefix grant.

`pnl` is the money chip on the day sheet — precisely what Adam said Crew must never see (*"anything derived from money/ops is a no go"*).

Add:

| area | label | sensitive |
|---|---|---|
| `day.notes` | Internal notes | yes |
| `day.pnl` | Day money summary | yes |

**One decision to make and argue rather than assume:** `day.pnl` could instead resolve against `budget.summary`, giving one truth about money rather than two places to get it wrong. That's cleaner in principle but couples day rendering to budget areas. Pick one, say why. What is not acceptable is the current state, where it isn't expressible at all.

## Change 2 — Drop `mobile` as an area

`/m/*` is a rendering surface, not a permission — the same data on a smaller screen. Making it grantable creates exactly one bug: a user with Day access but no `mobile` grant gets a 403 on their phone for no reason anyone can explain to them.

Access is decided by what the data is, never by which device asked for it. The `/m/*` routes gate on the same areas as their desktop equivalents.

## Change 3 — ONE payroll area, and it lives in Budget. **Adam's ruling.**

The proposal has both `operations.payroll` (tour scope, sensitive) and `budget.payroll` (Payroll cost lines). Adam: *"there should only be one and it should live in budget. Day rates can be viewed from Personnel but ultimately it feeds the budget payroll table."*

So:

- **Remove `operations.payroll`.** The payroll product is `budget.payroll`.
- **`operations.personnel.compensation` becomes the Personnel-side read.** Viewing someone's day rate on the roster is a read of compensation data; *editing* payroll is `budget.payroll`. Two different acts on the same underlying figures, which is exactly what two areas are for.

This also resolves the gap flagged in §3 of the proposal. `operations.personnel.compensation` was kept as "semantically right but knowingly unimplemented" — under Adam's ruling it now has a definite job, so it should be **wired in phase 4 rather than recorded as a permanent hole.** It is the read side of payroll. Note in the catalogue that its enforcement is still pending (`079:38-46` documents a redaction never built) but stop describing it as unowned.

## Change 4 — Record `/admin/*` staying outside, explicitly

Confirmed: `/admin/*` gets no area. `requireSiteAdmin` is platform-operator identity, not a role inside anyone's workspace — folding it in would make site-admin something a workspace could conceivably grant.

Put that reasoning **in the catalogue file**, not only in a handover doc. The absence of an area for a whole route tree looks like an oversight to the next reader unless the file says otherwise.

---

## Two smaller items, neither blocking

- **`artist.library` bundles riders / stage plots / channel lists into one area** while tour scope splits them (`operations.riders`, `operations.stage_plot`, `operations.channel_list`). Adam confirms this is deliberate — artist-scope items are templates, tour-scope items are instances. Note the asymmetry in the file so it doesn't read as an omission.
- **The three stray `26*.sql` at the repo root** are byte-identical duplicates of the tracked copies in `database/migrations/`. Adam is deleting them. Don't re-create them.

## Correction to carry forward — third time on this one

**Migration 255 IS pasted.** Verified against the live database: `rental_movements.gear_id` is `NOT NULL`, `rental_inventory_id` is nullable, the FK is `ON DELETE SET NULL`, and `gear_qr_token_key` exists. All four steps. It has been carried as "outstanding" through three handovers. **D-2 is unblocked and has been for some time.**

Genuinely outstanding: the pass-3 audit (261/262/263) is unrun, GH-2 is blocked on the `supabase` CLI, and the smoke secrets need adding.

## Order

Apply changes 1–4 to the catalogue → A-2 (schema) → A-3 (presets) → A-4 (resolver) → A-5 (tests).

## Gates

Unchanged from `CC_ACCESS_PHASE1.md`. The one that matters: **the acceptance test for phase 1 is that nothing happens.** Paste the migrations, deploy, and the app is byte-for-byte as it was. Any observable change means something got wired that shouldn't have been.

And: **prove the resolver against the real database with a real second session.** A permission resolver verified by `tsc`, `eslint` and unit tests is verified by three gates that cannot see permissions.
