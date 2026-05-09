# CC Sprint 9 — Phase 14 (final wrap-up bug fixes)

Adam ran a comprehensive smoke against the Sprint 9 merged work and surfaced a list of bugs + UX inconsistencies. Phase 14 closes them all in one commit so Sprint 9 can merge to main tonight. Items that are too big for a wrap-up phase are logged under "Deferred to Sprint 10" at the bottom — those become the start of the next sprint.

**Single commit at end. Don't merge to main — Adam smokes one more time + merges himself.**

---

## Hard rules

1. No new dependencies.
2. Lint baseline 75/120. Strict hold.
3. Typecheck zero. Build via `next build --webpack`.
4. Verify before claiming. Quote post-fix file:line in the report.
5. Use existing primitives (`<SlideOver>`, `<DeleteConfirmationModal>`, `<DataTable>`, `toTitleCase`, etc.).
6. Project root is `/Users/lowpass/Documents/lowpass-app` going forward — Drive copy is being deleted. All edits + git operations target Documents.
7. Halt criteria: anything that requires Sprint 10's User Area reframe (logged below) — STOP and report rather than half-implementing.

---

## 14.1 — Status column always says "OK" (smoke 13bg4)

`/personnel` grid — every row's Status column shows "OK" pill. The column is currently a wasted field.

**Action:** Read `src/components/personnel/PersonnelLibraryClient.tsx` — find the Status column renderer. Wire the cell value to the row's actual computed state. Use the same per-row status the `<CompletenessRing>` consumes:

- Status pill = "OK" when completeness ≥ 70% AND no expiring docs (passport ≤180 days, visa expired)
- Status pill = "Action required" when completeness < 70% OR any expiring doc
- Optional: split "Action required" into specific reasons (e.g. "Passport expiring", "Profile incomplete") if the row gives one dominant cause

If the column adds no value beyond what the ring shows, drop it entirely — don't ship a column where every row shows the same value.

---

## 14.2 — Lift bugs on manually-added v2 sections (smoke 13a6, 13DL1, 13DL2, 13DL3)

`PersonnelDetailSlideOver` lift logic populates v2 array sections (emergency_contacts, frequent_flier, dietary, merch_sizes) from legacy single-field data when v2 array is empty. **But** the lift only fires when v2 array sections already exist with at least one entry. If the user clicks `[+ Add emergency contact]` (the FIRST one), the new entry should pre-fill from `personnel.extended_profile.emergency_contact.*` (legacy single).

**Action:** Read `src/components/personnel/PersonnelDetailSlideOver.tsx`. Find the `[+ Add emergency contact]`, `[+ Add airline]`, `[+ Add dietary requirement]`, `[+ Add size]` handlers. When the user clicks one and the v2 array is empty, populate the FIRST entry with values lifted from the matching legacy field, NOT a blank entry.

Specific lifts:
- `[+ Add emergency contact]` first click → entry { name: legacy.name, relationship: legacy.relationship, phone: legacy.phone, email: legacy.email }
- `[+ Add airline]` first click → entry { airline: legacy.frequent_flyer_1.airline, member_number: legacy.frequent_flyer_1.member, tier: '' } (and create entries 2-4 if their legacy fields exist)
- `[+ Add dietary requirement]` first click → entry { type: 'custom', notes: legacy.dietary_needs }
- `[+ Add size]` first click → entry derived from legacy.merch_size + legacy.clothing_sizes if set

If legacy fields are empty, the new entry is blank as today. The lift is opt-in via the user clicking "Add" — they're given a populated starting point rather than a blank form.

---

## 14.3 — Invite link broken (MU-Invite smoke)

Adam clicked an invite URL in incognito and was sent to the login page rather than an accept-invite landing. The accept flow is unusable.

**Action:** Read `src/app/(app)/invite/accept/page.tsx` (the magic-link landing per Sprint 9 §3) and `src/app/api/workspaces/invite/accept/route.ts` (the RPC caller). Trace what happens when a non-authenticated user hits `/invite/accept?token=xyz`:

1. Currently — the (app) route group requires auth, so it redirects to `/login`. After login the user lands on home, NOT back at the invite token. Token is lost.
2. Need — `/invite/accept` (or a new public route) accepts the token regardless of auth state. If user has no account, prompt them to sign up with the invited_email pre-filled. If user has an account, prompt them to log in (with a continue-to-accept URL preserving the token).

