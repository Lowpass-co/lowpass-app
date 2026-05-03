/* ============================================
   LOWPASS — Budget · Generic tab placeholder (Phase 3 §C.4)

   For Actuals / Reports / Settings tabs that ship as stubs in this
   sprint. Renders a "coming soon" card with optional link out to
   the existing alternative (e.g. Reports → existing PDF/XLSX
   export flow).
   ============================================ */

import Link from 'next/link';
import { ExternalLink } from 'lucide-react';

interface BudgetTabPlaceholderProps {
  title: string;
  subtitle?: string;
  body: string;
  linkLabel?: string;
  linkHref?: string;
}

export function BudgetTabPlaceholder({
  title,
  subtitle,
  body,
  linkLabel,
  linkHref,
}: BudgetTabPlaceholderProps) {
  return (
    <div className="mx-auto w-full max-w-[760px] py-8">
      <div
        className="rounded-lg border p-6"
        style={{
          borderColor: 'var(--lp-border-strong)',
          background: 'var(--lp-surface)',
        }}
      >
        {subtitle ? (
          <p
            style={{
              fontSize: '11px',
              fontWeight: 600,
              letterSpacing: '0.1em',
              textTransform: 'uppercase',
              color: 'var(--lp-text-tertiary)',
            }}
          >
            {subtitle}
          </p>
        ) : null}
        <h1 className="lp-h2 mt-1">{title}</h1>
        <p
          className="mt-3"
          style={{
            fontSize: '14px',
            color: 'var(--lp-text-secondary)',
            lineHeight: 1.5,
          }}
        >
          {body}
        </p>
        {linkHref ? (
          <Link
            href={linkHref}
            className="btn-transition mt-4 inline-flex items-center gap-1.5 rounded-md border px-3 py-1.5"
            style={{
              borderColor: 'var(--color-lp-orange)',
              color: 'var(--color-lp-orange)',
              background:
                'color-mix(in srgb, var(--color-lp-orange) 4%, transparent)',
              fontSize: '13px',
              fontWeight: 500,
            }}
          >
            {linkLabel ?? 'Open'}
            <ExternalLink className="h-3.5 w-3.5" />
          </Link>
        ) : null}
      </div>
    </div>
  );
}
