# Smoke — The Day + tour roles (D1)

"The Day" is a per-routing-row surface assembling venue · schedule · hotel ·
flights · contacts · notes · money chip from data we already hold (no new entry
surfaces). Roles slice it **server-side**: the loader only queries the blocks in
the viewer's slice, so out-of-slice data (money, internal notes) is **absent
from the served object**, not CSS-hidden.

Route: `/operations/[tourId]/day/[routingId]`. Loader: `src/lib/day/loadDay.ts`.
Slice contract: `src/lib/roles/slices.ts`. Schema: migration 245.

Format: see [README.md](README.md).

---

#### DAY-01 / DAY-02 / ROLE-01 — loader + slice contract ✅ **automated**
**Run**: `npx tsx src/lib/day/loadDay.test.ts` → `the day: 25 checks passed`.
A fake Supabase feeds fixed rows into `loadDay()` and asserts, per role, which
block **keys** are present on the returned object:
- **DAY-01** — a `tm` viewer gets every block (venue/schedule/hotel/flights/
  contacts/notes/pnl); venue resolves via `resolveVenue()`; the schedule merges
  labor calls + advance time fields and flags an approx call.
- **DAY-02** — an empty day loads with no throw; each in-slice block is null.
- **ROLE-01** (headline) — a `crew` viewer's object has **no `notes` key and no
  `pnl` key**, and the internal note text appears **nowhere** in the serialized
  object. `driver` also omits contacts; `accountant` keeps notes + money but not
  the hotel/flights logistics. Unknown roles fail closed to the crew slice.

**Live** (Cowork walks production): on the day timeline (`/operations/[tourId]/day`),
expand a day → **Open day sheet →** opens `/operations/[tourId]/day/[routingId]`.
A workspace admin/manager sees all blocks incl. the Day P&L chip; the Flights
block is titled "Flights" (there is no ground-transport model, so the block is
scoped by name, not incomplete). The Notes block shows the internal routing note
for tm/production/accountant only.

#### DAY-05 — Contacts = the show's people, not the roster ✅ **automated**
Covered by the DAY-01 harness (`npx tsx src/lib/day/loadDay.test.ts`, 35 checks):
the Day's contacts come from the **advance** venue contacts + the show's
**deal-memo promoter** — the tour roster (`tour_personnel`) is present in the
fixture but **never** appears on the Day. Empty state on the live surface invites
"…they land here from the advance →" linking to that show's advance (per-day view
only; the crew token view shows no link).

#### DAY-03 — Day Sheet PDF composer ✅ **automated**
**Run**: `npx tsx src/lib/export/daysheet-pdf.test.ts` → `day sheet: 22 checks passed`.
Asserts the audience-template presets + body builder: **Standard** prints every
section incl. Notes; **Crew** drops the internal note; **Driver** uses big type +
drops the contacts card; **Compact** drops hotel/flights; and **money NEVER
prints** on any template (no currency, no P&L in the body).

**Live** (Cowork walks production): on the Day surface, **Day sheet…**
(`[data-testid="daysheet-open-composer"]`) opens a modal — pick a template
(`daysheet-template-*`), toggle sections (`daysheet-section-*`), the preview
re-renders, **Download PDF** (`daysheet-download-pdf`) streams the branded sheet
through the shared export shell (`/api/day/[routingId]/export/{preview,pdf}`).

#### ROLE-01 (token) / ROLE-03 / DAY-04 — tokenized links + /m/today ✅ **automated core**
**Run**: `npx tsx src/lib/roles/token.test.ts` → `role token: 12 checks passed`.
Asserts the token grammar: a valid link resolves to `{role, tourId, workspaceId}`
(which drives loadDay's slice — a **crew** token → money/notes absent per the
DAY-01 harness); **revoked / expired / missing** tokens resolve to a reason so the
public page 404s (**ROLE-03**); an unknown role value fails closed to crew; and
the today/next/last day-picker.

**Live** (Cowork walks production): on the day index (`/operations/[tourId]/day`),
the **Roles & day links** panel (admin/manager only) assigns a roster person a role
(`role-person`/`role-role`/`role-assign`), then **Generate link** (`role-mint-link`)
→ **Copy link** (`role-copy-link`) yields `/m/day/[token]`. Open it (logged out /
incognito) → the role-scoped mobile Day; **ROLE-01** = a crew link's served HTML
carries **no money and no internal note** (assert absent, not `display:none`).
**Revoke** (`role-revoke-link`) → the link 404s (**ROLE-03**). **DAY-04**:
`/m/today` routes the authenticated viewer into `/operations/[tourId]/day/[routingId]`
(role-resolved server-side) for today/next/last.

#### ROLE-02 — View-as ✅ **automated core**
Covered by the DAY-01 harness (`npx tsx src/lib/day/loadDay.test.ts`, now 30
checks): `resolveEffectiveRole('tm','driver',true)` → driver, and loadDay through
that role yields the **same block keys** as the driver's own load (money + notes
absent). A non-admin `?viewAs` override is **ignored** (no escalation); an invalid
role is ignored.

**Live** (Cowork walks production): on the Day surface, the bottom-right View-as
FAB (`viewas-fab`, admin/manager only) lists the 7 roles; picking **Driver**
(`viewas-driver`) sets `?viewAs=driver` and the SERVER re-renders through the
driver slice — byte-for-byte the driver token view (money/notes absent from the
HTML). The orange **Viewing as Driver** banner + **Exit** (`viewas-exit`) clear it.
It is server-checked: `?viewAs` is honoured only for admin/manager.

> Verification note: the slice is proven at the **loader** level (money + notes
> are absent object keys), which is the enforcement layer — not the render. A
> crew view cannot leak money/notes even if a component tried to show them,
> because the data was never fetched.
