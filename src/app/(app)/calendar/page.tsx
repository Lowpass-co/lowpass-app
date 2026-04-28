import Link from 'next/link';
import { listAppPageShell } from '@/components/shell/app-page-shells';
import { createServerSupabaseClient } from '@/lib/supabase-server';
import { CalendarView } from '@/components/calendar/CalendarView';

export default async function CalendarPage() {
  const supabase = await createServerSupabaseClient();
  const { count } = await supabase
    .from('tours')
    .select('*', { count: 'exact', head: true })
    .in('status', ['planning', 'active']);

  return listAppPageShell(
    <div className="mx-auto max-w-6xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-lp-text">Calendar</h1>
        <p className="mt-1 text-sm text-lp-text-secondary">
          All shows across tours. Toggle tours and artists to filter. Click a show for advance, budget, and docs.
        </p>
      </div>
      {(count ?? 0) > 0 ? (
        <CalendarView />
      ) : (
        <div className="rounded-xl border-2 border-dashed border-lp-border py-12 text-center text-lp-text-secondary">
          No active tours yet. <Link href="/tours/create" className="text-lp-orange hover:underline">Create a tour</Link> and add routing to see shows here.
        </div>
      )}
    </div>
  );
}
