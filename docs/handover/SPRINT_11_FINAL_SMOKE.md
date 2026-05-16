# Sprint 11 — Final smoke checklist

Run this when you have an uninterrupted hour. Skip §1 entirely (Phase 1 chrome IA is parked, archived on `origin/feat/sprint-11-closeout` for Sprint 12+).

Branch: `feat/sprint-11-closeout-v2`
Commits to test against (in order):
- `657e39e` — Phase 2 (intake form expansion)
- `2e76713` — Phase 3 (notification triggers + migration 090)
- `ebb536a` — Phase 4a (auto-save: PersonnelManage + MemberManage)
- `b0c9dfa` — Phase 4b (auto-save: PersonnelDetailSlideOver — large refactor)
- `f85a1f1` — Phase 4c (auto-save: EditTourSlideOver hybrid + CLAUDE.md docs)
- `b761b6b` — Phase 5 (equipment status pills + filter chips + migration 091)
- TBD       — Phase 6 (polish)

Pre-flight: apply migrations **090** (Phase 3 dedup columns) and **091** (Phase 5 equipment columns) via `npm run db:migrate` (or Supabase SQL Editor). Set `CRON_SECRET` in Vercel env if you haven't yet.

Phase 4 split into 4a / 4b / 4c per the spec's >500 LOC escape hatch — PersonnelDetail alone is ~1900 LOC, EditTour needed the hybrid pattern. Every commit compiles + passes lint + builds independently.

---

## §2 — Personnel intake form expansion (Phase 2)

| ID | Action | PASS criteria |
|---|---|---|
| 11.2.1 | Generate intake link from a personnel detail slide-over → open in incognito | Form renders with all sections: Identity, Contact, Passports, Visas, Emergency contacts, Frequent flier, Dietary, Merch sizes |
| 11.2.2 | Add 2 passport rows, fill both with country/number/expiry, submit | "Thanks" panel. Reopen admin slide-over → v2 passport list shows both entries |
| 11.2.3 | On the form, add 2 emergency contacts, fill name/relationship/phone for both, submit | Both land in admin slide-over's Emergency Contacts section |
| 11.2.4 | Add 2 frequent flier entries (different airlines), submit | Both render in admin slide-over with airline + member# + tier |
| 11.2.5 | Add a visa entry with country / type / valid_from / valid_to / notes / multi_entry, submit | All fields land correctly |
| 11.2.6 | Add 2 dietary entries (vegetarian + custom with notes), submit | Both render correctly |
| 11.2.7 | Add 2 merch sizes (t-shirt M + hoodie L), submit | Both render correctly |
| 11.2.8 | Submit with one emergency contact email malformed | Submit blocks with inline error message |
| 11.2.9 | Submit with allergies free-text | Admin slide-over Health/Medical section shows it (mapped to `extended_profile.health.allergies_medicine`) |
| 11.2.10 | Submit a token that's already been submitted once | "Thanks — already submitted" panel, NOT the form |
| 11.2.11 | Visit a fake/expired token | "This intake link isn't valid" panel |
| 11.2.12 | Form labelling | Title reads "Request Personnel Info Form" or similar (NOT "User info survey") |

---

## §3 — Notification dispatcher triggers (Phase 3)

Requires migration 090 + `CRON_SECRET` set + Resend key in Vercel env. Cron fires every 5 min so allow time after each action.

| ID | Action | PASS criteria |
|---|---|---|
| 11.3.1 | Accept an invite using a different email/account than the inviter | Within 5 min, inviter receives email "X accepted your invite to {workspace}". Second cron pass is a no-op (no duplicate). |
| 11.3.2 | Submit an intake form on a token | Within 5 min, the admin who generated the token (`invited_by_user_id`) receives email "X filled in their intake form" |
| 11.3.3 | Create a `tour_personnel` row that overlaps another non-cancelled assignment for the same person in the same workspace | Within 5 min, the assigning manager receives email naming both tour names + overlap window |
| 11.3.4 | After dispatch, check `personnel_intake_tokens.notification_email_sent_to` in Supabase SQL Editor | Stamped with the recipient's user ID. Row not re-processed on next cron pass. |
| 11.3.5 | Same check on `workspace_invites.notification_email_sent_to` | Stamped after invite_accepted email sends |
| 11.3.6 | Cancel an existing confirmed `tour_personnel` (Sprint 10 trigger — regression check) | Within 5 min, the assigned person (if linked to a user account) receives "Your assignment for {tour} has been cancelled" |

