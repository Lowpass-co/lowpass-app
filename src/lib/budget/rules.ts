/* ============================================================
   LOWPASS — Budget rules engine (Layer B, deterministic)

   Pure, unit-tested checks over budget/routing structured data. No
   model involved — cheap, reliable, zero AI bill. The output `findings`
   render in the same proactive-prompt surface the LLM suggestions use
   (see AI_ASSISTANT_ARCHITECTURE.md §2 Layer B).

   The carnet/haulage detection here is the single source of truth — it
   was previously inlined in budget/ai/suggest; that route now imports
   hasCarnet/hasHaulage from this module (DRY).
   ============================================================ */

export interface BudgetFinding {
  /** Stable id, e.g. 'eu-shows-no-carnet'. */
  id: string;
  severity: 'info' | 'warn';
  /** Short title. */
  title: string;
  /** One-sentence detail. */
  detail: string;
  suggestedAction?: { kind: 'add_line_item'; label: string; category?: string };
}

export interface BudgetRuleLineItem {
  category?: string;
  label?: string;
  proposed_cost?: number;
}

export interface BudgetRulesInput {
  showCount: number;
  /** EU shows present — derived from the tour's region (see rules-check). */
  hasEuShows: boolean;
  lineItems: BudgetRuleLineItem[];
  /**
   * Largest known venue capacity across the routing, when venue data is
   * linked. Optional — the large-room-no-pa rule only fires when this is
   * present, so a tour with no linked/sized venues is never flagged.
   */
  maxVenueCapacity?: number;
}

/** Show-day threshold above which a tour without haulage looks suspicious. */
const HAULAGE_SHOW_THRESHOLD = 3;
/** Capacity at/above which a routed venue is "large" enough to expect a PA line. */
const LARGE_ROOM_CAPACITY_THRESHOLD = 2000;

/** True when any line item label mentions a carnet. */
export function hasCarnet(lineItems: BudgetRuleLineItem[]): boolean {
  return lineItems.some((i) => /carnet/i.test(i.label ?? ''));
}

/** True when any line item label mentions haulage / freight / truck. */
export function hasHaulage(lineItems: BudgetRuleLineItem[]): boolean {
  return lineItems.some((i) => /haulage|freight|truck/i.test(i.label ?? ''));
}

/** True when any line item looks like a PA / sound / audio rental. */
export function hasPa(lineItems: BudgetRuleLineItem[]): boolean {
  return lineItems.some((i) => /\bPA\b|sound|audio/i.test(i.label ?? ''));
}

/**
 * Run every seed rule over the input and return the findings that fire.
 * Pure — deterministic in its input, no I/O.
 */
export function runBudgetRules(input: BudgetRulesInput): BudgetFinding[] {
  const findings: BudgetFinding[] = [];
  const { showCount, hasEuShows, lineItems, maxVenueCapacity } = input;

  // EU shows present, no carnet budgeted.
  if (hasEuShows && !hasCarnet(lineItems)) {
    findings.push({
      id: 'eu-shows-no-carnet',
      severity: 'warn',
      title: 'No carnet budgeted',
      detail: 'This tour has EU shows but no carnet line item — cross-border gear usually needs one.',
      suggestedAction: { kind: 'add_line_item', label: 'Carnet', category: 'prod_freight' },
    });
  }

  // More than a few show days, no haulage / freight.
  if (showCount > HAULAGE_SHOW_THRESHOLD && !hasHaulage(lineItems)) {
    findings.push({
      id: 'no-haulage',
      severity: 'warn',
      title: 'No haulage budgeted',
      detail: `This tour has ${showCount} show days but no haulage, freight, or truck line item.`,
      suggestedAction: { kind: 'add_line_item', label: 'Haulage', category: 'prod_freight' },
    });
  }

  // A large routed venue with no PA / sound rental.
  if (
    typeof maxVenueCapacity === 'number' &&
    maxVenueCapacity >= LARGE_ROOM_CAPACITY_THRESHOLD &&
    !hasPa(lineItems)
  ) {
    findings.push({
      id: 'large-room-no-pa',
      severity: 'info',
      title: 'Large venue, no PA budgeted',
      detail: `A routed venue holds ~${maxVenueCapacity.toLocaleString()} but there's no PA, sound, or audio rental line.`,
      suggestedAction: { kind: 'add_line_item', label: 'PA / sound rental', category: 'prod_audio' },
    });
  }

  return findings;
}
