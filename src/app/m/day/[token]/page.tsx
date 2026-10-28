/* ============================================
   LOWPASS — /m/day/[token]  ·  retired crew day link

   Day sheets were retired in the Advance rebuild (Oct 2026, Adam). Crew phone
   links already handed out still resolve here so they get a plain answer
   instead of a 404. Nothing is read: the token is not looked up, and the old
   tour_role_links rows are left in the database untouched.
   ============================================ */

export const dynamic = 'force-static';

export const metadata = { title: 'Link no longer active · Lowpass', robots: { index: false } };

export default function RetiredDayLinkPage() {
  return (
    <main
      style={{
        minHeight: '100dvh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 'var(--lp-space-6)',
        background: 'var(--lp-bg)',
        color: 'var(--lp-text)',
      }}
    >
      <div style={{ maxWidth: 420, textAlign: 'center' }}>
        <h1 className="lp-page-title" style={{ margin: 0 }}>
          This link is no longer active
        </h1>
        <p style={{ marginTop: 'var(--lp-space-3)', color: 'var(--lp-text-secondary)', fontSize: 'var(--lp-text-sm)', lineHeight: 1.6 }}>
          Day sheet links have been switched off. Ask your tour manager for the day&rsquo;s details.
        </p>
      </div>
    </main>
  );
}