---

## §4 — Auto-save adoption (Phase 4a + 4b)

Wait until both 4a and 4b commits land. Test together.

| ID | Action | PASS criteria |
|---|---|---|
| 11.4.1 | Open PersonnelDetailSlideOver, edit a name field, blur out (click elsewhere) | "Saved 2s ago" status pill appears in footer. Refresh page — change persists. |
| 11.4.2 | Edit multiple fields rapidly | Save status debounces (single PATCH after 600ms idle), not one PATCH per keystroke |
| 11.4.3 | Make changes, click Cancel | Slide-over closes. Reopen → fields reverted to pre-session values (auto-saved changes also reverted via snapshot restore) |
| 11.4.4 | Make changes, network goes offline (devtools throttle), continue editing | Status shows "Save failed — retry". When network returns, retry succeeds |
| 11.4.5 | Repeat 11.4.1–4 on PersonnelManageSlideOver (tour personnel) | Same auto-save + cancel-revert behavior |
| 11.4.6 | Repeat 11.4.1–4 on MemberManageSlideOver | Same |
| 11.4.7 | Open EditTourSlideOver, change name | Auto-saves on blur (safe field) |
| 11.4.8 | Open EditTourSlideOver, change end_date to a date BEFORE existing routing rows | Does NOT auto-save. Shows confirmation modal listing affected routing rows. Explicit Save required to confirm. |
| 11.4.9 | EditTourSlideOver — change name (auto-saves) AND end_date (gated) → Cancel | Name reverts via snapshot. Date field returns to original value. No partial save lingers. |
| 11.4.10 | Save status pill | Reads "Saved Xs ago" with relative time. Updates as time passes. |

---

## §5 — Equipment grid Bug-Reports rework (Phase 5)

Requires migration 091 (equipment.category, equipment.status, equipment.last_used_at columns).

| ID | Action | PASS criteria |
|---|---|---|
| 11.5.1 | Visit `/equipment` | New div-grid (matching personnel grid chrome). Sticky header. Columns: Image / Name / Category / Status / Serial / Last used / actions |
| 11.5.2 | Look at category badges | Audio = blue, Lights = yellow, Backline = orange, Misc = grey (or whatever final palette CC picks) |
| 11.5.3 | Look at status pills | "In storage" / "On tour" / "Out for repair" — colour-coded |
| 11.5.4 | Filter chips above grid | All / Audio / Lights / Backline / Misc / In storage / On tour / Out for repair. Clicking filters the list. |
| 11.5.5 | Click `[⋯]` on a row | Menu shows: View / Assign to tour / Delete |
| 11.5.6 | Edit equipment item, change category | Updates immediately, badge in grid reflects new colour |

---

## §6 — Polish carry-over (Phase 6)

| ID | Action | PASS criteria |
|---|---|---|
| 11.6.1 | Open the InventoryModal (Add or Edit on /equipment) | New "Status" dropdown appears under Category/Serial. Defaults to "Available" on Add; pre-fills the existing row's status on Edit. Saving persists to `rental_inventory.status`. |
| 11.6.2 | Visit `/intake/<token>` for an unsubmitted token | Page heading reads "{workspace name} — Personnel info form" (NOT "User info survey"). Sections render per §2 above. |
| 11.6.3 | Visit a `/intake/<token>` whose `submitted_at` is set | Page heading reads "Thanks — your details are in", body confirms the workspace name received it, NO form rendered. |
| 11.6.4 | Visit a `/intake/<token>` that doesn't exist or has expired | Page heading reads "This personnel info form link isn't valid", explanatory paragraph below. |

---

## Out of scope (Sprint 12+)

Don't smoke these — they're explicitly deferred:

- Phase 1 IA chrome work (parked on `origin/feat/sprint-11-closeout`)
- Stripe billing
- Workspace creation UI
- Mobile PWA
- Per-show personnel assignment grid
- Audit log advanced filtering
- Rental-inventory route fix
- Image cropping / processing
- Spotify search → genre extension
- Artist library nested pages

---

## Smoke summary

After running everything:

- Total tests: ~30 across §2-6
- PASS:
- FAIL:
- N/A (intentional skips):
- Notes / defects:

Failures format: `<TestID> FAIL — <what you saw>` with paste of any console / network errors. PASS by ID alone is fine.

After smoke, decide:
- If green → merge `feat/sprint-11-closeout-v2` → main
- If failures are surface-level → small Phase 6.1 patch then merge
- If failures are structural → halt, escalate to me
