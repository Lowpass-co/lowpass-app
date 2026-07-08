# CC_ADVANCE_DECOMP_MAP — Advance decomposition (P3) pre-work

> Read-only map produced BEFORE the B1 extraction cut. Nothing in
> `AdvanceSectionBuilder.tsx` was edited to produce this. It exists so the B1
> cut can be executed mechanically in a dedicated, verifiable window without
> re-deriving the monolith's structure.
>
> Line numbers are against `src/components/advance/AdvanceSectionBuilder.tsx`
> at origin/main `ebc795d` (6,057 lines). Treat them as ±a few lines once the
> cut starts moving code.

---

## 1. Mount points (blast radius — 8 importers)

`AdvanceSectionBuilder` (and its exported helpers/types) is imported by:

| Importer | Uses |
|---|---|
| `src/app/(app)/advance/[tourId]/[routingId]/page.tsx` | mounts the builder (the show page) |
| `src/components/advance/AdvanceBuilderShellClient.tsx` | three-pane Variant-parity shell (renders builder with `wrappedInShell`) |
| `src/components/advance/AdvanceSectionLibrary.tsx` | left library column |
| `src/components/advance/AdvanceFieldPropertiesPanel.tsx` | inspector panel |
| `src/components/advance/SectionDropZone.tsx` | DnD drop target |
| `src/components/advance/FieldTypeIcon.tsx` | field-type icon |
| `src/components/advance/AdvanceSectionBuilderDynamic.tsx` | `next/dynamic` wrapper |
| `src/components/rider-pack/RiderSectionBuilder.tsx` | **rider-packs reuse builder pieces** — DO NOT break |

**Rule for the cut:** keep the exported type/helper surface (`ContactRow`,
`AdvanceDocument`, `AdvanceFlag`, `FlightEntry`, field/section types, icon maps)
importable from a stable module path, or these 8 all break. Prefer moving them
to `advance/shared/` and re-exporting from the old path during B1.

---

## 2. The SETUP / FILL seam + state model

`AdvanceSectionBuilder` (402–615) is the shell. It owns ALL top-level state and
picks the surface:

```
line 424  isBuilderMode = searchParams.get('mode') === 'edit'
line 426  data: PageData        (routing + advance + tour)   ← fetched 442–453
line 427  allDates              ← fetched 455–462  (day-strip navigator)
line 430  setupMode             (local toggle)
line 431  saving
line 432  autosaveStatus        ('idle'|'saving'|'saved'|'error')
line 433  conflictWarning
line 464  hasSections = data.advance.sections.length > 0
line 468  showSetup = isBuilderMode || setupMode || !hasSections   ← THE SEAM
```

- `showSetup === true`  → **`SetupMode`** (528–544)  = **BUILD** surface.
- `showSetup === false` → **`FillMode`** (546–…)     = **ADVANCE** (fill) surface.
- `<Header>` (659) sits above both; `showSaveButton = !showSetup && !!advance`.

`data` is loaded once (442) from `GET /api/tours/[id]/advance/[routingId]` and
threaded down as props. **This is the shared state module to extract** — a
`useAdvanceData(tourId, routingId)` hook (data + allDates + load + save
orchestration + autosaveStatus/conflict) that all three route surfaces consume.

---

## 3. Old → new module map (with line ranges)

