# UX08 — `<EntityChip>` + Entity Routing Layer

> Inline reference component for canonical entities (Person / Flight / Room / Gear / Show). Click → opens SlideOver for that entity. Establishes the universal entity-link routing layer used by SpreadsheetGrid `entityRef` cells (UX06) and the Command Palette (UX08b).

---

## 0. Context for Cursor

Read first:

1. `docs/cursor-prompts/UX_OVERHAUL_ROADMAP.md` — section 4 (relational data model), 5 (component library row for EntityChip).
2. `docs/components/SLIDE_OVER_CONTRACT.md` (UX03).
3. `docs/components/SPREADSHEET_GRID_CONTRACT.md` (UX06).
4. UX02–UX07 (must be merged).

---

## 1. Why this prompt exists

The relational model (Section 4 of the roadmap) makes Person / Flight / Room / Gear / Show into single records surfaced everywhere. To support that without spaghetti, we need:

1. A single primitive for displaying an entity reference inline (`<EntityChip>`)
2. A routing layer that, given an entity type + id, knows how to open the right SlideOver

Without this, SpreadsheetGrid's `entityRef` cells (currently stubbed as text) can't actually be wired up, and the Command Palette (UX08b) has nowhere to dispatch its results.

---

## 2. Hard rules

1. No new dependencies.
2. EntityChip is **display-only**, not edit. Editing the entity happens in its SlideOver, not the chip.
3. Routing layer is a registry pattern — each entity registers its renderers + slide-over content once, anywhere in the app can use it.
4. Lazy-load entity slide-over content. Don't bundle every entity's full detail view into every page.
5. Must work inside SpreadsheetGrid cells, prose text, table cells, and free-form contexts.
6. Lint + typecheck clean. No build run.

---

## 3. Step 1 — Entity registry

File: `src/lib/entities/registry.ts`

Define the entity registry pattern:

```ts
type EntityKind = 'person' | 'flight' | 'room' | 'gear' | 'show';

type EntityDescriptor<T> = {
  kind: EntityKind;
  // How to fetch by id (server)
  fetchById: (id: string) => Promise<T | null>;
  // How to fetch a list (server, used by Command Palette + EntityRefEditor)
  search: (query: string, opts?: { limit?: number; tourId?: string }) => Promise<T[]>;
  // Display
  getLabel: (entity: T) => string;
  getSecondary?: (entity: T) => string; // sub-text in chip / palette
  getColor?: (entity: T) => string; // optional accent
  // SlideOver content renderer (lazy-loaded client component)
  SlideOverContent: () => Promise<{ default: ComponentType<{ entity: T }> }>;
};

const registry = new Map<EntityKind, EntityDescriptor<any>>();

export function registerEntity<T>(desc: EntityDescriptor<T>): void;
export function getEntityDescriptor(kind: EntityKind): EntityDescriptor<any> | null;
```

For each entity, create a stub descriptor file under `src/lib/entities/`:
- `person.ts`
- `flight.ts`
- `room.ts`
- `gear.ts`
- `show.ts`

Each descriptor's `fetchById` and `search` use existing Supabase tables. **Don't create new tables in this prompt** — the canonical entity migrations are UX09–UX12. For now, descriptors can read from the existing tables (e.g. Person reads from `personnel` or wherever current data lives).

`SlideOverContent` returns a placeholder component for now: title, label, "Full content coming in UX09–UX12". That's fine — when UX09 lands, it will replace the placeholder for Person specifically, and so on.

---

## 4. Step 2 — `<EntityChip>` component

File: `src/components/entity/EntityChip.tsx` (`'use client'`)

### 4.1 API

```ts
type EntityChipProps = {
  kind: EntityKind;
  id: string;
  // Optional pre-loaded data to avoid fetch (for SpreadsheetGrid cells with embedded data)
  prefetch?: { label: string; secondary?: string; color?: string };
  // Visual variant
  variant?: 'default' | 'compact' | 'inline'; // default 'default'
  // Behavior
  clickable?: boolean; // default true
  onClick?: () => void; // override default open-slide-over behaviour
};
```

### 4.2 Visuals

- **default**: pill-shaped, `--lp-radius-full`, padding `var(--lp-space-1) var(--lp-space-3)`, icon (per kind) + label + chevron, `--lp-text-sm`, background `--lp-surface`, border `--lp-border-light`. Hover: `--lp-surface-hover` background.
- **compact**: same but no icon, just label + chevron, `--lp-text-xs`.
- **inline**: rendered as text underline (link-style), no border or background. For prose use.

