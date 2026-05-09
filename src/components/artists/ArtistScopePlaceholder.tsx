/* ============================================
   LOWPASS — <ArtistScopePlaceholder> (Sprint 10 §1.4)

   Shared placeholder body for artist-scope sub-pages whose
   real surfaces ship in Sprint 11+. Renders a title + a one-
   line description per Adam's Q4: stubs > 404s for UX
   continuity.

   The artist-scope <ScopeNavStrip> still renders above this
   body via the (app)/layout.tsx mount, so users can navigate
   sideways back to Overview without losing context.
   ============================================ */

interface ArtistScopePlaceholderProps {
  title: string;
  description: string;
}

export function ArtistScopePlaceholder({
  title,
  description,
}: ArtistScopePlaceholderProps) {
  return (
    <div
      className="mx-auto w-full max-w-3xl"
      style={{ padding: 'var(--lp-space-4)' }}
    >
      <header className="mb-4">
        <h1 className="text-2xl font-bold text-lp-text">{title}</h1>
      </header>
      <div
        role="status"
        style={{
          padding: 'var(--lp-space-4)',
          background: 'var(--lp-panel)',
          border: '1px dashed var(--lp-border-strong)',
          borderRadius: 'var(--lp-radius-md)',
          fontSize: 'var(--lp-text-sm)',
          color: 'var(--lp-text-secondary)',
        }}
      >
        {description}
      </div>
    </div>
  );
}