Implementation:
- Move `/invite/accept/page.tsx` OUT of the `(app)` route group so it's not auth-gated. Or add a separate `/i/[token]/page.tsx` public route that bridges auth.
- The page reads the token, validates via the RPC (which requires auth — so do this AFTER login).
- If no auth: show a clear panel "You've been invited to {workspace_name}. [Sign in to accept] or [Create account to accept]". Both buttons preserve the token in the redirect URL.
- After auth, the same page calls `accept_workspace_invite(token)` and routes to the workspace.

Non-trivial. If this turns into a refactor that touches auth routing broadly, STOP and report — log to deferred and we ship it as a Sprint 10 §1 sub-task instead.

---

## 14.4 — Generic Safari delete confirm (smoke 13bg5)

`/personnel` row delete uses `window.confirm`. Should use the existing `<DeleteConfirmationModal>` with the shake animation.

**Action:** Read `src/components/personnel/PersonnelLibraryClient.tsx` for the delete handler. Replace `window.confirm` with `<DeleteConfirmationModal>` from `@/components/ui` (or wherever it lives — grep for it). Wire the `onConfirm` to the existing delete API call.

Same fix anywhere else in /personnel where `window.confirm` is used (bulk delete confirm, etc.).

---

## 14.5 — File upload triggers page refresh (smoke RF6)

`PersonnelDetailSlideOver` Files section: uploading a file closes the slide-over and reloads the page; file appears after 2-3 sec.

