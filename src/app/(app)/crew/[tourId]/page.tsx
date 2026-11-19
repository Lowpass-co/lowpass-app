/* /crew/[tourId] — a tour on a phone: the shows (next one first in view) and
   the tour's files. Reads through the Member's own access (293). */
import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { ChevronRight, FileText } from 'lucide-react';
import { createServerSupabaseClient } from '@/lib/supabase-server';
import { getRequestViewerAccess } from '@/lib/server/requestContext';
import { loadCrewTour } from '@/server/crew/load';
import { dayLabel, nextDayIndex, todayKey } from '@/components/crew/format';
import { dayTypeLabel } from '@/components/advance/format';
import '@/components/crew/crew.css';

export const dynamic = 'force-dynamic';

export default async function CrewTour({ params }: { params: Promise<{ tourId: string }> }) {
  const { tourId } = await params;
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect(`/login?next=/crew/${tourId}`);
  const access = await getRequestViewerAccess(tourId);
  const data = await loadCrewTour(supabase, tourId, access);
  if (!data) notFound();
  const today = todayKey();
  const next = nextDayIndex(data.days.map((d) => d.date), today);
  const upcoming = data.days.slice(Math.max(next, 0));
  const past = data.days.slice(0, Math.max(next, 0));

  const day = (d: (typeof data.days)[number]) => (
    <Link key={d.id} href={`/crew/${tourId}/${d.id}`} className="crew-row">
      <span className="crew-row-main">
        <span className={`crew-row-title${d.date === today ? ' crew-today' : ''}`}>
          {d.date === today ? 'Today · ' : ''}
          {dayLabel(d.date)} · {d.venue ?? d.city ?? dayTypeLabel(d.dayType ?? 'show')}
        </span>
        <br />
        <span className="crew-row-meta">
          {[d.venue ? d.city : null, d.dayType && d.dayType !== 'show' ? dayTypeLabel(d.dayType) : null].filter(Boolean).join(' · ')}
        </span>
      </span>
      {d.hasParking ? <span className="crew-pill">Parking</span> : null}
      <ChevronRight size={18} className="crew-chev" aria-hidden />
    </Link>
  );

  return (
    <main className="crew">
      <div className="crew-top">
        <Link href="/crew" className="crew-back">
          ← Tours
        </Link>
        {access?.manager ? (
          <Link href={`/operations/${tourId}/overview`} className="crew-back">
            Full app →
          </Link>
        ) : null}
      </div>
      <h1 className="crew-title">{data.tour.name}</h1>
      {data.tour.artistName ? <div className="crew-sub">{data.tour.artistName}</div> : null}

      <div className="crew-h2">Shows</div>
      <div className="crew-list">
        {upcoming.map(day)}
        {data.days.length === 0 ? <p className="crew-empty">No dates on this tour yet.</p> : null}
      </div>

      {data.can.files ? (
        <>
          <div className="crew-h2">Files</div>
          <div className="crew-list">
            {data.files.map((f) => (
              <a key={f.id} href={`/crew/${tourId}/file/${f.id}`} className="crew-row" target="_blank" rel="noreferrer">
                <span className="crew-row-main">
                  <span className="crew-row-title">{f.name}</span>
                  {f.folder ? (
                    <>
                      <br />
                      <span className="crew-row-meta">{f.folder}</span>
                    </>
                  ) : null}
                </span>
                <FileText size={18} className="crew-chev" aria-hidden />
              </a>
            ))}
            {data.files.length === 0 ? <p className="crew-empty">No files shared on this tour.</p> : null}
          </div>
        </>
      ) : null}

      {past.length ? (
        <details>
          <summary className="crew-h2" style={{ cursor: 'pointer' }}>
            Earlier shows ({past.length})
          </summary>
          <div className="crew-list">{past.map(day)}</div>
        </details>
      ) : null}
    </main>
  );
}
