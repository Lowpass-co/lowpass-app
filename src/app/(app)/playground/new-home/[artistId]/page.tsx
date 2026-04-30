/* ============================================
   LOWPASS — New Home reference page (Phase 0 §C)

   Mounted at /playground/new-home/[artistId]. NOT a production
   route — does not redirect, does not replace anything. Adam
   navigates here manually to eyeball the Phase 1 visual direction.

   Layout, top to bottom:
     [ProductRail (placeholder — clicks log to console)]
     [Top header — artist hero + stats]
     [4 stat tiles — JetBrains Mono numerics]
     [3 product cards (Operations / Budget / Advance) — each lists this
      artist's tours as clickable rows; click → playground placeholder]
     [Recent activity table — dense, mono timestamps]

   Tokens: applies the Phase 0 token proposal inline (13px body, mono
   on numerics, dense table for the activity feed, breathing room on
   tiles + cards). Phase 1 promotes these to globals.css.
   ============================================ */

import { notFound } from 'next/navigation';
import Link from 'next/link';
import { Briefcase, ChevronRight, ClipboardList, DollarSign } from 'lucide-react';
import { createServerSupabaseClient } from '@/lib/supabase-server';
import { getHomeData } from '@/server/home/getHomeData';
import { HomeProductRailPreview } from '@/components/home/HomeProductRailPreview';

const CURRENCY_SYMBOL: Record<string, string> = {
  GBP: '£',
  USD: '$',
  EUR: '€',
  AUD: 'A$',
  CAD: 'C$',
};

function abbrevCurrency(value: number, currency: string): string {
  const sym = CURRENCY_SYMBOL[currency.toUpperCase()] ?? `${currency} `;
  const abs = Math.abs(value);
  if (abs >= 1_000_000) return `${sym}${(value / 1_000_000).toFixed(1)}M`;
  if (abs >= 1_000) return `${sym}${Math.round(value / 1_000)}K`;
  return `${sym}${Math.round(value)}`;
}

function deriveInitials(name: string | null | undefined): string {
  const t = (name ?? '').trim();
  if (!t) return '?';
  const tokens = t.split(/\s+/).filter(Boolean);
  if (tokens.length === 1) return tokens[0].slice(0, 2).toUpperCase();
  return (tokens[0][0] + tokens[tokens.length - 1][0]).toUpperCase();
}

function formatRelative(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const diffMs = Date.now() - d.getTime();
  const diffMin = Math.round(diffMs / 60_000);
  if (diffMin < 1) return 'just now';
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffH = Math.round(diffMin / 60);
  if (diffH < 24) return `${diffH}h ago`;
  const diffD = Math.round(diffH / 24);
  if (diffD < 30) return `${diffD}d ago`;
  return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short' });
}

const PRODUCT_META = {
  operations: {
    label: 'Operations',
    Icon: Briefcase,
    deepLink: (artistId: string, tourId: string) =>
      `/playground/new-home/${artistId}/operations/${tourId}`,
    summary: 'Riders, routing, channel list, rooming, files, personnel, gear',
  },
  budget: {
    label: 'Budget',
    Icon: DollarSign,
    deepLink: (artistId: string, tourId: string) =>
      `/playground/new-home/${artistId}/budget/${tourId}`,
    summary: 'Line items, settlement, expenses, payroll',
  },
  advance: {
    label: 'Advance',
    Icon: ClipboardList,
    deepLink: (artistId: string, tourId: string) =>
      `/playground/new-home/${artistId}/advance/${tourId}`,
    summary: 'Per-show advance forms, day-view',
  },
} as const;

