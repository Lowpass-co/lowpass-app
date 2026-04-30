/* ============================================
   LOWPASS — Phase 0 product placeholder

   Catches /playground/new-home/[artistId]/{operations|budget|advance}/[tourId]
   so the product cards on the Home reference page have somewhere to link
   to. Phase 1 onwards replaces this with the real product pages at
   /operations/[id], /budget/[id], /advance/[id].

   Phase 0 just confirms the navigation pattern works — the body of
   the placeholder names the product + tour and points at the still-
   live legacy URL so Adam can keep working while the product split
   ships in real phases.
   ============================================ */

import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowLeft, ExternalLink } from 'lucide-react';
import { createServerSupabaseClient } from '@/lib/supabase-server';
import { HomeProductRailPreview } from '@/components/home/HomeProductRailPreview';

type ProductKey = 'operations' | 'budget' | 'advance';

const PRODUCT_LABELS: Record<ProductKey, string> = {
  operations: 'Operations',
  budget: 'Budget',
  advance: 'Advance',
};

const LEGACY_LINK: Record<ProductKey, (tourId: string) => string> = {
  operations: (tourId) => `/tours/${tourId}`,
  budget: (tourId) => `/tours/${tourId}/budget`,
  advance: (tourId) => `/tours/${tourId}/advance`,
};

const VALID_PRODUCTS: ReadonlySet<string> = new Set([
  'operations',
  'budget',
  'advance',
]);

export default async function NewHomeProductPlaceholderPage({
  params,
}: {
  params: Promise<{ artistId: string; product: string; tourId: string }>;
}) {
  const { artistId, product, tourId } = await params;
  if (!VALID_PRODUCTS.has(product)) notFound();
  const productKey = product as ProductKey;

  const supabase = await createServerSupabaseClient();
  const [{ data: artist }, { data: tour }] = await Promise.all([
    supabase.from('artists').select('id, name').eq('id', artistId).maybeSingle(),
    supabase.from('tours').select('id, name').eq('id', tourId).maybeSingle(),
  ]);

  const monoStyle = { fontFamily: 'var(--lp-font-numeric)' } as const;

  return (
    <div
      className="flex min-h-screen"
      style={{
        background: 'var(--lp-bg)',
        color: 'var(--lp-text)',
        fontSize: '13px',
        ['--lp-font-numeric' as string]:
          "'JetBrains Mono', var(--font-geist-mono), 'SF Mono', monospace",
      }}
    >
      {/* See sibling page comment — Phase 1 promotes the @import to
         globals.css; Phase 0 ships per-page so the playground stays
         self-contained. */}
      {/* eslint-disable-next-line @next/next/no-page-custom-font */}
      <link
        rel="stylesheet"
        href="https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;500;600&display=swap"
      />
      <HomeProductRailPreview active={productKey} />

      <main className="flex-1 overflow-y-auto" style={{ minHeight: 0 }}>
        <div className="mx-auto w-full max-w-[1280px] space-y-6 px-6 py-6">
          <Link
            href={`/playground/new-home/${artistId}`}
            className="inline-flex items-center gap-1.5"
            style={{
              fontSize: '12px',
              color: 'var(--lp-text-secondary)',
            }}
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            Back to Home
          </Link>

          <header className="space-y-1">
            <p
              style={{
                fontSize: '11px',
                fontWeight: 600,
                letterSpacing: '0.1em',
                textTransform: 'uppercase',
                color: 'var(--lp-text-tertiary)',
              }}
            >
              {PRODUCT_LABELS[productKey]} · {artist?.name ?? 'Artist'}
            </p>
            <h1
              style={{
                fontSize: '24px',
                fontWeight: 600,
                lineHeight: 1.2,
              }}
            >
              {tour?.name ?? 'Tour'}
            </h1>
          </header>

          <div
            className="rounded-lg border p-6"
            style={{
              borderColor: 'var(--lp-border-strong, var(--lp-border))',
              background: 'var(--lp-surface)',
            }}
          >
            <h2
              style={{
                fontSize: '15px',
                fontWeight: 600,
                color: 'var(--lp-text)',
              }}
            >
              {PRODUCT_LABELS[productKey]} for{' '}
              <span style={monoStyle}>{tour?.name ?? tourId}</span> — to be
              migrated in a future phase
            </h2>
            <p
              className="mt-2"
              style={{
                fontSize: '13px',
                color: 'var(--lp-text-secondary)',
              }}
            >
              Phase 0 only ships the Home reference page. The actual{' '}
              {PRODUCT_LABELS[productKey].toLowerCase()} surface lives at the
              legacy URL until Phase 3 / Phase 4 ports it onto{' '}
              <code style={monoStyle}>/{productKey}/[id]</code>.
            </p>
            <p
              className="mt-1"
              style={{
                fontSize: '13px',
                color: 'var(--lp-text-secondary)',
              }}
            >
              The breadcrumb above + this placeholder confirm the
              navigation pattern: clicking a tour-row in a product card on
              the Home page enters that product+tour. Production routes
              are untouched in Phase 0 — once the new shell lands, the
              cutover redirects from <code style={monoStyle}>/tours/[id]</code>{' '}
              to{' '}
              <code style={monoStyle}>/{productKey}/[id]</code>.
            </p>

            <div className="mt-4 flex flex-wrap gap-2">
              <Link
                href={LEGACY_LINK[productKey](tourId)}
                className="inline-flex items-center gap-1.5 rounded-md border px-3 py-1.5"
                style={{
                  borderColor: 'var(--color-lp-orange)',
                  color: 'var(--color-lp-orange)',
                  background:
                    'color-mix(in srgb, var(--color-lp-orange) 4%, transparent)',
                  fontSize: '12px',
                  fontWeight: 500,
                }}
              >
                Open the live{' '}
                {productKey === 'operations' ? 'Tour Hub' : PRODUCT_LABELS[productKey]}
                <ExternalLink className="h-3.5 w-3.5" />
              </Link>
              <Link
                href={`/playground/new-home/${artistId}`}
                className="inline-flex items-center gap-1.5 rounded-md border px-3 py-1.5"
                style={{
                  borderColor: 'var(--lp-border)',
                  color: 'var(--lp-text-secondary)',
                  fontSize: '12px',
                  fontWeight: 500,
                }}
              >
                <ArrowLeft className="h-3.5 w-3.5" />
                Back to Home
              </Link>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