| Surface / bucket | Monolith lines | Approx size | New home |
|---|---|---|---|
| **shared** — types (`FieldDef`/`SectionDef` 236–254, `ContactRow` 272, `AdvanceDocument` 284, `AdvanceFlag` 345, `PageData` 368, `AdvanceData`/`SectionStatuses` 342–343), constants (`FIELD_TYPE_OPTIONS` **176**, `FIELD_TYPE_ICONS` 161, `ICON_MAP` 100, `SECTION_CONTACT_ROLES` 305, `CONTACT_ROLES` 320), helpers (`slugify` 191, `FieldTypeIcon` 198, `SectionIcon` 151, `setDragGhost` 225, `sortFieldsContactsFirst` 255, `relativeTime` 85), `AdvanceDropdownZProvider` 392 | 85–401 | `advance/shared/` |
| **shell** — `AdvanceSectionBuilder` (state + seam + `Header`) | 402–734 | ~330 | `advance/AdvanceShell` + `useAdvanceData` |
| day-strip navigator `AdvanceDateStrip` | 615–658 | ~45 | `advance/shared/` (used by Advance surface, VIS-AA-04) |
| **BUILD** — `SetupMode` (+ its DnD, library, canvas, template CRUD/merge, autosave) | 737–2198 | **~1,462** | `advance/build/` |
| build modals — `DropdownOptionsEditor` 2199, `CustomFieldModal` 2257, `CustomSectionModal` 2415 | 2199–2462 | ~264 | `advance/build/` |
| **ADVANCE (fill)** — `FillMode` (+ fill autosave) | 2468–2863 | ~396 | `advance/fill/` |
| fill cards — `STATUS_OPTIONS` 2864, `KeyContactsCard` 2873, `RiderCard` 3034, `FlightsSectionCard` 3255 (+`FlightEntry` 3188, `buildTourPersonnelList` 3200, `flightRowsFromLegacyData` 3219), `PersonnelMultiSelect` 3441, `DealInfoUploadBlock` **3541**, `ParkingAccessCard` 3747, `ImportantDocumentsCard` 3883, `MealTimesBlock` 4388, dropdowns (`RoleDropdown` 4109, `SelectDropdown` 4165, `AddableSelectDropdown` 4220, `RoleCombobox` 4459), `KeyContactRow` 4541, `StatusDropdown` **4744**, `AssignDropdown` **4808**, `SectionCard` 4890 (~490), `SectionComments` 5380, `LocalSearchableField` 5501, `FileUploadField` 5667, `FieldRenderer` 5781 | 2864–6057 | ~3,190 | `advance/fill/` |
| **DEAD — delete in B4** `SettlementBlock` | 3700–3746 | ~47 | — |
| **SHARE** (B4) — packet + intake link + deal-memo review; currently the `/packet` route + `SendPacketButton`/`VenueIntakeForm` | (separate files) | — | `advance/share/` |

---

## 4. Route surfaces + redirects (B1)

Current:
- `/advance/[tourId]/[routingId]`            → builder (FillMode default; `?mode=edit` forces SetupMode)
- `/advance/[tourId]/[routingId]/packet`     → packet/share

Target (B1):
- `/advance/[tourId]/[routingId]/build`      → **Build** (SetupMode)
- `/advance/[tourId]/[routingId]`            → **Advance** (FillMode)  *(keep as default landing)*
- `/advance/[tourId]/[routingId]/share`      → **Share** (packet)
- Segmented switcher (Build / Advance / Share) in `advance/[tourId]/[routingId]/layout.tsx` (breadcrumb includes the show — B2).
- **Redirects:** `?mode=edit` → `/build`; `/packet` → `/share`.

---

## 5. The two autosave paths (B1 must consolidate onto `useAutoSave` — WITHOUT merging them)

They are **structurally different** — different endpoints, payloads, debounce
windows, and dirty-tracking. The consolidation is **two `useAutoSave` instances
sharing the pattern**, NOT one timer. This is the single highest data-loss risk
of the whole decomposition.

### 5a. BUILD — structure autosave (`SetupMode`)
- **Trigger:** `sections` state changes vs `lastSavedSectionsRef` baseline via `JSON.stringify` equality (858–860). Covers ALL setters (moveSectionOrder, moveFieldOrder, addSectionFromDrop, addField, removeField…) with no per-call-site instrumentation.
- **Debounce:** **800 ms** `setTimeout` (**872**).
- **Endpoint:** `POST /api/tours/${tourId}/advance` (**893**).
- **Payload:** `{ routing_id: routingId, sections }` (896).
- **On 200:** baseline `lastSavedSectionsRef.current = current` (902). On failure: baseline unchanged (retry on next change).
- **Manual path:** "Save Layout" button (~1011, `saveLayout`) POSTs the same payload to the same endpoint.

