/* ============================================
   LOWPASS — Workspace Landing (Sprint 7 §5)

   /artists — first page a returning user sees. Workspace-level,
   no artist selected. Replaces the bare list-of-artists page.

   Layout:
     [WorkspaceTopBar] (no rail, no switcher, no product nav)
     ┌── workspace identity (name + 4 stats)
     ├── PickUpCard (most recent context)
     ├── Artists grid (banner + logo + meta cards)
     └── Activity feed (deferred; section renders empty for now)

   Click an artist card → navigates to /artists/[id] (Phase 4
   surface). "+ NEW ARTIST" routes to /artists/new (placeholder
   per the sprint's out-of-scope list — actual creation flow is
   a separate sprint).
   ============================================ */

import { redirect } from 'next/navigation';
import Link from 'next/link';
import { Plus } from 'lucide-react';
import { createServerSupabaseClient } from '@/lib/supabase-server';
import { WorkspaceTopBar } from '@/components/shell-v2/WorkspaceTopBar';
import { PickUpCard } from '@/components/artists/PickUpCard';
import { ArtistGridCard } from '@/components/artists/ArtistGridCard';
import { ArtistHomeStagger } from '@/components/artists/ArtistHomeStagger';
import { getWorkspaceLandingData } from '@/server/workspace/getWorkspaceLandingData';

const CURRENCY_SYMBOL: Record<string, string> = {
  GBP: '£',
  USD: '$',
  EUR: '€',
  AUD: 'A$',
  CAD: 'C$',
};

function abbreviateCurrency(value: number, currency: string): string {
  const sym = CURRENCY_SYMBOL[currency.toUpperCase()] ?? `${currency} `;
  const abs = Math.abs(value);
  if (abs >= 1_000_000) return `${sym}${(value / 1_000_000).toFixed(1)}M`;
  if (abs >= 1_000) return `${sym}${Math.round(value / 1_000)}K`;
  return `${sym}${Math.round(value)}`;
}

