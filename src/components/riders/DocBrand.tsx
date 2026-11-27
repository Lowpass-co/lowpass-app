'use client';

/* The artist at the head of a rider on screen (Nov 2026, Adam: "logo should be
   everywhere… if none added, write artist name"). The logo when there is one;
   if it's missing or won't load, the artist's name — the same rule as the PDF
   cover. `action` sits beside the name when there's no logo (the editor's
   "Add the artist's logo"). */

import { useState, type ReactNode } from 'react';

export function DocBrand({ logo, artist, action }: { logo: string | null; artist: string | null; action?: ReactNode }) {
  const [failed, setFailed] = useState(false);
  if (logo && !failed) {
    return (
      // eslint-disable-next-line @next/next/no-img-element -- a same-origin route that streams the artist's logo; next/image adds nothing here
      <img className="rd-logo" src={logo} alt={artist ?? 'Artist logo'} referrerPolicy="no-referrer" onError={() => setFailed(true)} />
    );
  }
  if (!artist && !action) return null;
  return (
    <div className="rd-brand">
      {artist ? <div className="rd-artist">{artist}</div> : null}
      {action}
    </div>
  );
}
