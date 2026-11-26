# Auth smoke tests

> **Last bulk verification**: (pending — design/ux-audit-2026)

Walk these after changes to the signed-out surfaces (login / signup /
password reset). Format defined in `docs/smoke-tests/README.md`.
Prefix: `AUTH`.

## Login + signup unification (UX Audit 2026)

#### AUTH-01 — Login layout + brand colour + input affordances

**Do**: Open `/login`.

**Expect**: Dark globe split layout (brand panel + form). Brand orange
is `#FF4500` (grep confirms zero `#ff5500`). Inputs have visible focus
rings; the password field has a working show/hide toggle.

**Last verified**:

#### AUTH-02 — Signup matches login

**Do**: Open `/signup`.

**Expect**: Same `AuthShell` layout as login (not the old plain card).
Name/email/new-password autocomplete set; password toggle; errors
announce via `aria-live`.

**Last verified**:

#### AUTH-03 — Forgot-password + Google button consistent

**Do**: On `/login`, open the forgot-password form; note the Google
button.

**Expect**: Forgot-password renders through the shared AuthKit fields;
the Google button uses the shared button styling (not bespoke chrome).

**Last verified**:

## Route proxy + CSRF (security audit §M3/§L4 — merged to `main` 2026-06-07)

> The audit's `middleware.ts` was folded into `src/proxy.ts` (Next 16
> renamed middleware→proxy). These verify the merge didn't break auth and
> that the new CSRF layer is live. **Run these first after any deploy.**
>
> **2026-06-07 (Adam, preview)**: AUTH-05/06/07/08 PASS; AUTH-09 not
> hand-testable. AUTH-05 note — the signed-out redirect preserves the
> `?artist_id&tour_id` query params rather than landing on a bare `/login`.
> Acceptable (keeps return context); revisit only if a clean `/login` is
> wanted.

#### AUTH-05 — Signed-out redirect still works

**Do**: In a fresh/incognito window, open an authenticated page (e.g.
`/artists`).

**Expect**: Redirected to `/login` — the proxy → `updateSession` redirect is
intact after the merge.

**Last verified**:

#### AUTH-06 — Signed-in app loads and saves (same-origin not blocked)

**Do**: Log in; edit a budget line or add a personnel row.

**Expect**: Saves succeed — no `403 "Cross-origin request blocked"`.
Same-origin mutations pass the new CSRF check; API routes still authenticate
normally (the proxy short-circuits `/api/` after the CSRF check, so they
return JSON, not redirects).

**Last verified**:

#### AUTH-07 — Public token routes reachable signed-out

**Do**: In incognito, open a rider-pack share link (`/r/[token]`) or
`/invite/accept`.

**Expect**: Renders for the unauthenticated visitor — NOT bounced to
`/login`. (Public-route allowlist in `updateSession` intact.)

**Last verified**:

#### AUTH-08 — Auth route bounce when signed-in

**Do**: While logged in, visit `/login`.

**Expect**: Redirected to `/dashboard`.

**Last verified**:

#### AUTH-09 — Cross-origin write blocked (code-level; manual optional)

**Do**: Hard to do by hand — a `POST/PUT/PATCH/DELETE` from a foreign
`Origin` header should be rejected. Trust the proxy code unless you can craft
a cross-site request.

**Expect**: `403` JSON `"Cross-origin request blocked"`. Server-to-server
callers that send no `Origin` (Vercel Cron, webhooks) pass through to their
own secret checks (e.g. `CRON_SECRET`).

**Last verified**:

## New accounts (Nov 2026 — needs migration 290)

#### AUTH-10 — A new sign-up lands in its own workspace, with the welcome

**Do**: Paste migration 290. Sign up a brand-new account (new email), confirm from the email.

