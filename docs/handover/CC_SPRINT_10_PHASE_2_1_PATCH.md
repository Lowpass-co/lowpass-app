# CC Sprint 10 — Phase 2.1 patch (pre-merge bug bash)

Adam smoked Phases 2 + 5 on `feat/sprint-10-ia-and-polish` (post-revert). Seven small items to fix before merging to main. Single commit. ~30 min CC time.

---

## Hard rules

1. Single commit at end. Don't fragment.
2. Lint baseline 75/120, tsc zero, build green.
3. Project root `/Users/lowpass/Documents/lowpass-app`.
4. No new dependencies.
5. Each item is small — if any tempts a refactor, STOP and report.

---

## Items

### 5.1 — Tooltip is white instead of dark (smoke 5.1 FAIL)

**Root cause** (already diagnosed): `src/components/ui/Tooltip.tsx:163` uses `background: 'var(--lp-text-strong, #0a0a0a)'`. The `--lp-text-strong` token isn't defined anywhere in the codebase (verified by grep). The fallback `#0a0a0a` should apply but Adam reports white — likely a CSS var resolution edge case in dark mode where the var "exists but is invalid" triggers a browser quirk.

**Fix:** hardcode the dark color. Replace line 163 with:

```ts
background: '#0a0a0a',
```

Drop the var fallback dance entirely. If we want token-driven later, define `--lp-text-strong` in `globals.css` first then use it.

Also drop the Sprint 10 §5.2 comment block at lines 154-161 since it no longer reflects the implementation. Replace with a one-line comment: `/* Hardcoded dark surface; --lp-text-strong token isn't defined yet. */`

---

### 5.2 — File upload "Bucket not found" (smoke 5.2 FAIL)

**Symptom:** Click [Open] on an uploaded passport scan in personnel detail → JSON response: `{"statusCode":"404","error":"Bucket not found","message":"Bucket not found"}`.

**Diagnosis required.** The bucket `personnel-files` exists (created in migration 027, tightened in 085 to non-public + workspace-scoped RLS). Adam confirmed this earlier. So the 404 must be either:

1. Upload code references a wrong bucket name (e.g. `personnel-documents`, `personnel-uploads`, etc. — anything not `personnel-files`).
2. The signed URL generation is targeting the wrong bucket.
3. Some path component is being interpreted as a bucket name.

**Action:**

1. Read `src/app/api/personnel/[id]/documents/route.ts` and any related upload handlers. Confirm the bucket name passed to Supabase storage operations is exactly `personnel-files`.
2. Read the file-rendering / preview code in `PersonnelDetailSlideOver.tsx` and `PersonnelFilesSection.tsx`. Same check — verify bucket name.
3. If a wrong name is used anywhere, replace with `personnel-files`.
4. If the bucket name is correct everywhere, the issue is signed URL generation — `supabase.storage.from('personnel-files').createSignedUrl(path, 60)`. Verify it's `from('personnel-files')` not `from(...)` with a stale name.

Don't introduce a new bucket. The existing `personnel-files` is the canonical location per migrations 027 + 085.

---

### 5.3 — Drag-and-drop opens file in new tab (smoke 5.3 FAIL)

**Root cause:** Missing `e.preventDefault()` on `onDragOver` (and possibly `onDrop`). Browser default behavior when a file is dropped on a page without a registered drop handler is to open the file in a new tab.