Icon per kind:
- person: `User`
- flight: `Plane`
- room: `BedDouble`
- gear: `Speaker`
- show: `Music`

### 4.3 Behaviour

On click (default): open SlideOver for the entity. Calls `openEntitySlideOver({ kind, id })` (defined in Step 3).

If `prefetch` is provided, render the chip immediately. Otherwise, fetch via `getEntityDescriptor(kind).fetchById(id)` and render once loaded. Show a skeleton chip while loading.

Errors (entity not found): render the chip greyed out with a strikethrough and tooltip "Entity not found".

---

## 5. Step 3 — Entity slide-over orchestrator

File: `src/components/entity/EntitySlideOverHost.tsx` (`'use client'`)

Mount once per app (in `(app)/layout.tsx` or a top-level provider). Listens for entity-open events and renders the corresponding SlideOver.

```tsx
// Provider API
const EntityRoutingContext = React.createContext<{
  open: (target: { kind: EntityKind; id: string }) => void;
  close: () => void;
}>(...);

export function EntityRoutingProvider({ children }: { children: ReactNode }) {
  const [target, setTarget] = useState<{ kind: EntityKind; id: string } | null>(null);
  // …
  return (
    <EntityRoutingContext.Provider value={{ open: setTarget, close: () => setTarget(null) }}>
      {children}
      {target && <EntitySlideOver target={target} onClose={() => setTarget(null)} />}
    </EntityRoutingContext.Provider>
  );
}

export function useEntityRouting() {
  return useContext(EntityRoutingContext);
}
```

`<EntitySlideOver>` reads the descriptor via `getEntityDescriptor(target.kind)`, fetches the entity, lazy-loads `SlideOverContent`, and renders it inside `<SlideOver>` (UX03).

Mount `<EntityRoutingProvider>` in the existing root provider stack so any page can call `useEntityRouting().open({...})`.

---

## 6. Step 4 — Wire SpreadsheetGrid `entityRef` cells

UX06's `entityRef` cell editor was stubbed (renders entity ID as text + TODO log). Now wire it:

- Display: render `<EntityChip kind={cellType.entity} id={value} variant="compact" />`
- Edit: clicking the cell enters edit mode → renders an autocomplete picker that calls `descriptor.search(query)` and lets the user pick an entity. On select, commits the new id.

File: `src/components/spreadsheet-grid/cell-editors/EntityRefEditor.tsx` — replace the stub.

---

## 7. Step 5 — Playground demo

Add to `/admin/shell-playground`:
- A row of `<EntityChip>` examples for each kind, each variant
- A "Click to open" demo using `useEntityRouting().open(…)`
- A SpreadsheetGrid demo with an `entityRef` column wired to real Person data — clicking the cell opens the picker; clicking a chip outside edit mode opens the slide-over

---

## 8. Verification

1. Lint + typecheck clean
2. EntityChip variants render correctly
3. Clicking a chip opens the SlideOver with the entity's stub content
4. SpreadsheetGrid `entityRef` cell now picks entities via autocomplete
5. Lazy-loaded slide-over content code-splits (verify in network tab)
6. Multiple chips in a single page don't fight over the slide-over (only one open at a time)
7. Dark mode parity
8. ARIA: chip is a button with `aria-label="Open <kind> <label>"`

---

## 9. Acceptance criteria

- [ ] Entity registry at `src/lib/entities/registry.ts` with 5 stub descriptors
- [ ] `<EntityChip>` with 3 variants
- [ ] `<EntityRoutingProvider>` mounted at app root
- [ ] `useEntityRouting()` hook works
- [ ] SpreadsheetGrid `entityRef` cells now use live picker + chip render
- [ ] Playground demos for each entity kind
- [ ] No new dependencies
- [ ] Lint + typecheck clean

---

## 10. Out of scope

- ❌ Don't build full entity slide-over content — UX09–UX12 do that per entity
- ❌ Don't migrate any production page to use EntityChip — that's part of the page redesigns (UX13–UX17)
- ❌ Don't build the Command Palette — UX08b
- ❌ Don't change schema — UX09–UX12

---

## 11. Commit plan

```
UX08: EntityChip + entity routing layer

- Registry pattern in src/lib/entities/registry.ts
- 5 stub descriptors (person, flight, room, gear, show)
- <EntityChip> with default / compact / inline variants
- <EntityRoutingProvider> for app-wide slide-over orchestration
- SpreadsheetGrid entityRef cells now live (chip + picker)
- Playground demos
```
