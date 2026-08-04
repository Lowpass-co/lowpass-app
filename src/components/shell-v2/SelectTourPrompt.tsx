/* ============================================
   LOWPASS — SelectTourPrompt (IA tour-flow fix §2)

   Shared "no tour selected" empty-state for the workspace-level product
   landings (Operations / Advance / Budget). Mirrors the budget page's
   prompt so all three read identically. Server-safe (no client hooks).
   ============================================ */

import Link from 'next/link';

export function SelectTourPrompt({ product }: { product: string }) {
  return (
    <div className="flex h-[calc(100vh-8rem)] items-center justify-center p-8">
      <div
        className="max-w-md rounded-xl border p-6 text-center"
        style={{
          borderColor: 'var(--lp-border-strong)',
          background: 'var(--lp-surface)',
        }}
      >
        <h1 className="lp-h2">Select a tour to open {product}</h1>
        <p
          className="mt-2"
          style={{
            fontSize: '14px',
            color: 'var(--lp-text-secondary)',
            lineHeight: 1.5,
          }}
        >
          Pick an artist and tour from the picker in the top bar — the
          greyed controls up there come alive the moment a tour is
          selected — or start from your artists.
        </p>
        <Link
          href="/artists"
          className="btn-transition mt-4 inline-flex items-center gap-1.5 rounded-md px-3 py-1.5"
          style={{
            fontSize: '13px',
            fontWeight: 500,
            background: 'var(--color-lp-orange)',
            color: 'var(--lp-text-inverse, #fff)',
          }}
        >
          Go to artists →
        </Link>
      </div>
    </div>
  );
}
