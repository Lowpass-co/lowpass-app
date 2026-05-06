/* ============================================
   LOWPASS — Sprint 7 §5 — <WorkspaceTopBar>

   Minimal top bar for the workspace landing (/artists). NO
   ProductRail, NO artist/tour switcher, NO product nav — those
   are tour-scoped and don't apply at the workspace level.

   Layout:
     [Lowpass logo]  WORKSPACE NAME              [⌘K]  [User]

   Server component — async because it pulls user + admin
   status for the avatar menu (mirrors ProductHeader's pattern).
   ============================================ */

import { Search } from 'lucide-react';
import { createServerSupabaseClient } from '@/lib/supabase-server';
import { ProductHeaderAvatarMenu } from './ProductHeaderAvatarMenu';

interface WorkspaceTopBarProps {
  workspaceName: string;
}

export async function WorkspaceTopBar({
  workspaceName,
}: WorkspaceTopBarProps) {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  let isSiteAdmin = false;
  let avatarUrl: string | null = null;
  let displayName = '';
  const email = user?.email ?? '';
  if (user) {
    const { data: profile } = await supabase
      .from('profiles')
      .select('full_name, avatar_url, is_site_admin')
      .eq('id', user.id)
      .maybeSingle();
    const p = (profile ?? null) as {
      full_name?: string | null;
      avatar_url?: string | null;
      is_site_admin?: boolean | null;
    } | null;
    isSiteAdmin = !!p?.is_site_admin;
    avatarUrl = p?.avatar_url ?? null;
    displayName = (p?.full_name ?? '').trim();
  }

  return (
    <header
      className="lp-workspace-top-bar flex h-12 shrink-0 items-center"
      style={{
        gap: 'var(--lp-space-3)',
        padding: '0 var(--lp-space-4)',
        background: 'var(--lp-panel)',
        borderBottom: '1px solid var(--lp-border-strong)',
      }}
    >
      {/* Lowpass wordmark — uses the brand-orange dot pattern as
          a placeholder logo. Real wordmark asset lives at
          /lowpass-checkbox-mark.svg etc.; using a styled span
          avoids a network fetch and stays token-clean. */}
      <span
        aria-hidden
        className="flex shrink-0 items-center"
        style={{
          gap: 6,
        }}
      >
        <span
          style={{
            width: 14,
            height: 14,
            borderRadius: 'var(--lp-radius-sm)',
            background: 'var(--color-lp-orange)',
            display: 'inline-block',
          }}
        />
        <span
          style={{
            fontSize: 'var(--lp-text-base)',
            fontWeight: 'var(--lp-weight-semibold)',
            color: 'var(--lp-text)',
            letterSpacing: '-0.01em',
          }}
        >
          Lowpass
        </span>
      </span>

      {/* Workspace name — visible at the top so the user knows
          which workspace they're in even before scrolling to the
          identity strip. */}
      <span
        className="min-w-0 truncate"
        style={{
          fontSize: 'var(--lp-text-sm)',
          color: 'var(--lp-text-secondary)',
          marginLeft: 'var(--lp-space-2)',
        }}
      >
        <span
          aria-hidden
          style={{
            margin: '0 var(--lp-space-2)',
            color: 'var(--lp-text-tertiary)',
          }}
        >
          ·
        </span>
        {workspaceName}
      </span>

      {/* Right-side actions */}
      <div className="ml-auto flex items-center" style={{ gap: 'var(--lp-space-2)' }}>
        <button
          type="button"
          className="btn-transition flex h-8 w-8 items-center justify-center"
          style={{
            color: 'var(--lp-text-tertiary)',
            background: 'transparent',
            borderRadius: 'var(--lp-radius-md)',
          }}
          aria-label="Search"
          title="Search (⌘K)"
        >
          <Search size={16} strokeWidth={2} />
        </button>
        {user ? (
          <ProductHeaderAvatarMenu
            user={{ name: displayName, email, avatarUrl }}
            isSiteAdmin={isSiteAdmin}
          />
        ) : null}
      </div>
    </header>
  );
}
