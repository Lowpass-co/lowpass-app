import { createServerSupabaseClient } from '@/lib/supabase-server';
import type { LeftRailVariant, ShellDayType } from '@/components/shell/LeftRail';

function localYmd(d: Date): string {
  return d.toLocaleDateString('en-CA');
}

function eachDayInRange(start: string, end: string): string[] {
  const [y1, m1, d1] = start.split('-').map(Number);
  const [y2, m2, d2] = end.split('-').map(Number);
  const a = new Date(y1, (m1 ?? 1) - 1, d1 ?? 1);
  const b = new Date(y2, (m2 ?? 1) - 1, d2 ?? 1);
  const out: string[] = [];
  const cur = new Date(a);
  while (cur <= b) {
    out.push(localYmd(cur));
    cur.setDate(cur.getDate() + 1);
  }
  return out;
}

function dayTypeToShell(dt: string | null): ShellDayType | undefined {
  if (!dt) return undefined;
  const parts = dt.split(',').map((s) => s.trim().toLowerCase());
  const map: Record<string, ShellDayType> = {
    show: 'show',
    off: 'off',
    travel: 'travel',
    rehearsal: 'rehearsal',
    press: 'press',
    radio: 'radio',
    tv: 'tv',
    festival: 'festival',
  };
  for (const p of parts) {
    if (map[p]) return map[p];
  }
  return 'show';
}

/**
 * Day rail for routing/advance: one row per day in tour range, with routing labels when present.
 */
export async function getDocDaysLeftRail(
  tourId: string,
  options?: { activeDate?: string }
): Promise<Extract<LeftRailVariant, { kind: 'docDays' }>> {
  const supabase = await createServerSupabaseClient();
  const { data: tour } = await supabase
    .from('tours')
    .select('start_date, end_date')
    .eq('id', tourId)
    .single();

  const start = (tour?.start_date as string) ?? new Date().toISOString().slice(0, 10);
  const end = (tour?.end_date as string) ?? start;

  const { data: routRows } = await supabase
    .from('routing')
    .select('id, date, day_type, city, venue_name')
    .eq('tour_id', tourId)
    .order('date', { ascending: true });

  const byDate = new Map<string, { id: string; day_type: string | null; city: string; venue_name: string | null }>();
  for (const r of routRows ?? []) {
    byDate.set(r.date as string, {
      id: r.id as string,
      day_type: r.day_type as string | null,
      city: (r.city as string) ?? '',
      venue_name: (r.venue_name as string | null) ?? null,
    });
  }

  const days = eachDayInRange(start, end).map((date) => {
    const row = byDate.get(date);
    const label = row
      ? [row.city, row.venue_name].filter(Boolean).join(' · ') || date
      : '—';
    return {
      date,
      label,
      type: dayTypeToShell(row?.day_type ?? null),
    };
  });

  const today = localYmd(new Date());
  let activeDate = options?.activeDate ?? today;
  if (!days.some((d) => d.date === activeDate) && days.length) {
    activeDate = days[0].date;
  }

  return {
    kind: 'docDays',
    tourStartDate: start,
    tourEndDate: end,
    days,
    activeDate,
  };
}
