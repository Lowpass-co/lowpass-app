import Link from 'next/link';
import { createServerSupabaseClient } from '@/lib/supabase-server';
import { formatDate } from '@/lib/utils';

export default async function CalendarPage() {
  const supabase = await createServerSupabaseClient();
  const { data: tours } = await supabase
    .from('tours')
    .select('id, name, start_date, end_date, artist:artists(name)')
    .order('start_date', { ascending: false });

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-lp-text">Calendar</h1>
        <p className="mt-1 text-sm text-lp-text-secondary">
          Open a tour to see Grid, Calendar, and Kanban views and export the iCal feed.
        </p>
      </div>
      {tours?.length ? (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {tours.map((tour) => (
            <Link
              key={tour.id}
              href={`/tours/${tour.id}`}
              className="rounded-xl border border-lp-border bg-lp-surface p-4 hover:border-lp-orange/30 hover:bg-lp-surface-hover"
            >
              <p className="text-sm text-lp-text-tertiary">{(tour.artist as { name?: string })?.name ?? '—'}</p>
              <p className="font-semibold text-lp-text">{tour.name}</p>
              <p className="mt-1 text-sm text-lp-text-secondary">
                {formatDate(tour.start_date)} – {formatDate(tour.end_date)}
              </p>
            </Link>
          ))}
        </div>
      ) : (
        <div className="rounded-xl border-2 border-dashed border-lp-border py-12 text-center text-lp-text-secondary">
          No tours yet. <Link href="/tours/create" className="text-lp-orange hover:underline">Create a tour</Link> to add routing and calendar.
        </div>
      )}
    </div>
  );
}
