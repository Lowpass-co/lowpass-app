/* ============================================
   LOWPASS — Permission resource catalog (Sprint 9 §2C)

   Canonical list of resource_id values referenced by
   permission_grants and the can_access() RLS helper. The
   PermissionMatrix UI renders rows from this catalog; the
   members/invite API routes validate incoming grants against
   it (defense in depth — permission_grants.resource_id is a
   free-form TEXT column, so the API enforces the canonical
   set).

   Resource IDs are dotted-namespace strings: <product>.<page>
   or <product>.<page>.<column-or-section> for sub-grants.

   sensitive: true means granting this resource fires the
   sensitive-info confirmation modal in the Manage slide-over.
   The eight sensitive IDs were locked in by Adam at Phase 3
   sign-off:
     - budget.receipts, budget.line_items, budget.payroll,
       budget.deal_memos, budget.commissions, budget.summary
     - operations.personnel.compensation
     - artist.contracts
   ============================================ */

export type ResourceType = 'page' | 'product';
export type ResourcePermission = 'read' | 'write';
export type ResourceGroup = 'home' | 'artist' | 'operations' | 'budget' | 'advance';

export interface ResourceDef {
  id: string;
  type: ResourceType;
  group: ResourceGroup;
  label: string;
  description: string;
  sensitive: boolean;
}

export const SENSITIVE_RESOURCE_IDS: ReadonlySet<string> = new Set([
  'budget.receipts',
  'budget.line_items',
  'budget.payroll',
  'budget.deal_memos',
  'budget.commissions',
  'budget.summary',
  'operations.personnel.compensation',
  'artist.contracts',
]);

/* Group order matches the existing nav order in Sprint 8.6
   surfaces (home → artist → operations → budget → advance) per
   Adam's sign-off question 6. */
export const RESOURCE_GROUP_ORDER: readonly ResourceGroup[] = [
  'home',
  'artist',
  'operations',
  'budget',
  'advance',
];

export const RESOURCE_GROUP_LABELS: Record<ResourceGroup, string> = {
  home: 'Home',
  artist: 'Artist',
  operations: 'Operations',
  budget: 'Budget',
  advance: 'Advance',
};

