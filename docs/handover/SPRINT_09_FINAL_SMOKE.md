# Sprint 9 — final smoke checklist

Run these in one sitting after 13.C and 13.D land. Order: re-tests of previous fails first (quick gut-check that fixes held), then new functionality.

Apply migrations **087** before starting (and any that 13.C / 13.D add).

---

## Section 1 — Re-tests of previous FAIL / concerns

These were broken or sub-par in the earlier smoke. Confirm they're now PASS.

### Chrome regressions (now fixed via 13.A.2 + 13.A.3)

| Test | Action | PASS criteria |
|---|---|---|
| R-A1 | Visit `/settings`, `/personnel`, `/admin`, `/operations/[tourId]`, `/artists/[id]` | Single TopBar on every page. NO upper "adam's Workspace · Tour" bar above. |
| R-A2 | Look at chrome on `/settings` vs `/operations/[tourId]/routing` | Visually consistent — no "settings still has old chrome" feel. |
| R-A4 | TopBar on every page | "ADMIN" pill visible (between Search and avatar) on all pages, not just Settings. User name displayed next to avatar. |

### Operations summary regressions (now fixed via 13.A.7 / 13.A.8 / 13.A.9)

| Test | Action | PASS criteria |
|---|---|---|
| R-E2a | Operations summary "Conflicts" card | Shows correct count matching what /personnel filtered by conflicts displays. NOT 0 when there are conflicts. |
| R-E2b | All four summary cards | Each has explicit title ("Shows", "Crew", "Conflicts", "Pending tasks"), not just an icon. |
| R-E5 | Extend tour, save | Header dates update without hard refresh. |

### Personnel page regressions (now fixed via 13.A.5 / 13.A.6 / 13.A.10–13)

| Test | Action | PASS criteria |
|---|---|---|
| R-F1a | Visit `/personnel` | Single TopBar. Grid styled like Bug Reports. |
| R-F2 | Open Manage personnel slide-over | Date inputs have visible "Start date" / "End date" labels. |
| R-F3 | Click `+ Add new` on `/personnel` | Slide-over opens. NO "Person not found" toast. NO blank placeholder row. |
| R-F6 | Open detail slide-over | Files section visible with upload area. Upload a small PDF — appears in list with size + date. |
| R-F7a | Import a CSV with name / email / phone columns | All fields populate, not just name. NO "Person not found" errors. |
| R-F7b | Select 2+ rows on `/personnel` | "Delete N selected" button appears in selection bar. Click → confirm → rows delete. |

### Site admin regressions (now fixed via 13.A.1 + 13.A.4)

| Test | Action | PASS criteria |
|---|---|---|
| R-G3a | Look at TopBar as site admin | "Admin" link visible in nav strip, between Settings and the user pill area. |
| R-G3b | Click Admin → /admin/users | Users table loads. NO "column reference id is ambiguous" error. |
| R-G5 | Click Workspaces tab | Workspaces table loads. NO column-ambiguous error. |

---

## Section 2 — New 13.A functionality (12 items not yet smoked)

| Test | Action | PASS criteria |
|---|---|---|
| 13.A.1 | Visit `/admin/users` | List of users renders. |
| 13.A.2 | Visit `/personnel` then `/settings` | Single TopBar on both, identical chrome. |
| 13.A.3 | Look at TopBar | "ADMIN" pill is between Search box and avatar — outside the user pill button (NOT inside it). |
| 13.A.4 | Look at TopBar nav as site admin | "Admin" link visible, gets orange underline when on `/admin/*`. Non-site-admins don't see it (test if you have a non-admin account). |
| 13.A.5 | `/personnel` → `+ Add new` | Slide-over opens with blank fields. No errors. Save creates the row. |
| 13.A.6 | Click any existing row on `/personnel` | Detail slide-over opens directly with that person's data. |
| 13.A.7 | Operations summary card "Conflicts" | Count matches /personnel conflicts filter. |
| 13.A.8 | Operations summary card titles | "Shows" / "Crew" / "Conflicts" / "Pending tasks" visible above the metric. |
| 13.A.9 | Extend tour, save | Header dates update without F5. |
| 13.A.10 | `/personnel` filter chips | All / Conflicts / Issues / Recently updated / Untouched. Each shows count. Click filters list. |
| 13.A.11 | Manage personnel date inputs | "Start date" + "End date" labels visible above each input, semibold. |
| 13.A.12 | Select 2+ rows on `/personnel` | "Delete N selected" button appears. Confirms. Deletes. |
| 13.A.13 | Import a CSV with multiple columns | All fields populate per row. |

---

## Section 3 — New 13.B functionality (7 items not yet smoked)

| Test | Action | PASS criteria |
|---|---|---|
| 13.B.G1 | Look at `/personnel` grid | Rows have small ring/donut at start showing percentage. Red < 30%, amber 30–70%, green > 70%. |
| 13.B.G2 | Hover the ring | Tooltip lists specific missing fields. |
| 13.B.G3 | Click the ring | Detail slide-over opens, scrolled to first missing section. |
| 13.B.G4 | Look at grid columns | "Status" column with coloured pill ("Action required" with overflow count, or neutral "OK"). Trailing `[⋯]` kebab column. |
| 13.B.G5 | Click `[⋯]` on a row | Menu shows: Open profile / Assign to tour / Delete. |
| 13.B.D1 | Open detail slide-over | Sections collapsed except Identity (PERSONAL + CONTACT). Pay section locked for non-admin. |
| 13.B.C1 | Operations summary header | ConnectionIndicator pill visible. Test offline state by turning off wifi for 2 sec → goes to Offline. Wifi back → returns to Live. |

