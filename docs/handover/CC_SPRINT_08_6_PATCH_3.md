# CC Sprint 8.6 — Patch 3

Three remaining bugs. Bug 1 is fixed in this branch already (direct edit to `AdvanceSectionBuilder.tsx` — see commit). Bugs 2 and 3 need diagnostic input from Adam before any code changes.

Branch: `fix/sprint-8.6-fixes-plus-overhaul`

---

## Bug 1 — drag-reorder indicators ate drops (FIXED, please verify)

**Root cause:** The orange dashed drop-zone indicators in `AdvanceSectionBuilder.tsx` (the field-row indicator at the original line 1719 and the section-card indicator at the original line 1642) had no `onDragOver`/`onDrop` handlers. They render in flow before the target element with a fixed height (h-10 / min-h-[52px]), displacing the real target down by their height. The user's cursor ends up over the indicator's pixels at release. With no drop handler on the indicator, the event bubbled to the section card's `onDrop` (or canvas `onDrop` for sections), which read `data.type !== 'section'` and bailed.

That's exactly what Adam's console logs showed: `section onDrop {targetIdx: 0, data: {fieldIndex: 1, sectionIndex: 0, type: 'field'}}` followed by `payload not a section move`.

**Fix:** Both indicators now have their own `onDragOver` (preventDefault + stopPropagation) and `onDrop` handlers that mirror the real targets' logic. Field indicator calls `moveFieldOrder(secIdx, data.fieldIndex, fieldIdx)`. Section indicator calls `moveSectionOrder(data.sectionIndex, secIdx)`.

**Verification:** Adam to drag a field within a section, drag a section header, confirm both reorder visibly and persist. Console should show `field onDrop` / `section onDrop` calls succeeding (no "payload not a section move" warnings).

---

## Bug 2 — §6 trigger error persists (NEEDS DIAGNOSTIC)

Adam ran the SQL strip but the trigger error still fires when adding a custom field to a workspace-forked template.

**Action required from Adam (NOT CC):**

1. Reproduce the bug.
2. Open browser devtools → Network tab → find the failing request (likely PATCH or POST to `/api/advance/templates/...` or similar).
3. Copy the full response body. It will contain the Postgres error including `hint`, `detail`, and `where` — that tells us exactly which row violated the trigger.
4. Paste the response body back here.

Without that error body, any fix is a guess. The strip query might have left workspace-fork rows untouched (forks copy fields from platform templates at fork-time; if the fork happened before the strip ran, the fork still has stale contact fields).

---

## Bug 3 — §3 venue picker (NEEDS CLARIFICATION)

Adam's last note said "no address fix". This is ambiguous — could mean:

(a) The false-positive toast is still firing on a successful pick, OR
(b) The address field doesn't fill at all, even when the toast doesn't fire.

**Action required from Adam:** When you reproduce the bug, share:
- Whether the address fills correctly (visually) — yes/no
- Whether a toast fires — yes/no, and what the toast says
- The console log starting with `[VenueAutocomplete] /api/places/details ok:` — paste the full object so we can see what Google returned

Note: I noticed a separate latent bug at `VenueAutocomplete.tsx:217` — `address: formattedAddress ?? ''` passes empty string to the receiver when Google returns no address. The comment two lines up says it should pass null to preserve the existing value, but the code doesn't match the comment. This is unlikely to be the cause if Google IS returning an address (which is the normal case), but worth flagging. Hold off on changing it until we see Adam's console output — the type signature on `VenuePlaceResult.address` is `string` so changing to null would require a type change too.

---

## Reporting expectations

Adam: please run the smoke for Bug 1 first. If field+section reorder both work, we move on. For Bug 2 and Bug 3, paste the diagnostic data above and I'll write the fix from the code, not from speculation.
