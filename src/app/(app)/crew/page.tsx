/* /crew — a Member's tours, phone-first (Nov 2026). One tour → straight in. */
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { ChevronRight } from 'lucide-react';
import { createServerSupabaseClient } from '@/lib/supabase-server';
import { loadCrewTours, orderCrewTours } from '@/server/crew/load';
import { todayKey } from '@/components/crew/format';
import '@/components/crew/crew.css';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Your tours · Lowpass' };

export default async function CrewHome() {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login?next=/crew');
  const tours = orderCrewTours(await loadCrewTours(supabase), todayKey());
  if (tours.length === 1) redirect(`/crew/${tours[0].id}`);
  return (
    <main className="crew">
      <h1 className="crew-title">Your tours</h1>
      <div className="crew-h2">Tours</div>
      <div className="crew-list">
        {tours.map((t) => (
          <Link key={t.id} href={`/crew/${t.id}`} className="crew-row">
            <span className="crew-row-main">
              <span className="crew-row-title">{t.name}</span>
              <br />
              <span className="crew-row-meta">
                {t.artistName ?? ''}
                {t.startDate ? ` · ${t.startDate}${t.endDate ? ` – ${t.endDate}` : ''}` : ''}
              </span>
            </span>
            <ChevronRight size={18} className="crew-chev" aria-hidden />
          </Link>
        ))}
        {tours.length === 0 ? (
          <p className="crew-empty">You haven&apos;t been added to a tour yet. Ask your tour manager to share one with you.</p>
        ) : null}
      </div>
    </main>
  );
}