### 5b. ADVANCE — fill autosave (`FillMode`)
- **Trigger:** field/contact/status/assignee/flag edits via `setFieldValue`/`setSectionFieldBatch` (2634/2639), `setSectionContacts` (2623), `setSectionStatus` (2557), `setSectionAssigned` (2563), `updateFlags` (2603).
- **Accumulator:** `patchRef.current` merged with override (2569–2570) — `{ data?, section_statuses?, status?, flags? }`.
- **Two flush modes:**
  - `debouncedFlush()` — **2000 ms** `setTimeout` (**2611**) for **data/contacts** edits (2629, 2660).
  - `flushPatch()` — **immediate** for **status / assignee / flags** (2560, 2566, 2606).
- **Endpoint:** `PATCH /api/tours/${tourId}/advance/${routingId}` (**2574**).
- **Side effects to preserve:** auto-advance section `not_started→in_progress` and overall status (2643–2652); conflict banner via `last_updated_at` comparison (2586–2592); `router.refresh()` when `section_statuses` changed (2593–2594).

**Consolidation checklist (do not regress):** distinct endpoints; 800 vs 2000 ms
windows; immediate-flush for status/assignee/flags; accumulator merge; on-200
baseline reset (build) / conflict-check (fill); flush-before-unmount cleanup
(2524–2529). Prefer wiring each surface's `useAutoSave` to a `flush()` on
navigation away (mirrors the routing-editor `flushSave` pattern).

---

## 6. Drag-reorder bug — root-cause hypothesis (fix in B2, NOT B1)

The reorder code self-diagnoses at **1210–1211**:

> `console.error('[advance-builder] moveFieldOrder: DUPLICATE FIELD IDS in section — React key collisions will prevent visible reorder', …)`

