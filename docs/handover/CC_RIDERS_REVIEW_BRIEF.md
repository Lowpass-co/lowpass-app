# Cowork review brief — riders R-A/R-D/R-F, and everything I could not verify

`main` @ `50e4189`, tree clean. Written 2026-08-09 at the end of a long session.

**Your job is to check my work against the bigger picture, not to take it on
trust.** Three riders stages shipped; three did not. The log in §3 is the part
that matters most — it is everything I asserted without being able to prove, and
everything I knowingly left wrong.

---

## 1. What shipped

| Stage | Commit | What |
|---|---|---|
| R-A | `0e798de` | Layout: 1024px cap → 1600, `flex`/widths/`columnWidthsKey`, two-line Pack cell, real `<ContextMenu>` |
| R-D | `50e4189` | `created_by` selected + Created-by column with avatar |
| R-F | `50e4189` | Recipient column deleted |

Floor on each: tsc 0, build green, vitest 538/538, lint ratchet 50 errors / 390
warnings (net zero), money harnesses 72 / 27 / 40 untouched.

## 2. What did NOT ship, and why

- **R-E (copy link)** — not started. Needs the newest-unrevoked-link join, a
  create-if-none path, and a confirm on the create branch because that click
  mints a public URL. The `<ContextMenu>` from R-A is where it goes; I
  deliberately left NO placeholder entry, because a dead menu item is worse than
  an absent one.
- **R-B (status)** — not started. The dishonest derivation is **still live**:
  `rider-pack-rows.ts` still maps `export_type === 'web_link'` → `'signed'`.
  **Creating a share link still marks a pack signed.** Nothing records a
  signature. This is the highest-value remaining item.
- **R-C (visibility)** — not started, and **correctly blocked**. The spec says
  do not proceed until Adam rules on the write-authorization dependency, and
  that ruling has not happened.

## 3. THE LOG — check these; I could not

### 3a. Asserted but never executed

1. **I never ran the riders page.** Not once, in any form. Every change is
   verified by tsc, lint, build and unit tests — the exact four gates that both
   of this week's production incidents passed. R-A is a layout change whose
   whole point is visual, and **nobody has looked at it.**
2. **The author lookup is unexercised.** `profiles.select('id, name, avatar_url')
   .in('id', authorIds)` — if `profiles` RLS blocks that read for a normal
   member, every row silently shows an em-dash and nothing errors. That is the
   zero-signal shape this codebase keeps producing. **Check it renders a real
   name for a real pack.**
3. **`created_by` may be null on older packs.** I render a dash. I do not know
   what fraction of the 33-odd packs actually carry it. If it is most of them,
   the column is decoration and R-D should be reconsidered rather than kept.
4. **`columnWidthsKey` persists to localStorage per tour.** I did not verify the
   key does not collide with another surface's, or that a stale persisted width
   from before this change does not override the new defaults. First load after
   deploy is the case to watch.

### 3b. Knowingly left wrong

5. **The `signed` status still lies.** R-B. Flagged above; repeating it here
   because it is the one a user can actually be misled by today.
6. **ScopePill kept without the check the spec asked for.** R-F says decide
   based on whether Show packs are common. That needs a production query I have
   no access to. I kept it because R-A folded it into the Pack cell where it
   costs no width — the cheaper error — but **that is a guess, not a decision.**
7. **`recipientLabel` the field survives** even though its column is gone,
   because `RiderPackDetailsSlideOver:97` uses it as a subtitle. If R-B/R-C
   rework that panel, it should probably go with it.

### 3c. Things I got wrong earlier and corrected — verify the corrections

8. **The riders file is `src/components/tours/`, not `components/riders/`.** My
   first grep assumed the wrong folder. Every LINE number in the spec was exact.
9. **Harness counts are 72 / 27 / 40.** I quoted 64/21/15 for most of this
   session from stale handover docs. Any doc still saying 64/21/15 is wrong.
10. **The pass-3 migration audit had two false-positive checks** which I
    rewrote (`_AUDIT_pass3_261_263.sql`). 261's checks tested a value that
    pre-dated the migration and a name that a partial paste would also satisfy.
    **The audit has still not been RUN** — 261/262/263 applied-status is
    unknown, and 262/263 touch riders.

## 4. Outstanding pastes and rulings

- `255_movements_gear_first.sql` — written, **not pasted**. Blocks S1 D-2 only.
- `261` / `262` / `263` — untracked at repo root, applied-status **unknown**.
  Run `database/migrations/_AUDIT_pass3_261_263.sql` before trusting anything
  about `rider_section_templates`.
- **Adam owes two rulings**: R-C's write-authorization axis (choosing
  `can_access()` there sets precedent for ~135 policy clauses), and whether R-B
  also gets a user-settable state alongside the derived one.

## 5. The bigger-picture checks I actually want from you

This is where a second pair of eyes earns its keep — these are judgement calls I
made alone and may have made wrong.

1. **Is R-D worth its query?** I added a second round-trip per page load to
   avoid an embed I could not test. If the embed works, that is a needless
   query on every render. Verify the embed, and if it is fine, collapse it.
2. **Does the 1600px cap fit the design system?** I matched `DataTable`'s own
   internal cap. But other surfaces use `max-w-5xl` deliberately, and if the
   house rule is "list surfaces are 1024", I have made riders inconsistent
   rather than fixed it. Check against `AdvanceOverview` and the routing list.
3. **R-B's derivation is the real work and it has a trap.**
   `rider_packs.updated_at` does NOT move when a section is edited — the trigger
   at `034:377` is on the pack row only. So `pack.updated_at > export.exported_at`
   reports `sent` for a pack whose content was rewritten after sending, which is
   exactly the bug the column exists to prevent. Use
   `MAX(rider_sections.updated_at)`, greatest-of with `pack.updated_at`. **Do
   not let anyone implement this the obvious way.**
4. **R-C is the one that can take the page down.** RLS is invisible to every
   gate this project has, including the CI that landed today. This repo has a
   recursion history (`004_fix_rls_recursion.sql`). Prove the policies with a
   real second session before Adam pastes — not by reading the SQL.
5. **Does the CI split still look right to you?** I put lint in its own job with
   a ratchet at 50 errors rather than fixing all 50, because 44 are
   `react-hooks/set-state-in-effect` and rewriting 44 effect bodies blind, in
   the week two incidents came from unexercised changes, seemed like the same
   mistake. That is arguable and I would like it argued.

## 6. Standing hazards this session kept re-proving

- **The file is not the unit.** Three times a guard or a write turned out to be
  one import away. Grep, then follow.
- **A reference count of zero deserves following.** Unexercised code is wrong
  with no signal.
- **Derive the assertion from the fact that determines it.** The carnet printed
  `value_currency` beside a `purchase_cost` figure because the two reads looked
  adjacent and were not the same fact. R-B's timestamps are the same shape.
- **Green gates are not evidence of working software.** Everything in §1 passed
  every gate this project has, and none of it has been seen running.
