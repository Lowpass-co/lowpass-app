/* ============================================================
   LOWPASS — Tour roles → Day slices (D1-3 core, consumed from D1-1)

   ONE source of truth for what each tour role sees. Pure + dependency-free
   so it can be imported by the server loader (loadDay), the tokenized public
   route, the PDF composer, and View-as — every enforcement point speaks this
   module, never a hand-rolled per-surface check.

   The slice is enforced SERVER-SIDE: loadDay() only fetches/returns the blocks
   in the viewer's slice, so out-of-slice data (money, internal notes) is ABSENT
   from the served object — not hidden with CSS. See loadDay.ts.

   Amendment (Adam, 2026-07-20): routing.notes is an INTERNAL operator note that
   may hold things never meant for crew. In v1 the `notes` block is in the
   tm / production / accountant slices ONLY; crew / driver / band exclude it. A
   crew-facing note field can be added later without touching this contract.
   ============================================================ */

/** The seven tour roles (mig 245 tour_roles.role CHECK). */
export type TourRole =
  | 'tm'
  | 'production'
  | 'accountant'
  | 'crew'
  | 'driver'
  | 'band'
  | 'management';

/** A renderable block of the Day. `pnl` is the compact money chip; `notes` is
 *  the internal routing note. Presence in a slice = the loader fetches it. */
export type DayBlock =
  | 'venue'
  | 'schedule'
  | 'hotel'
  | 'flights'
  | 'contacts'
  | 'notes'
  | 'pnl';

/** Product silos a role may reach (nav gating + View-as scope). */
export type ProductKey = 'home' | 'operations' | 'budget' | 'advance';

export interface RoleSlice {
  /** Day blocks this role may see. Money (`pnl`) and internal `notes` are the
   *  gated ones — their absence here means the loader never queries them. */
  blocks: ReadonlySet<DayBlock>;
  /** Product silos this role may reach. Crew-tier roles get none (Day-only). */
  products: ReadonlySet<ProductKey>;
}

export const ALL_ROLES: readonly TourRole[] = [
  'tm',
  'production',
  'accountant',
  'crew',
  'driver',
  'band',
  'management',
] as const;

export const ROLE_LABELS: Record<TourRole, string> = {
  tm: 'Tour Manager',
  production: 'Production',
  accountant: 'Accountant',
  crew: 'Crew',
  driver: 'Driver',
  band: 'Band',
  management: 'Management',
};

const ALL_BLOCKS: DayBlock[] = ['venue', 'schedule', 'hotel', 'flights', 'contacts', 'notes', 'pnl'];
const ALL_PRODUCTS: ProductKey[] = ['home', 'operations', 'budget', 'advance'];

/** The v1 slice matrix. Money (`pnl`) → tm / accountant / management. Internal
 *  `notes` → tm / production / accountant (per Adam's amendment). Crew-tier
 *  roles (crew / driver / band) never get either, and reach no product silos. */
const SLICES: Record<TourRole, RoleSlice> = {
  // Full operator — everything.
  tm: {
    blocks: new Set(ALL_BLOCKS),
    products: new Set(ALL_PRODUCTS),
  },
  // All operations context, no money.
  production: {
    blocks: new Set<DayBlock>(['venue', 'schedule', 'hotel', 'flights', 'contacts', 'notes']),
    products: new Set<ProductKey>(['home', 'operations', 'advance']),
  },
  // Money read + minimal context + notes.
  accountant: {
    blocks: new Set<DayBlock>(['venue', 'schedule', 'notes', 'pnl']),
    products: new Set<ProductKey>(['home', 'budget']),
  },
  // Day-sheet slice: logistics only. No notes, no money.
  crew: {
    blocks: new Set<DayBlock>(['venue', 'schedule', 'hotel', 'flights', 'contacts']),
    products: new Set<ProductKey>([]),
  },
  // Schedule + venue (parking) + hotel + flights (airport runs). No contacts card, no notes, no money.
  driver: {
    blocks: new Set<DayBlock>(['venue', 'schedule', 'hotel', 'flights']),
    products: new Set<ProductKey>([]),
  },
  // Schedule + hospitality/guest-relevant. No notes, no money.
  band: {
    blocks: new Set<DayBlock>(['venue', 'schedule', 'hotel', 'flights', 'contacts']),
    products: new Set<ProductKey>([]),
  },
  // Read-most — everything, like tm but not an editor.
  management: {
    blocks: new Set(ALL_BLOCKS),
    products: new Set(ALL_PRODUCTS),
  },
};

/** Narrowing guard for an arbitrary string (e.g. a DB value or a query param). */
export function isTourRole(v: unknown): v is TourRole {
  return typeof v === 'string' && (ALL_ROLES as readonly string[]).includes(v);
}

/** The slice for a role. Unknown roles fall back to the most-restrictive crew
 *  slice (fail-closed) — a bad role never widens access. */
export function sliceFor(role: TourRole | string | null | undefined): RoleSlice {
  if (isTourRole(role)) return SLICES[role];
  return SLICES.crew;
}

/** True if the role's slice includes a Day block. */
export function canSeeBlock(role: TourRole | string | null | undefined, block: DayBlock): boolean {
  return sliceFor(role).blocks.has(block);
}

/** True if the role may see money (the `pnl` chip / any money field on the Day). */
export function roleAllowsMoney(role: TourRole | string | null | undefined): boolean {
  return canSeeBlock(role, 'pnl');
}

/** True if the role may reach a product silo (nav + View-as). */
export function canSeeProduct(role: TourRole | string | null | undefined, product: ProductKey): boolean {
  return sliceFor(role).products.has(product);
}
