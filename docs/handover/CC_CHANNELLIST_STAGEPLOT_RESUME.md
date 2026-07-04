# CC — RESUME (single-owner tree only): channel-list redo + stage-plot safe parts. Off clean `main`.

**Precondition:** the tree must be single-owner and on clean `main` (the payroll contamination is cherry-picked
to `payroll-rate-types-clean` and merged; `feat/payroll-rate-types` deleted). Do NOT start until Adam confirms
no other CC session is active. Discard the old incomplete `804a824` — redo channel-list fresh.

> Protocol: check files first (cite file:line) → build → floor green → commit + PUSH → continue. You're
> empowered to decide on anything not touching money math / saved data. Hard-stop only on money math, data
> destruction, or a listed BLOCKED item.

## PART 1 — Channel list. Fresh branch `feat/revamp-channel-list` off `main`.
Your own pre-collision scope findings (verify they hold on current main, then build):
- The **patching menu already exists** and is wired into the rider's `ChannelListEditor` via `StageBoxDialog`
  (the dLive/LV1-style patch grid Adam asked for). **Reuse it — don't build a new one.**
- The **Rider already has a full editable channel-list editor** ("Edit in rider pack"). So editing a channel
  list inside a rider already works. (Adam's "no way to edit in rider" was likely a stale deploy — confirm on
  current `main`; if it genuinely doesn't work, fix it, else note it's already there.)

The real gap to build:
1. **Make the standalone tour Channel-list tab EDITABLE** — today it's read-only. Wire the existing
   `ChannelListEditor` + `StageBoxDialog` (they exist) onto the tour Channel-list tab, using the canonical
   `SpreadsheetGrid` with dropdowns (mic/DI, phantom, etc.). This is mostly composition of existing pieces.
2. **De-box chrome** (Phase-1) — the partial `804a824` attempted a `SpreadsheetGrid` flat/de-box prop; redo it
   cleanly (opt-in flat prop, scoped so no other grid changes).

DEFER — flag, do not blind-build:
3. **Storage decouple** — Adam wants the channel list to "ride as its own thing" rather than inherit from
   artist-scope. That's a data-model change (a tour-owned channel-list table + fork-from-artist logic +
   migration) — data-adjacent, needs a design decision. Map it as a follow-up; don't build it in this pass.

## PART 2 — Stage plot, SAFE parts only. Branch `feat/revamp-stageplot` off `main`.
- **Labels default OFF for NEW items** — default new items to hidden labels **at the item-creation site**. Do
  NOT flip the `StageCanvas` render default (that retroactively blanks existing saved plots = hard stop).
- **Brand the tick-boxes** — the Stage-panel checkboxes → `.lp-checkbox`. Locate first; if not found, note + move on.
- DEFER (note, don't build): the ft-grid→canvas **scale** fix + **export-parity** (own risky pass).
- BLOCKED: the **drum icon** rebuild — needs Adam's reference art. Skip, note.

## Final
One report: table (part · branch · hash · landed / deferred-why) + floor-green + a combined click-test. Confirm
which channel-list capabilities already existed vs what you built.
