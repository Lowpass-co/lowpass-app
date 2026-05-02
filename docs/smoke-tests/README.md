# Lowpass smoke tests

Per-product smoke checklists run on Vercel preview after a non-trivial
PR lands. Each test is a Do/Expect pair plus a stable `ADV-NN` (or
`BUD-NN`, `OPS-NN`, etc.) identifier.

## Why

Adam smoke-tests every advance/budget/operations PR before merging.
Without a written record, regressions sneak back in PRs later (the
"chunky strip data" gap was a regression of behaviour that worked in
an earlier build). The smoke folder is the canonical record so:

- A regression has a stable test ID someone can point at ("ADV-03 was
  passing in PR #14, broken in PR #20").
- A "Known broken" section is honest about what's already shipped
  partially-working.
- Anyone (CC, Adam, future contributor) can run the same checks
  without re-deriving them from prompts.

## Layout

- `docs/smoke-tests/<product>.md` — checklist for one product surface.
- `docs/smoke-tests/_template.md` — copy this when starting a new
  product checklist.

## Test ID format

`<PREFIX>-<NN>`. Prefix matches the product (ADV / BUD / OPS / HOM).
Numbers are stable forever — when a test retires, leave the ID
referenced in the "Retired" section so old PR descriptions still
resolve. Never recycle an ID.

## Test format

Each test is an H4 heading + Do + Expect + (optional) Currently:
+ Tracked-in.

```md
#### ADV-03 — Chunky strip totals match section list

**Do**: Open `/advance/[any]/[any]`. Scroll the section list, count
sections by status pill colour (green = complete, blue = in
progress, etc.).

**Expect**: The Complete / Pending / Overdue tiles in the chunky
progress strip at the top of the show match the counts you just
made.

**Last verified**: 2026-05-02 (Adam, Vercel preview)
```

When a test currently fails, add:

```md
**Currently**: <one line on the failure mode>
**Tracked in**: <issue ID or PR #>
```

…and move the test under `## Known broken` until the gap closes.

## Running a smoke pass

1. Open the relevant product's URL on Vercel preview (or local dev
   if you have a working env).
2. Walk every test top to bottom, ticking ones that pass.
3. Tests that fail: capture the failure mode, file an issue, move
   the test under "Known broken", reference the issue.
4. Update the "Last bulk verification" line at the top of the file.

## When to update

- Sprint-prompt acceptance criteria that are observable behaviour
  → land them as new test IDs in the same PR that ships them.
- Smoke runs that surface new bugs → add the test under "Known
  broken" so it's tracked.
- Bug fixes → move tests OUT of "Known broken" with the same PR
  that closes them.

## Cross-references

- `CLAUDE.md` — has a one-line pointer to this folder under "Critical
  conventions".
- `docs/handover/CC_*.md` — sprint prompts often reference these IDs
  when scoping followups (e.g. ADV-65/66/67/68 in the parity
  followups).