export const RESOURCE_CATALOG: readonly ResourceDef[] = [
  // Home
  {
    id: 'home.dashboard',
    type: 'page',
    group: 'home',
    label: 'Dashboard',
    description: 'Workspace home + activity feed.',
    sensitive: false,
  },

  // Artist
  {
    id: 'artist.home',
    type: 'page',
    group: 'artist',
    label: 'Artist home',
    description: 'Per-artist overview.',
    sensitive: false,
  },
  {
    id: 'artist.tours',
    type: 'page',
    group: 'artist',
    label: 'Artist tours',
    description: 'Tour list for an artist.',
    sensitive: false,
  },
  {
    id: 'artist.contracts',
    type: 'page',
    group: 'artist',
    label: 'Artist contracts',
    description: 'Contract documents and terms.',
    sensitive: true,
  },

  // Operations
  {
    id: 'operations.routing',
    type: 'page',
    group: 'operations',
    label: 'Routing',
    description: 'Tour date list, venue assignments, drive times.',
    sensitive: false,
  },
  {
    id: 'operations.personnel',
    type: 'page',
    group: 'operations',
    label: 'Personnel (list)',
    description: 'Tour personnel roster (without compensation).',
    sensitive: false,
  },
  {
    id: 'operations.personnel.compensation',
    type: 'page',
    group: 'operations',
    label: 'Personnel — compensation',
    description: 'Rates, salaries, day-rate breakdowns.',
    sensitive: true,
  },
  {
    id: 'operations.personnel.my_schedule',
    type: 'page',
    group: 'operations',
    label: 'Personnel — my schedule',
    description:
      'Crew read-only view of own assignments. Default-granted to anyone with the "crew" tag at member-creation time.',
    sensitive: false,
  },
  {
    id: 'operations.channel_list',
    type: 'page',
    group: 'operations',
    label: 'Channel list',
    description: 'Audio channel list.',
    sensitive: false,
  },
  {
    id: 'operations.payroll',
    type: 'page',
    group: 'operations',
    label: 'Payroll',
    description: 'Payroll calculation surface.',
    sensitive: false,
  },
  {
    id: 'operations.rooming',
    type: 'page',
    group: 'operations',
    label: 'Rooming',
    description: 'Hotel room assignments.',
    sensitive: false,
  },
  {
    id: 'operations.files',
    type: 'page',
    group: 'operations',
    label: 'Files',
    description: 'Tour file uploads.',
    sensitive: false,
  },
  {
    id: 'operations.riders',
    type: 'page',
    group: 'operations',
    label: 'Riders',
    description: 'Rider packs.',
    sensitive: false,
  },

  // Budget
  {
    id: 'budget.line_items',
    type: 'page',
    group: 'budget',
    label: 'Line items',
    description: 'Budget line item entries with amounts.',
    sensitive: true,
  },
  {
    id: 'budget.receipts',
    type: 'page',
    group: 'budget',
    label: 'Receipts',
    description: 'Expense receipts including amounts and uploaded files.',
    sensitive: true,
  },
  {
    id: 'budget.payroll',
    type: 'page',
    group: 'budget',
    label: 'Payroll',
    description: 'Payroll entries with rates.',
    sensitive: true,
  },
  {
    id: 'budget.deal_memos',
    type: 'page',
    group: 'budget',
    label: 'Deal memos',
    description: 'Show deal memos.',
    sensitive: true,
  },
  {
    id: 'budget.commissions',
    type: 'page',
    group: 'budget',
    label: 'Commissions',
    description: 'Commission rate breakdown.',
    sensitive: true,
  },
  {
    id: 'budget.summary',
    type: 'page',
    group: 'budget',
    label: 'Summary',
    description: 'Budget summary, income, settlement.',
    sensitive: true,
  },

  // Advance
  {
    id: 'advance',
    type: 'product',
    group: 'advance',
    label: 'Advance (full)',
    description: 'Per-show advance fill + setup.',
    sensitive: false,
  },
];

export const RESOURCE_BY_ID: ReadonlyMap<string, ResourceDef> = new Map(
  RESOURCE_CATALOG.map((r) => [r.id, r] as const),
);

export function isValidResource(
  resource_type: string,
  resource_id: string,
): boolean {
  const def = RESOURCE_BY_ID.get(resource_id);
  return !!def && def.type === resource_type;
}

export function isSensitive(resource_id: string): boolean {
  return SENSITIVE_RESOURCE_IDS.has(resource_id);
}

export function resourceGroupOf(resource_id: string): ResourceGroup | null {
  return RESOURCE_BY_ID.get(resource_id)?.group ?? null;
}

/** Canonical grant shape used in API request/response bodies. */
export interface GrantInput {
  resource_type: ResourceType;
  resource_id: string;
  permission: ResourcePermission;
}

/** Validate a single grant input. Returns null if valid, or an error message. */
export function validateGrant(g: unknown): string | null {
  if (!g || typeof g !== 'object') return 'grant must be an object';
  const obj = g as Record<string, unknown>;
  if (obj.resource_type !== 'page' && obj.resource_type !== 'product') {
    return `resource_type must be "page" or "product" (got ${String(obj.resource_type)})`;
  }
  if (typeof obj.resource_id !== 'string' || !obj.resource_id) {
    return 'resource_id required';
  }
  if (obj.permission !== 'read' && obj.permission !== 'write') {
    return `permission must be "read" or "write" (got ${String(obj.permission)})`;
  }
  if (!isValidResource(obj.resource_type, obj.resource_id)) {
    return `unknown resource: ${obj.resource_type}/${obj.resource_id}`;
  }
  return null;
}
