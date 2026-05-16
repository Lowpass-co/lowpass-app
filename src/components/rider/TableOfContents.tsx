/* ============================================
   LOWPASS — <TableOfContents> (Sprint 12 §9b)

   Auto-rendered TOC for the rider reader. One entry per
   section in sort_order. Each entry shows the section title
   (or a sensible default per section_type if title is empty)
   + a page-number slot.

   Page numbers are placeholders ("Page —") in the web reader
   because the actual pagination only resolves at PDF render
   time (Sprint 12 §10). The web reader renders anchor links
   that jump to the section's <section id="…"> in the same
   document.

   Stored nowhere — computed at render from the sections
   array. The component is pure render: props in, JSX out.
   ============================================ */

interface TocSection {
  id: string;
  section_key: string;
  title: string;
  section_type?: string;
}

interface TableOfContentsProps {
  sections: TocSection[];
}

function fallbackTitle(s: TocSection): string {
  const t = s.title?.trim();
  if (t) return t;
  switch (s.section_type) {
    case 'channel_list':
      return 'Channel list';
    case 'rich_text':
      return 'Rich text';
    case 'advance_summary':
      return 'Advance summary';
    default:
      return s.section_key;
  }
}

export function TableOfContents({ sections }: TableOfContentsProps) {
  if (sections.length === 0) return null;
  return (
    <div
      className="mx-auto"
      style={{
        maxWidth: '48rem',
        padding: '3rem 2rem',
        background: '#ffffff',
        color: '#0a0a0a',
      }}
    >
      <h2
        style={{
          margin: 0,
          marginBottom: 'var(--lp-space-5)',
          fontSize: '1.5rem',
          fontWeight: 600,
          letterSpacing: '-0.01em',
          textAlign: 'center',
        }}
      >
        Contents
      </h2>
      <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
        {sections.map((s) => (
          <li
            key={s.id}
            style={{
              display: 'grid',
              gridTemplateColumns: 'minmax(0, 1fr) auto',
              alignItems: 'baseline',
              gap: 'var(--lp-space-3)',
              padding: 'var(--lp-space-2) 0',
              borderBottom: '1px solid #e5e5e5',
              fontSize: '0.9rem',
            }}
          >
            <a
              href={`#section-${s.section_key}`}
              className="truncate"
              style={{
                color: '#0a0a0a',
                textDecoration: 'none',
              }}
            >
              {fallbackTitle(s)}
            </a>
            <span
              style={{
                fontSize: '0.75rem',
                color: '#737373',
                fontVariantNumeric: 'tabular-nums',
              }}
            >
              Page —
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
