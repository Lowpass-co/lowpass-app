# Section-dedupe backfill — rework to respect the budget-versioning lock

> The Phase S dedupe migration (from `CC_DATA_INTEGRITY_PASS`) failed on apply:
> `ERROR 23514: budget version <id> is locked (status=superseded); its proposed snapshot is immutable`
> — `deny_write_on_locked_version()` (`212_budget_versioning.sql:141-157`) on `trg_lock_version_lines`.
>
> **Root cause:** the migration tried to rewrite snapshot tables (`budget_version_lines`), which are immutable once their version leaves `draft`. And it can't even hard-delete the twin section, because the twin is pinned into snapshots: `budget_version_sections.section_id` = `ON DELETE CASCADE` (212:62) and `budget_version_lines.section_id` = `ON DELETE SET NULL` (212:76) — both fire the lock trigger for non-draft versions.
>
> The Phase S **code** fix (`ensureSection` alias-match) is correct and shipping. This is only about the **existing-twin backfill**.

## Principle
**Never write to snapshot tables. Never bypass the lock trigger.** Frozen snapshots stay frozen (migration 219's stated invariant). A twin pinned by a locked version simply is not hard-deletable — and that's fine; it's cosmetic.

## The rework
Operate on LIVE tables only, and delete twins conservatively:

1. **Re-point live line items:** `UPDATE budget_line_items SET section_id = keep_id WHERE section_id = twin_id`. (live table, no trigger — fine.)
2. **Delete the twin section ONLY when it is not pinned by a non-draft version:**
   ```sql
   DELETE FROM public.budget_sections s
   WHERE s.id = pair.twin_id
     AND NOT EXISTS (SELECT 1 FROM public.budget_line_items li WHERE li.section_id = s.id)
     AND NOT EXISTS (
       SELECT 1 FROM public.budget_version_sections vs
       JOIN public.budget_versions v ON v.id = vs.version_id
       WHERE vs.section_id = s.id AND v.status <> 'draft')
     AND NOT EXISTS (
       SELECT 1 FROM public.budget_version_lines vl
       JOIN public.budget_versions v ON v.id = vl.version_id
       WHERE vl.section_id = s.id AND v.status <> 'draft');
   ```
   (Draft-version references are OK — the delete's `ON DELETE SET NULL`/`CASCADE` onto draft snapshots is permitted by the trigger. Only non-draft pins block, so we skip those.)
3. **Do NOT** touch `budget_version_lines` / `budget_version_sections` directly. Remove the `UPDATE budget_version_lines` step entirely.
4. **Residual (expected, document it):** on tours that have a locked version referencing a duplicate section, the empty twin section survives. That's acceptable — it's empty in the live budget, the alias-match stops it repopulating, and rewriting the locked snapshot to remove it would violate the immutability invariant. If the live budget view renders empty sections and that looks bad, a *separate* follow-up can hide zero-line derived-section twins in the view — not worth a snapshot rewrite.

## Numbering
Rename to the next free number (**233** — 230/231/232 are used: 230 rate-lines backfill applied, 231 held drop, 232 day-rate seed applied). Verify across branches. Idempotent. Keep the DO-block's verify queries.

## Verify
- [ ] Applies clean against a DB that has a locked version referencing a twin (the case that just failed).
- [ ] Tours with no locked version: twin fully removed, single section remains.
- [ ] Tours with a locked version pinning the twin: live line items re-pointed to keep; empty twin remains; **no error**; locked snapshot untouched.
- [ ] `SELECT tour_id, count(*) ... GROUP BY tour_id HAVING count(*)>1` returns only the pinned residuals, and the done report lists them.

## When done
```
Section-dedupe backfill reworked (migration 233).
- Live line_items re-pointed twin->keep; twin deleted only where not pinned by a non-draft version.
- Snapshot tables untouched; lock trigger never tripped.
- Residual empty twins on <N> tours with locked versions (listed) — cosmetic, by design.
- Adam: apply 233; confirm the residual list matches locked-version tours.
```