**Hypothesis:** the "autosave returns 200 but nothing visibly moves" symptom
(Adam's smoke, comment at 832) is a **React key collision** — `moveFieldOrder`
reorders state and the 800 ms POST persists it (200 OK), but sibling fields
share `id`s used as React keys, so React can't reconcile the DOM to the new
order. `moveSectionOrder` (1167) has bail paths (1169) worth confirming too.

**B2 fix direction:** guarantee unique field ids on load + on add (slugify +
de-dupe suffix), use a stable unique key, remove the 9 DnD `console.*` markers
(865, 881, 898, 907, 913, 1167, 1169, 1195, 1199, 1210, 1219, 1650, 1668, 1678,
1684, 1707) once fixed.

---

## 7. §12 override items — locations + preservation

| # | Item | Location | Preserved by |
|---|---|---|---|
| 1 | 12 field types | `FIELD_TYPE_OPTIONS` **176** | → `advance/shared/` constants, verbatim |
| 2 | section drag-reorder | `moveSectionOrder` ~1167, `moveFieldOrder` ~1195 | stays in Build; bug FIXED in B2 |
| 3 | templates + merge modes | `ApiTemplate` 331; SetupMode template CRUD/reorder/merge (delete 1374, reorder 1386–1390) | stays in Build; reuse existing merge code |
| 4 | **intake never-clobber** | **NOT in the component** — see §8 | untouched by the cut (server + pure lib) |
| 5 | deal-memo review-before-write | `DealInfoUploadBlock` **3541**, `DEAL_MEMO_DOC_TYPES` 3539 | → Fill/Share; review modal intact |
| 6 | tm_only / status / assignee / flags | `tm_only` on `FieldDef`/section; `StatusDropdown` **4744**; `AssignDropdown` **4808**; `AdvanceFlag` **345**; flag rendering in `SectionCard` | Build (tm_only/flag props) + Fill (status/assignee) |
| 7 | packet + password links | `/packet` route + `SendPacketButton` / intake link card | → Share surface (B4) |

---

## 8. §12.4 intake never-clobber — LINE-PINNED

The never-clobber guard is **entirely server-side + pure lib — it does NOT live
in `AdvanceSectionBuilder`**, so the component cut cannot break it. Pinned:

- **Guard:** `src/lib/advance/intake.ts` → `mergeIntakeIntoAdvance` **line 133**:
  ```ts
  if (isEmptyAnswer(value)) continue;   // blank submitted value → skip → existing kept
  ```
- **"Empty" definition:** `isEmptyAnswer` **105–110** (null/undefined/`''`/whitespace/`[]` → empty; `0`/`false` → NOT empty).
- **Tamper-defence:** `sanitizeSubmission` **146–165** (only schema-declared fields survive).
- **tm_only exclusion from venue form:** `buildIntakeFormSchema` **80** (`if (section.tm_only) continue`) + non-fillable `file`/`contact` drop **65/81–83**.
- **Write call site:** `src/app/api/public/advance-intake/[token]/submit/route.ts`
  **112–119**: `sanitizeSubmission(schema, rawData)` → `mergeIntakeIntoAdvance(instance.data, clean)` → `.update({ data: merged, last_updated_at })` on `advance_instances`.

**Standing proof:** `src/lib/advance/intake.test.ts` (29 assertions, `node
--experimental-strip-types`) locks all of the above. The cut must keep this
green.

---

## 9. Q1 venue-preserve (PARKED — do NOT flip during the cut)

Live-advance read views render the advance's OWN `data` JSONB / snapshotted
routing, NOT current canonical venue:
- `FillMode` reads `data.routing.venue_name` (props at 557–559 in the shell).
- `AdvanceShowReadView` / `MobileShowReader` / advance-intake read the advance's
  stored data.

Whether they SHOULD show current canonical instead is **Q1 (Adam, parked)**.
The decomposition must **preserve current behavior** — flag if a seam tempts a
change, do not flip it.

---

## 10. Harness feasibility note (why there's no component save-path test)

The component's two autosave paths (§5) **cannot** be characterization-tested
without the extraction: the repo has **no jsdom / testing-library** (tests run
via `node --experimental-strip-types` + `node:assert`), and the timers/flush
functions are **non-exported internals** of `SetupMode`/`FillMode`. Rendering
`AdvanceSectionBuilder` in node is not possible (needs DOM + `useAuth`/router/
`searchParams`/`fetch`/`requestAnimationFrame`). Their exact trigger conditions
are documented in §5 instead. The one save-invariant that IS provable now —
§12.4 never-clobber (pure lib) — has a real test (§8).

**B1 verification will therefore lean on:** `tsc`/`eslint`/`build` green + the
intake test + Adam's smoke pass. Extract each autosave into a testable unit
(e.g. a `buildStructurePayload(sections)` / `buildFillPayload(patchRef)` pure
fn) DURING the cut so post-cut unit tests can assert payloads.

---

## 11. B1 execution order (for the dedicated window)

1. **Pin §12.4 (done, §8)** — confirm intake test green before touching anything.
2. Move shared types/constants/helpers → `advance/shared/`, re-export from the old
   path so all 8 importers keep resolving.
3. Extract `useAdvanceData(tourId, routingId)` (data + allDates + orchestration).
4. Extract two `useAutoSave` instances per §5 (build POST 800 ms; fill PATCH
   2000 ms + immediate status/assignee/flags). Add pure payload builders for
   later unit tests.
5. Split `SetupMode`→`advance/build/`, `FillMode`+cards→`advance/fill/`.
6. Stand up `/build` + `/share` routes + segmented switcher in the layout;
   default route renders Advance. Redirect `?mode=edit`→`/build`, `/packet`→`/share`.
7. Keep `SettlementBlock` for now (delete in B4).
8. Floor: `tsc` 0 · `eslint` 0 · `next build --webpack` · intake test green → commit → push. STOP.