---

## Section 4 — New 13.C functionality

| Test | Action | PASS criteria |
|---|---|---|
| 13.C.1a | Operations summary → click `[Edit tour]` | Slide-over opens with name + start_date + end_date + currency + continent prefilled. |
| 13.C.1b | Edit tour → change end date by 7 days → Save | TourHeader updates immediately (no hard refresh). |
| 13.C.1c | Edit tour → shrink end date past existing routing rows | Confirm modal warns about N rows outside new window. |
| 13.C.1d | Operations summary | NO `[Extend tour]` button (folded into Edit tour). |
| 13.C.2a | Operations sub-nav under TourHeader | First entry is "Summary". Click — lands on `/operations/[tourId]` summary page. |
| 13.C.2b | Click through Personnel / Routing / Channel List etc. then back to Summary | Active sub-nav entry tracks current page. |

---

## Section 5 — New 13.D functionality (multi-of-each UI flows)

| Test | Action | PASS criteria |
|---|---|---|
| 13.D.E | Detail slide-over → scroll to bottom | Six new sections visible: Emergency contacts, Passports (v2), Frequent flier, Visas, Dietary, Merch sizes. |
| 13.D.P | Travel section → click `[+ Add passport]` | New passport entry appears with country / number / given_names / surname / date_of_issue / date_of_expiry / place_of_birth fields. |
| 13.D.F | Travel section → `[+ Add airline]` | Frequent flier entry with airline / member_number / tier dropdown (basic/silver/gold/platinum). |
| 13.D.EC | Contact section → `[+ Add emergency contact]` | Entry with name / relationship / phone / email. |
| 13.D.V | Travel section → `[+ Add visa]` | Entry with country / type / valid_from / valid_to / notes. |
| 13.D.D | Personal section → `[+ Add dietary requirement]` | Entry with type (vegetarian / vegan / etc.) + notes textarea. |
| 13.D.M | Personal section → `[+ Add size]` | Entry with garment dropdown + size text. |
| 13.D.R | Click Remove on any multi entry | Entry disappears. |
| 13.D.S | Save with several multi entries populated | All persist. Reload slide-over — same data shown. |
| 13.D.L1 | Open a personnel row with legacy single `emergency_contact` data | The v2 Emergency contacts section is pre-populated from legacy data (lift worked). |
| 13.D.L2 | Open a personnel row with legacy `frequent_flyer_1`–`frequent_flyer_4` fields | The v2 Frequent flier section is pre-populated. |
| 13.D.L3 | Open a personnel row with legacy `dietary_needs` text | The v2 Dietary section is pre-populated. |
| 13.D.L4 | Save a row with EMPTY v2 lists but legacy data | Legacy fields preserved (not cleared). |
| 13.D.C1 | Detail slide-over → look for "Important / emergency" section | Renamed "Health & medical". emergency_contact + dietary fields gone (only in v2 sections now). |
| 13.D.C2 | Detail slide-over → look for "Merch etc" section | Renamed "Food & drink preferences". clothing_sizes + merch_size gone. Coffee/pizza fields stay. |
| 13.D.C3 | Detail slide-over → Transport section | frequent_flyer_N inputs gone. home_airport + TSA + aisle/window stay. |
| 13.D.C4 | Detail slide-over → "Passport (form-style legacy fields)" | Visa notes textarea gone. Single passport fields stay (form-style). |

---

## Section 6 — Multi-user / "needs another account" smokes

These genuinely need a second user. Skip until you have a non-admin account ready (e.g. when you onboard your first real teammate). Don't try to fake them with hacks.

| Test | Setup | What to verify |
|---|---|---|
| MU-Invite | Invite someone to your workspace via /settings/members | They get an invite link. Open it in incognito, accept. Their row appears as Active in members list. |
| MU-Read-only | Make the invited user role=readonly with no grants | They see no data on /operations/[tourId]/* / /budget/* / /advance/*. |
| MU-Crew | Give them 'crew' tag | They see /operations/[tourId]/personnel filtered to their own crew schedule (read-only view). |
| MU-Permission grant | Grant readonly user `budget.receipts read` | They can see receipts but not line items. |
| MU-Site-admin gate | Try to access /admin as the readonly user | 403 panel. |
| MU-Real-time | Open Routing in tab1 (admin), tab2 (collaborator), edit in tab1 | Tab2 updates within 2 sec. |
| MU-Conflict | Assign same person to two tours with overlapping dates across two workspaces | Conflict banner shows on both tours. |

---

## Failure reporting

Per failed test:

```
<TestID> FAIL — <what you saw>
   Console: <relevant errors if any>
   Network: <failed request status + body if any>
```

Skip with `<TestID> SKIP — <reason>`. PASS by ID only is fine.

Report all results in one batch at the end of your smoke session — don't paste per-test as you go.
