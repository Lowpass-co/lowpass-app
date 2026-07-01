# CC — Riders fix Stage B: GO (D1–D5 answered)

`RIDERS_FIX_MAP.md` reviewed. **Commit the map.** Build Stage B.

## Decisions
- **D1 — Extract. YES.** Pull the editor page body into a shared
  `RiderPackEditorView({ packId })`, used by BOTH `/rider-packs/[id]` and the new
  `/operations/[tourId]/riders/[id]`. One source of truth — no duplicate.
- **D2 — Match the LIST page's chrome.** Default to your recommendation
  (`<ProductShell active={null} productName="Rider">`) **only if** that's what the
  riders **list** page (`/operations/[tourId]/riders`) renders. If the list is
  Operations-active, make the editor Operations-active too. The rule: opening a pack
  must keep the same shell as the list it was opened from. Check the list page; align.
- **D3 — Both. YES.** Change the row click to push the direct
  `/operations/[tourId]/riders/[id]` (no redirect hop) **and** create the page so the
  legacy `/tours/.../rider-packs/[packId]` redirect also resolves. Belt and braces.
- **D4 — Delete: slide-over footer, slide-over only. YES.** Your copy is good:
  *"Delete "{title}"? This permanently removes the pack, its sections, and its
  history. This can't be undone."* Optimistic remove + `router.refresh()`. **Skip the
  row `…` menu for now** — slide-over only keeps scope tight (a row-menu delete is a
  possible later follow-up if Adam wants more reach; don't build it now).
- **D5 — Loading rail: agreed, not a code bug → no blind change.** Leave it; I'll
  Chrome re-check it live when I verify. If it's actually stuck, that's its own ticket.

## Hard rules (unchanged)
- Tokens; `next build --webpack`; tsc 0; eslint 0. Don't regress the existing
  `/rider-packs/[id]` route, templates, channel-list/stage-plot, or the editor body
  (it's now shared — both routes must render identically).
- **Verify before claiming** — name files/lines; mark build vs needs-live. I
  Chrome-verify: row → editor loads (no 404) on the direct push AND via the legacy
  redirect; delete removes the pack + the list refreshes; the editor is byte-identical
  on both routes.
- Land a riders smoke block + add Adam's manual smokes to `SMOKE_QUEUE.md`.
