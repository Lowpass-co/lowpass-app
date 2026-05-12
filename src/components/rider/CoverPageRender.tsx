/* ============================================
   LOWPASS — <CoverPageRender> (Sprint 12 §9b)

   Pure render: the rider's cover as it appears on the public
   reader (/r/[token]) and the future in-app preview pane.
   No fetching, no hooks.

   Layout per the §9b spec:
     - Logo centered at the top (v1 placement; easy to flip
       to top-left later).
     - Artist name (h1) below the logo.
     - Rider title (h2) below the artist name.
     - Subtitle in muted text below the title (when present).
     - "Rider Updated — <ordinal date>" timestamp at the
       bottom of the cover.
     - Disclaimer in a small italic block, full width,
       below the date (when present).

   Logo fallback chain happens server-side (the public
   endpoint resolves cover_logo_url → artist.default_logo_url →
   null). When null, the logo slot renders empty whitespace
   rather than a placeholder image so the cover stays clean.

   Token-clean: every visual value via var(--lp-…). Reader is
   a "white document" surface (matches ReadOnlyPackView's
   white-page convention) — uses literal white for the page
   background to look like a print sheet.
   ============================================ */

import { formatOrdinalDate } from '@/lib/text/ordinalDate';

interface CoverPageRenderProps {
  artistName: string;
  title: string | null;
  subtitle: string | null;
  disclaimer: string | null;
  logoUrl: string | null;
  updatedAt: string;
}

export function CoverPageRender({
  artistName,
  title,
  subtitle,
  disclaimer,
  logoUrl,
  updatedAt,
}: CoverPageRenderProps) {
  const resolvedTitle = title?.trim() || 'Rider';
  const dateLabel = formatOrdinalDate(updatedAt);

  return (
    <div
      className="mx-auto"
      style={{
        maxWidth: '48rem',
        padding: '4rem 2rem',
        background: '#ffffff',
        color: '#0a0a0a',
        minHeight: '70vh',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        textAlign: 'center',
      }}
    >
      {/* Logo slot — fixed height so the rest of the cover
          doesn't shift when the logo isn't set. */}
      <div
        style={{
          height: 140,
          width: 280,
          marginBottom: 'var(--lp-space-6)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        {logoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={logoUrl}
            alt={`${artistName} logo`}
            style={{
              maxHeight: '100%',
              maxWidth: '100%',
              objectFit: 'contain',
            }}
            onError={(e) => {
              /* If the resolved URL 404s (broken legacy public-
                 bucket link, etc.), hide the img so the cover
                 doesn't render a broken-image icon. */
              e.currentTarget.style.display = 'none';
            }}
          />
        ) : null}
      </div>

      <h1
        style={{
          margin: 0,
          marginBottom: 'var(--lp-space-2)',
          fontSize: '2.25rem',
          fontWeight: 700,
          letterSpacing: '-0.01em',
          color: '#0a0a0a',
        }}
      >
        {artistName}
      </h1>
      <h2
        style={{
          margin: 0,
          fontSize: '1.5rem',
          fontWeight: 500,
          color: '#404040',
        }}
      >
        {resolvedTitle}
      </h2>

      {subtitle ? (
        <p
          style={{
            margin: 0,
            marginTop: 'var(--lp-space-2)',
            fontSize: '1rem',
            color: '#737373',
            fontStyle: 'italic',
          }}
        >
          {subtitle}
        </p>
      ) : null}

      <div
        style={{
          flex: 1,
          minHeight: 'var(--lp-space-6)',
        }}
      />

      {dateLabel ? (
        <p
          style={{
            margin: 0,
            marginTop: 'var(--lp-space-4)',
            fontSize: '0.75rem',
            fontWeight: 600,
            letterSpacing: '0.08em',
            textTransform: 'uppercase',
            color: '#737373',
          }}
        >
          Rider Updated — {dateLabel}
        </p>
      ) : null}

      {disclaimer ? (
        <p
          style={{
            margin: 0,
            marginTop: 'var(--lp-space-4)',
            paddingTop: 'var(--lp-space-3)',
            borderTop: '1px solid #e5e5e5',
            fontSize: '0.7rem',
            lineHeight: 1.5,
            color: '#525252',
            fontStyle: 'italic',
            maxWidth: '36rem',
          }}
        >
          {disclaimer}
        </p>
      ) : null}
    </div>
  );
}
