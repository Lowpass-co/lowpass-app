/* ============================================
   LOWPASS — /stage-plot-icons gate (Nav & entry fixpack, item 5)

   Dev-only icon debug harness. Its three siblings (stage-plot-editor /
   -icon-preview / -canvas-preview) each `return null` in production, but
   this page's scattered hooks made a top-level early-return awkward, so it
   leaked to authenticated users in production. This server layout closes
   the gap the same way — notFound() in production — without touching the
   client page's hook order.
   ============================================ */

import type { ReactNode } from 'react';
import { notFound } from 'next/navigation';

export default function StagePlotIconsLayout({ children }: { children: ReactNode }) {
  if (process.env.NODE_ENV === 'production') notFound();
  return <>{children}</>;
}