**Fix:** Read `src/components/personnel/UploadDropZone.tsx` (CC's Phase 5 file). Verify:

```tsx
<div
  onDragOver={(e) => { e.preventDefault(); /* + visual state */ }}
  onDragEnter={(e) => { e.preventDefault(); /* + visual state */ }}
  onDrop={(e) => { e.preventDefault(); handleFiles(e.dataTransfer.files); }}
>
```

If `onDragOver` is missing OR doesn't `preventDefault`, the browser falls through. Add it.

Also: the drop zone might be wrapped in a parent element that doesn't propagate the drag events correctly. If `e.preventDefault()` is on the inner element but the outer element receives the drop first, the browser default fires. Test by also adding `onDragOver={(e) => e.preventDefault()}` to the parent wrapper — usually the slide-over body — to catch any stray drops.

---

### 5.4 — Invite link redirects to login (smoke 5.4 FAIL)

**Symptom:** Visit an invite URL in incognito → lands on login page, NOT the InviteAcceptUnauth two-button panel.

**Diagnosis steps:**

1. Verify the latest deploy on Vercel for `feat/sprint-10-ia-and-polish` includes commit `149d190` (Phase 5 — auth callback fix). Check Vercel dashboard's Deployments tab. If the latest deploy is older, force a redeploy.
2. Read `src/app/(app)/invite/accept/page.tsx`. Confirm the unauth branch renders `<InviteAcceptUnauth>` and does NOT call `redirect('/login')` or similar.
3. Check `src/app/(app)/layout.tsx` for any auth-gated middleware or wrapper that redirects unauth users BEFORE the page renders.
4. If the page is correctly handling unauth but the user still lands on login, the route might be intercepted at a higher level — check `middleware.ts` (root) and any nested middleware files.

**Likely fix:** if the (app) route group has implicit auth gating (e.g. via AppShell layout that calls `redirect('/login')` for unauth users), the InviteAcceptUnauth route needs to be moved OUT of (app) — to a public top-level route like `/invite-accept/[token]/page.tsx` or similar. The accept flow is fundamentally public-by-token, not auth-gated.

If a route move is needed, do it. Update the invite URL generation to point at the new public route. Update existing invites in `workspace_invites` table (if any have URL strings stored) with a one-time data migration, OR ensure the URL format is computed from the token on each render so old/new tokens both work.

If route move turns out to be a refactor that takes >30 min, STOP and report — it becomes a Sprint 11 item.

---

### 2.2 — Headshot images render as question marks (smoke 2.2 FAIL)

**Symptom:** Avatar component shows a `?` or broken-image placeholder where the headshot should be. Appears in both the personnel grid and the detail slide-over preview.

**Diagnosis:** Either:
1. Avatar component renders an `<img>` tag with a URL that 404s.
2. The avatar URL field on the personnel record is empty/invalid.
3. The component doesn't handle the missing-URL case and falls through to a broken-image state.

**Fix:** Read `src/components/shell/AccountAvatar.tsx` (or wherever the Avatar component lives — grep for `<Avatar` if needed). Confirm:

- When `photoUrl` is null/empty/undefined → render initials fallback, NOT `<img src="">` or `<img src={undefined}>`.
- When `photoUrl` is set → render `<img>` with proper `onError` handler that swaps to initials if the image fails to load.

Pattern:

```tsx
const [imgFailed, setImgFailed] = useState(false);
if (!photoUrl || imgFailed) return <InitialsAvatar name={name} />;
return <img src={photoUrl} onError={() => setImgFailed(true)} ... />;
```

If the issue is that `personnel.extended_profile.photo_url` (or wherever headshots are stored) hasn't been populated yet for any test data, that's expected behavior — initials should fallback cleanly. The bug is the broken-image state, which is the fallback that needs to work properly.

---

### 2.3 — Groups multi-select editor doesn't auto-save (smoke 2.3)

**Symptom:** In the personnel detail slide-over Groups section, selecting/deselecting group chips requires the explicit Save button to take effect. Adam wants auto-save consistent with the rest of the form.

**Fix:** Read `src/components/personnel/GroupsEditor.tsx`. Wire the `onChange` to fire the server save (PATCH `/api/personnel/[id]`) on each chip toggle, debounced 600ms to batch rapid changes. Status pill ("Saved 2s ago") via the `useAutoSave` primitive from Phase 3 if it's a clean fit, or inline state management if not.

Grid badges should refresh after the save commits. Either:
1. Local state in the grid client updates optimistically on save success.
2. `router.refresh()` after save (heavier but simpler).

Recommend (1) — optimistic update is faster perceptually.

---

### 2.6 — Intake link button label → "Request Personnel Info Form"

**Fix:** Replace the existing button label / modal title / surrounding copy with **"Request Personnel Info Form"** everywhere it appears.

Locations to update (verify by grep — could be more):
- `src/components/personnel/IntakeLinkButton.tsx` — button label
- Any modal title shown when the link is generated
- Any toast / copy-to-clipboard confirmation copy
- The `<title>` and visible heading on the public `/intake/[token]` form page itself, if it currently says "User info survey" or similar — should say "Personnel info form" or "{Workspace name} — personnel info form" so the recipient knows what they're filling in.

Use that exact casing: **Request Personnel Info Form**. No abbreviations.

---

## Final commit

```
fix(personnel,ui,auth): Sprint 10 Phase 2.1 patch — pre-merge bug bash
```

After commit, push. Adam re-smokes the 7 items above. If green, merge to main.

---

## Reporting expectations

Standard format:

```
Phase 2.1 patch done. Commit: <hash>
Files changed: [file:line for each fix]
Verify: tsc zero, lint X/Y, build green
Re-smoke checklist: 5.1, 5.2, 5.3, 5.4, 2.2, 2.3, 2.6
Blockers: [empty if clean; halt-and-report if any item required scope creep]
```

If any item turns into a refactor (e.g. 5.4 invite route move that's >30 min), stop on that item, log it as a Sprint 11 follow-up, ship the rest. Don't block the patch on one item.
