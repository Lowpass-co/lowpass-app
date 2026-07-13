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
import { LayoutTemplate } from 'lucide-react';

export function AdvanceModeSwitcher({
  tourId,
  routingId,
  showName = null,
  dateLabel = null,
  templateName = null,
}: {
  tourId: string;
  routingId: string;
  /** VIS-AB-01 — the show this advance is for (venue/city). Rendered as a
   *  breadcrumb tail before the Build/Advance/Share tabs. */
  showName?: string | null;
  /** VIS-AB-01 — the show date, shown muted next to the show name. */
  dateLabel?: string | null;
  /** VIS-AB-01 — the active form template, rendered as a context chip on
   *  the right of the switcher bar. */
  templateName?: string | null;
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

  const showLabel = (showName ?? '').trim();

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
      {/* VIS-AB-01 — breadcrumb tail: which show this advance is for. Sits
          before the tabs, muted, so the segmented control still reads as the
          primary control. Hidden on narrow widths to protect the tabs. */}
      {showLabel ? (
        <div
          className="hidden min-w-0 items-baseline md:flex"
          style={{ gap: 'var(--lp-space-2)', marginRight: 'var(--lp-space-2)' }}
        >
          <span
            className="truncate"
            style={{
              maxWidth: 220,
              fontSize: 'var(--lp-text-sm)',
              fontWeight: 'var(--lp-weight-semibold)',
              color: 'var(--lp-text)',
            }}
            title={showLabel}
          >
            {showLabel}
          </span>
          {dateLabel ? (
            <span
              className="lp-mono shrink-0"
              style={{ fontSize: 'var(--lp-text-xs)', color: 'var(--lp-text-tertiary)' }}
            >
              {dateLabel}
            </span>
          ) : null}
          <span
            aria-hidden
            className="shrink-0"
            style={{ color: 'var(--lp-border-strong)', fontSize: 'var(--lp-text-sm)' }}
          >
            /
          </span>
        </div>
      ) : null}

      {/* Stage E · §7 — Build / Advance / Share as a SEGMENTED control (the
          graded mockups), not underline text tabs. Container tint + active
          segment fill; inactive segments read tertiary. */}
      <div
        role="tablist"
        aria-label="Advance mode"
        className="my-2 inline-flex items-center"
        style={{
          gap: 2,
          padding: 2,
          background: 'var(--lp-bg-deep)',
          border: '1px solid var(--lp-border-subtle)',
          borderRadius: 'var(--lp-radius-md)',
        }}
      >
        {tabs.map((t) => (
          <Link
            key={t.key}
            href={t.href}
            role="tab"
            aria-selected={t.active}
            aria-current={t.active ? 'page' : undefined}
            className="btn-transition whitespace-nowrap"
            style={{
              padding: '5px var(--lp-space-3)',
              fontSize: 'var(--lp-text-sm)',
              fontWeight: t.active
                ? 'var(--lp-weight-semibold)'
                : 'var(--lp-weight-medium)',
              color: t.active ? 'var(--color-lp-orange)' : 'var(--lp-text-secondary)',
              background: t.active
                ? 'color-mix(in srgb, var(--color-lp-orange) 10%, var(--lp-panel))'
                : 'transparent',
              borderRadius: 'calc(var(--lp-radius-md) - 2px)',
              textDecoration: 'none',
            }}
          >
            {t.label}
          </Link>
        ))}
      </div>

      {/* VIS-AB-01 — template-context chip. Right-aligned so it reads as
          metadata ("which form is this show on"), not a fourth tab. */}
      {templateName && templateName.trim() ? (
        <span
          className="ml-auto hidden shrink-0 items-center sm:inline-flex"
          style={{
            gap: 'var(--lp-space-1)',
            padding: '3px var(--lp-space-2)',
            fontSize: 'var(--lp-text-xs)',
            fontWeight: 'var(--lp-weight-medium)',
            color: 'var(--lp-text-secondary)',
            background: 'var(--lp-bg-deep)',
            border: '1px solid var(--lp-border-subtle)',
            borderRadius: 'var(--lp-radius-full)',
          }}
          title={`Template: ${templateName.trim()}`}
        >
          <LayoutTemplate size={12} aria-hidden style={{ color: 'var(--color-lp-orange)' }} />
          <span className="max-w-[160px] truncate">{templateName.trim()}</span>
        </span>
      ) : null}
    </nav>
  );
}
