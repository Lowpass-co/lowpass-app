# A-1 — Area catalogue. APPROVED 2026-08-14, with four changes applied.

Signed off in `CC_ACCESS_A1_SIGNOFF.md` subject to changes 1–4, which are
applied below. **40 areas.** A-2 through A-5 are unblocked.

> **Count correction.** The signed-off version claimed "44 areas, up from 21".
> That number was asserted, not counted, and it was wrong — the table held 41.
> After the four changes (−`mobile`, −`operations.payroll`, +`day.notes`) it is
> **40**, verified by parsing the table rather than by arithmetic on a figure I
> had not checked. Recorded rather than quietly fixed: the miscount is the same
> mistake this project keeps finding — a number reported instead of measured —
> and it reached a document that was approved on the strength of it. The
> vocabulary itself is unchanged; only my claim about its size was wrong.

Per `CC_ACCESS_PHASE1.md` §A-1, which stops here by design: everything
downstream references these ids, so a wrong vocabulary is expensive later.

Enumerated from both required sources and reconciled: **78 route surfaces**
(`page.tsx` under `src/app`) and **106 RLS-bearing tables** (distinct tables
named by a `CREATE POLICY` in `database/migrations/`).

---

## 0. Three corrections to the brief, found while confirming it

1. **RLS-bearing tables: I count 106, the brief says 113.** My method is
   `CREATE POLICY … ON <table>`, deduped. It will miss a table whose RLS was
   enabled without a policy in the same file, or whose policies were written in
   a shape my regex does not match. **Neither number should be trusted as
   final** — a `pg_policy` probe against production is the authority, and the
   brief was written from one. Treat 106 as a floor.
2. **Dead catalogue entries: I measure 6 with ZERO references, not 8/4.**
   `artist.contracts`, `artist.tours`, `budget.deal_memos`, `budget.payroll`,
   `home.dashboard`, `operations.personnel.compensation`. Another 7 have exactly
   one reference, which by this project's own rule deserves following rather
   than counting.
3. **`ResourceDef` is `{ id, type, group, label, description, sensitive }`** —
   the brief quotes it as `{ id, label, description, sensitive }`, omitting
   `type` and `group`. Line reference `resources.ts:29-36` is exact. Keeping
   `type`/`group` costs nothing and dropping them would churn 21 rows.

Also worth flagging, unrelated to A-1 but found while checking numbering:
**`261`, `262` and `263` exist BOTH in `database/migrations/` AND at the repo
root, byte-identical.** The root copies are untracked strays. Someone will
eventually paste from the wrong one, or a numbering check will miss them. Not
mine to delete unasked — but they should go.

Migration numbering: highest present is **264**, matching the brief. Next free
is **265** — but re-check immediately before committing, since two agents number
into this space.

---

## 1. The proposal

Hierarchical by dotted prefix; a grant on a prefix implies its children.
**Existing ids preserved wherever they still fit** — renaming one silently
orphans its `permission_grants` rows.

`†` = new. `~` = existing id, scope or label changed. Everything else is
existing and unchanged.

### workspace scope

| area | label | sensitive |
|---|---|---|
| `workspace.members` † | Members and invitations | yes |
| `workspace.billing` † | Billing and subscription | yes |
| `workspace.ai_spend` † | AI usage limits and spend | yes |
| `workspace.settings` † | Workspace settings | no |
| `workspace.venues` † | Venue directory | no |
| `workspace.personnel` † | Workspace personnel pool | yes |
| `workspace.equipment` † | Equipment, rental and assets | no |
| `workspace.audit` † | Audit log | yes |

### artist scope

| area | label | sensitive |
|---|---|---|
| `artist.home` | Artist overview | no |
| `artist.tours` | Tours list | no |
| `artist.contracts` | Contracts | yes |
| `artist.library` † | Files, riders, stage plots, channel lists | no |

### tour scope

| area | label | sensitive |
|---|---|---|
| `operations.routing` | Routing | no |
| `operations.personnel` | Tour roster | no |
| `operations.personnel.compensation` | Roster rates — the READ side of payroll | yes |
| `operations.personnel.my_schedule` | My schedule | no |
| `operations.rooming` | Rooming | no |
| `operations.files` | Tour files | no |
| `operations.riders` | Riders | no |
| `operations.stage_plot` | Stage plot | no |
| `operations.channel_list` | Channel list | no |
| `operations.labor` † | Labor calls | no |
| `operations.hire` † | Hire / sub-rental | no |
| `day` † | Day sheet — the whole day | no |
| `day.schedule` † | Schedule and set times | no |
| `day.venue` † | Venue details | no |
| `day.travel` † | Flights, hotels, ground | no |
| `day.contacts` † | Contacts | yes |
| `day.notes` † | Internal operator notes | yes |
| `advance` | Advance | no |
| `budget` † | Budget — the whole product | yes |
| `budget.line_items` | Budget lines | yes |
| `budget.receipts` | Receipts | yes |
| `budget.summary` | Summary and reports | yes |
| `budget.income` † | Income and actuals | yes |
| `budget.settlement` † | Settlement | yes |
| `budget.deal_memos` | Deal memos | yes |
| `budget.commissions` | Commissions | yes |
| `budget.payroll` | Payroll cost lines | yes |

