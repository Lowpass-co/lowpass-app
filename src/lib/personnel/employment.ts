/* ============================================
   LOWPASS — Employment on a tour (Nov 2026, Adam)

   One field, three values, per tour: Principal / Mgmt, Band or Crew. It lives
   on the person's payroll card (personnel_rates.person_type) and is edited in
   Payroll AND on the Crew panel — the same value. A new tour starts from the
   person's People-page groups (employmentFromGroups); changing it on a tour
   never changes the person.

   The old 5-value tour_personnel.employment_type (staff / freelance / …) is
   retired: nothing shows or writes it.
   ============================================ */

export const EMPLOYMENT_OPTIONS = [
  { value: 'principal', label: 'Principal / Mgmt' },
  { value: 'band', label: 'Band' },
  { value: 'crew', label: 'Crew' },
] as const;

export type Employment = (typeof EMPLOYMENT_OPTIONS)[number]['value'];

export function isEmployment(v: unknown): v is Employment {
  return typeof v === 'string' && EMPLOYMENT_OPTIONS.some((o) => o.value === v);
}

export function employmentLabel(v: string | null | undefined): string {
  return EMPLOYMENT_OPTIONS.find((o) => o.value === v)?.label ?? 'Crew';
}

/** The People-page groups → where a new tour puts them. Artist or management
 *  → Principal; band → Band; everyone else → Crew. */
export function employmentFromGroups(groups: readonly unknown[] | null | undefined): Employment {
  const g = new Set((groups ?? []).filter((x): x is string => typeof x === 'string'));
  if (g.has('artist') || g.has('mgmt')) return 'principal';
  if (g.has('band')) return 'band';
  return 'crew';
}

/** The groups out of a personnel.extended_profile JSON value. */
export function groupsOf(extendedProfile: unknown): string[] {
  const g = (extendedProfile as { groups?: unknown } | null)?.groups;
  return Array.isArray(g) ? g.filter((x): x is string => typeof x === 'string') : [];
}
