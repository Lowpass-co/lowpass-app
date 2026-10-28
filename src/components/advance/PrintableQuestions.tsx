'use client';

/* The venue's questions as a printable sheet (/advance-intake/<token>?print=1):
   opens the print dialog so it can be saved as a PDF and attached, or filled
   in by hand. Light, ink-friendly, one answer box per question. */

import { useEffect } from 'react';

export function PrintableQuestions({
  title,
  tourName,
  url,
  sections,
}: {
  title: string;
  tourName: string | null;
  url: string;
  sections: { label: string; fields: { label: string; type: string }[] }[];
}) {
  useEffect(() => {
    const t = setTimeout(() => window.print(), 400);
    return () => clearTimeout(t);
  }, []);
  const full = typeof window !== 'undefined' ? `${window.location.origin}${url}` : url;
  return (
    <main className="lp-print-sheet" style={{ background: 'var(--lp-text)', color: 'var(--lp-text-inverse)', minHeight: '100vh', padding: '32px 40px', fontFamily: 'inherit' }}>
      <style>{`@media print { @page { margin: 16mm; } .lp-print-hide { display: none !important; } } .lp-print-sheet h2 { break-after: avoid; }`}</style>
      <div className="lp-print-hide" style={{ marginBottom: 16, fontSize: 'var(--lp-text-sm)' }}>
        <button type="button" onClick={() => window.print()} style={{ padding: '6px 12px', borderRadius: 6, border: '1px solid currentColor', background: 'transparent', color: 'inherit', cursor: 'pointer' }}>
          Print / save as PDF
        </button>
      </div>
      <h1 style={{ margin: 0, fontSize: 'var(--lp-text-2xl)' }}>Advance — {title}</h1>
      {tourName ? <p style={{ margin: '4px 0 0', fontSize: 'var(--lp-text-sm)' }}>{tourName}</p> : null}
      <p style={{ margin: '10px 0 24px', fontSize: 'var(--lp-text-xs)' }}>Easier online: {full}</p>
      {sections.map((s) => (
        <section key={s.label} style={{ marginBottom: 22, breakInside: 'avoid-page' }}>
          <h2 style={{ fontSize: 'var(--lp-text-md)', margin: '0 0 8px', paddingBottom: 4, borderBottom: '1.5px solid currentColor' }}>{s.label}</h2>
          {s.fields.map((f) => (
            <div key={f.label} style={{ display: 'grid', gridTemplateColumns: '38% 1fr', gap: 12, padding: '8px 0', borderBottom: '1px solid color-mix(in srgb, currentColor 20%, transparent)', breakInside: 'avoid' }}>
              <span style={{ fontSize: 'var(--lp-text-sm)' }}>{f.label}</span>
              <span style={{ fontSize: 'var(--lp-text-xs)', minHeight: f.type === 'textarea' ? 48 : 20 }}>{f.type === 'boolean' ? 'Yes  /  No' : ''}</span>
            </div>
          ))}
        </section>
      ))}
    </main>
  );
}
