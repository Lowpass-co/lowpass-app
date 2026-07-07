'use client';

/* ============================================
   LOWPASS — /tour-fingerprint-demo (Design pass §7 grading harness)

   Renders <TourFingerprint> at all three sizes against seed data that exercises
   every feature: mixed day types, two-type stacking, advance states, the
   next-show highlight, and a long tour that overflows so wheel→horizontal +
   week-commencing markers are visible. Not a product surface.
   ============================================ */

import { TourFingerprint, type FingerprintDay } from '@/components/tour/TourFingerprint';

const CITIES = ['Nashville', 'Atlanta', 'Charlotte', 'DC', 'NYC', 'Boston', 'Toronto', 'Chicago'];
const VENUES = ['EXIT/IN', 'The Masquerade', 'The Underground', '9:30 Club', 'Bowery Ballroom', 'Paradise', 'Velvet', 'Metro'];

function addDays(iso: string, n: number): string {
  const d = new Date(`${iso}T12:00:00`);
  d.setDate(d.getDate() + n);
  return d.toISOString().slice(0, 10);
}

/** 28-day seed: a realistic show/off/travel cadence + a couple of two-type days. */
function seed(start: string): FingerprintDay[] {
  const pattern: string[] = [
    'rehearsal', 'rehearsal', 'travel', 'show', 'off', 'show', 'travel', 'show',
    'show,press', 'off', 'travel', 'show', 'show', 'off', 'festival', 'travel',
    'show', 'off', 'show', 'radio', 'travel', 'show', 'show,tv', 'off',
    'show', 'travel', 'show', 'off',
  ];
  const states: Array<FingerprintDay['advanceState']> = ['complete', 'complete', 'in_progress', 'not_started', 'needs_review'];
  let showIdx = 0;
  return pattern.map((dt, i) => {
    const isShow = dt.startsWith('show') || dt.startsWith('festival');
    const day: FingerprintDay = {
      date: addDays(start, i),
      dayType: dt,
      routingId: `r${i}`,
    };
    if (isShow) {
      day.venue = VENUES[showIdx % VENUES.length];
      day.city = CITIES[showIdx % CITIES.length];
      day.advanceState = states[showIdx % states.length];
      showIdx++;
    }
    return day;
  });
}

export default function TourFingerprintDemoPage() {
  const days = seed('2026-08-03');
  const nextShow = days.find((d) => d.dayType.startsWith('show'))?.date ?? null;

  const onDayClick = (d: FingerprintDay) => {
    // In product this routes show days → advance/grid; here just surface it.
    if (typeof window !== 'undefined') window.alert(`${d.date} · ${d.dayType}`);
  };

  return (
    <div style={{ padding: 'var(--lp-space-8)', maxWidth: 1100, margin: '0 auto', color: 'var(--lp-text)' }}>
      <h1 className="lp-h2" style={{ marginBottom: 4 }}>TourFingerprint</h1>
      <p style={{ fontSize: 'var(--lp-text-sm)', color: 'var(--lp-text-secondary)', marginBottom: 'var(--lp-space-8)' }}>
        Signature component · §7. Hover a tick for the anchored popover; wheel to scroll the hero strip;
        two-type days stack a second tick; the next show is outlined; bars draw in on load.
      </p>

      <Section title="Card scale (10px) — workspace / artist rows">
        <TourFingerprint days={days} size="card" highlightDate={nextShow} onDayClick={onDayClick} />
      </Section>

      <Section title="Row scale (16px) — artist tour rows">
        <TourFingerprint days={days} size="row" highlightDate={nextShow} onDayClick={onDayClick} />
      </Section>

      <Section title="Hero scale (40px) — tour landing (week markers + wheel→horizontal)">
        <div style={{ maxWidth: 620 }}>
          <TourFingerprint days={days} size="hero" highlightDate={nextShow} onDayClick={onDayClick} />
        </div>
      </Section>

      <Section title="Empty state">
        <TourFingerprint days={[]} size="row" />
      </Section>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section style={{ marginBottom: 'var(--lp-space-8)' }}>
      <div className="lp-label-caps" style={{ fontSize: 'var(--lp-text-2xs)', color: 'var(--lp-text-tertiary)', marginBottom: 'var(--lp-space-3)' }}>
        {title}
      </div>
      {children}
    </section>
  );
}
