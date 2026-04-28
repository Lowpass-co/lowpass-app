import type { BudgetSectionKind } from '@/lib/budget/budgetUx14Kinds';

/** Derive UX14 bucket from persisted section + pragmatic fallbacks before migration backfill completes. */
export function resolveSectionForLine(l: {
  section?: string | null;
  category: string;
  flight_id?: string | null;
  hotel_id?: string | null;
  room_id?: string | null;
  gear_id?: string | null;
  tour_gear_id?: string | null;
}): BudgetSectionKind {
  const s = (l.section ?? '').trim().toLowerCase();
  const valid =
    s &&
    [
      'income',
      'expenses',
      'hotels',
      'travel',
      'hire',
      'payroll',
      'per_diems',
      'other',
    ].includes(s);
  if (valid) return s as BudgetSectionKind;

  const cat = l.category ?? '';
  if (l.flight_id) return 'travel';
  if (l.hotel_id || l.room_id) return 'hotels';
  if (l.gear_id || l.tour_gear_id) return 'hire';

  const c = cat.toLowerCase();
  if (c.includes('income') || c.startsWith('routing')) return 'income';
  if (c.includes('hotel') || c.includes('accom')) return 'hotels';
  if (c.includes('flight') || c.includes('air')) return 'travel';
  if (c.includes('transport') || c.includes('van') || c.includes('bus')) return 'travel';
  if (c.startsWith('prod_') || c.includes('misc')) return 'expenses';
  if (c.includes('salary') || c.includes('payroll')) return 'payroll';
  if (c.includes('per_diem')) return 'per_diems';
  return 'other';
}