**Action:** Read `src/components/personnel/PersonnelFilesSection.tsx` (or wherever the Files section's upload handler lives). The upload probably calls `router.refresh()` or `router.push()` after success. Replace with:
- POST to `/api/personnel/[id]/documents`
- On success, append the returned file metadata to the local `files` state array (no router refresh).
- Slide-over stays open; file appears inline.

If the slide-over has no local state for files (always re-fetches on mount), add the local state.

---

## 14.6 — Frequent flier form alignment (smoke 13A5)

The Tier dropdown is shorter than the Airline / Member# inputs.

**Action:** In `PersonnelDetailSlideOver`, find the frequent-flier row render. The grid uses 3 columns (airline / member# / tier). Force all three to the same height + padding. Wrap inputs in a flex row with `gap` + each child `flex: 1`. The tier dropdown's native height differs from text inputs; explicitly set its `padding` + `height` to match the inputs (use the same token values).

---

## 14.7 — Slide-over close animation (smoke 13DS)

Slide-over closes without animation — disappears instantly. Should mirror open animation (slide out + fade).

**Action:** `src/components/shell/SlideOver.tsx` — the open transition was added in Phase 12. Verify the close transition is also wired. If the component unmounts on close, transitions don't fire — need to:

- Track `isClosing` state
- On close: set `isClosing` true → CSS transition runs (200ms) → setTimeout unmount
- OR use `framer-motion` if already a dep — looks for `<AnimatePresence>` pattern
- OR use Headless UI's Transition component

Check if `framer-motion` is in package.json before adding any new approach. Use what's already there.

---

## 14.8 — Tooltip on completeness ring looks default-browser (smoke 13bG2)

The ring's tooltip uses native `title=""` attribute or similar. Looks like a browser tooltip, not native UI.

**Action:** Replace native tooltip with the app's existing tooltip pattern. Grep for "Tooltip" in `src/components/` — there's likely a `<Tooltip>` primitive already. If not, build a simple one:
- Black/dark background
- Small white text
- Rounded
- Positioned above the ring on hover
- Shows missing-fields list

Apply same pattern anywhere else native tooltips are visible (e.g. file row "delete" hover, etc.) — quick grep for `title=` attributes.

---

## 14.9 — Completeness ring discoverability (smoke 13bG3)

The ring is clickable and opens the slide-over scrolled to the missing section, but users don't know that's clickable.

**Action:** Add a hover state that signals interactivity:
- Cursor: pointer on hover
- Subtle ring scale (1.0 → 1.05) on hover
- Tooltip extends with: "Click to fix"

Optional: also add a small "→" affordance OR the entire row becomes clickable (clicking anywhere in the row except action buttons opens the slide-over). The latter is more discoverable.

---

## 14.10 — Workspace name capitalisation (smoke RA4)

"adam's Workspace" displays in lowercase across all chrome. Should be title-cased ("Adam's Workspace").

**Action:** Apply `toTitleCase()` from `src/lib/text/toTitleCase.ts` to the workspace name display points:
- TopBar (whichever element renders the workspace name)
- ProductHeader (same — workspace name display)
- Workspace switcher dropdown items
- Audit log activity feed actor workspace contexts (if any)
- Anywhere else workspace name appears as display text

Don't mutate stored data (`workspaces.name`). Display-only.

---

## 14.11 — Operations sub-nav disappears on empty placeholder pages (smoke 13C2b)

Visit `/operations/[tourId]/channel-list` (or any other placeholder sub-page that hasn't been built yet) — the OperationsSubNav at the top vanishes. Should always render so user can navigate sideways back to a real page.

**Action:** Read the placeholder pages under `/operations/[tourId]/*`. They probably return early or render a 404-ish component. Wrap each in `<ProductShell>` with `<OperationsSubNav>` mounted regardless of body content. The body can be a "Coming soon" placeholder; sub-nav still shows.

If there's no individual page file for those routes, add minimal placeholder pages that wrap the shell properly.

---

## 14.12 — De-emphasize Conflicts metric on Operations summary (smoke RE2a)

Adam's feedback: Conflicts is a low-frequency concern — only matters at tour kickoff, rarely during a tour. Currently it's one of four prominent summary cards, which over-emphasizes it.

**Action:** Two options, your choice:

(a) Keep the card but hide it when conflict count is 0. With 0 conflicts, the card disappears; remaining 3 cards (Shows / Crew / Pending tasks) reflow to fill width.

(b) Replace the Conflicts card with a more daily-relevant metric. Suggestions: "Last edit Xh ago" (already on the page above), "Today's show" (next show date), "Outstanding tasks" (pending sum from existing `pending_tasks` count), "Days until next show".

Recommend (a) — simpler, preserves the data without the noise. When a conflict actually exists, it surfaces; otherwise, gone.

---

## 14.13 — User pill style consistency between shell-v1 and shell-v2 (smoke RA2)

Adam wants the LARGER user pill (with avatar + full name + ADMIN badge) — currently used on `/settings`, `/personnel`, `/admin` (shell-v1) — to also appear on Operations / Budget / Advance (shell-v2). Currently shell-v2 uses a smaller circular avatar + "AD" initials.

**Action:** This is partial chrome unification. Two paths:

(a) Update `<ProductHeader>` (shell-v2) to use the same user-pill component that shell-v1's `<TopBar>` uses. Just import + drop in.

(b) Add a small enhancement to ProductHeader's avatar that shows full name + ADMIN badge to match shell-v1.

Recommend (a) — same component, same look. Check if `<UserPill>` or similar already exists in `src/components/shell/`. If yes, mount it in ProductHeader. If not, extract the markup from TopBar into a shared component first.

If this gets too big (e.g. requires touching ProductHeader's layout grid), STOP and log to deferred — full chrome unification is Sprint 10 §1.

---

## 14.14 — Visa needs more fields (smoke 13DV)

Visa entries currently have: country / type / valid_from / valid_to / notes. Adam wants:

- Visa number
- Possibly: issuing authority, place of issue, multi-entry vs single-entry flag

**Action:** In `src/lib/personnel/personnel-extended-profile.ts`, extend the visa shape:

```ts
visas?: Array<{
  country: string;
  type: string;
  visa_number?: string;          // new
  issuing_authority?: string;    // new
  multi_entry?: boolean;         // new
  valid_from?: string;
  valid_to?: string;
  photo_path?: string;
  notes?: string;
}>;
```

Then add fields to the visa section in `PersonnelDetailSlideOver`. Order them logically: country → type → number → multi-entry checkbox → issuing authority → dates → notes → upload.

---

## Final commit

Single commit at the end:

```
fix(personnel,operations,ui,invite): Sprint 9 Phase 14 wrap-up bug fixes
```

After commit, push from your sandbox (auth should work — Adam ran `gh auth login` in his terminal earlier and the URL is clean).

Then post the report:
- Files changed (with file:line for load-bearing logic)
- Verify: tsc / lint / build status
- Adam's smoke checklist: which test IDs from Phase 13 smoke are now expected to PASS
- Deferred items confirmed (not added, not removed)

---

## Deferred to Sprint 10 (LOG, do not implement)

These are real items — Adam wants them, but they're too big for a Sprint 9 wrap-up. Sprint 10 §1 starts with these:

### Sprint 10 §1 — User Area reframe (chrome unification + content rework)

**Mental model:** `/settings`, `/personnel`, `/equipment`, `/admin` are functionally a "User / Workspace" area, not "Settings". Reframe accordingly:

- Top header reads "Workspace" (or similar — name to be confirmed in mockup)
- Single unified TopBar component used by ALL routes (shell-v1 + shell-v2). Currently we have two shell systems; Sprint 10 collapses to one or fully harmonizes them.
- Left-rail navigation matching the operations sub-nav style: Personnel, Equipment, Members, Admin, Settings as siblings.
- Tour picker consistent across all pages — Operations-style artist+tour combo picker, not the Settings-style "Select tour" dropdown.
- `/settings` becomes a sub-page (since it only has "promote to admin" — minimal real estate); the rest of "user area" features fill the page.

### Sprint 10 §2 — Personnel grid like Bug Reports + comprehensive profile

- Grid matches Bug Reports chrome exactly: row hover state, status badges, density, filtering UX.
- **Compact list pattern (Adam's reference screenshot)** — name + role on two lines next to a small headshot+status-dot avatar. Group badges (ADMIN / ARTIST / BAND / CREW) with distinct colours. Tighter row height than current.
- Each row shows a small headshot profile photo (not just initials).
- Each row shows group tags (Crew / Band / Admin / Mgr) as colour-coded chips.
- **Swap "Tours" column for "Phone number"** — phone is more useful at a glance.
- **Drop the redundant "Profile incomplete" status pill** — the completeness ring next to it shows the same info. Keep only the ring + a "Connected" / "Disconnected" sync state pill (matches the green-dot-by-avatar pattern in Adam's reference).
- Fix overlap between "last toured" and email columns at narrow viewports.
- Remove "Daysheets-style" labels from copy app-wide — branding should be Lowpass-native.
- Replace form-style legacy passport with v2 multi-of-each as the only path. Add fields: description, birthplace, nationality, blank pages count, etc. (full passport schema).
- **Optional fields = add-as-needed** — basic info (name, email, phone, role) is the default profile. Other fields (passport, visa, freq flier, dietary, merch, emergency contact, etc.) appear only when added via `[+ Add X]`. Empty optional sections don't render.
- **Personnel survey/intake form generator** — admin can generate a public-shareable form link for any personnel record. Form lets the person fill in their own info (passport, contact, dietary, merch sizes, etc.). Submission writes back to that personnel record. Replaces the current Google Forms workflow (`https://docs.google.com/forms/d/e/1FAIpQLScDzlWGwEjr-Bx9dGHfJDVF1BloZFVyFyk1BzhezW4s3NOzLQ/viewform`). Token-gated, single-use or time-bounded.

### Sprint 10 §3 — Stripe billing + workspace creation UI

- "+ Create workspace" entry point (currently hidden v1).
- Stripe billing integration for workspace owners.

### Sprint 10 §3a — Auto-save semantics with cancel-revert

- Personnel detail slide-over (and any other multi-field edit surface) should auto-save changes on field blur or after a debounce, NOT require explicit Save.
- `[Cancel]` button reverts ALL changes made during the session, including auto-saved ones — capture the original state on slide-over open, restore on cancel.
- Pattern applies to: PersonnelDetailSlideOver, EditTourSlideOver, MemberManageSlideOver, anywhere else a multi-field edit form lives.
- Save indicator (small "Saved 2s ago" type label) replaces the explicit Save button or sits alongside as a status.

### Sprint 10 §4 — Email/SMS notification dispatcher

- Reads audit_log rows tagged with `would_email_user_id` and dispatches actual notifications. Sprint 9 wrote the rows; Sprint 10 sends them.

### Sprint 10 §5 — Mobile PWA `/m/*`

- Mobile cuts of crew schedule, manager view, etc.

### Sprint 10 §6 — Other deferrals from earlier sprints

- Per-show personnel assignment grid (refinement #3 from Phase 6)
- Audit log advanced filtering / visualisation
- Rental-inventory route fix per `CC_RENTAL_DENORMALISE.md`
- "No Key Contacts section" investigation (Sprint 8.6 carry-over)
- Spotify search → genre extension
- Image cropping / processing for uploaded files
- Per-personnel `tour_personnel.tags` column

---

## Phase 14 vs Sprint 10 boundary check

If you start a Phase 14 item and discover it requires User Area reframe (i.e. touching the chrome unification), STOP. Log to deferred. Don't half-ship.

Items that should DEFINITELY stay in Phase 14:
- 14.1 (Status column logic)
- 14.2 (lift bugs)
- 14.4 (delete modal)
- 14.5 (file upload UX)
- 14.6 (form alignment)
- 14.7 (close animation)
- 14.8 (tooltip)
- 14.9 (ring affordance)
- 14.10 (workspace name casing)
- 14.11 (sub-nav rendering)
- 14.12 (conflicts card)
- 14.14 (visa fields)

Items that MIGHT cross into Sprint 10:
- 14.3 (invite flow) — if it's a small route refactor, fix; if it touches auth routing broadly, defer.
- 14.13 (user pill consistency) — if it's a quick component swap, fix; if it requires unifying the two shell chromes, defer.
