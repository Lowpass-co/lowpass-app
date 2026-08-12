# CC — Rider packs list. Handoff into a fresh session.

The spec is `docs/handover/CC_RIDERS_LIST.md` and it is good — file:line accurate
where I spot-checked it, and Adam's rulings are recorded in it. **Read that
first; this file is only what a new session cannot get from it.**

Written 2026-08-09. `main` @ `2205328`, working tree clean.

---

## 1. What changed under your feet TODAY, and it changes how you verify

**This project now has CI. It did not this morning.** `.github/workflows/ci.yml`,
landed `2c96443` + `2205328`. Two jobs:

- **`verify`** — typecheck, vitest (538), and the three money harnesses run
  explicitly (they are `node --experimental-strip-types`, NOT vitest suites, and
  vitest does not pick them up). This is what finally arms the route-guard
  ratchet and the money gates. Both had been documented as "fails CI" while
  there was no CI at all.
- **`lint`** — separate job, runs `scripts/lint-ratchet.mjs`, not raw eslint.

**The lint ratchet will bite you and that is intentional.** 50 pre-existing
errors are pinned in `scripts/lint-baseline.json`. The pin only moves DOWN and
`--write` refuses an increase. If your bank adds a lint error the job fails.
Do not re-pin to go green. Run `npx eslint <your files>` before you commit.

**Harness numbers are 72 / 27 / 40.** Older docs in `docs/handover/` say
64/21/15 — those are stale, including things I said earlier today. Riders are
not a money path, so these must not move at all; if one does, stop.

## 2. Outstanding pastes — do not build on unpasted SQL

| SQL | State |
|---|---|
| `255_movements_gear_first.sql` | **WRITTEN, NOT PASTED.** Blocks S1 D-2 only. Not yours. |
| `261` / `262` / `263` | Untracked at repo root, applied-status UNKNOWN. `database/migrations/_AUDIT_pass3_261_263.sql` measures them — **262 and 263 touch riders**, so run it before assuming anything about `rider_section_templates`. |

**261's audit checks were false positives and I corrected them** — they tested
`per_day_status` (which pre-dated 261) and a name match (a partial paste leaves
the right name with wrong data). If you write an audit assertion: test what the
migration CHANGES, not what it mentions. A check that passes against the
pre-state is worse than none, because it retires the question.

Next free migration number is **256** by file, but 261–263 exist untracked —
**check every branch before numbering**, and expect the next free to be 264.

## 3. Two rulings Adam owes you before parts of this can start

- **R-C write-authorization.** The spec flags it and it is a real stop.
  Visibility without write-gating is theatre — a readonly member can still
  delete any workspace-visible pack, which will be nearly all of them. Choosing
  `can_access()` here silently sets precedent for ~135 policy clauses. Do not
  resolve it yourself.
- **R-B, if Adam wants a user-settable state** ("approved", "on hold") as well
  as the derived one. That is orthogonal. Ask; do not merge it in.

## 4. The one thing in this spec most likely to be got wrong

**R-B's timestamp trap.** `rider_packs.updated_at` does not move when a section
is edited — the trigger at `034:377` fires on the pack row only, and section
edits are essentially all editing. So the obvious implementation
(`pack.updated_at > export.exported_at`) reports `sent` for a pack whose entire
content was rewritten after sending — precisely the failure the column exists to
prevent.

This is the same shape as a bug I shipped and had to fix twice today: the carnet
printed `value_currency` next to a `purchase_cost` figure because the two reads
looked adjacent and were not the same fact. **Derive the thing you are asserting
from the fact that determines it**, not from the field that happens to be nearby.
`MAX(rider_sections.updated_at)`, greatest-of with `pack.updated_at`.

The spec asks you to choose between timestamp comparison and comparing
`content_snapshot` JSONB, and to say why. Answer it; do not take the timestamp
because it is easier.

## 5. Session-earned habits that apply directly here

- **The file is not the unit.** Three times today a guard or a write turned out
  to be one import away — `requireSiteAdmin` on six admin routes that looked
  wide open, `guardGoogleCall` on the Places proxies, a create hidden behind a
  helper in `apply-template`. Grep, then FOLLOW. Twice I nearly reported a
  security finding that did not exist.
- **A count of zero deserves following.** `rental_movements`'s new columns had
  no readers; `/api/budget/exchange-rate` 502'd for months because nothing
  called it. R-C is creating a new access model — if nothing reads
  `rider_pack_access`, it is decoration.
- **RLS is invisible to every gate this project has**, including the new CI.
  The spec says prove R-C's policies with a real second session. It means it.
  Both of this week's outages passed tsc, eslint, a green build and 538 tests.
- **This repo has an RLS recursion history** (`004_fix_rls_recursion.sql`).
  Use a `SECURITY DEFINER` helper beside `get_my_workspace_id()`; do not inline
  a join that can loop back through `rider_packs`.

## 6. Suggested first move

R-A only. It is the visible win, it is zero-risk, and `AdvanceOverview.tsx` is
the house pattern to port rather than a thing to invent — `flex: true` on the
primary column, explicit widths on trailing ones, `columnWidthsKey` for
`tableLayout: 'fixed'`. Bank it on its own. Do not hold the layout fix hostage
to the permissions work; the spec's ordering exists for that reason.

## 7. What I did NOT verify

I read the spec and spot-checked its topology claims; I did not run the riders
page. Every file:line in `CC_RIDERS_LIST.md` should be confirmed before
planning — the spec says so itself, and it was written from a read of the tree
rather than from running it.

Nothing in this session touched `src/components/riders/*`,
`RiderPacksTourClient.tsx`, or `rider-pack-rows.ts`. Fable landed a riders bank
at `6728c07` (documents, named versions, attachments) — check what it moved
before trusting any line number in the spec that falls in those files.