export default async function NewHomePreviewPage({
  params,
}: {
  params: Promise<{ artistId: string }>;
}) {
  const { artistId } = await params;
  const supabase = await createServerSupabaseClient();
  const data = await getHomeData(supabase, artistId);
  if (!data) notFound();

  const { artist, stats, tours, recentActivity } = data;

  const monoStyle = { fontFamily: 'var(--lp-font-numeric)' } as const;

  return (
    <div
      className="flex min-h-screen"
      style={{
        background: 'var(--lp-bg)',
        color: 'var(--lp-text)',
        // Phase 0 reference — apply the token proposal inline. Phase 1
        // promotes these to globals.css.
        fontSize: '13px',
        // Pull JetBrains Mono via Google Fonts CDN. Tailwind doesn't
        // need it; we set --lp-font-numeric inline so the mono spans
        // below resolve. Phase 1 moves the @import to globals.css.
        ['--lp-font-numeric' as string]:
          "'JetBrains Mono', var(--font-geist-mono), 'SF Mono', monospace",
      }}
    >
      {/* Phase 0 reference loads JetBrains Mono via Google Fonts CDN
         per the token proposal. Phase 1 promotes the @import to
         globals.css (which silences the per-page-custom-font warning
         too). Disabling the warning inline so Phase 0 can ship clean. */}
      {/* eslint-disable-next-line @next/next/no-page-custom-font */}
      <link
        rel="stylesheet"
        href="https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;500;600&display=swap"
      />

      <HomeProductRailPreview active="home" />

      <main className="flex-1 overflow-y-auto" style={{ minHeight: 0 }}>
        <div className="mx-auto w-full max-w-[1280px] space-y-8 px-6 py-6">
          {/* Hero */}
          <header className="flex items-center gap-4">
            <div
              className="flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-full"
              style={{
                background: artist.imageUrl
                  ? 'var(--lp-bg-tertiary)'
                  : 'var(--color-lp-orange)',
              }}
            >
              {artist.imageUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={artist.imageUrl}
                  alt=""
                  className="h-full w-full object-cover"
                />
              ) : (
                <span
                  aria-hidden
                  style={{
                    color: 'var(--lp-text-inverse, #FFFFFF)',
                    fontSize: 'var(--lp-text-lg)',
                    fontWeight: 'var(--lp-weight-semibold)',
                  }}
                >
                  {deriveInitials(artist.name)}
                </span>
              )}
            </div>
            <div className="min-w-0 flex-1">
              <h1
                style={{
                  fontSize: '24px',
                  fontWeight: 600,
                  lineHeight: 1.2,
                  color: 'var(--lp-text)',
                }}
              >
                {artist.name}
              </h1>
              <p
                className="mt-0.5"
                style={{
                  fontSize: '13px',
                  color: 'var(--lp-text-secondary)',
                }}
              >
                <span style={monoStyle}>{tours.length}</span> tours ·{' '}
                <span style={monoStyle}>{stats.activeTours}</span> active ·{' '}
                <span style={monoStyle}>{stats.showsThisMonth}</span> shows this month
              </p>
            </div>
          </header>

          {/* 4 stat tiles */}
          <section
            className="grid gap-3"
            style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))' }}
          >
            <StatTile
              label="Active tours"
              value={String(stats.activeTours)}
              monoStyle={monoStyle}
            />
            <StatTile
              label="Shows this month"
              value={String(stats.showsThisMonth)}
              monoStyle={monoStyle}
            />
            <StatTile
              label="Personnel assigned"
              value={String(stats.personnelActive)}
              monoStyle={monoStyle}
            />
            <StatTile
              label="Budget committed"
              value={abbrevCurrency(stats.budgetCommitted, stats.budgetCurrency)}
              monoStyle={monoStyle}
            />
          </section>

          {/* 3 product cards */}
          <section
            className="grid gap-3"
            style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))' }}
          >
            <ProductCard
              productKey="operations"
              tours={tours}
              artistId={artist.id}
              monoStyle={monoStyle}
            />
            <ProductCard
              productKey="budget"
              tours={tours}
              artistId={artist.id}
              monoStyle={monoStyle}
            />
            <ProductCard
              productKey="advance"
              tours={tours}
              artistId={artist.id}
              monoStyle={monoStyle}
            />
          </section>

          {/* Recent activity */}
          <section className="space-y-2">
            <h2
              style={{
                fontSize: '11px',
                fontWeight: 600,
                letterSpacing: '0.1em',
                textTransform: 'uppercase',
                color: 'var(--lp-text-tertiary)',
              }}
            >
              Recent activity
            </h2>
            <div
              className="overflow-hidden rounded-lg border"
              style={{
                borderColor: 'var(--lp-border-strong, var(--lp-border))',
                background: 'var(--lp-bg-deep, var(--lp-bg))',
              }}
            >
              {/* DENSE table per the density rule: 12px body, mono on
                  the timestamp column, narrow padding, tight rows. */}
              <table className="w-full" style={{ fontSize: '12px' }}>
                <thead>
                  <tr
                    style={{
                      background: 'var(--lp-panel, var(--lp-bg-secondary))',
                      borderBottom:
                        '1px solid var(--lp-border-subtle, var(--lp-border))',
                    }}
                  >
                    <Th>Product</Th>
                    <Th>Tour</Th>
                    <Th>Summary</Th>
                    <Th align="right">When</Th>
                  </tr>
                </thead>
                <tbody>
                  {recentActivity.length === 0 ? (
                    <tr>
                      <td
                        colSpan={4}
                        className="px-3 py-6 text-center"
                        style={{ color: 'var(--lp-text-tertiary)' }}
                      >
                        No recent activity for this artist.
                      </td>
                    </tr>
                  ) : (
                    recentActivity.map((row) => (
                      <tr
                        key={row.id}
                        style={{
                          borderTop:
                            '1px solid var(--lp-border-subtle, var(--lp-border))',
                        }}
                      >
                        <Td>
                          <ProductBadge product={row.product} />
                        </Td>
                        <Td>
                          <span
                            className="truncate"
                            style={{ color: 'var(--lp-text)' }}
                          >
                            {row.tourName || '—'}
                          </span>
                        </Td>
                        <Td>
                          <span
                            className="truncate"
                            style={{ color: 'var(--lp-text-secondary)' }}
                          >
                            {row.summary}
                          </span>
                        </Td>
                        <Td align="right">
                          <span style={monoStyle}>
                            {formatRelative(row.occurredAt)}
                          </span>
                        </Td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </section>

          {/* Phase 0 footer */}
          <footer
            className="rounded-md border px-4 py-3 text-xs"
            style={{
              borderColor: 'var(--lp-border)',
              background: 'var(--lp-surface)',
              color: 'var(--lp-text-tertiary)',
            }}
          >
            <strong style={{ color: 'var(--lp-text-secondary)' }}>
              Phase 0 reference page.
            </strong>{' '}
            Mounted at <code style={monoStyle}>/playground/new-home/[artistId]</code>.
            Production routes untouched. Phase 1 promotes this layout to{' '}
            <code style={monoStyle}>/artists/[id]</code> with the new shell.
          </footer>
        </div>
      </main>
    </div>
  );
}

function StatTile({
  label,
  value,
  monoStyle,
}: {
  label: string;
  value: string;
  monoStyle: React.CSSProperties;
}) {
  return (
    <div
      className="rounded-lg border p-4"
      style={{
        borderColor: 'var(--lp-border-strong, var(--lp-border))',
        background: 'var(--lp-surface)',
      }}
    >
      <div
        style={{
          fontSize: '11px',
          fontWeight: 600,
          letterSpacing: '0.08em',
          textTransform: 'uppercase',
          color: 'var(--lp-text-tertiary)',
        }}
      >
        {label}
      </div>
      <div
        className="mt-2"
        style={{
          ...monoStyle,
          fontSize: '28px',
          fontWeight: 500,
          lineHeight: 1.1,
          color: 'var(--lp-text)',
        }}
      >
        {value}
      </div>
    </div>
  );
}

function ProductCard({
  productKey,
  tours,
  artistId,
  monoStyle,
}: {
  productKey: keyof typeof PRODUCT_META;
  tours: Awaited<ReturnType<typeof getHomeData>> extends infer T
    ? T extends { tours: infer U }
      ? U
      : never
    : never;
  artistId: string;
  monoStyle: React.CSSProperties;
}) {
  const meta = PRODUCT_META[productKey];
  const Icon = meta.Icon;
  return (
    <div
      className="flex flex-col gap-3 rounded-lg border p-4"
      style={{
        borderColor: 'var(--lp-border-strong, var(--lp-border))',
        background: 'var(--lp-surface)',
      }}
    >
      <div className="flex items-center gap-2">
        <span
          aria-hidden
          className="flex h-7 w-7 items-center justify-center rounded-md"
          style={{
            background: 'color-mix(in srgb, var(--color-lp-orange) 8%, transparent)',
            color: 'var(--color-lp-orange)',
          }}
        >
          <Icon className="h-4 w-4" />
        </span>
        <div className="min-w-0 flex-1">
          <div
            style={{
              fontSize: '13px',
              fontWeight: 600,
              color: 'var(--lp-text)',
            }}
          >
            {meta.label}
          </div>
          <div
            className="truncate"
            style={{
              fontSize: '11px',
              color: 'var(--lp-text-tertiary)',
            }}
          >
            {meta.summary}
          </div>
        </div>
      </div>

      <ul
        className="flex flex-col gap-1 rounded-md border"
        style={{
          borderColor: 'var(--lp-border)',
          background: 'var(--lp-bg-deep, var(--lp-bg))',
        }}
      >
        {tours.length === 0 ? (
          <li
            className="px-3 py-2"
            style={{
              fontSize: '12px',
              color: 'var(--lp-text-tertiary)',
            }}
          >
            No tours yet.
          </li>
        ) : (
          tours.map((tour, i) => {
            const lastTouchedAt =
              productKey === 'budget'
                ? tour.lastBudgetTouchedAt
                : productKey === 'advance'
                  ? tour.lastAdvanceTouchedAt
                  : tour.lastOpsTouchedAt;
            return (
              <li
                key={tour.id}
                style={{
                  borderTop:
                    i === 0
                      ? 'none'
                      : '1px solid var(--lp-border-subtle, var(--lp-border))',
                }}
              >
                <Link
                  href={meta.deepLink(artistId, tour.id)}
                  className="btn-transition flex items-center gap-2 px-3 py-2"
                  style={{
                    fontSize: '12px',
                    color: 'var(--lp-text)',
                  }}
                >
                  <span className="min-w-0 flex-1 truncate">
                    {tour.name}
                  </span>
                  <span
                    style={{
                      ...monoStyle,
                      fontSize: '11px',
                      color: 'var(--lp-text-tertiary)',
                    }}
                  >
                    {lastTouchedAt ? formatRelative(lastTouchedAt) : '—'}
                  </span>
                  <ChevronRight
                    aria-hidden
                    className="h-3 w-3 shrink-0"
                    style={{ color: 'var(--lp-text-tertiary)' }}
                  />
                </Link>
              </li>
            );
          })
        )}
      </ul>
    </div>
  );
}

function ProductBadge({ product }: { product: 'budget' | 'advance' | 'operations' }) {
  const tones: Record<typeof product, { tone: string; label: string }> = {
    budget: { tone: 'var(--color-lp-status-complete)', label: 'BUDGET' },
    advance: { tone: 'var(--color-lp-status-in-progress)', label: 'ADVANCE' },
    operations: { tone: 'var(--color-lp-orange)', label: 'OPS' },
  };
  const { tone, label } = tones[product];
  return (
    <span
      className="inline-flex items-center rounded-full px-2 py-0.5"
      style={{
        fontSize: '10px',
        fontWeight: 600,
        letterSpacing: '0.05em',
        color: tone,
        background: `color-mix(in srgb, ${tone} 12%, transparent)`,
      }}
    >
      {label}
    </span>
  );
}

function Th({
  children,
  align,
}: {
  children: React.ReactNode;
  align?: 'left' | 'right';
}) {
  return (
    <th
      className="px-3 py-2"
      style={{
        textAlign: align ?? 'left',
        fontSize: '10px',
        fontWeight: 600,
        letterSpacing: '0.08em',
        textTransform: 'uppercase',
        color: 'var(--lp-text-tertiary)',
      }}
    >
      {children}
    </th>
  );
}

function Td({
  children,
  align,
}: {
  children: React.ReactNode;
  align?: 'left' | 'right';
}) {
  return (
    <td
      className="px-3 py-2"
      style={{
        textAlign: align ?? 'left',
        verticalAlign: 'middle',
      }}
    >
      {children}
    </td>
  );
}
