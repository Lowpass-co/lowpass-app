'use client';

/* ============================================================
   LOWPASS — <AdvanceModeSwitcher> (P3 · B1 extraction skeleton)

   Segmented Build / Advance / Share control for the per-show Advance surfaces.
   Per Adam's ruling the middle tab IS "Advance" (Advance-inside-Advance is
   intentional; the breadcrumb disambiguates).

   B1 is the skeleton: the three surfaces map onto the existing working views —
   Build = the builder (?mode=edit), Advance = the read/fill page, Share = the
   packet page. The /build and /share routes redirect onto those for now; B2/B4
   turn them into fully-styled standalone page surfaces.
   ============================================================ */

import Link from 'next/link';
import { usePathname, useSearchParams } from 'next/navigation';

export function AdvanceModeSwitcher({
  tourId,
  routingId,
}: {
  tourId: string;
  routingId: string;
}) {
  const pathname = usePathname() ?? '';
  const mode = useSearchParams()?.get('mode') ?? null;
  const base = `/advance/${tourId}/${routingId}`;

  const isShare = pathname.endsWith('/packet') || pathname.endsWith('/share');
  const isBuild = !isShare && mode === 'edit';
  const isAdvance = !isShare && !isBuild;

  // Build maps to the existing builder entry (?mode=edit) rather than a /build
  // route — the folder name `build` is gitignored (.gitignore `build/`), so the
  // surface can't own a `build/` route dir. B2 gives Build a proper page under a
  // non-ignored segment. Advance = base; Share = the /share route.
  const tabs = [
    { key: 'build', label: 'Build', href: `${base}?mode=edit`, active: isBuild },
    { key: 'advance', label: 'Advance', href: base, active: isAdvance },
    { key: 'share', label: 'Share', href: `${base}/share`, active: isShare },
  ];

  return (
    <nav
      aria-label="Advance surfaces"
      className="flex items-center"
      style={{
        gap: 'var(--lp-space-1)',
        padding: '0 var(--lp-space-4)',
        borderBottom: '1px solid var(--lp-border-subtle)',
        background: 'var(--lp-panel)',
      }}
    >
      {tabs.map((t) => (
        <Link
          key={t.key}
          href={t.href}
          aria-current={t.active ? 'page' : undefined}
          className="btn-transition"
          style={{
            padding: '10px var(--lp-space-3)',
            fontSize: 'var(--lp-text-sm)',
            fontWeight: t.active
              ? 'var(--lp-weight-semibold)'
              : 'var(--lp-weight-medium)',
            color: t.active ? 'var(--lp-text)' : 'var(--lp-text-tertiary)',
            borderBottom: `2px solid ${t.active ? 'var(--color-lp-orange)' : 'transparent'}`,
            marginBottom: '-1px',
            textDecoration: 'none',
          }}
        >
          {t.label}
        </Link>
      ))}
    </nav>
  );
}
