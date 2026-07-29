# CC — FIXPACK: two nav bugs + the hang. SINGLE OWNER, bank-per-item, Vercel-success rule.

Adam re-tested and found both previously-reported nav bugs still live. Cowork confirmed each with evidence. A third, worse issue surfaced during the same walk.

## F-1 — Day-type arrows are INERT (the ledger re-broke the keyboard contract)
Cowork's live test on the deployed ledger, in order:
- Click the day-type pill → `document.activeElement` = `BUTTON "Rehearsal"`, no popup. ✅
- Press ↓ → **row value stays "Rehearsal"; no popup; nothing happens.** ❌
- Press Tab → focus moves to the venue `INPUT` with "O2 Apollo Manchester". ✅

So focus and Tab-escape work; **the arrows no longer change the value.** This is the third distinct regression of the same contract (originally Tab-swallowing, then arrows-open-a-popup, now arrows-do-nothing) — the R2 text-until-touched rewrite replaced the control and dropped the handler.

Required (unchanged from `CC_ROUTING_KEYBOARD.md`): with the cell focused, **↑/↓ cycle the day type IN PLACE, committing as they go, without opening a popup.** Enter/Alt+↓ may open the full list for mouse users; Esc closes it and returns focus to the cell; Tab always leaves.

**This regression keeps happening because nothing tests it.** Land a real automated keyboard test in this bank — jsdom/RTL over the ledger row: focus the day-type cell, fire ArrowDown, assert the committed value changed; fire Tab, assert focus is the venue input. KEY-04..07 stop being a manual walk item. If the harness genuinely can't mount the row, say so explicitly and explain what's needed instead of skipping.

## F-2 — Tour builder: Save dead until you nudge the artist dropdown
`src/components/shell-v2/TourEditorModal.tsx:122`:
```ts
const [pickedArtistId, setPickedArtistId] = useState<string>(() => initialArtistId ?? artists[0]?.id ?? '');
```
One-shot lazy init, `artists` is a prop defaulting to `[]`, and **there is no effect re-seeding it when the list arrives.** Open the modal before artists resolve → `pickedArtistId === ''` → `effectiveArtistId` null → `canSave` false (line 154) until the user changes the select. Exactly Adam's report; a task chip was logged for this weeks ago and never landed.

Fix: re-seed when the list arrives and nothing is picked (effect on `artists`), or derive the effective artist rather than storing it. Prefer derivation — same class of bug as the P0 context hydration. While in there, check the `key` remount on line 101 still resets cleanly with the fix in place.

### F-1 ROOT CAUSE (found 2026-07-21, record it — this regressed three times)
The arrow handler's first line was `if (open) return;`. **Tabbing in leaves `open` false, so arrows worked** — which is why every manual test and every code read passed. **Clicking the pill fires `onClick → setMenu(!open)`, so `open` becomes true while focus stays on the button**, and every subsequent arrow hits the guard and returns. Cowork saw "no popup" because the ledger trigger is a bare pill whose menu renders in a body portal. Fix: arrows handled first, ungated by `open`; cycling closes an open menu; Alt+↓ still opens; Tab still never swallowed.

**The lesson to keep:** a unit test on `DayTypeDropdown` alone would have stayed green. The bug only exists on the real click path, so the harness mounts at the **ledger row** level. Both fixes were proven by revert-check (F-1: 1 failed / 4 passed against HEAD, 5 passed against the fix). Every future keyboard-contract change re-runs this harness — the contract is now executable, not a walk item.

## F-3 — The hang (Adam: "a loading spinner instead of hanging so the app feels more fluid")
**REVISED ORDER (CC's handoff, endorsed): do (b) before (a), and take the `/touch` 503 first as a standalone.** Skeletons make a 30-second hang *feel* better; the server-side move makes it *not happen*. A fire-and-forget write that blocks or errors a page load is a bug on its own and likely a small fix. Land the loader changes with tests, same as F-1/F-2.
Cowork measured on production, cold: **routing showed "Loading routing…" for 28–70s before the ledger appeared, twice running.** Personnel is 15–20s. This is the worst defect in the app — the page a TM lives in taking half a minute beats every visual issue on the list.

Two parts, both in scope:

**(a) Never show a bare "Loading…" string again.** Every surface that fetches gets a **skeleton** matching its final layout — ledger rows as grey bars at the real 46px height, cards as outlined blocks, matrix as a dimmed grid. Skeletons, not spinners: they preserve layout, prevent the content jump, and read premium. One shared `<Skeleton>` primitive + per-surface compositions; no bespoke loaders. Surfaces: routing ledger, personnel, payroll, budget grids, day, advance, assets. If a fetch exceeds ~10s, add a quiet secondary line ("still loading — the server is waking up") rather than leaving the user guessing.

**(b) Root-cause the 28–70s.** Skeletons hide the symptom; find the cause. Cowork's evidence: routing's cold load fires a chain of sequential client API calls (`/api/workspaces`, `/api/artists`, `/api/tours?limit=200`, `/api/artists/[id]/tours`, `/api/tours/[id]/routing`, `/api/tours/[id]/touch` — one of which 503'd on a cold lambda). The pattern that already worked once: the D1-6 personnel **rates mirror is server-loaded and paints instantly while the client-fetched roster below it still spins.** Apply that lesson — move the primary payload of routing (and personnel) to the server component, and parallelise or drop what's left. Report before/after timings on the deployed build. Investigate the cold-lambda 503 on `/touch` separately; a fire-and-forget write should never block or error a page load.

## Gates
Floor green · money untouched (all three are UI/loader work) · the F-1 keyboard test is a deliverable, not optional · before/after load timings in the F-3 report · raw git evidence + Vercel success per bank. Cowork re-walks F-1 keyboard and F-3 timings on production.