### cross-cutting

| area | label | sensitive |
|---|---|---|
| `personal_data` † | Other members' personal data | yes |

**40 areas, up from 21.**

### Change 1 — `day.pnl` is NOT an area. It gates on `budget.summary`.

`slices.ts` defines seven day blocks and the proposal originally mapped four.
`day.notes` is now an area, because Adam's ruling (`slices.ts:18-22` — the
internal operator note is in tm / production / accountant slices ONLY) is
**inexpressible without it**, and Band + Crew would otherwise inherit notes from
any `day` prefix grant.

`day.pnl` is the other way. **It is not a grantable area; the day sheet's money
chip resolves against `budget.summary`.** The sign-off asked for an argument
rather than an assumption, so:

A separate `day.pnl` area makes it POSSIBLE to grant money to Crew by accident —
someone grants `day.pnl` while denying `budget.summary`, and the exact thing
Adam ruled must never happen becomes one checkbox away. Resolving against
`budget.summary` makes that state **unrepresentable**: you cannot see the day
P&L unless you can see the budget summary, because they are the same fact.

The cost the sign-off names is real — day rendering now depends on a budget
area. But that coupling **mirrors the domain**: the day P&L *is* budget data
displayed on the day sheet. Coupling that tracks reality is not the kind that
hurts; the kind that hurts is two independent switches over one truth.

Recorded here rather than left implicit, because a reader auditing *"what can
Crew see on the day sheet"* must be able to find out that the money chip is
budget-gated without reading the renderer.

### Change 2 — `mobile` dropped

`/m/*` is a rendering surface, not a permission. Making it grantable creates
exactly one bug: a user with Day access but no `mobile` grant gets a 403 on
their phone that nobody can explain. The `/m/*` routes gate on the same areas
as their desktop equivalents. **Access is decided by what the data is, never by
which device asked.**

### Change 3 — ONE payroll area, and it is `budget.payroll`

`operations.payroll` is REMOVED. The payroll product lives in Budget.

`operations.personnel.compensation` is the **read** side: viewing someone's day
rate on the roster reads compensation data, while *editing* payroll is
`budget.payroll`. Two different acts on the same figures, which is what two
areas are for.

This changes its status. §3 below previously recorded it as "semantically right
but knowingly unimplemented". Under this ruling it has a definite job, so it is
**scheduled for phase 4**, not a permanent hole. Its enforcement is still
pending — `079:38-46` documents an API redaction that was never built — but it
is owned.

### Change 4 — `/admin/*` has NO area, deliberately

Recorded here and not only in a handover doc, because a whole route tree with no
area reads as an oversight unless the file says otherwise.

`requireSiteAdmin` is **platform-operator identity, not a role inside anyone's
workspace.** Giving it an area would make site-admin something a workspace could
conceivably grant itself. It stays outside this model on purpose.

### Noted asymmetry — artist vs tour scope

`artist.library` bundles riders, stage plots and channel lists into one area
while tour scope splits them (`operations.riders`, `operations.stage_plot`,
`operations.channel_list`). **This is deliberate:** artist-scope items are
templates, tour-scope items are instances. Recorded so it does not read as an
omission.

## 2. The Driver decision the brief asked me to argue

**Split the Day into sub-areas.** Do not give Driver a built-in override.

Adam wants Driver to see schedule, venue, hotels and flights but **not
contacts**. Expressing that as a built-in override makes Driver the only preset
whose meaning is not readable from the preset table — you would have to read
code to know what a Driver can see, and the whole point of
`access_role_presets` is that the answer lives in one queryable place.

Sub-areas cost four rows in the catalogue and make the exclusion **visible**:
Driver gets `day.schedule`, `day.venue`, `day.travel` and simply does not appear
against `day.contacts`. Money is already expressed by absence in this design;
contacts should be too. It also gives Band + Crew somewhere to land later
without another special case.

The cost is real — `day` as a whole must still work as a prefix for Tour Manager
and Production, which longest-prefix-first already handles.

## 3. Coverage gaps I could NOT close, and why

Both are honest holes, not oversights:

**Both were resolved by the sign-off — see changes 3 and 4 above.**
`operations.personnel.compensation` is now the read side of payroll and is
scheduled for phase 4 rather than being a permanent hole; `/admin/*` stays
outside the model, confirmed, with the reasoning recorded in this file.

## 4. What I have NOT done

A-2 through A-5. The brief stops here and so do I: *"Do not start A-2 before the
catalogue is signed off. Everything downstream references those ids."*

No migration written, no schema, no resolver, no presets, no code touched. The
app is byte-for-byte unchanged by this bank — which is also A-1's acceptance
condition.