export default async function ArtistsLandingPage() {
  const supabase = await createServerSupabaseClient();
  const data = await getWorkspaceLandingData(supabase);
  if (!data) redirect('/login');

  return (
    <div
      className="flex min-h-screen flex-col"
      style={{ background: 'var(--lp-bg)' }}
    >
      <WorkspaceTopBar workspaceName={data.workspaceName} />

      <ArtistHomeStagger>
        <div
          className="mx-auto w-full"
          style={{
            maxWidth: 1280,
            padding:
              'var(--lp-space-6) var(--lp-space-6) var(--lp-space-12)',
          }}
        >
          {/* Workspace identity strip */}
          <section style={{ marginBottom: 'var(--lp-space-6)' }}>
            <div
              className="lp-label-caps"
              style={{ color: 'var(--lp-text-tertiary)' }}
            >
              Workspace
            </div>
            <h1
              className="mt-1"
              style={{
                margin: 0,
                fontSize: 32,
                fontWeight: 'var(--lp-weight-semibold)',
                color: 'var(--lp-text)',
                lineHeight: 1.1,
              }}
            >
              {data.workspaceName}
            </h1>
            <div
              className="mt-3"
              style={{
                fontSize: 'var(--lp-text-2xs)',
                fontWeight: 'var(--lp-weight-bold)',
                letterSpacing: 'var(--lp-tracking-caps)',
                textTransform: 'uppercase',
                color: 'var(--lp-text-secondary)',
              }}
            >
              <span className="lp-mono" style={{ color: 'var(--lp-text)' }}>
                {data.stats.artistCount}
              </span>{' '}
              {data.stats.artistCount === 1 ? 'ARTIST' : 'ARTISTS'}
              <span
                aria-hidden
                style={{
                  margin: '0 var(--lp-space-2)',
                  color: 'var(--lp-text-tertiary)',
                }}
              >
                ·
              </span>
              <span className="lp-mono" style={{ color: 'var(--lp-text)' }}>
                {data.stats.activeTourCount}
              </span>{' '}
              ACTIVE {data.stats.activeTourCount === 1 ? 'TOUR' : 'TOURS'}
              <span
                aria-hidden
                style={{
                  margin: '0 var(--lp-space-2)',
                  color: 'var(--lp-text-tertiary)',
                }}
              >
                ·
              </span>
              <span className="lp-mono" style={{ color: 'var(--lp-text)' }}>
                {data.stats.showsThisMonth}
              </span>{' '}
              SHOWS THIS MONTH
              <span
                aria-hidden
                style={{
                  margin: '0 var(--lp-space-2)',
                  color: 'var(--lp-text-tertiary)',
                }}
              >
                ·
              </span>
              <span className="lp-mono" style={{ color: 'var(--lp-text)' }}>
                {abbreviateCurrency(
                  data.stats.budgetCommitted,
                  data.stats.budgetCurrency,
                )}
              </span>{' '}
              COMMITTED
            </div>
          </section>

          {/* Pick up card — only when there's a recent tour. */}
          {data.pickUp ? (
            <section style={{ marginBottom: 'var(--lp-space-6)' }}>
              <PickUpCard pickUp={data.pickUp} />
            </section>
          ) : null}

          {/* Artists grid */}
          <section style={{ marginBottom: 'var(--lp-space-6)' }}>
            <div
              className="flex items-baseline justify-between"
              style={{ marginBottom: 'var(--lp-space-3)' }}
            >
              <h2
                className="lp-label-caps"
                style={{
                  margin: 0,
                  color: 'var(--lp-text-tertiary)',
                }}
              >
                Artists
                <span
                  aria-hidden
                  style={{
                    margin: '0 var(--lp-space-2)',
                    color: 'var(--lp-text-tertiary)',
                  }}
                >
                  ·
                </span>
                <span
                  className="lp-mono"
                  style={{ color: 'var(--lp-text)' }}
                >
                  {data.artists.length}
                </span>
              </h2>
              <Link
                href="/artists/new"
                className="btn-transition inline-flex items-center"
                style={{
                  gap: 'var(--lp-space-2)',
                  padding: 'var(--lp-space-2) var(--lp-space-3)',
                  fontSize: 'var(--lp-text-sm)',
                  fontWeight: 'var(--lp-weight-medium)',
                  color: 'var(--lp-text-secondary)',
                  background: 'var(--lp-panel)',
                  border: '1px solid var(--lp-border-strong)',
                  borderRadius: 'var(--lp-radius-md)',
                }}
              >
                <Plus aria-hidden size={14} strokeWidth={2.25} />
                New artist
              </Link>
            </div>
            {data.artists.length === 0 ? (
              <div
                style={{
                  padding: 'var(--lp-space-8)',
                  textAlign: 'center',
                  fontSize: 'var(--lp-text-sm)',
                  color: 'var(--lp-text-tertiary)',
                  background: 'var(--lp-panel)',
                  border: '1px solid var(--lp-border-strong)',
                  borderRadius: 'var(--lp-radius-lg)',
                }}
              >
                No artists yet. Create one to start a tour.
              </div>
            ) : (
              <div
                className="grid"
                style={{
                  gap: 'var(--lp-space-4)',
                  gridTemplateColumns:
                    'repeat(auto-fit, minmax(280px, 1fr))',
                }}
              >
                {data.artists.map((a) => (
                  <ArtistGridCard key={a.id} artist={a} />
                ))}
              </div>
            )}
          </section>

          {/* Activity feed — placeholder until workspace-wide
              activity is implemented; see deferred section in
              sprint report. */}
          <section>
            <div
              className="flex items-baseline justify-between"
              style={{ marginBottom: 'var(--lp-space-3)' }}
            >
              <h2
                className="lp-label-caps"
                style={{
                  margin: 0,
                  color: 'var(--lp-text-tertiary)',
                }}
              >
                Activity
              </h2>
              <span
                className="lp-label-caps"
                style={{ color: 'var(--lp-text-tertiary)' }}
              >
                Last 24 hours
              </span>
            </div>
            <div
              style={{
                padding: 'var(--lp-space-6)',
                textAlign: 'center',
                fontSize: 'var(--lp-text-sm)',
                color: 'var(--lp-text-tertiary)',
                background: 'var(--lp-panel)',
                border: '1px solid var(--lp-border-strong)',
                borderRadius: 'var(--lp-radius-lg)',
              }}
            >
              No recent activity.
            </div>
          </section>
        </div>
      </ArtistHomeStagger>
    </div>
  );
}