**Expect**: Lands on `/artists` — "<name>'s Workspace", no artists — and the welcome opens by itself. No reloading. (Before 290 a new account had no workspace membership, couldn't read its own workspace, and `/artists` ⇄ `/login` looped.)

**Last verified**:

#### AUTH-11 — Signed in with no workspace: a message, not a loop

**Do**: (Staging / by hand) delete a test account's `workspace_members` row for its active workspace, then open `/artists`.

**Expect**: "We can't open your workspace" with Try again / Sign out. The page doesn't reload by itself; Sign out goes to `/login`.

**Last verified**:

## Beta blockers (Nov 2026 — needs migration 291)

#### AUTH-12 — Busy elsewhere stays private

**Do**: From a second account in its own workspace, add a contact with the email of someone on one of your tours, then open a tour's Crew page there (the double-booking check runs).

**Expect**: No clash shown from your workspace — the check only looks inside workspaces the viewer belongs to. In your own workspace, a real double-booking across your own tours still shows.

**Last verified**:

#### AUTH-13 — A profile can't be pointed at someone else's workspace

**Do**: Switch workspace with the switcher (should work). Then, as a test account, try to set your profile's workspace to one you're not in (Supabase API / devtools).

**Expect**: The switch works; the forced change is refused ("Not a member of that workspace"). Removing someone from your workspace moves their profile to another workspace they're in (or none).

**Last verified**:

#### AUTH-14 — AI budget ceiling

**Do**: As a workspace admin who isn't a Lowpass site admin: Settings › AI limits → set the monthly budget to $50. Then to $10.

**Expect**: $50 is refused ("needs a Lowpass site admin"); $10 saves. As a site admin, $50 saves.

**Last verified**:

#### AUTH-15 — Shared venues are read-only for workspaces

**Do**: As a workspace admin who isn't a site admin, open Venues → a venue.

**Expect**: "Open", not "Edit"; fields read-only, no Save, a note that venue details are shared. Linked files still show. As a site admin: Edit + Save as before.

**Last verified**:

#### AUTH-16 — Sign-up is by beta code only

**Do**: Site admin → Admin › Beta codes → make a code for an email. Signed out, open `/signup`, enter that email, a password and the code.

**Expect**: Account made and signed in straight away (no confirmation email), landing on their own new workspace. The code shows "Used" on Admin › Beta codes. The same code again → "already been used". A different email with that code → "made for a different email".

**Last verified**:

#### AUTH-17 — Invite a crew member with tour access

**Do**: Team & roles → Invite → Member, pick their crew record, "Only these tours" → one tour, preset Crew. Open the invite link signed out → Create account (no code asked) → accept.

**Expect**: They land on `/crew` (or straight into the tour if it's their only one): shows, advance info, parking, files — nothing else. The tour menu (full app) shows only Overview, Advance, Riders / Channel list / Stage plot / Gear, Parking, Files. Typing `/operations/<tour>/payroll` shows "Not on your access". People › that crew record now has a login.

**Last verified**:

#### AUTH-18 — A Member's access is enforced by the database (after 293)

**Do**: As the AUTH-17 member, open `/budget/<tour>?tab=budget` directly, then `/operations/<tour>/personnel`.

**Expect**: "Not on your access" page; and Supabase returns no budget rows for them (rows hidden by 293, not just the page). Their own crew row, room and pay lines still show where they appear.

**Last verified**:

#### AUTH-19 — Production assistant: Receipts edit without the budget

**Do**: Give a Member Production preset + Receipts: edit. As them, add a receipt and file it against a line.

**Expect**: Receipt saved; the line's actual updates. The Budget item is not in their menu; Payroll and Income aren't either.

**Last verified**:


#### AUTH-20 — One permission system: Team & roles shows tour access, no tags

**Do**: Settings › Team & roles. Open a Member, then an Admin / Manager. Then open Invite.

**Expect**: Member cards say what they can reach ("All tours · Edit: Advance · View: Production…", or "No tour access yet"); no tag chips, no "Granted:" line, no tag filter. The member panel has Role + Tour access only — no tags editor, no sensitive-grants panel. Invite has no tags field.

**Last verified**:

#### AUTH-21 — A Member's pages follow tour access, not old grants

**Do**: Give a Member Logistics: view on one tour (no Payroll). As them open that tour's Crew page, then Dates & routing (needs Schedule: view). Then give Schedule: view and reload.

**Expect**: Crew shows the roster with NO rate columns and no add / remove / swap. Dates & routing shows "Not on your access" until Schedule is given, then opens read-only (no editing — dates stay admin / manager). Share… on a tour file works only with Files: edit.

**Last verified**:


#### AUTH-22 — Only admins delete crew documents

**Do**: As a Manager, open a crew record in People › Documents and remove a passport scan. Then as an Admin, remove one.

**Expect**: Manager: the scan stays and the panel says "Only admins can delete documents." Admin: it goes.

**Last verified**:


#### AUTH-23 — The Admin chip opens the admin pages

**Do**: As a site admin, click the orange "Admin" chip in the top bar.

**Expect**: `/admin` opens. Non-admins have no chip.

**Last verified**:


#### AUTH-24 — Site admin deletes a user (after 295)

**Do**: Admin › Users → ⋯ → Delete on a test user who has added a flight or a receipt but owns no workspace.

**Expect**: They're gone from the list and can't sign in. The flight / receipt stays on its tour. Before 295 is pasted this fails with "…Has migration 295 been pasted?".

**Last verified**:


#### AUTH-25 — A workspace owner can't be deleted

**Do**: Admin › Users → Delete on a user who owns a workspace (any new sign-up does).

**Expect**: Refused: "<name> owns a workspace (<workspace>). Delete it first — Admin › Workspaces: archive, then delete." Nothing is deleted.

**Last verified**:


#### AUTH-26 — Site admin deletes a workspace: archive, then type its name

**Do**: Admin › Workspaces → ⋯ on a live workspace (no Delete offered) → Archive. Tick "Include archived" → ⋯ → Delete permanently… → type the name wrong, then right.

**Expect**: Delete stays disabled until the name matches exactly. Then the row goes; a toast says how many tours / members and stored files went. Its members still sign in (they land in another workspace they belong to, or on "No workspace"). Then AUTH-25's owner can be deleted.

**Last verified**:


## Known broken

#### AUTH-04 — Login globe not yet deduped onto AuthShell

**Currently**: `/login` still carries its own inline globe `useEffect`
+ post-login zoom overlay rather than reusing `AuthShell`'s globe.
Cosmetically identical; flagged for a dedup pass.

**Tracked in**: design/ux-audit-2026 auth follow-up.

## Retired

(None yet.)

#### AUTH-30 — Tour manager tier (needs migration 298)
Team & roles → Ben → Role: **Tour manager** → Tour access: tick the Aura tour
(any preset). As Ben:
- He sees ONLY Aura (no other tour in the picker / Artists).
- On Aura: Tour settings shows; Details and Dates & routing are editable and
  save (changing the **currency** or **artist** is refused — admin / manager).
- Crew: Add crew, Remove, edit roles all work; app logins stay admin-only.
  Add crew lists only people already on his tours; new people he adds are his.
- People: shows the people on his tours, with passports; nobody else.
- Parking, Advance, Receipts all editable (as before).
- Templates (workspace menu): opens and saves — advance + budget templates,
  rate types. A template change reaches days on HIS tours; other tours' days
  update next time an admin / manager saves it.
- Never: Team & roles, AI Ask, other tours, artist-level riders.
A Read-only member is unchanged (AUTH-21). Invite with role Tour manager +
tours → accepting gives those tours.
