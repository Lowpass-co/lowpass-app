# A-1 — Proposed area catalogue. FOR ADAM'S SIGN-OFF. No code until approved.

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
| `operations.personnel.compensation` | Roster rates | yes |
| `operations.personnel.my_schedule` | My schedule | no |
| `operations.rooming` | Rooming | no |
| `operations.files` | Tour files | no |
| `operations.riders` | Riders | no |
| `operations.stage_plot` | Stage plot | no |
| `operations.channel_list` | Channel list | no |
| `operations.payroll` | Payroll | yes |
| `operations.labor` † | Labor calls | no |
| `operations.hire` † | Hire / sub-rental | no |
| `day` † | Day sheet — the whole day | no |
| `day.schedule` † | Schedule and set times | no |
| `day.venue` † | Venue details | no |
| `day.travel` † | Flights, hotels, ground | no |
| `day.contacts` † | Contacts | yes |
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
| `mobile` † | `/m/*` surfaces | no |

**44 areas, up from 21.**

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

- **`operations.personnel.compensation` is kept but still unwired.**
  `079:38-46` documents an API redaction keyed on it that was never built. The
  brief says wire it or drop it. I propose KEEP, because the area is
  semantically right and phase 4 is where it gets teeth — but it must be
  recorded as knowingly unimplemented, or it keeps looking finished.
- **`/admin/*` has no area at all and I did not give it one.** Those surfaces
  are gated by `requireSiteAdmin`, a different and stronger axis than workspace
  role. Folding site-admin into this model would conflate two things that are
  deliberately separate. **Adam should confirm** that admin stays outside.

## 4. What I have NOT done

A-2 through A-5. The brief stops here and so do I: *"Do not start A-2 before the
catalogue is signed off. Everything downstream references those ids."*

No migration written, no schema, no resolver, no presets, no code touched. The
app is byte-for-byte unchanged by this bank — which is also A-1's acceptance
condition.
